"""
Multi-Format Export Engine for BYOK Research Workbench.
Exports research reports to Markdown with YAML frontmatter,
standalone print-ready HTML with executive typography, and structured JSON dossiers.
"""

from typing import Dict, Any, List, Optional
import html
import json
from datetime import datetime


def export_to_markdown(
    run: Dict[str, Any],
    report: str,
    thoughts: str,
    evidence: List[Dict[str, Any]],
    debate: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Generate clean Markdown document with metadata frontmatter and debate transcript."""
    created_at = run.get("created_at", datetime.utcnow().isoformat())
    title = run.get("title", "Research Report")
    prompt = run.get("prompt", "")

    frontmatter = f"""---
title: "{title.replace('"', '\\"')}"
date: "{created_at}"
prompt: "{prompt.replace('"', '\\"')}"
generator: "BYOK Research Workbench"
sources_count: {len(evidence)}
debate_turns_count: {len(debate or [])}
---

# {title}

> **Original Research Hypothesis / Prompt:**
> {prompt}

---

## Synthesized Research Report

{report}
"""

    debate_block = ""
    if debate:
        turns_str = []
        for t in debate:
            spk = t.get("speakerName") or t.get("speaker", "Agent")
            role = t.get("speakerRole", "")
            ts = t.get("timestamp", "")
            content = t.get("content", "").strip()
            turns_str.append(f"### {spk} ({role}) — {ts}\n\n> {content.replace(chr(10), chr(10) + '> ')}")
        debate_block = f"""
---

## Adversarial Multi-Agent Court Debate Transcript

{chr(10).join(turns_str)}
"""

    sources_block = []
    for idx, ev in enumerate(evidence, 1):
        domain = ev.get("domain", "web")
        url = ev.get("url", "#")
        item_title = ev.get("title") or domain
        snippet = ev.get("snippet", "").replace("\n", " ").strip()
        sources_block.append(f"{idx}. **[{item_title}]({url})** — *{domain}*\n   > {snippet}")

    if not sources_block:
        sources_block.append("_No external sources were indexed for this run._")

    sources_str = "\n\n---\n\n## Evidence Ledger & Sources\n\n" + "\n\n".join(sources_block)

    audit_block = ""
    if thoughts:
        audit_block = f"""

---

## Adversarial Audit & Reasoning Trace

```text
{thoughts.strip()}
```
"""

    return frontmatter + debate_block + sources_str + audit_block


def export_to_html(
    run: Dict[str, Any],
    report: str,
    thoughts: str,
    evidence: List[Dict[str, Any]],
    debate: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Generate a self-contained, publication-grade HTML report suitable for browser viewing, sharing, or Print-to-PDF."""
    title = html.escape(run.get("title", "Research Report"))
    prompt = html.escape(run.get("prompt", ""))
    created_at = html.escape(run.get("created_at", datetime.utcnow().isoformat()))

    # Basic markdown paragraph formatting for simple rendering
    paragraphs = report.split("\n\n")
    formatted_paragraphs = []
    for p in paragraphs:
        p_clean = p.strip()
        if not p_clean:
            continue
        if p_clean.startswith("### "):
            formatted_paragraphs.append(f"<h3>{html.escape(p_clean[4:])}</h3>")
        elif p_clean.startswith("## "):
            formatted_paragraphs.append(f"<h2>{html.escape(p_clean[3:])}</h2>")
        elif p_clean.startswith("# "):
            formatted_paragraphs.append(f"<h1>{html.escape(p_clean[2:])}</h1>")
        elif p_clean.startswith("- "):
            items = [f"<li>{html.escape(line[2:])}</li>" for line in p_clean.split("\n") if line.startswith("- ")]
            formatted_paragraphs.append(f"<ul>{''.join(items)}</ul>")
        elif p_clean.startswith("> "):
            formatted_paragraphs.append(f"<blockquote>{html.escape(p_clean[2:])}</blockquote>")
        else:
            formatted_paragraphs.append(f"<p>{html.escape(p_clean).replace(chr(10), '<br/>')}</p>")

    report_html = "\n".join(formatted_paragraphs)

    debate_html = ""
    if debate:
        debate_cards = []
        for turn in debate:
            spk_name = html.escape(turn.get("speakerName") or turn.get("speaker", "Agent"))
            spk_role = html.escape(turn.get("speakerRole", ""))
            color = html.escape(turn.get("avatarColor", "#38bdf8"))
            ts = html.escape(turn.get("timestamp", ""))
            content = html.escape(turn.get("content", "")).replace("\n", "<br/>")
            debate_cards.append(f"""
            <div class="debate-turn-card" style="margin-bottom: 14px; background: var(--surface); padding: 14px 18px; border-radius: 8px; border: 1px solid var(--border); border-left: 4px solid {color};">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <span style="background: {color}22; color: {color}; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">{spk_name[:2].upper()}</span>
                    <strong style="font-size: 14px;">{spk_name}</strong>
                    <span style="font-size: 12px; color: var(--text-muted);">{spk_role}</span>
                    <span style="font-size: 11px; color: var(--text-muted); margin-left: auto;">{ts}</span>
                </div>
                <div style="font-size: 14px; line-height: 1.6;">{content}</div>
            </div>
            """)
        debate_html = f"""
        <section class="debate-section" style="margin-bottom: 40px;">
            <h2>Multi-Agent Adversarial Court Debate</h2>
            <div>{''.join(debate_cards)}</div>
        </section>
        """

    evidence_rows = []
    for idx, ev in enumerate(evidence, 1):
        domain = html.escape(ev.get("domain", "web"))
        url = html.escape(ev.get("url", "#"))
        item_title = html.escape(ev.get("title") or domain)
        snippet = html.escape(ev.get("snippet", ""))
        evidence_rows.append(f"""
        <div class="evidence-item">
            <div class="evidence-header">
                <span class="evidence-num">[{idx}]</span>
                <a href="{url}" target="_blank" rel="noopener noreferrer" class="evidence-title">{item_title}</a>
                <span class="evidence-domain">{domain}</span>
            </div>
            <p class="evidence-snippet">"{snippet}"</p>
        </div>
        """)
    evidence_html = "\n".join(evidence_rows) if evidence_rows else "<p class='no-evidence'>No web evidence sources indexed.</p>"

    reasoning_html = ""
    if thoughts:
        reasoning_html = f"""
        <div class="audit-section">
            <h2>Adversarial Audit & Inner Reasoning</h2>
            <pre class="reasoning-box">{html.escape(thoughts.strip())}</pre>
        </div>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - BYOK Research Report</title>
    <style>
        :root {{
            --bg: #0f1012;
            --surface: #18191b;
            --border: #2e3035;
            --text-main: #e6e8eb;
            --text-muted: #9ba1a6;
            --accent: #38bdf8;
            --accent-glow: rgba(56, 189, 248, 0.12);
            --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }}
        @media print {{
            :root {{
                --bg: #ffffff;
                --surface: #f8fafc;
                --border: #e2e8f0;
                --text-main: #0f172a;
                --text-muted: #64748b;
                --accent: #0284c7;
            }}
            body {{
                padding: 0 !important;
            }}
            .print-button {{
                display: none !important;
            }}
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            background-color: var(--bg);
            color: var(--text-main);
            font-family: var(--font-sans);
            line-height: 1.65;
            padding: 40px 20px;
        }}
        .container {{
            max-width: 860px;
            margin: 0 auto;
        }}
        header {{
            border-bottom: 2px solid var(--border);
            padding-bottom: 24px;
            margin-bottom: 32px;
        }}
        .badge {{
            display: inline-block;
            background: var(--surface);
            border: 1px solid var(--border);
            color: var(--accent);
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 3px 10px;
            border-radius: 9999px;
            margin-bottom: 12px;
        }}
        h1 {{
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.02em;
            line-height: 1.3;
            margin-bottom: 12px;
        }}
        .meta-bar {{
            font-size: 13px;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 16px;
        }}
        .prompt-card {{
            background: var(--surface);
            border: 1px solid var(--border);
            border-left: 4px solid var(--accent);
            padding: 16px 20px;
            border-radius: 8px;
            margin-bottom: 36px;
        }}
        .prompt-card h4 {{
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
            margin-bottom: 6px;
        }}
        .prompt-card p {{
            font-size: 14px;
            font-style: italic;
        }}
        .report-content {{
            font-size: 15px;
            margin-bottom: 48px;
        }}
        .report-content h1, .report-content h2, .report-content h3 {{
            margin-top: 28px;
            margin-bottom: 12px;
            color: var(--text-main);
        }}
        .report-content h2 {{
            font-size: 20px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 8px;
        }}
        .report-content h3 {{
            font-size: 16px;
        }}
        .report-content p {{
            margin-bottom: 16px;
        }}
        .report-content ul {{
            margin-left: 20px;
            margin-bottom: 16px;
        }}
        .report-content li {{
            margin-bottom: 6px;
        }}
        .report-content blockquote {{
            border-left: 3px solid var(--accent);
            padding-left: 16px;
            color: var(--text-muted);
            margin-bottom: 16px;
            font-style: italic;
        }}
        .sources-section, .audit-section {{
            margin-top: 40px;
            border-top: 1px solid var(--border);
            padding-top: 28px;
        }}
        .sources-section h2, .audit-section h2 {{
            font-size: 18px;
            margin-bottom: 20px;
        }}
        .evidence-item {{
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 14px 18px;
            margin-bottom: 12px;
        }}
        .evidence-header {{
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 6px;
        }}
        .evidence-num {{
            font-weight: 700;
            color: var(--accent);
            font-family: var(--font-mono);
            font-size: 13px;
        }}
        .evidence-title {{
            color: var(--accent);
            text-decoration: none;
            font-weight: 500;
            font-size: 14px;
        }}
        .evidence-title:hover {{
            text-decoration: underline;
        }}
        .evidence-domain {{
            font-size: 12px;
            color: var(--text-muted);
            margin-left: auto;
        }}
        .evidence-snippet {{
            font-size: 13px;
            color: var(--text-muted);
            font-style: italic;
        }}
        .reasoning-box {{
            background: var(--surface);
            border: 1px solid var(--border);
            padding: 16px;
            border-radius: 8px;
            font-family: var(--font-mono);
            font-size: 12px;
            white-space: pre-wrap;
            color: var(--text-muted);
            max-height: 400px;
            overflow-y: auto;
        }}
        .print-button {{
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: var(--accent);
            color: #000000;
            border: none;
            border-radius: 9999px;
            padding: 10px 22px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .print-button:hover {{
            opacity: 0.9;
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <span class="badge">Verified Research Report</span>
            <h1>{title}</h1>
            <div class="meta-bar">
                <span>Date: {created_at}</span>
                <span>•</span>
                <span>Sources: {len(evidence)} verified</span>
                <span>•</span>
                <span>Engine: BYOK Autonomous Agent Harness</span>
            </div>
        </header>

        <div class="prompt-card">
            <h4>Research Objective</h4>
            <p>"{prompt}"</p>
        </div>

        <main class="report-content">
            {report_html}
        </main>

        {debate_html}

        <section class="sources-section">
            <h2>Evidence Ledger ({len(evidence)} Sources Indexed)</h2>
            {evidence_html}
        </section>

        {reasoning_html}
    </div>

    <button class="print-button" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
        </svg>
        Print / Save PDF
    </button>
</body>
</html>
"""
    return html_content


def export_to_json_dossier(
    run: Dict[str, Any],
    report: str,
    thoughts: str,
    events: List[Dict[str, Any]],
    evidence: List[Dict[str, Any]],
    debate: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Generate a complete machine-readable research dossier for auditing or downstream processing."""
    return {
        "version": "1.0",
        "harness": "BYOK Research Workbench",
        "exported_at": datetime.utcnow().isoformat(),
        "run": run,
        "synthesis": {
            "report": report,
            "reasoning_trace": thoughts,
            "character_count": len(report),
            "word_count": len(report.split()),
        },
        "debate_transcript": debate or [],
        "evidence_ledger": evidence,
        "pipeline_events": events,
    }
