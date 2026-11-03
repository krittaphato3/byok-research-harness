"""
Application Configuration and Runtime Defaults.
Loads optional .env file and sets sane defaults for local-first execution.
"""

from __future__ import annotations

import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(DATA_DIR / "harness.db")))
MASTER_KEY_PATH = Path(os.getenv("MASTER_KEY_PATH", str(DATA_DIR / "master.key")))

# Budget & Governor Defaults
DEFAULT_MAX_TOKENS = int(os.getenv("DEFAULT_MAX_TOKENS", "50000"))
DEFAULT_MAX_SEARCHES = int(os.getenv("DEFAULT_MAX_SEARCHES", "10"))
DEFAULT_MAX_PAGES = int(os.getenv("DEFAULT_MAX_PAGES", "8"))
DEFAULT_MAX_COST_DOLLARS = float(os.getenv("DEFAULT_MAX_COST_DOLLARS", "1.00"))
DEFAULT_RUN_TIMEOUT_SECONDS = int(os.getenv("DEFAULT_RUN_TIMEOUT_SECONDS", "180"))

# Webfetch & Scraper Defaults
FETCH_TIMEOUT_SECONDS = float(os.getenv("FETCH_TIMEOUT_SECONDS", "15.0"))
FETCH_MAX_BYTES = int(os.getenv("FETCH_MAX_BYTES", "5_000_000"))  # 5MB ceiling
FETCH_USER_AGENT = os.getenv(
    "FETCH_USER_AGENT",
    "BYOK-Research-Harness/0.1.0 (+https://github.com/local/byok-harness)",
)

# Evidence Chunker Defaults
CHUNK_SIZE_CHARS = int(os.getenv("CHUNK_SIZE_CHARS", "2000"))
CHUNK_OVERLAP_CHARS = int(os.getenv("CHUNK_OVERLAP_CHARS", "200"))

# Search Defaults
DEFAULT_SEARCH_PROVIDER = os.getenv("DEFAULT_SEARCH_PROVIDER", "searxng").lower()
SEARCH_MAX_RESULTS = int(os.getenv("SEARCH_MAX_RESULTS", "5"))

# Provider Endpoint Defaults
DEFAULT_ENDPOINT_URL = os.getenv("DEFAULT_ENDPOINT_URL", "http://localhost:20128/v1")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "auto/qwen")

# Ensure data directory exists on import
DATA_DIR.mkdir(parents=True, exist_ok=True)
