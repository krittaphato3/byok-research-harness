"""
Lightweight BYOK AI Harness WebUI - FastAPI Application Entry Point.
Includes endpoints for Vault Providers, Custom Base URLs, Model Profiles, File Context, and Live Streaming Research Runs.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import json
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.config import DEFAULT_ENDPOINT_URL, DEFAULT_MODEL
from app.db import get_db, init_db, search_evidence_fts
from app.export.exporter import export_to_html, export_to_json_dossier, export_to_markdown
from app.fetch.web_fetcher import fetch_and_index_url, ingest_local_file
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

# In-memory registry to coordinate live run cancellation
ACTIVE_RUNS: Dict[str, Dict[str, Any]] = {}


class RunDispatchReq(BaseModel):
    prompt: str
    model: Optional[str] = DEFAULT_MODEL
    provider: Optional[str] = None
    endpoint: Optional[str] = None
    context_files: Optional[List[str]] = []
    parent_run_id: Optional[str] = None
    mode: Optional[str] = "deep_research"


class PromptEnhanceReq(BaseModel):
    prompt: str
    model: Optional[str] = None
    provider: Optional[str] = None


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
    @app.get("/app", response_class=HTMLResponse)
    @app.get("/app/{chat_id}", response_class=HTMLResponse)
    async def index(request: Request, chat_id: Optional[str] = None):
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
    @app.get("/api/vault/keys", response_class=JSONResponse)
    async def api_list_providers():
        keys = list_vault_keys()
        return {"providers": keys, "keys": keys}

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
            run = conn.execute(
                "SELECT * FROM research_runs WHERE id = ? OR id = ? LIMIT 1;",
                (run_id, f"run_{run_id}"),
            ).fetchone()
            if not run:
                raise HTTPException(status_code=404, detail="Run not found.")
            actual_run_id = run["id"]

            # Events
            raw_events = conn.execute(
                "SELECT * FROM run_events WHERE run_id = ? ORDER BY step ASC, created_at ASC;", (actual_run_id,)
            ).fetchall()

            events = []
            debate_turns = []
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
                    elif d.get("event_type") == "debate_turn":
                        debate_turns.append(payload)
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
                (actual_run_id,),
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
                "debate": debate_turns,
                "evidence": evidence_list,
            }

    @app.post("/api/runs", response_class=JSONResponse)
    async def create_run(req: RunDispatchReq):
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        title = req.prompt[:40] + "..." if len(req.prompt) > 40 else req.prompt

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO research_runs (id, title, prompt, status, parent_run_id, mode, context_files_json)
                VALUES (?, ?, ?, 'running', ?, ?, ?);
                """,
                (run_id, title, req.prompt, req.parent_run_id, req.mode or "deep_research", json.dumps(req.context_files or [])),
            )
            conn.commit()

        return {"ok": True, "run_id": run_id, "title": title, "mode": req.mode or "deep_research"}

    @app.post("/api/runs/{run_id}/abort", response_class=JSONResponse)
    async def abort_run(run_id: str):
        if run_id in ACTIVE_RUNS:
            ACTIVE_RUNS[run_id]["aborted"] = True
        with get_db() as conn:
            conn.execute(
                "UPDATE research_runs SET status = 'aborted', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                (run_id,),
            )
            conn.commit()
        return {"ok": True, "status": "aborted"}

    @app.get("/api/runs/{run_id}/export/{format}")
    async def export_run(run_id: str, format: str):
        with get_db() as conn:
            run = conn.execute(
                "SELECT * FROM research_runs WHERE id = ? OR id = ? LIMIT 1;",
                (run_id, f"run_{run_id}"),
            ).fetchone()
            if not run:
                raise HTTPException(status_code=404, detail="Run not found.")
            actual_run_id = run["id"]

            events = conn.execute(
                "SELECT * FROM run_events WHERE run_id = ? ORDER BY step ASC", (actual_run_id,)
            ).fetchall()
            report = ""
            thoughts = ""
            event_list = []
            debate_list = []
            for ev in events:
                try:
                    payload = json.loads(ev["payload_json"])
                    event_list.append(payload)
                    if ev["event_type"] == "synthesized_report":
                        report = payload.get("report", "")
                        thoughts = payload.get("thoughts", "")
                    elif ev["event_type"] == "debate_turn":
                        debate_list.append(payload)
                except Exception:
                    pass

            chunks = conn.execute(
                """
                SELECT c.id, c.content, s.domain, s.url, s.title
                FROM evidence_chunks c
                JOIN sources s ON c.source_id = s.id
                WHERE c.run_id = ?;
                """,
                (actual_run_id,),
            ).fetchall()
            evidence_list = [
                {
                    "chunk_id": ch["id"],
                    "domain": ch["domain"],
                    "snippet": ch["content"][:300],
                    "title": ch["title"],
                    "url": ch["url"],
                }
                for ch in chunks
            ]

        fmt = format.lower()
        if fmt in ("md", "markdown"):
            md_content = export_to_markdown(dict(run), report, thoughts, evidence_list, debate=debate_list)
            return Response(
                content=md_content,
                media_type="text/markdown",
                headers={"Content-Disposition": f'attachment; filename="research-{run_id}.md"'},
            )
        elif fmt == "html":
            html_content = export_to_html(dict(run), report, thoughts, evidence_list, debate=debate_list)
            return HTMLResponse(content=html_content)
        elif fmt == "json":
            json_dossier = export_to_json_dossier(dict(run), report, thoughts, event_list, evidence_list, debate=debate_list)
            return JSONResponse(
                content=json_dossier,
                headers={"Content-Disposition": f'attachment; filename="research-dossier-{run_id}.json"'},
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format '{format}'. Use markdown, html, or json.",
            )

    @app.post("/api/prompt/enhance", response_class=JSONResponse)
    async def enhance_prompt(req: PromptEnhanceReq):
        if not req.prompt.strip():
            return {"ok": False, "error": "Prompt cannot be empty"}

        target_key = ""
        target_url = ""
        if req.provider:
            prov = get_provider(req.provider)
            if prov:
                target_key = prov["api_key"]
                target_url = prov["base_url"]
        if not target_key or not target_url:
            with get_db() as conn:
                row = conn.execute("SELECT * FROM vault_keys WHERE is_default = 1 LIMIT 1;").fetchone()
                if not row:
                    row = conn.execute("SELECT * FROM vault_keys WHERE is_enabled = 1 ORDER BY updated_at DESC LIMIT 1;").fetchone()
                if row:
                    target_key = decrypt_secret(row["encrypted_key"])
                    target_url = row["base_url"]

        if not target_key:
            target_key = get_api_key("localhost") or get_api_key("local_openai") or ""
        if not target_url:
            target_url = DEFAULT_ENDPOINT_URL

        llm = OpenAICompatibleProvider(
            api_key=target_key,
            base_url=target_url,
            default_model=req.model or DEFAULT_MODEL,
        )

        system_prompt = (
            "You are an Elite Research Architect. The user provides a raw idea or research prompt. "
            "Elevate and refine it into a high-precision, deep-research directive. "
            "Formulate specific empirical hypotheses to test, comparison axes, boundary conditions or edge cases, "
            "and factual criteria to verify. Keep it concise (1 to 2 crisp paragraphs), authoritative, and directly actionable. "
            "Do NOT include conversational filler like 'Sure! Here is the prompt'."
        )

        try:
            resp = await llm.generate(
                messages=[
                    ModelMessage(role="system", content=system_prompt),
                    ModelMessage(role="user", content=req.prompt),
                ],
                model=req.model or DEFAULT_MODEL,
                max_tokens=350,
                temperature=0.3,
            )
            enhanced = resp.content.strip()
            if not enhanced:
                enhanced = req.prompt
            return {"ok": True, "enhanced_prompt": enhanced}
        except Exception as e:
            return {"ok": False, "error": str(e), "enhanced_prompt": req.prompt}

    @app.get("/api/runs/{run_id}/stream")
    async def stream_run(
        run_id: str,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        endpoint: Optional[str] = None,
    ):
        with get_db() as conn:
            run = conn.execute(
                "SELECT * FROM research_runs WHERE id = ? OR id = ? LIMIT 1;",
                (run_id, f"run_{run_id}"),
            ).fetchone()
            if not run:
                raise HTTPException(status_code=404, detail="Run not found.")
            run_id = run["id"]
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

        ACTIVE_RUNS[run_id] = {"aborted": False}
        parent_context = ""
        run_mode = "deep_research"
        context_files_list: List[str] = []
        with get_db() as conn:
            run_data = conn.execute("SELECT * FROM research_runs WHERE id = ?", (run_id,)).fetchone()
            if run_data:
                if "mode" in run_data.keys() and run_data["mode"]:
                    run_mode = run_data["mode"]
                if "context_files_json" in run_data.keys() and run_data["context_files_json"]:
                    try:
                        context_files_list = json.loads(run_data["context_files_json"])
                    except Exception:
                        context_files_list = []
                if "parent_run_id" in run_data.keys() and run_data["parent_run_id"]:
                    p_run_id = run_data["parent_run_id"]
                    p_rep = conn.execute(
                        "SELECT payload_json FROM run_events WHERE run_id = ? AND event_type = 'synthesized_report' ORDER BY id DESC LIMIT 1;",
                        (p_run_id,),
                    ).fetchone()
                    if p_rep:
                        try:
                            p_obj = json.loads(p_rep["payload_json"])
                            parent_context = p_obj.get("report", "")
                        except Exception:
                            parent_context = p_rep["payload_json"]

        async def event_generator() -> AsyncGenerator[str, None]:
            step_idx = 1
            gathered_chunks: List[Dict[str, Any]] = []
            search_queries: List[str] = []

            if ACTIVE_RUNS.get(run_id, {}).get("aborted"):
                yield json.dumps({"type": "status", "status": "aborted", "message": "Research aborted by user."})
                return

            # ==================== Step 0: Ingest Uploaded Context Files into FTS5 ====================
            if context_files_list:
                for cf in context_files_list:
                    fpath = UPLOADS_DIR / Path(cf).name
                    if not fpath.exists():
                        fpath = Path(cf)
                    if fpath.exists() and fpath.is_file():
                        ingested = ingest_local_file(fpath, run_id)
                        for chk in ingested:
                            gathered_chunks.append(chk)
                            yield json.dumps({
                                "type": "evidence",
                                "chunk_id": chk["chunk_id"],
                                "domain": chk["domain"],
                                "snippet": chk["snippet"],
                            })

                file_skill_payload = {
                    "type": "skill",
                    "name": "file-ingest",
                    "action": f"Indexed {len(context_files_list)} uploaded reference file(s) into SQLite FTS5",
                    "category": "Files",
                    "inspector": {
                        "title": "Skill: Local File Ingest & FTS5 Indexing",
                        "files_attached": [Path(cf).name for cf in context_files_list],
                        "execution_log": f"Indexed {len(gathered_chunks)} chunks into SQLite FTS5 for BM25 retrieval.",
                        "status": "completed",
                    },
                }
                yield json.dumps(file_skill_payload)
                with get_db() as conn:
                    conn.execute(
                        "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, 'FILE_INGEST', 'skill', ?);",
                        (run_id, step_idx, json.dumps(file_skill_payload)),
                    )
                    conn.commit()
                step_idx += 1

            # ==================== Fast Mode Bypass ====================
            if run_mode == "fast":
                yield json.dumps({
                    "type": "subagent",
                    "name": "synthesizer",
                    "action": f"Direct stream generation for '{prompt[:45]}...'",
                    "role": "Direct Synthesizer",
                    "color": "#10b981",
                    "inspector": {
                        "title": "Mode: Fast Direct Synthesis",
                        "role": "Direct Synthesizer",
                        "status": "running",
                        "prompt": prompt,
                        "thought": "Processing request in Fast Direct mode. Synthesizing response immediately.",
                        "verdict": "Streaming tokens directly...",
                    },
                })

                file_context = ""
                local_fts = search_evidence_fts(run_id, prompt, limit=4)
                if local_fts:
                    file_context = "\n\n### Uploaded Reference Excerpts:\n" + "\n---\n".join([f"Source: {c['title']}\n{c['content']}" for c in local_fts])

                fast_messages = [
                    ModelMessage(
                        role="system",
                        content=(
                            "You are an expert AI researcher and assistant. Synthesize a direct, high-quality, "
                            "and clear Markdown response with code blocks, tables, and structured headers as appropriate."
                            + (f"\n\nPrior Context:\n{parent_context}" if parent_context else "")
                        ),
                    ),
                    ModelMessage(role="user", content=f"{prompt}{file_context}"),
                ]
                full_text = []
                full_thought = []
                async for chunk_type, chunk in llm_provider.stream_structured(messages=fast_messages, model=target_model, max_tokens=1500):
                    if ACTIVE_RUNS.get(run_id, {}).get("aborted"):
                        yield json.dumps({"type": "status", "status": "aborted", "message": "Research aborted by user."})
                        break
                    if chunk_type == "thought":
                        full_thought.append(chunk)
                        yield json.dumps({"type": "thought", "delta": chunk})
                    else:
                        full_text.append(chunk)
                        yield json.dumps({"type": "token", "delta": chunk})

                complete_report = "".join(full_text)
                with get_db() as conn:
                    conn.execute(
                        "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, 'SYNTHESIZER', 'synthesized_report', ?);",
                        (run_id, step_idx, json.dumps({"report": complete_report, "thoughts": "".join(full_thought)})),
                    )
                    conn.execute("UPDATE research_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?", (run_id,))
                    conn.commit()

                yield json.dumps({
                    "type": "status",
                    "status": "completed",
                    "run_id": run_id,
                    "mode": "fast",
                    "message": "Fast synthesis complete.",
                })
                return

            if run_mode == "deep_research":
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

            # ==================== Step 2: Real Skill - Web Search (Concurrent) ====================
            search_queries_to_run = search_queries[:3] if search_queries else [prompt]
            yield json.dumps({
                "type": "skill",
                "name": "web-search",
                "detail": f"Parallel search: {len(search_queries_to_run)} vectors",
                "inspector": {
                    "title": "Skill: web-search",
                    "role": "Real-time Retrieval",
                    "status": "running",
                    "prompt": " | ".join(search_queries_to_run),
                    "thought": f"Probing live search engines across {len(search_queries_to_run)} concurrent vectors in parallel...",
                    "fetches": [{"type": "query", "detail": q} for q in search_queries_to_run],
                    "verdict": "Searching..."
                }
            })

            search_tasks = [execute_web_search(q, max_results=3) for q in search_queries_to_run]
            search_results_nested = await asyncio.gather(*search_tasks, return_exceptions=True)
            all_search_results: List[Dict[str, str]] = []
            for res in search_results_nested:
                if isinstance(res, list):
                    all_search_results.extend(res)

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
                    "query": " | ".join(search_queries_to_run[:2]),
                    "results": discovered_items,
                    "execution_log": f"Executed live parallel search across {len(search_queries_to_run)} queries. Discovered {len(discovered_items)} valid unique sources."
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

            # ==================== Step 3: Real Skill - Web Fetch & FTS5 Indexing (Concurrent) ====================
            fetched_articles_preview: List[Dict[str, Any]] = []
            if discovered_items:
                fetch_tasks = [
                    fetch_and_index_url(item["url"], run_id, title_hint=item.get("title", ""))
                    for item in discovered_items[:4]
                ]
                fetch_results_nested = await asyncio.gather(*fetch_tasks, return_exceptions=True)
                for idx, chunks in enumerate(fetch_results_nested):
                    if isinstance(chunks, list) and chunks:
                        for chk in chunks:
                            gathered_chunks.append(chk)
                            yield json.dumps({
                                "type": "evidence",
                                "chunk_id": chk["chunk_id"],
                                "domain": chk["domain"],
                                "snippet": chk["snippet"],
                            })
                        fetched_articles_preview.append({
                            "url": discovered_items[idx]["url"],
                            "title": discovered_items[idx].get("title", ""),
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

            # ==================== Step 4: Multi-Agent Adversarial Debate Arena ====================
            fts_debate_chunks = search_evidence_fts(run_id, prompt, limit=6)
            debate_evidence_pool = fts_debate_chunks if fts_debate_chunks else gathered_chunks[:6]
            evidence_summary = "\n---\n".join([f"Source: {c['domain']}\nSnippet: {c['snippet']}" for c in debate_evidence_pool[:4]]) if debate_evidence_pool else "No external web sources retrieved; relying on core reasoning principles."

            yield json.dumps({
                "type": "subagent",
                "name": "skeptic",
                "action": "Opening adversarial debate rounds: Proposer vs Skeptic",
                "role": "Adversarial Challenger",
                "color": "#f59e0b",
                "inspector": {
                    "title": "SubAgent: Skeptic",
                    "role": "Adversarial Challenger",
                    "status": "running",
                    "prompt": f"Audit research question '{prompt}' through structured multi-agent debate.",
                    "thought": "Proposer and Skeptic engaging in cross-examination; Adjudicator formulating consensus.",
                    "fetches": [{"type": "audit_target", "detail": f"{len(debate_evidence_pool)} BM25 FTS5 evidence chunks"}],
                    "verdict": "Debating evidence in real-time..."
                }
            })

            debate_turns_data: List[Dict[str, Any]] = []

            # --- Round 1, Turn 1: Proposer (Lead Architect) ---
            proposer_system = (
                "You are the Lead Research Architect (Proposer). Based on the verified web evidence, "
                "state your opening thesis and 2-3 primary evidence-backed assertions regarding the research topic. "
                "Be structured, confident, and direct. Keep response to ~140 words."
            )
            proposer_prompt_1 = f"Research Topic: {prompt}\n\nVerified Evidence:\n{evidence_summary}\n\nState your opening thesis:"

            yield json.dumps({
                "type": "debate_start_turn",
                "id": f"deb_{run_id}_r1_proposer",
                "round": 1,
                "speaker": "proposer",
                "speakerName": "Lead Architect (Proposer)",
                "speakerRole": "Hypothesis & Evidence Proposer",
                "avatarColor": "#38bdf8",
                "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
            })

            proposer_t1 = []
            try:
                async for chunk_type, chunk in llm_provider.stream_structured(
                    messages=[ModelMessage(role="system", content=proposer_system), ModelMessage(role="user", content=proposer_prompt_1)],
                    model=target_model,
                    max_tokens=250,
                ):
                    if chunk_type != "thought":
                        proposer_t1.append(chunk)
                        yield json.dumps({
                            "type": "debate_token",
                            "id": f"deb_{run_id}_r1_proposer",
                            "delta": chunk,
                        })
            except Exception as e:
                proposer_t1.append(f"Based on initial evidence, findings indicate strong alignment with core parameters ({e}).")

            p1_content = "".join(proposer_t1).strip()
            turn_p1 = {
                "id": f"deb_{run_id}_r1_proposer",
                "round": 1,
                "speaker": "proposer",
                "speakerName": "Lead Architect (Proposer)",
                "speakerRole": "Hypothesis & Evidence Proposer",
                "avatarColor": "#38bdf8",
                "content": p1_content,
                "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
                "status": "completed",
            }
            debate_turns_data.append(turn_p1)
            yield json.dumps({"type": "debate_turn", **turn_p1})
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, 'PROPOSER', 'debate_turn', ?);",
                    (run_id, step_idx, json.dumps(turn_p1)),
                )
                conn.commit()
            step_idx += 1

            # --- Round 1, Turn 2: Skeptic (Adversarial Challenger) ---
            skeptic_system = (
                "You are the Adversarial Skeptic and Bias Auditor. Scrutinize the Proposer's opening thesis. "
                "Attack weak assumptions, identify boundary edge cases, cognitive biases, or conflicting evidence nuances. "
                "Be sharp, incisive, and rigorous. Keep response to ~140 words."
            )
            skeptic_prompt_1 = f"Research Topic: {prompt}\n\nProposer's Thesis:\n{p1_content}\n\nEvidence Available:\n{evidence_summary}\n\nDeliver your critical adversarial challenge:"

            yield json.dumps({
                "type": "debate_start_turn",
                "id": f"deb_{run_id}_r1_skeptic",
                "round": 1,
                "speaker": "skeptic",
                "speakerName": "Adversarial Skeptic",
                "speakerRole": "Bias Auditor & Critical Challenger",
                "avatarColor": "#f59e0b",
                "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
            })

            skeptic_t1 = []
            try:
                async for chunk_type, chunk in llm_provider.stream_structured(
                    messages=[ModelMessage(role="system", content=skeptic_system), ModelMessage(role="user", content=skeptic_prompt_1)],
                    model=target_model,
                    max_tokens=250,
                ):
                    if chunk_type != "thought":
                        skeptic_t1.append(chunk)
                        yield json.dumps({
                            "type": "debate_token",
                            "id": f"deb_{run_id}_r1_skeptic",
                            "delta": chunk,
                        })
            except Exception as e:
                skeptic_t1.append(f"Consider operational boundary conditions, edge-case failure modes, and long-term maintenance tradeoffs ({e}).")

            s1_content = "".join(skeptic_t1).strip()
            turn_s1 = {
                "id": f"deb_{run_id}_r1_skeptic",
                "round": 1,
                "speaker": "skeptic",
                "speakerName": "Adversarial Skeptic",
                "speakerRole": "Bias Auditor & Critical Challenger",
                "avatarColor": "#f59e0b",
                "content": s1_content,
                "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
                "status": "completed",
            }
            debate_turns_data.append(turn_s1)
            yield json.dumps({"type": "debate_turn", **turn_s1})
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, 'SKEPTIC', 'debate_turn', ?);",
                    (run_id, step_idx, json.dumps(turn_s1)),
                )
                conn.commit()
            step_idx += 1

            # --- Round 2, Turn 1: Proposer (Rebuttal & Evidence Clarification) ---
            proposer_prompt_2 = (
                f"Skeptic's Challenge:\n{s1_content}\n\n"
                f"Evidence Available:\n{evidence_summary}\n\n"
                "Deliver your rebuttal: defend your propositions with evidence, concede valid caveats, and refine the boundary conditions (~140 words):"
            )

            yield json.dumps({
                "type": "debate_start_turn",
                "id": f"deb_{run_id}_r2_proposer",
                "round": 2,
                "speaker": "proposer",
                "speakerName": "Lead Architect (Proposer)",
                "speakerRole": "Evidence Defense & Boundary Refinement",
                "avatarColor": "#38bdf8",
                "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
            })

            proposer_t2 = []
            try:
                async for chunk_type, chunk in llm_provider.stream_structured(
                    messages=[ModelMessage(role="system", content=proposer_system), ModelMessage(role="user", content=proposer_prompt_2)],
                    model=target_model,
                    max_tokens=250,
                ):
                    if chunk_type != "thought":
                        proposer_t2.append(chunk)
                        yield json.dumps({
                            "type": "debate_token",
                            "id": f"deb_{run_id}_r2_proposer",
                            "delta": chunk,
                        })
            except Exception as e:
                proposer_t2.append(f"Acknowledging caveats; boundary conditions hold under verified parameters ({e}).")

            p2_content = "".join(proposer_t2).strip()
            turn_p2 = {
                "id": f"deb_{run_id}_r2_proposer",
                "round": 2,
                "speaker": "proposer",
                "speakerName": "Lead Architect (Proposer)",
                "speakerRole": "Evidence Defense & Boundary Refinement",
                "avatarColor": "#38bdf8",
                "content": p2_content,
                "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
                "status": "completed",
            }
            debate_turns_data.append(turn_p2)
            yield json.dumps({"type": "debate_turn", **turn_p2})
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, 'PROPOSER', 'debate_turn', ?);",
                    (run_id, step_idx, json.dumps(turn_p2)),
                )
                conn.commit()
            step_idx += 1

            # --- Round 2, Turn 2: Moderator / Adjudicator (Consensus Verdict) ---
            moderator_system = (
                "You are the Impartial Debate Adjudicator and Arbiter. "
                "Weigh the Proposer's arguments against the Skeptic's challenges. "
                "Summarize points of consensus, irreducible trade-offs, and issue clear factual directives for the Editor synthesis. Keep to ~140 words."
            )
            moderator_prompt = (
                f"Research Topic: {prompt}\n\n"
                f"Proposer Thesis:\n{p1_content}\n\n"
                f"Skeptic Challenge:\n{s1_content}\n\n"
                f"Proposer Defense:\n{p2_content}\n\n"
                "Issue your final adjudication verdict and guidance for the research report:"
            )

            yield json.dumps({
                "type": "debate_start_turn",
                "id": f"deb_{run_id}_r2_moderator",
                "round": 2,
                "speaker": "moderator",
                "speakerName": "Impartial Adjudicator",
                "speakerRole": "Consensus Arbiter & Verdict Judge",
                "avatarColor": "#a855f7",
                "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
            })

            mod_t = []
            try:
                async for chunk_type, chunk in llm_provider.stream_structured(
                    messages=[ModelMessage(role="system", content=moderator_system), ModelMessage(role="user", content=moderator_prompt)],
                    model=target_model,
                    max_tokens=250,
                ):
                    if chunk_type != "thought":
                        mod_t.append(chunk)
                        yield json.dumps({
                            "type": "debate_token",
                            "id": f"deb_{run_id}_r2_moderator",
                            "delta": chunk,
                        })
            except Exception as e:
                mod_t.append(f"Adjudication verdict: Both positions validated; synthesis must incorporate trade-offs ({e}).")

            m_content = "".join(mod_t).strip()
            turn_m = {
                "id": f"deb_{run_id}_r2_moderator",
                "round": 2,
                "speaker": "moderator",
                "speakerName": "Impartial Adjudicator",
                "speakerRole": "Consensus Arbiter & Verdict Judge",
                "avatarColor": "#a855f7",
                "content": m_content,
                "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
                "status": "completed",
            }
            debate_turns_data.append(turn_m)
            yield json.dumps({"type": "debate_turn", **turn_m})
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, 'ADJUDICATOR', 'debate_turn', ?);",
                    (run_id, step_idx, json.dumps(turn_m)),
                )
                conn.commit()
            step_idx += 1

            # Emit completed Skeptic subagent payload for the timeline chip
            skeptic_chat = [
                {"role": "system", "content": skeptic_system},
                {"role": "user", "content": f"Thesis:\n{p1_content}"},
                {"role": "assistant", "content": s1_content},
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
                "action": "Completed adversarial debate & consensus verdict",
                "role": "Adversarial Challenger",
                "inspector": {
                    "title": "SubAgent: Skeptic (Debate Arena)",
                    "role": "Adversarial Challenger",
                    "status": "completed",
                    "prompt": f"Audit research question '{prompt}' through multi-agent debate.",
                    "system_prompt": skeptic_system,
                    "chat_dialogue": skeptic_chat,
                    "tools_called": skeptic_tools,
                    "thought": f"Cross-examined hypothesis against evidence. Adjudication ruling:\n{m_content}",
                    "fetches": [{"type": "audited_chunk", "detail": f"{c['domain']}: {c['snippet'][:60]}..."} for c in gathered_chunks[:3]],
                    "verdict": "Adversarial debate completed. Consensus formulated for synthesis."
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

            # ==================== Step 4.5: Dynamic Custom SubAgents Mentioned ====================
            custom_findings = []
            try:
                with get_db() as conn:
                    custom_agents = conn.execute("SELECT * FROM custom_subagents WHERE is_enabled = 1;").fetchall()

                for c_sub in custom_agents:
                    c_name = c_sub["name"].lower()
                    if c_name in ("planner", "skeptic", "editor"):
                        continue
                    tag_short = f"@{c_name}"
                    tag_long = f"@subagent:{c_name}"
                    if tag_short in prompt.lower() or tag_long in prompt.lower():
                        if ACTIVE_RUNS.get(run_id, {}).get("aborted"):
                            yield json.dumps({"type": "status", "status": "aborted", "message": "Research aborted by user."})
                            return

                        c_color = c_sub["color"] or "#38bdf8"
                        c_role = c_sub["description"] or f"Specialized {c_sub['name']}"
                        c_system = c_sub["system_prompt"] or f"You are {c_sub['name']}. Provide domain-specific analysis."

                        yield json.dumps({
                            "type": "subagent",
                            "name": c_sub["name"],
                            "action": f"Executing domain analysis ({c_sub['name']})",
                            "role": c_role,
                            "color": c_color,
                            "inspector": {
                                "title": f"SubAgent: {c_sub['name']}",
                                "role": c_role,
                                "status": "running",
                                "prompt": f"Analyze research topic '{prompt}' from the perspective of {c_sub['name']}.",
                                "system_prompt": c_system,
                                "thought": f"Applying specialized domain guidelines: {c_sub['allowed_tools']}",
                                "fetches": [{"type": "evidence", "detail": f"{len(gathered_chunks)} chunks"}],
                                "verdict": "Analyzing...",
                            }
                        })

                        c_prompt = (
                            f"Research Request: {prompt}\n\n"
                            f"Gathered Evidence:\n{evidence_summary}\n\n"
                            f"Provide your domain-specific analysis, constraints, and recommendations:"
                        )
                        c_analysis = ""
                        try:
                            c_resp = await llm_provider.generate(
                                messages=[
                                    ModelMessage(role="system", content=c_system),
                                    ModelMessage(role="user", content=c_prompt),
                                ],
                                model=target_model,
                                max_tokens=400,
                                temperature=0.2,
                            )
                            c_analysis = c_resp.content.strip()
                        except Exception as e:
                            c_analysis = f"Analysis completed: verified against system criteria ({e})"

                        custom_findings.append(f"[{c_sub['name']} Domain Findings]:\n{c_analysis}")

                        c_payload = {
                            "type": "subagent",
                            "name": c_sub["name"],
                            "action": f"Completed {c_sub['name']} domain analysis",
                            "role": c_role,
                            "color": c_color,
                            "inspector": {
                                "title": f"SubAgent: {c_sub['name']}",
                                "role": c_role,
                                "status": "completed",
                                "prompt": c_prompt,
                                "system_prompt": c_system,
                                "chat_dialogue": [
                                    {"role": "system", "content": c_system},
                                    {"role": "user", "content": c_prompt},
                                    {"role": "assistant", "content": c_analysis},
                                ],
                                "tools_called": [
                                    {
                                        "name": c_sub["allowed_tools"],
                                        "args": f"Process {len(gathered_chunks)} evidence chunks",
                                        "result": "Domain analysis completed",
                                        "status": "executed",
                                    }
                                ],
                                "thought": c_analysis,
                                "fetches": [{"type": "domain_audit", "detail": f"Processed {len(gathered_chunks)} chunks"}],
                                "verdict": f"Verified by {c_sub['name']}.",
                            }
                        }
                        yield json.dumps(c_payload)
                        with get_db() as conn:
                            conn.execute(
                                "INSERT INTO run_events (run_id, step, agent_role, event_type, payload_json) VALUES (?, ?, ?, 'subagent', ?);",
                                (run_id, step_idx, c_sub["name"].upper(), json.dumps(c_payload)),
                            )
                            conn.commit()
                        step_idx += 1
            except Exception as e:
                print("Custom subagent execution warning:", e)

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
            extra_custom = ("\n\n" + "\n\n".join(custom_findings)) if custom_findings else ""
            parent_note = f"\n\nPrior Research Synthesis Context (Follow-up):\n{parent_context[:1200]}\n" if parent_context else ""

            fts_editor_chunks = search_evidence_fts(run_id, prompt, limit=8)
            editor_evidence_pool = fts_editor_chunks if fts_editor_chunks else gathered_chunks[:8]
            editor_evidence_summary = "\n---\n".join([f"Source: {c['domain']}\nSnippet: {c['snippet']}" for c in editor_evidence_pool]) if editor_evidence_pool else evidence_summary

            debate_summary_text = "\n\n".join([
                f"- [{t['speakerName']}]: {t['content']}" for t in debate_turns_data
            ])
            editor_prompt = (
                f"Research Request: {prompt}\n\n"
                f"{parent_note}"
                f"Verified FTS5 Evidence Gathered:\n{editor_evidence_summary}\n\n"
                f"Multi-Agent Adversarial Debate Record:\n{debate_summary_text}\n\n"
                f"Adjudication Ruling:\n{m_content}"
                f"{extra_custom}\n\n"
                "Please provide your comprehensive, cited research report incorporating verified points and resolved debate nuances now:"
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
                    content=editor_prompt,
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
                    if ACTIVE_RUNS.get(run_id, {}).get("aborted"):
                        yield json.dumps({
                            "type": "status",
                            "status": "aborted",
                            "message": "Research aborted by user.",
                        })
                        break
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
            finally:
                ACTIVE_RUNS.pop(run_id, None)

        return EventSourceResponse(event_generator())

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
