"""
Tests for SQLite Database Schema, Triggers, and FTS5 Synchronization.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from app.db import init_db, get_db

TEST_DB_PATH = Path("data/test_harness.db")


def test_schema_and_fts_sync():
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()

    # 1. Initialize schema
    init_db(TEST_DB_PATH)
    assert TEST_DB_PATH.exists(), "Test database was not created."

    with get_db(TEST_DB_PATH) as conn:
        # Verify foreign keys and WAL mode
        mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
        assert mode.lower() == "wal", f"Expected WAL mode, got {mode}"

        # 2. Insert test run and source
        conn.execute("INSERT INTO research_runs (id, title, prompt) VALUES ('run-1', 'Test Run', 'Prompt 1');")
        conn.execute(
            """
            INSERT INTO sources (id, url, url_hash, domain, content_markdown, char_count)
            VALUES ('src-1', 'https://example.com/test', 'hash-1', 'example.com', '# Title', 7);
            """
        )

        # 3. Test FTS5 INSERT trigger
        conn.execute(
            """
            INSERT INTO evidence_chunks (id, source_id, run_id, chunk_index, content)
            VALUES ('chk-1', 'src-1', 'run-1', 0, 'FastAPI with SQLite FTS5 lexical BM25 retrieval');
            """
        )
        conn.commit()

        # Check FTS index directly
        fts_match = conn.execute(
            "SELECT id FROM evidence_chunks_fts WHERE evidence_chunks_fts MATCH 'lexical BM25';"
        ).fetchone()
        assert fts_match is not None and fts_match["id"] == "chk-1", "FTS5 insert trigger failed."

        # 4. Test FTS5 UPDATE trigger
        conn.execute(
            "UPDATE evidence_chunks SET content = 'Updated content with quantum computing' WHERE id = 'chk-1';"
        )
        conn.commit()

        old_match = conn.execute(
            "SELECT id FROM evidence_chunks_fts WHERE evidence_chunks_fts MATCH 'lexical BM25';"
        ).fetchone()
        assert old_match is None, "FTS5 update trigger failed to clear old content."

        new_match = conn.execute(
            "SELECT id FROM evidence_chunks_fts WHERE evidence_chunks_fts MATCH 'quantum';"
        ).fetchone()
        assert new_match is not None and new_match["id"] == "chk-1", "FTS5 update trigger failed to index new content."

        # 5. Test FTS5 DELETE trigger
        conn.execute("DELETE FROM evidence_chunks WHERE id = 'chk-1';")
        conn.commit()

        del_match = conn.execute(
            "SELECT id FROM evidence_chunks_fts WHERE evidence_chunks_fts MATCH 'quantum';"
        ).fetchone()
        assert del_match is None, "FTS5 delete trigger failed to remove content."

        # 6. Test claim citation uniqueness constraint
        conn.execute("INSERT INTO claims (id, run_id, statement) VALUES ('clm-1', 'run-1', 'Statement A');")
        conn.execute(
            """
            INSERT INTO evidence_chunks (id, source_id, run_id, chunk_index, content)
            VALUES ('chk-2', 'src-1', 'run-1', 0, 'Evidence sample');
            """
        )
        conn.execute(
            """
            INSERT INTO claim_citations (id, claim_id, evidence_chunk_id, verbatim_quote)
            VALUES ('cit-1', 'clm-1', 'chk-2', 'Evidence sample');
            """
        )
        conn.commit()

        try:
            conn.execute(
                """
                INSERT INTO claim_citations (id, claim_id, evidence_chunk_id, verbatim_quote)
                VALUES ('cit-2', 'clm-1', 'chk-2', 'Evidence sample');
                """
            )
            conn.commit()
            duplicate_blocked = False
        except sqlite3.IntegrityError:
            duplicate_blocked = True

        assert duplicate_blocked, "Unique constraint on claim_citations failed to block duplicate."

    print("ALL TESTS PASSED: Schema, FTS5 sync triggers, and unique constraints verified.")


if __name__ == "__main__":
    test_schema_and_fts_sync()
