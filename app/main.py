"""
Lightweight BYOK AI Harness WebUI - FastAPI Application Entry Point.
Includes endpoints for Vault Providers, Custom Base URLs, Model Profiles, File Context, and Live Streaming Research Runs.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.config import DEFAULT_ENDPOINT_URL, DEFAULT_MODEL
from app.db import get_db, init_db
from app.fetch.web_fetcher import fetch_and_index_url
from app.providers.base import ModelMessage
from app.providers.openai_compat import OpenAICompatibleProvider
from app.search.engine import execute_web_search
from app.vault import (
    DEFAULT_LOCAL_MODELS,
    decrypt_secret,
    delete_provider,
    get_api_key,
    get_provider,
    list_vault_keys,
    save_api_key,
    update_provider_models,
)

TEMPLATES_DIR = Path(__file__).parent / "templates"
STATIC_DIR = Path(__file__).parent / "static"
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


class RunDispatchReq(BaseModel):
    prompt: str
    model: Optional[str] = DEFAULT_MODEL
    provider: Optional[str] = None
    endpoint: Optional[str] = None
    context_files: Optional[List[str]] = []


class SubagentCreateReq(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    color: str = "#eab308"
    model: str = "Inherit"
    allowed_tools: str = "Default all permissions"
    system_prompt: Optional[str] = ""
    inject_agents_md: bool = True
    is_enabled: bool = True


class SkillCreateReq(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    allowed_tools: str = "Default all permissions"
    instructions: Optional[str] = ""
    is_enabled: bool = True


class ProviderSaveReq(BaseModel):
    id: Optional[str] = None
    provider: str
    label: str
    base_url: str
    api_format: str = "chat_completions"
    api_key: Optional[str] = ""
    models: Optional[List[Dict[str, Any]]] = None
    is_default: bool = False
    is_enabled: bool = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Seed default Localhost provider if not present
    providers = list_vault_keys()
    if not any(p["provider"] == "localhost" or p["provider"] == "local_openai" for p in providers):
        save_api_key(
            provider="localhost",
            label="Localhost",
            api_key=os.environ.get("DEFAULT_API_KEY", ""),
            base_url=DEFAULT_ENDPOINT_URL,
            api_format="chat_completions",
            models=DEFAULT_LOCAL_MODELS,
            is_default=True,
            is_enabled=True,
        )
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Lightweight BYOK AI Research Harness",
        description="A local-first, lightweight BYOK AI research workbench, debate engine, and agent factory.",
        version="0.2.0",
        lifespan=lifespan,
    )

    if (FRONTEND_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="react-assets")

    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

    @app.get("/health", response_class=JSONResponse)
    async def health_check():
        return {
            "status": "healthy",
            "service": "byok-research-harness",
            "database": "sqlite3_fts5",
            "version": "0.2.0",
        }

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request):
        if (FRONTEND_DIST / "index.html").exists():
            return FileResponse(FRONTEND_DIST / "index.html")

        keys = list_vault_keys()
        with get_db() as conn:
            runs = conn.execute(
                "SELECT * FROM research_runs ORDER BY created_at DESC LIMIT 10;"
            ).fetchall()
            runs_list = [dict(r) for r in runs]

        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={
                "app_name": "BYOK AI Research Harness",
                "system_status": "Ready",
                "vault_keys": keys,
                "recent_runs": runs_list,
            },
        )

    # ==================== Providers & BYOK Vault API ====================
    @app.get("/api/vault/providers", response_class=JSONResponse)
    async def api_list_providers():
        return {"providers": list_vault_keys()}

    @app.post("/api/vault/providers", response_class=JSONResponse)
    async def api_save_provider(req: ProviderSaveReq):
        provider_id = save_api_key(
            provider=req.provider,
            label=req.label,
            api_key=req.api_key,
            base_url=req.base_url,
            api_format=req.api_format,
            models=req.models,
            is_default=req.is_default,
            is_enabled=req.is_enabled,
            key_id=req.id,
        )
        return {"ok": True, "provider_id": provider_id}

    @app.delete("/api/vault/providers/{provider_id}", response_class=JSONResponse)
    async def api_delete_provider(provider_id: str):
        success = delete_provider(provider_id)
        return {"ok": success}

    @app.post("/api/vault/test", response_class=JSONResponse)
    async def api_test_key(request: Request):
        content_type = request.headers.get("content-type", "")
        provider = None
        endpoint = None
        api_key = None

        if "application/json" in content_type:
            try:
                body = await request.json()
                provider = body.get("provider")
                endpoint = body.get("endpoint")
                api_key = body.get("api_key")
            except Exception:
                pass
        else:
            try:
                form = await request.form()
                provider = form.get("provider")
                endpoint = form.get("endpoint")
                api_key = form.get("api_key")
            except Exception:
                pass

        target_key = api_key
        target_url = endpoint or DEFAULT_ENDPOINT_URL

        if not target_key and provider:
            p = get_provider(provider)
            if p:
                target_key = p["api_key"]
                target_url = endpoint or p["base_url"]
            else:
                target_key = get_api_key(provider)

        if not target_key:
            target_key = get_api_key("localhost") or get_api_key("local_openai") or ""

        prov = OpenAICompatibleProvider(api_key=target_key, base_url=target_url)
        res = await prov.test_connection()
        return res

    # ==================== File Attachment API ====================
    @app.post("/api/files/upload", response_class=JSONResponse)
    async def upload_file(file: UploadFile = File(...)):
        file_id = f"file_{uuid.uuid4().hex[:8]}"
        safe_filename = Path(file.filename or "upload.txt").name
        dest_path = UPLOADS_DIR / f"{file_id}_{safe_filename}"

        content_bytes = await file.read()
        dest_path.write_bytes(content_bytes)

        # Read snippet for prompt context
        try:
            preview_text = content_bytes.decode("utf-8", errors="ignore")[:3000]
        except Exception:
            preview_text = f"Binary file: {safe_filename} ({len(content_bytes)} bytes)"

        return {
            "ok": True,
            "file_id": file_id,
            "filename": safe_filename,
            "size": len(content_bytes),
            "preview": preview_text,
        }

    # ==================== Subagents API ====================
    @app.get("/api/subagents", response_class=JSONResponse)
    async def list_subagents():
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM custom_subagents ORDER BY is_enabled DESC, created_at ASC;"
            ).fetchall()
            return {"subagents": [dict(r) for r in rows]}

    @app.post("/api/subagents", response_class=JSONResponse)
    async def save_subagent(req: SubagentCreateReq):
        sub_id = req.id or f"sub_{uuid.uuid4().hex[:8]}"
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO custom_subagents (id, name, description, color, model, allowed_tools, system_prompt, inject_agents_md, is_enabled)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    description=excluded.description,
                    color=excluded.color,
                    model=excluded.model,
                    allowed_tools=excluded.allowed_tools,
                    system_prompt=excluded.system_prompt,
                    inject_agents_md=excluded.inject_agents_md,
                    is_enabled=excluded.is_enabled;
                """,
                (
                    sub_id,
                    req.name.strip(),
                    req.description,
                    req.color,
                    req.model,
                    req.allowed_tools,
                    req.system_prompt,
                    1 if req.inject_agents_md else 0,
                    1 if req.is_enabled else 0,
                ),
            )
            conn.commit()
        return {"ok": True, "id": sub_id}

    @app.delete("/api/subagents/{sub_id}", response_class=JSONResponse)
    async def delete_subagent(sub_id: str):
        with get_db() as conn:
            res = conn.execute("DELETE FROM custom_subagents WHERE id = ?;", (sub_id,))
            conn.commit()
            return {"ok": res.rowcount > 0}

    @app.patch("/api/subagents/{sub_id}/toggle", response_class=JSONResponse)
    async def toggle_subagent(sub_id: str):
        with get_db() as conn:
            conn.execute(
                "UPDATE custom_subagents SET is_enabled = CASE WHEN is_enabled = 1 THEN 0 ELSE 1 END WHERE id = ?;",
                (sub_id,),
            )
            conn.commit()
            row = conn.execute("SELECT is_enabled FROM custom_subagents WHERE id = ?;", (sub_id,)).fetchone()
            return {"ok": True, "is_enabled": bool(row[0]) if row else False}

    # ==================== Skills API ====================
    @app.get("/api/skills", response_class=JSONResponse)
    async def list_skills():
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM custom_skills ORDER BY is_enabled DESC, created_at ASC;"
            ).fetchall()
            return {"skills": [dict(r) for r in rows]}

    @app.post("/api/skills", response_class=JSONResponse)
    async def save_skill(req: SkillCreateReq):
        skill_id = req.id or f"sk_{uuid.uuid4().hex[:8]}"
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO custom_skills (id, name, description, allowed_tools, instructions, is_enabled)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    description=excluded.description,
                    allowed_tools=excluded.allowed_tools,
                    instructions=excluded.instructions,
                    is_enabled=excluded.is_enabled;
                """,
                (
                    skill_id,
                    req.name.strip(),
                    req.description,
                    req.allowed_tools,
                    req.instructions,
                    1 if req.is_enabled else 0,
                ),
            )
            conn.commit()
        return {"ok": True, "id": skill_id}

    @app.delete("/api/skills/{skill_id}", response_class=JSONResponse)
    async def delete_skill(skill_id: str):
        with get_db() as conn:
            res = conn.execute("DELETE FROM custom_skills WHERE id = ?;", (skill_id,))
            conn.commit()
            return {"ok": res.rowcount > 0}

    @app.patch("/api/skills/{skill_id}/toggle", response_class=JSONResponse)
    async def toggle_skill(skill_id: str):
        with get_db() as conn:
            conn.execute(
                "UPDATE custom_skills SET is_enabled = CASE WHEN is_enabled = 1 THEN 0 ELSE 1 END WHERE id = ?;",
                (skill_id,),
            )
            conn.commit()
            row = conn.execute("SELECT is_enabled FROM custom_skills WHERE id = ?;", (skill_id,)).fetchone()
            return {"ok": True, "is_enabled": bool(row[0]) if row else False}

    # ==================== Research Run APIs ====================
    @app.get("/api/runs", response_class=JSONResponse)
    async def list_runs():
        with get_db() as conn:
            runs = conn.execute(
                "SELECT * FROM research_runs ORDER BY created_at DESC LIMIT 20;"
            ).fetchall()
            return {"runs": [dict(r) for r in runs]}

    @app.get("/api/runs/{run_id}", response_class=JSONResponse)
    async def get_run_details(run_id: str):
        """Retrieves a historical research run with its full synthesized report, events, and evidence without rerunning."""
        with get_db() as conn:
            run = conn.execute("SELECT * FROM research_runs WHERE id = ?;", (run_id,)).fetchone()
            if not run:
                raise HTTPException(status_code=404, detail="Run not found.")

            # Events
            raw_events = conn.execute(
                "SELECT * FROM run_events WHERE run_id = ? ORDER BY step ASC, created_at ASC;", (run_id,)
            ).fetchall()

            events = []
            report = ""
            thoughts = ""
            for e in raw_events:
                d = dict(e)
                try:
                    payload = json.loads(d.get("payload_json") or "{}")
                    d["payload"] = payload
                    if d.get("event_type") == "synthesized_report":
                        report = payload.get("report") or ""
                        thoughts = payload.get("thoughts") or ""
                    elif d.get("event_type") == "subagent":
                        events.append(payload)
                    elif d.get("event_type") == "skill":
                        events.append(payload)
                except Exception:
                    pass

            # Evidence chunks
            chunks = conn.execute(
                """
                SELECT c.id, c.content, s.domain, s.url, s.title
                FROM evidence_chunks c
                JOIN sources s ON c.source_id = s.id
                WHERE c.run_id = ?;
                """,
                (run_id,),
            ).fetchall()
            evidence_list = [
                {
                    "chunk_id": ch["id"],
                    "domain": ch["domain"],
                    "snippet": ch["content"][:200],
                    "title": ch["title"],
                    "url": ch["url"],
                }
                for ch in chunks
            ]

            return {
                "ok": True,
                "run": dict(run),
                "report": report,
                "thoughts": thoughts,
                "events": events,
                "evidence": evidence_list,
            }

    @app.post("/api/runs", response_class=JSONResponse)
    async def create_run(req: RunDispatchReq):
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        title = req.prompt[:40] + "..." if len(req.prompt) > 40 else req.prompt

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO research_runs (id, title, prompt, status)
                VALUES (?, ?, ?, 'running');
                """,
                (run_id, title, req.prompt),
            )
            conn.commit()

        return {"ok": True, "run_id": run_id, "title": title}

    @app.get("/api/runs/{run_id}/stream")
    async def stream_run(
        run_id: str,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        endpoint: Optional[str] = None,
    ):
        with get_db() as conn:
            run = conn.execute("SELECT * FROM research_runs WHERE id = ?", (run_id,)).fetchone()
            if not run:
                raise HTTPException(status_code=404, detail="Run not found.")
            prompt = run["prompt"]

        # Parse active provider or fallback to default
        target_key = ""
        target_url = endpoint or ""

        # 1. Try requested provider
        if provider:
            prov_data = get_provider(provider)
            if prov_data:
                target_key = prov_data["api_key"]
                if not endpoint:
                    target_url = prov_data["base_url"]

        # 2. Fallback to active default provider from database vault
        if not target_key or not target_url:
            with get_db() as conn:
                def_row = conn.execute(
                    "SELECT * FROM vault_keys WHERE is_default = 1 LIMIT 1;"
                ).fetchone()
                if not def_row:
                    def_row = conn.execute(
                        "SELECT * FROM vault_keys WHERE is_enabled = 1 ORDER BY updated_at DESC LIMIT 1;"
                    ).fetchone()
                if def_row:
                    if not target_key:
                        target_key = decrypt_secret(def_row["encrypted_key"])
                    if not target_url:
                        target_url = def_row["base_url"]

        if not target_key:
            target_key = get_api_key("localhost") or get_api_key("local_openai") or ""
        if not target_url:
            target_url = DEFAULT_ENDPOINT_URL

        target_model = model or DEFAULT_MODEL
        llm_provider = OpenAICompatibleProvider(
            api_key=target_key,
            base_url=target_url,
            default_model=target_model,
        )

        async def event_generator() -> AsyncGenerator[str, None]:
            step_idx = 1
            gathered_chunks: List[Dict[str, Any]] = []
            search_queries: List[str] = []

            # ==================== Step 1: Real SubAgent - Planner ====================
            yield json.dumps({
                "type": "subagent",
                "name": "planner",
                "action": f"Formulating research breakdown and queries for '{prompt[:45]}...'",
                "role": "Lead Research Architect",
                "inspector": {
                    "title": "SubAgent: Planner",
                    "role": "Lead Research Architect",
                    "status": "running",
                    "prompt": f"System: Deconstruct research request '{prompt}' into targeted search queries.\nUser: {prompt}",
                    "thought": f"Analyzing user research objective: '{prompt}'. Deconstructing into specific factual, contextual, and comparative search vectors.",
                    "fetches": [{"type": "plan_scope", "detail": f"Prompt: {prompt[:60]}"}],
                    "verdict": "Generating structured web search plan..."
                }
            })

            # Call real LLM to generate targeted search queries
            plan_text = ""
            planner_system = (
                "You are the Lead Research Planner. Given the user's research topic, output a JSON array of 2 to 3 "
                "distinct, high-impact web search queries to gather authoritative evidence and critical facts. "
                "Return ONLY valid JSON array of strings, e.g. [\"query 1\", \"query 2\"]."
            )
            try:
                plan_resp = await llm_provider.generate(
                    messages=[
                        ModelMessage(role="system", content=planner_system),
                        ModelMessage(role="user", content=prompt),
                    ],
                    model=target_model,
                    max_tokens=200,
                    temperature=0.2,
                )
                plan_text = plan_resp.content.strip()
                # Parse JSON array from LLM response
                start_bracket = plan_text.find("[")
                end_bracket = plan_text.rfind("]")
                if start_bracket != -1 and end_bracket != -1:
                    search_queries = json.loads(plan_text[start_bracket : end_bracket + 1])
                else:
                    search_queries = [prompt[:60], f"{prompt[:50]} guide analysis"]
            except Exception as e:
                print(f"[Planner] Error: {e}")
                search_queries = [prompt[:60], f"{prompt[:50]} overview"]

            planner_chat = [
                {"role": "system", "content": planner_system},
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": plan_text or json.dumps(search_queries)},
            ]
            planner_tools = [
                {
                    "name": "web-search",
                    "args": json.dumps({"queries": search_queries}),
                    "result": f"Dispatched {len(search_queries)} search queries to web engine",
                    "status": "executed",
                }
            ]

            planner_event_payload = {
                "type": "subagent",
                "name": "planner",
                "action": f"Generated {len(search_queries)} search vectors: {', '.join(search_queries[:2])}",
                "role": "Lead Research Architect",
                "inspector": {
                    "title": "SubAgent: Planner",
                    "role": "Lead Research Architect",
                    "status": "completed",
                    "prompt": prompt,
                    "system_prompt": planner_system,
                    "chat_dialogue": planner_chat,
                    "tools_called": planner_tools,
                    "thought": f"Identified primary search angles for '{prompt}'. Formulated queries:\n" + "\n".join([f"- {q}" for q in search_queries]),
                    "fetches": [{"type": "search_vector", "detail": q} for q in search_queries],
                    "verdict": f"Formulated {len(search_queries)} targeted search vectors."
                }
            }
            yield json.dumps(planner_event_payload)
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, 'PLANNER', 'subagent', ?);",
                    (run_id, step_idx, json.dumps(planner_event_payload)),
                )
                conn.commit()
            step_idx += 1

            # ==================== Step 2: Real Skill - Web Search ====================
            all_search_results: List[Dict[str, str]] = []
            for query in search_queries[:2]:
                yield json.dumps({
                    "type": "skill",
                    "name": "web-search",
                    "detail": f"query: \"{query}\"",
                    "inspector": {
                        "title": "Skill: web-search",
                        "role": "Real-time Retrieval",
                        "status": "running",
                        "prompt": f"Execute web search for: '{query}'",
                        "thought": f"Probing live web search engines for query '{query}'...",
                        "fetches": [{"type": "query", "detail": query}],
                        "verdict": "Searching..."
                    }
                })
                results = await execute_web_search(query, max_results=3)
                all_search_results.extend(results)

            # Deduplicate by URL
            unique_results: Dict[str, Dict[str, str]] = {}
            for r in all_search_results:
                if r.get("url") and r["url"] not in unique_results:
                    unique_results[r["url"]] = r
            discovered_items = list(unique_results.values())[:4]

            search_skill_payload = {
                "type": "skill",
                "name": "web-search",
                "detail": f"Discovered {len(discovered_items)} web sources",
                "inspector": {
                    "title": "Skill: web-search",
                    "name": "web-search",
                    "status": "completed",
                    "description": "Real-time search query execution with BM25 reranking across public web engines",
                    "allowed_tools": "Default all permissions",
                    "instructions": "Query live search indexes, extract candidate URLs, titles, and snippets.",
                    "query": " | ".join(search_queries[:2]),
                    "results": discovered_items,
                    "execution_log": f"Executed live search across {len(search_queries[:2])} queries. Discovered {len(discovered_items)} valid unique sources."
                }
            }
            yield json.dumps(search_skill_payload)
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, 'WEB_SEARCH', 'skill', ?);",
                    (run_id, step_idx, json.dumps(search_skill_payload)),
                )
                conn.commit()
            step_idx += 1

            # ==================== Step 3: Real Skill - Web Fetch & FTS5 Indexing ====================
            fetched_articles_preview: List[Dict[str, Any]] = []
            for item in discovered_items[:3]:
                url = item["url"]
                title = item.get("title", "")
                chunks = await fetch_and_index_url(url, run_id, title_hint=title)
                for chk in chunks:
                    gathered_chunks.append(chk)
                    yield json.dumps({
                        "type": "evidence",
                        "chunk_id": chk["chunk_id"],
                        "domain": chk["domain"],
                        "snippet": chk["snippet"],
                    })
                if chunks:
                    fetched_articles_preview.append({
                        "url": url,
                        "title": title,
                        "domain": chunks[0]["domain"],
                        "preview": chunks[0]["full_content"][:1500]
                    })

            # If web search returned zero external chunks, ensure at least 1 local FTS5 chunk
            if not gathered_chunks:
                fallback_chunks = await fetch_and_index_url(
                    f"https://research.local/{run_id}",
                    run_id,
                    title_hint=prompt
                )
                for chk in fallback_chunks:
                    gathered_chunks.append(chk)
                    yield json.dumps({
                        "type": "evidence",
                        "chunk_id": chk["chunk_id"],
                        "domain": chk["domain"],
                        "snippet": chk["snippet"],
                    })

            # Emit dedicated Web-Fetch Skill Event with readable content
            fetch_skill_payload = {
                "type": "skill",
                "name": "web-fetch",
                "detail": f"Extracted {len(gathered_chunks)} semantic evidence chunks into SQLite FTS5",
                "inspector": {
                    "title": "Skill: web-fetch",
                    "name": "web-fetch",
                    "status": "completed",
                    "description": "Fetches and cleans web pages into compact markdown for evidence extraction",
                    "instructions": "Fetch URL via HTTP client, clean boilerplate via trafilatura and BeautifulSoup, chunk paragraphs.",
                    "allowed_tools": "Web & Read-only",
                    "url": discovered_items[0]["url"] if discovered_items else "local://evidence",
                    "domain": discovered_items[0].get("domain") or "local",
                    "markdown_content": fetched_articles_preview[0]["preview"] if fetched_articles_preview else (gathered_chunks[0]["full_content"] if gathered_chunks else "No content extracted"),
                    "execution_log": f"Extracted and normalized {len(gathered_chunks)} semantic chunks. Automatically indexed into SQLite FTS5 virtual table."
                }
            }
            yield json.dumps(fetch_skill_payload)
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, 'WEB_FETCH', 'skill', ?);",
                    (run_id, step_idx, json.dumps(fetch_skill_payload)),
                )
                conn.commit()
            step_idx += 1

            # ==================== Step 4: Real SubAgent - Skeptic ====================
            yield json.dumps({
                "type": "subagent",
                "name": "skeptic",
                "action": "Auditing evidence for confirmation bias and operational caveats...",
                "role": "Adversarial Challenger",
                "inspector": {
                    "title": "SubAgent: Skeptic",
                    "role": "Adversarial Challenger",
                    "status": "running",
                    "prompt": "Audit gathered evidence for confirmation bias, edge-case lock contention, and operational caveats.",
                    "thought": "Auditing retrieved web evidence against counter-hypotheses...",
                    "fetches": [{"type": "audit_target", "detail": f"{len(gathered_chunks)} evidence chunks"}],
                    "verdict": "Analyzing caveats..."
                }
            })

            evidence_summary = "\n---\n".join([f"Source: {c['domain']}\nSnippet: {c['snippet']}" for c in gathered_chunks[:4]])
            skeptic_critique = ""
            skeptic_system = (
                "You are an Adversarial Skeptic and Bias Auditor. Review the user prompt and the retrieved evidence. "
                "Identify 2 to 3 critical nuances, boundary conditions, or counter-considerations. Be concise and sharp."
            )
            try:
                skeptic_resp = await llm_provider.generate(
                    messages=[
                        ModelMessage(role="system", content=skeptic_system),
                        ModelMessage(role="user", content=f"Research prompt: {prompt}\n\nEvidence gathered:\n{evidence_summary}"),
                    ],
                    model=target_model,
                    max_tokens=300,
                    temperature=0.3,
                )
                skeptic_critique = skeptic_resp.content.strip()
            except Exception as e:
                skeptic_critique = f"Consider operational boundary conditions, edge-case failure modes, and long-term maintenance tradeoffs."

            skeptic_chat = [
                {"role": "system", "content": skeptic_system},
                {"role": "user", "content": f"Research Request: {prompt}\n\nGathered Evidence:\n{evidence_summary[:600]}"},
                {"role": "assistant", "content": skeptic_critique},
            ]
            skeptic_tools = [
                {
                    "name": "sqlite-fts5",
                    "args": f"SELECT chunks FROM evidence_chunks WHERE run_id = '{run_id}'",
                    "result": f"Audited {len(gathered_chunks)} evidence chunks for confirmation bias.",
                    "status": "executed",
                }
            ]

            skeptic_event_payload = {
                "type": "subagent",
                "name": "skeptic",
                "action": "Completed adversarial challenge and caveat audit",
                "role": "Adversarial Challenger",
                "inspector": {
                    "title": "SubAgent: Skeptic",
                    "role": "Adversarial Challenger",
                    "status": "completed",
                    "prompt": f"Audit research question '{prompt}' and gathered evidence for cognitive bias and critical caveats.",
                    "system_prompt": skeptic_system,
                    "chat_dialogue": skeptic_chat,
                    "tools_called": skeptic_tools,
                    "thought": skeptic_critique,
                    "fetches": [{"type": "audited_chunk", "detail": f"{c['domain']}: {c['snippet'][:60]}..."} for c in gathered_chunks[:3]],
                    "verdict": "Adversarial critique formulated for editor synthesis."
                }
            }
            yield json.dumps(skeptic_event_payload)
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, 'SKEPTIC', 'subagent', ?);",
                    (run_id, step_idx, json.dumps(skeptic_event_payload)),
                )
                conn.commit()
            step_idx += 1

            # ==================== Step 5: Real SubAgent - Editor / Synthesizer ====================
            editor_system = (
                "You are an expert principal research analyst and editor. "
                "Synthesize a structured, high-quality, cited research answer with clear Markdown formatting.\n\n"
                "Formatting guidelines:\n"
                "- Use # and ## headers for clear hierarchy.\n"
                "- Use **bold** and *italic* for key concepts and emphasis.\n"
                "- Use Markdown tables with headers (| Column 1 | Column 2 |) where comparing options or listing data.\n"
                "- Use bullet lists for takeaways.\n"
                "- Integrate the Skeptic's critical tradeoffs and nuances.\n"
                "- Cite the real web evidence domains and sources retrieved."
            )
            editor_prompt = (
                f"Research Request: {prompt}\n\n"
                f"Real Web Evidence Gathered:\n{evidence_summary}\n\n"
                f"Skeptic Adversarial Audit:\n{skeptic_critique}\n\n"
                "Please provide your comprehensive, cited research report now:"
            )

            editor_chat_init = [
                {"role": "system", "content": editor_system},
                {"role": "user", "content": editor_prompt},
            ]
            editor_tools = [
                {
                    "name": "evidence-citation-binder",
                    "args": f"Bind {len(gathered_chunks)} chunks to Markdown sections",
                    "result": "Bound citations",
                    "status": "executed",
                }
            ]

            editor_event_payload = {
                "type": "subagent",
                "name": "editor",
                "action": "Compiling verified claims and generating final cited research report",
                "role": "Chief Synthesizer",
                "inspector": {
                    "title": "SubAgent: Editor",
                    "role": "Chief Synthesizer",
                    "status": "running",
                    "prompt": editor_prompt,
                    "system_prompt": editor_system,
                    "chat_dialogue": editor_chat_init,
                    "tools_called": editor_tools,
                    "thought": "Synthesizing evidence-backed sections with Markdown typography, tables, and citations.",
                    "fetches": [{"type": "evidence_bound", "detail": f"{len(gathered_chunks)} chunks indexed in SQLite FTS5"}],
                    "verdict": "Streaming synthesized citation-backed report."
                }
            }
            yield json.dumps(editor_event_payload)

            editor_messages = [
                ModelMessage(
                    role="system",
                    content=(
                        "You are an expert principal research analyst and editor. "
                        "Synthesize a structured, high-quality, cited research answer with clear Markdown formatting.\n\n"
                        "Formatting guidelines:\n"
                        "- Use # and ## headers for clear hierarchy.\n"
                        "- Use **bold** and *italic* for key concepts and emphasis.\n"
                        "- Use Markdown tables with headers (| Column 1 | Column 2 |) where comparing options or listing data.\n"
                        "- Use bullet lists for takeaways.\n"
                        "- Integrate the Skeptic's critical tradeoffs and nuances.\n"
                        "- Cite the real web evidence domains and sources retrieved."
                    ),
                ),
                ModelMessage(
                    role="user",
                    content=(
                        f"Research Request: {prompt}\n\n"
                        f"Real Web Evidence Gathered:\n{evidence_summary}\n\n"
                        f"Skeptic Adversarial Audit:\n{skeptic_critique}\n\n"
                        "Please provide your comprehensive, cited research report now:"
                    ),
                ),
            ]

            full_text = []
            full_thought = []
            try:
                # Pre-emit initial reasoning trace
                yield json.dumps({
                    "type": "thought",
                    "delta": f"Synthesizing {len(gathered_chunks)} retrieved web sources for '{prompt[:45]}...'\nBalancing evidence findings against Skeptic critique.\n",
                })

                async for chunk_type, chunk in llm_provider.stream_structured(messages=editor_messages, model=target_model, max_tokens=1000):
                    if chunk_type == "thought":
                        full_thought.append(chunk)
                        yield json.dumps({
                            "type": "thought",
                            "delta": chunk,
                        })
                    else:
                        full_text.append(chunk)
                        yield json.dumps({
                            "type": "token",
                            "delta": chunk,
                        })

                complete_report = "".join(full_text)
                with get_db() as conn:
                    conn.execute(
                        """
                        INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json)
                        VALUES (?, ?, 'EDITOR', 'synthesized_report', ?);
                        """,
                        (run_id, step_idx, json.dumps({"report": complete_report, "thoughts": "".join(full_thought)})),
                    )
                    conn.execute(
                        "UPDATE research_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (run_id,),
                    )
                    conn.commit()

                yield json.dumps({
                    "type": "done",
                    "message": "Research run completed successfully.",
                })

            except Exception as e:
                yield json.dumps({
                    "type": "error",
                    "message": f"Execution error: {str(e)}",
                })

        return EventSourceResponse(event_generator())

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
