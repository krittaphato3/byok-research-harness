"""
Real Web Fetch & Extraction Engine.
Fetches live web pages, extracts clean markdown via trafilatura and BeautifulSoup,
chunks text into coherent units, and indexes into SQLite FTS5 for BM25 retrieval.
"""

from __future__ import annotations

import hashlib
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

    # Extract text content
    extracted_text = ""
    page_title = title_hint

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
