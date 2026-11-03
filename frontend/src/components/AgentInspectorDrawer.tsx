import React, { useState } from 'react';
import {
  X,
  Bot,
  Wand2,
  Brain,
  Search,
  ExternalLink,
  CheckCircle2,
  Terminal,
  FileText,
  MessageSquare,
  Globe,
  Sliders,
  Copy,
  Check,
  Code,
} from 'lucide-react';
import type { SubAgentEvent, SkillEvent } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AgentInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  event: SubAgentEvent | SkillEvent | null;
}

export const AgentInspectorDrawer: React.FC<AgentInspectorDrawerProps> = ({
  isOpen,
  onClose,
  event,
}) => {
  const [subagentTab, setSubagentTab] = useState<'dialogue' | 'tools' | 'raw'>('dialogue');
  const [skillTab, setSkillTab] = useState<'content' | 'definition' | 'log'>('content');
  const [copied, setCopied] = useState(false);

  if (!isOpen || !event) return null;

  const isSubagent = event.type === 'subagent';

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-[#141517] border-l border-[#282a2c] shadow-2xl flex flex-col text-[#e3e3e3] animate-in slide-in-from-right duration-200">
      {/* ================= Header ================= */}
      <div className="px-5 py-4 border-b border-[#282a2c] bg-[#1a1b1d] flex items-center justify-between">
        <div className="flex items-center space-x-3 truncate">
          <div className="p-2 rounded-xl bg-[#242628] border border-[#3c4043] shrink-0">
            {isSubagent ? (
              <Bot className="w-5 h-5 text-cyan-400" />
            ) : event.name === 'web-search' ? (
              <Search className="w-5 h-5 text-sky-400" />
            ) : event.name === 'web-fetch' ? (
              <Globe className="w-5 h-5 text-emerald-400" />
            ) : (
              <Wand2 className="w-5 h-5 text-purple-400" />
            )}
          </div>
          <div className="truncate">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white font-mono truncate">
                {isSubagent ? `SubAgent: ${event.name}` : `Skill: ${event.name}`}
              </h3>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/80 font-mono uppercase shrink-0">
                {event.inspector?.status || 'completed'}
              </span>
            </div>
            <p className="text-[11px] text-[#8e918f] truncate">
              {isSubagent
                ? (event as SubAgentEvent).role || 'Autonomous SubAgent'
                : 'Specialized Skill Capability'}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-[#8e918f] hover:text-white rounded-lg hover:bg-[#242628] transition-colors shrink-0 ml-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action Banner */}
      <div className="px-5 py-2.5 bg-[#121314] border-b border-[#242628] text-xs text-zinc-300 flex items-center space-x-2">
        <span className="text-[#8e918f] font-mono text-[10px] uppercase font-bold shrink-0">
          EXECUTION:
        </span>
        <span className="truncate">
          {(event as any).action || (event as any).detail || 'Running pipeline step'}
        </span>
      </div>

      {/* ================= Mode-Specific Navigation Tabs ================= */}
      {isSubagent ? (
        /* Subagent Tabs */
        <div className="flex border-b border-[#282a2c] px-4 pt-2 bg-[#1a1b1d] text-xs">
          <button
            onClick={() => setSubagentTab('dialogue')}
            className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              subagentTab === 'dialogue'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-[#8e918f] hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Subagent Chat</span>
          </button>
          <button
            onClick={() => setSubagentTab('tools')}
            className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              subagentTab === 'tools'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-[#8e918f] hover:text-white'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Items & Skills Called</span>
          </button>
          <button
            onClick={() => setSubagentTab('raw')}
            className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              subagentTab === 'raw'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-[#8e918f] hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>System Prompt & Brief</span>
          </button>
        </div>
      ) : (
        /* Skill Tabs */
        <div className="flex border-b border-[#282a2c] px-4 pt-2 bg-[#1a1b1d] text-xs">
          <button
            onClick={() => setSkillTab('content')}
            className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              skillTab === 'content'
                ? 'border-purple-400 text-purple-400'
                : 'border-transparent text-[#8e918f] hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Skill Content & Output</span>
          </button>
          <button
            onClick={() => setSkillTab('definition')}
            className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              skillTab === 'definition'
                ? 'border-purple-400 text-purple-400'
                : 'border-transparent text-[#8e918f] hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Definition & Rules</span>
          </button>
          <button
            onClick={() => setSkillTab('log')}
            className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              skillTab === 'log'
                ? 'border-purple-400 text-purple-400'
                : 'border-transparent text-[#8e918f] hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Execution Log</span>
          </button>
        </div>
      )}

      {/* ================= Content Body ================= */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* ==================== SUBAGENT VIEWS ==================== */}
        {isSubagent && subagentTab === 'dialogue' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between text-[11px] text-[#8e918f]">
              <span className="font-semibold uppercase tracking-wider">Conversation Transcript</span>
              <span className="font-mono">Role: {(event as SubAgentEvent).role || 'Subagent'}</span>
            </div>

            {/* Conversation Flow */}
            <div className="space-y-3">
              {/* 1. System Prompt Instruction Message */}
              <div className="p-3.5 rounded-xl bg-[#1e1f20] border border-[#2b2c2f] space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#8e918f]">
                  <span className="px-1.5 py-0.5 rounded bg-[#282a2c] text-cyan-300 font-bold">SYSTEM PROMPT</span>
                  <span>Role Instruction</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed font-mono">
                  {event.inspector?.system_prompt || (event as SubAgentEvent).inspector?.prompt || 'Execute designated role.'}
                </p>
              </div>

              {/* 2. Parent / User Task Prompt Message */}
              <div className="p-3.5 rounded-xl bg-[#242628] border border-[#3c4043] space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span className="px-1.5 py-0.5 rounded bg-zinc-700 text-white font-bold">TASK PROMPT</span>
                  <span>Dispatched Input</span>
                </div>
                <p className="text-xs text-white leading-relaxed font-sans">
                  {event.inspector?.prompt || (event as any).action}
                </p>
              </div>

              {/* 3. SubAgent Reasoning / Thinking Box */}
              {event.inspector?.thought && (
                <div className="p-3.5 rounded-xl bg-[#161718] border border-[#2e3033] space-y-1.5 shadow-inner">
                  <div className="flex items-center space-x-1.5 text-[10px] font-mono text-cyan-400 font-semibold">
                    <Brain className="w-3.5 h-3.5" />
                    <span>INNER REASONING & TRADEOFF ANALYSIS</span>
                  </div>
                  <div className="font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {event.inspector.thought}
                  </div>
                </div>
              )}

              {/* 4. Skills & Tools Invocation Chips */}
              {event.inspector?.tools_called && event.inspector.tools_called.length > 0 && (
                <div className="p-3 rounded-xl bg-[#18191b] border border-[#2b2c2f] space-y-2">
                  <span className="text-[10px] font-mono font-semibold text-purple-400 uppercase tracking-wider">
                    Skills & Items Called
                  </span>
                  {event.inspector.tools_called.map((tool, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-[#202124] border border-[#3c4043] flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <Wand2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="font-bold text-white">{tool.name}</span>
                        {tool.args && (
                          <span className="text-[11px] text-zinc-400 truncate max-w-[160px]">
                            {tool.args}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {tool.status || 'executed'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 5. SubAgent Output Result */}
              {event.inspector?.verdict && (
                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-900/40 text-xs flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-emerald-300 block text-[11px] font-mono">
                      SUBAGENT VERDICT
                    </span>
                    <span className="text-zinc-200 mt-0.5 block leading-relaxed">
                      {event.inspector.verdict}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isSubagent && subagentTab === 'tools' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <Wand2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Invoked Tools & Child Skills</span>
            </div>
            {event.inspector?.tools_called && event.inspector.tools_called.length > 0 ? (
              <div className="space-y-2.5">
                {event.inspector.tools_called.map((tool, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-[#1a1b1d] border border-[#2b2c2f] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 font-mono">
                        <span className="font-bold text-white">{tool.name}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 uppercase font-mono">
                        {tool.status || 'success'}
                      </span>
                    </div>
                    {tool.args && (
                      <div className="p-2 rounded-lg bg-[#141517] font-mono text-[11px] text-zinc-300 border border-[#242628]">
                        <span className="text-zinc-500 block text-[9px]">ARGUMENTS</span>
                        {tool.args}
                      </div>
                    )}
                    {tool.result && (
                      <div className="p-2 rounded-lg bg-[#141517] font-mono text-[11px] text-zinc-300 border border-[#242628]">
                        <span className="text-zinc-500 block text-[9px]">RESULT</span>
                        {tool.result}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-zinc-500 italic bg-[#1a1b1d] rounded-xl border border-[#282a2c]">
                No external tools were directly called by this subagent.
              </div>
            )}
          </div>
        )}

        {isSubagent && subagentTab === 'raw' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <span>Full System Brief & Prompt</span>
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    `${event.inspector?.system_prompt || ''}\n\nTask:\n${event.inspector?.prompt || ''}`
                  )
                }
                className="flex items-center space-x-1 px-2 py-1 rounded bg-[#242628] hover:bg-[#2c2e30] text-zinc-300 text-[11px] transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-4 rounded-xl bg-[#101112] border border-[#282a2c] font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
              {event.inspector?.system_prompt && (
                <>
                  <span className="text-cyan-400 block font-bold mb-1">// SYSTEM INSTRUCTION</span>
                  {event.inspector.system_prompt}
                  <hr className="my-3 border-[#282a2c]" />
                </>
              )}
              <span className="text-emerald-400 block font-bold mb-1">// USER BRIEF</span>
              {event.inspector?.prompt || 'No prompt recorded'}
            </div>
          </div>
        )}

        {/* ==================== SKILL VIEWS ==================== */}
        {!isSubagent && skillTab === 'content' && (
          <div className="space-y-4 animate-in fade-in">
            {/* If Web Search: Show Search Result Cards */}
            {event.name === 'web-search' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-semibold uppercase tracking-wider">Live Search Results</span>
                  {event.inspector?.query && (
                    <span className="font-mono text-[10px] text-cyan-400 truncate max-w-[200px]">
                      "{event.inspector.query}"
                    </span>
                  )}
                </div>

                {event.inspector?.results && event.inspector.results.length > 0 ? (
                  <div className="space-y-2.5">
                    {event.inspector.results.map((res, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-[#1a1b1d] border border-[#2b2c2f] hover:border-[#3c4043] transition-colors space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-[#242628] text-cyan-300 font-mono text-[10px]">
                            {new URL(res.url).hostname.replace('www.', '')}
                          </span>
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#8e918f] hover:text-white flex items-center space-x-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-xs text-white hover:text-cyan-300 transition-colors block"
                        >
                          {res.title}
                        </a>
                        <p className="text-zinc-400 text-xs leading-relaxed line-clamp-3">
                          {res.snippet}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-[#1a1b1d] border border-[#282a2c] text-xs text-zinc-400 font-mono">
                    Search executed successfully. Discovered sources indexed.
                  </div>
                )}
              </div>
            )}

            {/* If Web Fetch: Show Full Rendered Markdown Article */}
            {event.name === 'web-fetch' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400 pb-1 border-b border-[#242628]">
                  <span className="font-semibold uppercase tracking-wider">Extracted Article Content</span>
                  {event.inspector?.domain && (
                    <span className="font-mono text-[10px] text-emerald-400">{event.inspector.domain}</span>
                  )}
                </div>

                {event.inspector?.url && (
                  <a
                    href={event.inspector.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-400 hover:underline flex items-center space-x-1 truncate font-mono"
                  >
                    <span>{event.inspector.url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )}

                <div className="p-4 rounded-xl bg-[#101112] border border-[#2b2c2f] max-h-96 overflow-y-auto">
                  <MarkdownRenderer
                    content={event.inspector?.markdown_content || 'No extracted markdown text available.'}
                  />
                </div>
              </div>
            )}

            {/* Other Generic Skills */}
            {event.name !== 'web-search' && event.name !== 'web-fetch' && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Skill Execution Output
                </div>
                <div className="p-4 rounded-xl bg-[#1a1b1d] border border-[#2b2c2f] font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {event.inspector?.execution_log || (event as any).detail || 'Executed successfully.'}
                </div>
              </div>
            )}
          </div>
        )}

        {!isSubagent && skillTab === 'definition' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="p-4 rounded-xl bg-[#1a1b1d] border border-[#2b2c2f] space-y-3 text-xs">
              <div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
                  Skill Name
                </span>
                <span className="font-bold text-white font-mono text-sm">{event.name}</span>
              </div>

              <div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
                  Description
                </span>
                <p className="text-zinc-300 leading-relaxed">
                  {event.inspector?.description || 'Custom capability registered in the skills catalog.'}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
                  Allowed Permissions
                </span>
                <span className="px-2 py-1 rounded bg-[#242628] text-zinc-300 font-mono text-[11px] border border-[#3c4043] inline-block">
                  {event.inspector?.allowed_tools || 'Default all permissions'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
                  Operating Instructions
                </span>
                <div className="p-3 rounded-lg bg-[#141517] font-mono text-xs text-zinc-400 leading-relaxed border border-[#242628]">
                  {event.inspector?.instructions || 'Standard tool execution contract.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isSubagent && skillTab === 'log' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <span>Execution Telemetry & Diagnostics</span>
              <button
                type="button"
                onClick={() => handleCopy(event.inspector?.execution_log || '')}
                className="flex items-center space-x-1 px-2 py-1 rounded bg-[#242628] hover:bg-[#2c2e30] text-zinc-300 text-[11px] transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-4 rounded-xl bg-[#101112] border border-[#282a2c] font-mono text-xs text-emerald-400 leading-relaxed whitespace-pre-wrap select-text">
              {event.inspector?.execution_log ||
                `[200 OK] Skill '${event.name}' executed.\nParameters: ${(event as any).detail || 'None'}\nExit code: 0\nState: Synchronized with SQLite FTS5.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
