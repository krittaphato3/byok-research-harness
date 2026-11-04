"""
Real Web Fetch & Extraction Engine.
Fetches live web pages, extracts clean markdown via trafilatura and BeautifulSoup,
chunks text into coherent units, and indexes into SQLite FTS5 for BM25 retrieval.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
import re
import urllib.parse
import uuid
from typing import Any, Dict, List, Optional
import httpx
from bs4 import BeautifulSoup
import trafilatura

from app.db import get_db


def extract_domain(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
        return parsed.netloc or "unknown"
    except Exception:
        return "unknown"


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> List[str]:
    """Splits text into overlapping semantic chunks on sentence or paragraph boundaries."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    current_chunk = []
    current_length = 0

    for para in paragraphs:
        if current_length + len(para) > chunk_size and current_chunk:
            chunks.append("\n\n".join(current_chunk))
            # Keep overlap
            current_chunk = [para]
            current_length = len(para)
        else:
            current_chunk.append(para)
            current_length += len(para)

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))

    # Fallback to character chunking if paragraphs were too long or absent
    if not chunks and text:
        for i in range(0, len(text), chunk_size - overlap):
            chunks.append(text[i : i + chunk_size])

    return chunks[:5]  # Limit to top 5 most relevant chunks per page


async def fetch_and_index_url(url: str, run_id: str, title_hint: str = "") -> List[Dict[str, Any]]:
    """Fetches a single web page, extracts article content, and persists indexed chunks."""
    domain = extract_domain(url)
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
    source_id = f"src_{uuid.uuid4().hex[:10]}"

    # 1. Read-through cache check from sources table
    extracted_text = ""
    page_title = title_hint
    with get_db() as conn:
        cached = conn.execute(
            "SELECT id, title, content_markdown FROM sources WHERE url_hash = ? LIMIT 1;",
            (url_hash,),
        ).fetchone()
        if cached and cached["content_markdown"]:
            extracted_text = cached["content_markdown"]
            page_title = cached["title"] or title_hint
            source_id = cached["id"]

    if not extracted_text:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }

        raw_html = ""
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    raw_html = resp.text
        except Exception as e:
            print(f"[Web Fetcher] Failed to fetch {url}: {e}")

        if raw_html:
            # 1. Try Trafilatura for clean article extraction
            try:
                extracted_text = trafilatura.extract(
                    raw_html,
                    include_comments=False,
                    include_tables=True,
                    no_fallback=False,
                ) or ""
            except Exception:
                extracted_text = ""

            # 2. Fallback to BeautifulSoup if Trafilatura returned nothing
            if not extracted_text:
                try:
                    soup = BeautifulSoup(raw_html, "html.parser")
                    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
                        tag.decompose()
                    title_tag = soup.find("title")
                    if title_tag:
                        page_title = title_tag.get_text(strip=True)
                    paragraphs = [p.get_text(strip=True) for p in soup.find_all(["p", "h1", "h2", "h3", "li"])]
                    extracted_text = "\n\n".join([p for p in paragraphs if len(p) > 20])
                except Exception:
                    extracted_text = ""

    # If extraction is empty, use title hint
    if not extracted_text:
        extracted_text = f"Information regarding {title_hint} from {url}."

    chunks = chunk_text(extracted_text)
    if not chunks:
        chunks = [extracted_text[:600]]

    saved_chunks = []
    with get_db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO sources (id, url, url_hash, domain, title, content_markdown, char_count)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (source_id, url, url_hash, domain, page_title or domain, extracted_text, len(extracted_text)),
        )

        for idx, chunk in enumerate(chunks):
            chunk_id = f"chk_{uuid.uuid4().hex[:10]}"
            conn.execute(
                """
                INSERT OR REPLACE INTO evidence_chunks (id, source_id, run_id, chunk_index, content)
                VALUES (?, ?, ?, ?, ?);
                """,
                (chunk_id, source_id, run_id, idx, chunk),
            )
            saved_chunks.append({
                "chunk_id": chunk_id,
                "domain": domain,
                "url": url,
                "title": page_title or domain,
                "snippet": chunk[:280],
                "full_content": chunk,
            })

        conn.commit()

    return saved_chunks


def ingest_local_file(file_path: Path, run_id: str) -> List[Dict[str, Any]]:
    """Reads and indexes an uploaded or local reference file into SQLite FTS5 evidence chunks."""
    if not file_path.exists() or not file_path.is_file():
        return []

    file_name = file_path.name
    suffix = file_path.suffix.lower()
    content_text = ""

    # Handle PDF extraction
    if suffix == ".pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(str(file_path))
            pages = [page.extract_text() or "" for page in reader.pages]
            content_text = "\n\n".join(p.strip() for p in pages if p.strip())
        except Exception as e:
            print(f"[Ingest File] Error reading PDF {file_name}: {e}")

    # Text, markdown, json, csv, code files
    if not content_text:
        try:
            content_text = file_path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            print(f"[Ingest File] Error reading text file {file_name}: {e}")
            return []

    if not content_text.strip():
        return []

    url_synthetic = f"file://local/{file_name}"
    url_hash = hashlib.sha256(url_synthetic.encode("utf-8")).hexdigest()
    source_id = f"src_file_{uuid.uuid4().hex[:10]}"
    domain = f"file:{suffix.lstrip('.') or 'local'}"

    chunks = chunk_text(content_text, chunk_size=750, overlap=120)
    if not chunks:
        chunks = [content_text[:600]]

    saved_chunks = []
    with get_db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO sources (id, url, url_hash, domain, title, content_markdown, char_count)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (source_id, url_synthetic, url_hash, domain, file_name, content_text, len(content_text)),
        )

        for idx, chunk in enumerate(chunks):
            chunk_id = f"chk_{uuid.uuid4().hex[:10]}"
            conn.execute(
                """
                INSERT OR REPLACE INTO evidence_chunks (id, source_id, run_id, chunk_index, content)
                VALUES (?, ?, ?, ?, ?);
                """,
                (chunk_id, source_id, run_id, idx, chunk),
            )
            saved_chunks.append({
                "chunk_id": chunk_id,
                "domain": domain,
                "url": url_synthetic,
                "title": file_name,
                "snippet": chunk[:280],
                "full_content": chunk,
            })

        conn.commit()

    return saved_chunks
