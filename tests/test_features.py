"""
Unit and integration tests for new features:
1. Execution modes (fast, debate, deep_research)
2. SQLite FTS5 BM25 search
3. Local file ingestion
4. Multi-agent debate transcript in exports (Markdown, HTML, JSON)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Any, List

from app.db import init_db, get_db, search_evidence_fts
from app.fetch.web_fetcher import ingest_local_file
from app.export.exporter import export_to_markdown, export_to_html, export_to_json_dossier

TEST_DB_PATH = Path("data/test_features_harness.db")


def test_fts5_bm25_retrieval():
    db_path = Path("data/test_fts5.db")
    if db_path.exists():
        try:
            db_path.unlink()
        except Exception:
            pass

    init_db(db_path)

    with get_db(db_path) as conn:
        conn.execute("INSERT INTO research_runs (id, title, prompt, mode) VALUES ('run-fts', 'FTS Run', 'Prompt', 'deep_research');")
        conn.execute(
            """
            INSERT INTO sources (id, url, url_hash, domain, title, content_markdown, char_count)
            VALUES ('src-fts', 'https://example.com/fts', 'hash-fts', 'example.com', 'FTS Benchmark', 'Full text content', 17);
            """
        )
        conn.execute(
            """
            INSERT INTO evidence_chunks (id, source_id, run_id, chunk_index, content)
            VALUES
                ('chk-10', 'src-fts', 'run-fts', 0, 'Asynchronous event streaming in FastAPI using Server-Sent Events'),
                ('chk-11', 'src-fts', 'run-fts', 1, 'SQLite Write-Ahead Logging WAL mode provides superior concurrency'),
                ('chk-12', 'src-fts', 'run-fts', 2, 'Adversarial multi-agent debate architecture for validation');
            """
        )
        conn.commit()

    # Search for WAL mode
    results = search_evidence_fts(run_id="run-fts", query="Write-Ahead Logging concurrency", limit=2, db_path=db_path)
    assert len(results) > 0, "FTS5 query should return matched chunks"
    assert "WAL" in results[0]["content"], f"Expected WAL chunk first, got: {results[0]['content']}"

    # Search for debate
    results_debate = search_evidence_fts(run_id="run-fts", query="Adversarial debate", limit=2, db_path=db_path)
    assert len(results_debate) > 0, "FTS5 query should return debate chunk"
    assert "debate" in results_debate[0]["content"].lower()

    print("PASS: test_fts5_bm25_retrieval")


def test_file_ingestion():
    # Use default DATABASE_PATH for file ingestion test
    # Create a temporary local file to ingest
    tmp_file = Path("data/uploads/sample_reference_document.txt")
    tmp_file.parent.mkdir(parents=True, exist_ok=True)
    tmp_file.write_text(
        "Local Knowledge Context:\n"
        "The BYOK WebUI uses AES-256-GCM encryption for credentials.\n"
        "FTS5 provides BM25 ranked document retrieval.\n",
        encoding="utf-8"
    )

    with get_db() as conn:
        conn.execute("INSERT OR REPLACE INTO research_runs (id, title, prompt, mode) VALUES ('run-file', 'File Run', 'Prompt', 'deep_research');")
        conn.commit()

    chunks = ingest_local_file(tmp_file, "run-file")
    assert len(chunks) > 0, "Ingesting a local text file should produce indexed chunks"
    assert "file:" in chunks[0]["domain"]

    # Verify search finds the newly ingested file
    results = search_evidence_fts("run-file", "AES-256-GCM encryption", limit=2)
    assert len(results) > 0, "Search should retrieve ingested local file chunks"
    assert "AES-256-GCM" in results[0]["content"]

    print("PASS: test_file_ingestion")


def test_export_engine_with_debate():
    run = {
        "id": "run-test-export",
        "title": "Quantum Computing vs Silicon",
        "prompt": "Evaluate quantum decoherence challenges",
        "created_at": "2026-11-04 12:00:00",
    }
    report = "### Summary\nQuantum computing faces decoherence."
    thoughts = "Evaluated thermal noise against superconducting qubits."
    evidence = [
        {"chunk_id": "c1", "domain": "arxiv.org", "title": "Decoherence Paper", "url": "https://arxiv.org/1", "snippet": "Noise limits qubit life."}
    ]
    debate = [
        {
            "id": "deb-1",
            "round": 1,
            "speaker": "proposer",
            "speakerName": "Lead Architect (Proposer)",
            "speakerRole": "Opening Thesis",
            "avatarColor": "#38bdf8",
            "content": "Superconducting qubits show promise despite error rates.",
            "timestamp": "12:00:05",
        },
        {
            "id": "deb-2",
            "round": 1,
            "speaker": "skeptic",
            "speakerName": "Adversarial Challenger (Skeptic)",
            "speakerRole": "Error Margin Critique",
            "avatarColor": "#f59e0b",
            "content": "Cryogenic overhead renders scaling impractical for edge applications.",
            "timestamp": "12:00:15",
        },
    ]

    # 1. Test Markdown Export
    md = export_to_markdown(run, report, thoughts, evidence, debate=debate)
    assert "## Adversarial Multi-Agent Court Debate Transcript" in md
    assert "Superconducting qubits show promise" in md
    assert "Cryogenic overhead renders scaling impractical" in md
    assert "arxiv.org" in md

    # 2. Test HTML Export
    html_out = export_to_html(run, report, thoughts, evidence, debate=debate)
    assert "<!DOCTYPE html>" in html_out
    assert "Multi-Agent Adversarial Court Debate" in html_out
    assert "Lead Architect (Proposer)" in html_out
    assert "Adversarial Challenger (Skeptic)" in html_out
    assert "Print / Save PDF" in html_out

    # 3. Test JSON Dossier Export
    dossier = export_to_json_dossier(run, report, thoughts, events=[], evidence=evidence, debate=debate)
    assert "debate_transcript" in dossier
    assert len(dossier["debate_transcript"]) == 2
    assert dossier["synthesis"]["report"] == report

    print("PASS: test_export_engine_with_debate")


if __name__ == "__main__":
    test_fts5_bm25_retrieval()
    test_file_ingestion()
    test_export_engine_with_debate()
    print("\nALL FEATURE UNIT TESTS PASSED.")
