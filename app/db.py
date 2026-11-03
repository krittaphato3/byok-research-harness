"""
Lightweight SQLite Database Layer with FTS5 Full-Text Search.
Enforces WAL mode, foreign keys, synchronized FTS5 triggers, and indexed retrieval.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

from app.config import DATABASE_PATH, DATA_DIR


def init_db(db_path: Path = DATABASE_PATH) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute("PRAGMA synchronous=NORMAL;")

        # 1. Vault table for encrypted API credentials with metadata and test status
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vault_keys (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                label TEXT,
                base_url TEXT DEFAULT 'http://localhost:20128/v1',
                api_format TEXT DEFAULT 'chat_completions',
                encrypted_key TEXT NOT NULL,
                key_hint TEXT NOT NULL,
                models_json TEXT DEFAULT '[]',
                is_enabled INTEGER DEFAULT 1,
                is_default INTEGER DEFAULT 0,
                last_test_status TEXT,
                last_test_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # Migration: ensure newer columns exist on pre-existing tables
        cursor = conn.execute("PRAGMA table_info(vault_keys);")
        columns = [row[1] for row in cursor.fetchall()]
        if "base_url" not in columns:
            conn.execute("ALTER TABLE vault_keys ADD COLUMN base_url TEXT DEFAULT 'http://localhost:20128/v1';")
        if "api_format" not in columns:
            conn.execute("ALTER TABLE vault_keys ADD COLUMN api_format TEXT DEFAULT 'chat_completions';")
        if "models_json" not in columns:
            conn.execute("ALTER TABLE vault_keys ADD COLUMN models_json TEXT DEFAULT '[]';")

        # 2. Model profiles table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS model_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                provider TEXT NOT NULL,
                model_id TEXT NOT NULL,
                endpoint_url TEXT,
                temperature REAL DEFAULT 0.2,
                max_tokens INTEGER DEFAULT 4096,
                cost_per_1k_input REAL DEFAULT 0.0,
                cost_per_1k_output REAL DEFAULT 0.0,
                is_default INTEGER DEFAULT 0
            );
            """
        )

        # 3. Research runs table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS research_runs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                prompt TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                budget_max_tokens INTEGER DEFAULT 50000,
                budget_max_searches INTEGER DEFAULT 10,
                budget_max_cost REAL DEFAULT 1.00,
                tokens_used INTEGER DEFAULT 0,
                estimated_cost REAL DEFAULT 0.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            );
            """
        )

        # 4. Structured execution event journal for SSE and live timeline replay
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS run_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                step INTEGER NOT NULL,
                agent_role TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
            );
            """
        )

        # 5. Search queries record
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS search_queries (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                query_text TEXT NOT NULL,
                provider TEXT NOT NULL,
                result_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
            );
            """
        )

        # 6. Fetched web sources cache
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sources (
                id TEXT PRIMARY KEY,
                url TEXT UNIQUE NOT NULL,
                url_hash TEXT UNIQUE NOT NULL,
                domain TEXT NOT NULL,
                title TEXT,
                author TEXT,
                published_date TEXT,
                content_markdown TEXT NOT NULL,
                char_count INTEGER NOT NULL,
                fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # 7. Evidence chunks table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS evidence_chunks (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
                FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
            );
            """
        )

        # 8. SQLite FTS5 index for fast lexical BM25 keyword retrieval
        conn.execute(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS evidence_chunks_fts USING fts5(
                id UNINDEXED,
                content,
                tokenize='unicode61'
            );
            """
        )

        # FTS5 Synchronization Triggers to prevent index drift
        conn.execute(
            """
            CREATE TRIGGER IF NOT EXISTS evidence_chunks_ai AFTER INSERT ON evidence_chunks
            BEGIN
                INSERT INTO evidence_chunks_fts(id, content)
                VALUES (new.id, new.content);
            END;
            """
        )
        conn.execute(
            """
            CREATE TRIGGER IF NOT EXISTS evidence_chunks_ad AFTER DELETE ON evidence_chunks
            BEGIN
                DELETE FROM evidence_chunks_fts WHERE id = old.id;
            END;
            """
        )
        conn.execute(
            """
            CREATE TRIGGER IF NOT EXISTS evidence_chunks_au AFTER UPDATE ON evidence_chunks
            BEGIN
                DELETE FROM evidence_chunks_fts WHERE id = old.id;
                INSERT INTO evidence_chunks_fts(id, content)
                VALUES (new.id, new.content);
            END;
            """
        )

        # 9. Claims ledger
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS claims (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                statement TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'proposed',
                confidence_score REAL DEFAULT 0.0,
                contradiction_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
            );
            """
        )

        # 10. Citations linking claims directly to evidence chunks with uniqueness protection
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS claim_citations (
                id TEXT PRIMARY KEY,
                claim_id TEXT NOT NULL,
                evidence_chunk_id TEXT NOT NULL,
                verbatim_quote TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(claim_id, evidence_chunk_id, verbatim_quote),
                FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
                FOREIGN KEY (evidence_chunk_id) REFERENCES evidence_chunks(id) ON DELETE CASCADE
            );
            """
        )

        # 11. Exportable artifacts
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS artifacts (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                artifact_type TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE
            );
            """
        )

        # 12. Performance Indexes for Query Optimization
        conn.execute("CREATE INDEX IF NOT EXISTS idx_run_events_run_created ON run_events(run_id, created_at);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_evidence_chunks_run ON evidence_chunks(run_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_evidence_chunks_source ON evidence_chunks(source_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_claims_run ON claims(run_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_claim_citations_claim ON claim_citations(claim_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_claim_citations_chunk ON claim_citations(evidence_chunk_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sources_domain ON sources(domain);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sources_fetched ON sources(fetched_at);")

        # 13. Subagents registry table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS custom_subagents (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                color TEXT DEFAULT '#eab308',
                model TEXT DEFAULT 'Inherit',
                allowed_tools TEXT DEFAULT 'Default all permissions',
                system_prompt TEXT,
                inject_agents_md INTEGER DEFAULT 1,
                is_enabled INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # 14. Skills registry table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS custom_skills (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                allowed_tools TEXT DEFAULT 'Default all permissions',
                instructions TEXT,
                is_enabled INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # Pre-seed default subagents if table is empty
        sub_count = conn.execute("SELECT COUNT(*) FROM custom_subagents;").fetchone()[0]
        if sub_count == 0:
            default_subagents = [
                ("sub_1", "accessibility-specialist", ">-", "#eab308", "Inherit", "All tools", "Audits accessibility and screen-reader semantics.", 1, 1),
                ("sub_2", "algorithm-specialist", "'Analyzes algorithmic cost and structure choice: asymptotic time and space, invariants, data-structure", "#3b82f6", "Inherit", "All tools", "Specialized in data structures and algorithmic complexity.", 1, 1),
                ("sub_3", "api-architect", ">-", "#10b981", "Inherit", "All tools", "Designs clean REST, GraphQL, and RPC contracts.", 1, 1),
                ("sub_4", "browser-automation", ">-", "#06b6d4", "Inherit", "All tools", "Executes headless browser tests and interactions.", 1, 1),
                ("sub_5", "code-implementer", ">-", "#8b5cf6", "Inherit", "All tools", "Writes robust, production-grade clean code.", 1, 1),
                ("sub_6", "codebase-cartographer", ">-", "#ec4899", "Inherit", "All tools", "Maps file hierarchies and symbol dependencies.", 1, 1),
                ("sub_7", "comment-sicko", ">-", "#f97316", "Inherit", "All tools", "Audits comment accuracy and code documentation.", 1, 1),
                ("sub_8", "compliance-engineer", ">-", "#64748b", "Inherit", "All tools", "Enforces regulatory standards and data governance.", 1, 1),
                ("sub_9", "cybersecurity-specialist", ">-", "#ef4444", "Inherit", "All tools", "Identifies attack vectors and hardens attack surfaces.", 1, 1),
                ("sub_10", "data-engineer", ">-", "#14b8a6", "Inherit", "All tools", "Builds reliable ETL pipelines and data warehouses.", 1, 1),
                ("sub_11", "db-architect", ">-", "#f59e0b", "Inherit", "All tools", "Optimizes relational schemas, indices, and transactions.", 1, 1),
                ("sub_12", "debate-chair", ">-", "#a855f7", "Inherit", "All tools", "Adjudicates adversarial debate rounds and weighs tradeoffs.", 1, 1),
                ("sub_13", "planner", "Deconstructs hypotheses, breaks down research goals, and schedules validation steps", "#06b6d4", "Inherit", "All tools", "Principal planning and hypothesis formulation agent.", 1, 1),
                ("sub_14", "skeptic", "Adversarial debate challenger and bias auditor", "#ef4444", "Inherit", "All tools", "Challenging assertions, probing edge cases, and auditing cognitive bias.", 1, 1),
                ("sub_15", "editor", "Synthesizes verified claims, audits citations, and generates final reports", "#10b981", "Inherit", "All tools", "Synthesizes multi-source claims and writes clear cited reports.", 1, 1),
                ("sub_16", "researcher", "Multi-source deep crawler and evidence extractor", "#3b82f6", "Inherit", "All tools", "Searches and extracts verbatim evidence into SQLite FTS5.", 1, 1),
            ]
            conn.executemany(
                """
                INSERT INTO custom_subagents (id, name, description, color, model, allowed_tools, system_prompt, inject_agents_md, is_enabled)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                default_subagents,
            )

        # Pre-seed default skills if table is empty
        skill_count = conn.execute("SELECT COUNT(*) FROM custom_skills;").fetchone()[0]
        if skill_count == 0:
            default_skills = [
                ("sk_1", "accessibility-audit", "Audits and remediates web accessibility against WCAG 2.2 AA: keyboard-only operation, screen-reader semantics, focus management...", "Default all permissions", "Run WCAG 2.2 AA audit checklist.", 1),
                ("sk_2", "adr-engineering", "Records architecture decisions as ADRs: context, options considered, trade-off, consequence, and a revisit trigger. Use when a...", "Default all permissions", "Write ADR with context, decision, consequences.", 1),
                ("sk_3", "agent-browser", "Uses the standalone `agent-browser` CLI for CDP-driven browser work: navigation, clicks, form filling, accessibility snapshots...", "Default all permissions", "Drive headless browser interactions.", 1),
                ("sk_4", "agent-config-maintenance", "Maintains the agent and skill configuration itself: roster hygiene, routing accuracy, duplicate triggers, description tuning, depr...", "Default all permissions", "Maintain agents and skill metadata.", 1),
                ("sk_5", "agent-harness-design", "Designs the agent itself: prompt and skill contracts, tool schemas, subagent boundaries, context budgets, model tiering, and t...", "Default all permissions", "Architect agent execution contracts.", 1),
                ("sk_6", "algorithms-and-data-structures", "Reasons about algorithmic cost and structure choice in production code: complexity analysis, the working set of patterns (two ...", "Default all permissions", "Analyze asymptotic time and space.", 1),
                ("sk_7", "animation-web-builder", "Builds scroll-driven, motion-rich web experiences: image-sequence canvas animation, GSAP ScrollTrigger, parallax, section tran...", "Default all permissions", "Build high-performance web animations.", 1),
                ("sk_8", "api-design-architect", "Designs API contracts for REST, GraphQL, and gRPC: resources, endpoints, naming, error shape, pagination, versioning, idemp...", "Default all permissions", "Architect robust API contracts.", 1),
                ("sk_9", "architect", "Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. Use for /archit...", "Default all permissions", "System architecture sketch before coding.", 1),
                ("sk_10", "arena", "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena t...", "Default all permissions", "Run tournament arena over competing code solutions.", 1),
                ("sk_11", "automate-me", "Use for 'automate me', 'create/update/refresh my -mode skill', 'turn/capture my preferences or working style into a skill', or ...", "Default all permissions", "Automate personalized workflow skills.", 1),
                ("sk_12", "background-jobs-engineer", "Designs work that runs outside a request: queues, workers, cron and delayed jobs, retries with backoff, dead-letter queues, ide...", "Default all permissions", "Build resilient asynchronous queues.", 1),
                ("sk_13", "web-search", "Real-time search query execution with BM25 reranking across public web engines", "Default all permissions", "Search the web and parse result markdown.", 1),
                ("sk_14", "web-fetch", "Fetches and cleans web pages into compact markdown for evidence extraction", "Default all permissions", "Fetch URL and convert to markdown.", 1),
                ("sk_15", "sqlite-fts5", "BM25 full-text keyword retrieval across local chunk database without vector DB overhead", "Default all permissions", "Execute FTS5 MATCH queries on SQLite.", 1),
            ]
            conn.executemany(
                """
                INSERT INTO custom_skills (id, name, description, allowed_tools, instructions, is_enabled)
                VALUES (?, ?, ?, ?, ?, ?);
                """,
                default_skills,
            )

        conn.commit()


@contextmanager
def get_db(db_path: Path = DATABASE_PATH) -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield conn
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Database schema initialized successfully at: {DATABASE_PATH}")
