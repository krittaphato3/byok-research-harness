import React, { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent, ChangeEvent } from 'react';
import {
  ArrowRight,
  ChevronDown,
  Paperclip,
  X,
  Bot,
  ShieldAlert,
  PenTool,
  Search,
  Globe,
  FileCode,
  Database,
  FileText,
  Sparkles,
  Square,
  Wand2,
  CornerDownLeft,
  Copy,
  Check,
  Zap,
  Swords,
  Compass,
} from 'lucide-react';
import type { AttachedFile, ResearchMode } from '../types';

export interface ModelOption {
  id: string;
  name: string;
  provider?: string;
  providerLabel?: string;
  tags?: string[];
}

interface InputBarProps {
  onDispatch: (
    prompt: string,
    model: string,
    files: AttachedFile[],
    provider?: string,
    mode?: ResearchMode
  ) => void;
  isLoading: boolean;
  onAbort?: () => void;
  selectedModel: string;
  onModelChange: (model: string, provider?: string) => void;
  onToggleEvidence: () => void;
  availableModels?: ModelOption[];
  parentRunId?: string | null;
  externalPrompt?: string | null;
  initialMode?: ResearchMode;
}

interface MentionOption {
  id: string;
  tag: string;
  label: string;
  description: string;
  category: 'SubAgents' | 'Skills' | 'Files';
  icon: React.ReactNode;
}

const DEFAULT_MENTIONS: MentionOption[] = [
  // Core SubAgents
  {
    id: 'planner',
    tag: '@subagent:planner',
    label: 'planner',
    description: 'Hypothesis formulation and research decomposition',
    category: 'SubAgents',
    icon: <Bot className="w-3.5 h-3.5 text-cyan-400" />,
  },
  {
    id: 'skeptic',
    tag: '@subagent:skeptic',
    label: 'skeptic',
    description: 'Adversarial challenger and bias auditor',
    category: 'SubAgents',
    icon: <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />,
  },
  {
    id: 'editor',
    tag: '@subagent:editor',
    label: 'editor',
    description: 'Claim synthesis and citation ledger builder',
    category: 'SubAgents',
    icon: <PenTool className="w-3.5 h-3.5 text-purple-400" />,
  },
  {
    id: 'researcher',
    tag: '@subagent:researcher',
    label: 'researcher',
    description: 'Multi-source deep crawling and chunk extraction',
    category: 'SubAgents',
    icon: <Search className="w-3.5 h-3.5 text-emerald-400" />,
  },

  // Skills
  {
    id: 'web-search',
    tag: '@skill:web-search',
    label: 'web-search',
    description: 'Real-time live search query execution',
    category: 'Skills',
    icon: <Globe className="w-3.5 h-3.5 text-sky-400" />,
  },
  {
    id: 'web-fetch',
    tag: '@skill:web-fetch',
    label: 'web-fetch',
    description: 'Scrapes and indexes raw page content to markdown',
    category: 'Skills',
    icon: <FileCode className="w-3.5 h-3.5 text-orange-400" />,
  },
  {
    id: 'sqlite-fts5',
    tag: '@skill:sqlite-fts5',
    label: 'sqlite-fts5',
    description: 'BM25 full-text keyword retrieval over local chunks',
    category: 'Skills',
    icon: <Database className="w-3.5 h-3.5 text-indigo-400" />,
  },
];

export const InputBar: React.FC<InputBarProps> = ({
  onDispatch,
  isLoading,
  onAbort,
  selectedModel,
  onModelChange,
  onToggleEvidence,
  availableModels = [],
  parentRunId,
  externalPrompt,
  initialMode,
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedMode, setSelectedMode] = useState<ResearchMode>(initialMode || 'deep_research');
  const [copiedInput, setCopiedInput] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Dynamic Custom Subagents & Skills
  const [dynamicMentions, setDynamicMentions] = useState<MentionOption[]>([]);

  // Mention State
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (externalPrompt !== undefined && externalPrompt !== null) {
      setPrompt(externalPrompt);
      setHistoryIndex(-1);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(externalPrompt.length, externalPrompt.length);
        }
      }, 50);
    }
  }, [externalPrompt]);

  // Fetch registered subagents & skills dynamically
  useEffect(() => {
    const loadRegistry = async () => {
      try {
        const [subRes, skillRes] = await Promise.all([
          fetch('/api/subagents'),
          fetch('/api/skills'),
        ]);
        const subData = await subRes.json();
        const skillData = await skillRes.json();

        const customItems: MentionOption[] = [];

        if (subData.ok && Array.isArray(subData.subagents)) {
          for (const s of subData.subagents) {
            if (['planner', 'skeptic', 'editor'].includes(s.name.toLowerCase())) continue;
            customItems.push({
              id: `custom-sub-${s.id}`,
              tag: `@subagent:${s.name}`,
              label: s.name,
              description: s.description || 'Specialized domain agent',
              category: 'SubAgents',
              icon: <Bot className="w-3.5 h-3.5" style={{ color: s.color || '#38bdf8' }} />,
            });
          }
        }

        if (skillData.ok && Array.isArray(skillData.skills)) {
          for (const sk of skillData.skills) {
            if (['web-search', 'web-fetch', 'sqlite-fts5'].includes(sk.name.toLowerCase())) continue;
            customItems.push({
              id: `custom-skill-${sk.id}`,
              tag: `@skill:${sk.name}`,
              label: sk.name,
              description: sk.description || 'Custom capability',
              category: 'Skills',
              icon: <Globe className="w-3.5 h-3.5 text-teal-400" />,
            });
          }
        }

        setDynamicMentions(customItems);
      } catch (err) {
        // Fallback to static
      }
    };
    loadRegistry();
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute all available mentions
  const allMentions: MentionOption[] = [
    ...DEFAULT_MENTIONS,
    ...dynamicMentions,
    ...attachedFiles.map((file) => ({
      id: `file-${file.id}`,
      tag: `@file:${file.name}`,
      label: file.name,
      description: `Attached document (${Math.round(file.size / 1024)} KB)`,
      category: 'Files' as const,
      icon: <FileText className="w-3.5 h-3.5 text-amber-400" />,
    })),
  ];

  // Filter mentions by query
  const filteredMentions = allMentions.filter((m) => {
    const q = mentionQuery.toLowerCase();
    return (
      m.label.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.tag.toLowerCase().includes(q)
    );
  });

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPrompt(val);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      if (charBeforeAt === ' ' || charBeforeAt === '\n') {
        const query = textBeforeCursor.slice(lastAtIndex + 1);
        if (!query.includes(' ')) {
          setMentionOpen(true);
          setMentionQuery(query);
          setMentionSelectedIndex(0);
          return;
        }
      }
    }

    setMentionOpen(false);
  };

  const insertMention = (mentionTag: string) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const textBeforeCursor = prompt.slice(0, cursor);
    const textAfterCursor = prompt.slice(cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const newPrompt =
        prompt.slice(0, lastAtIndex) + mentionTag + ' ' + textAfterCursor;
      setPrompt(newPrompt);
      setMentionOpen(false);

      setTimeout(() => {
        if (textareaRef.current) {
          const nextCursor = lastAtIndex + mentionTag.length + 1;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      }, 0);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % filteredMentions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentions[mentionSelectedIndex].tag);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }

    if (!mentionOpen) {
      if (e.key === 'ArrowUp' && (prompt === '' || historyIndex !== -1)) {
        e.preventDefault();
        try {
          const raw = localStorage.getItem('byok_prompt_history');
          const history = raw ? JSON.parse(raw) : [];
          if (Array.isArray(history) && history.length > 0) {
            const nextIdx = Math.min(historyIndex + 1, history.length - 1);
            setHistoryIndex(nextIdx);
            setPrompt(history[nextIdx]);
          }
        } catch {}
        return;
      }
      if (e.key === 'ArrowDown' && historyIndex !== -1) {
        e.preventDefault();
        try {
          const raw = localStorage.getItem('byok_prompt_history');
          const history = raw ? JSON.parse(raw) : [];
          if (Array.isArray(history)) {
            const nextIdx = historyIndex - 1;
            if (nextIdx < 0) {
              setHistoryIndex(-1);
              setPrompt('');
            } else {
              setHistoryIndex(nextIdx);
              setPrompt(history[nextIdx]);
            }
          }
        } catch {}
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.ok) {
          setAttachedFiles((prev) => [
            ...prev,
            {
              id: data.file_id,
              name: data.filename,
              size: data.size,
              preview: data.preview,
            },
          ]);
        }
      } catch (err) {
        console.error('File upload failed', err);
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleEnhancePrompt = async () => {
    if (!prompt.trim() || isEnhancing || isLoading) return;
    setIsEnhancing(true);
    try {
      const res = await fetch('/api/prompt/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (data.ok && data.enhanced_prompt) {
        setPrompt(data.enhanced_prompt);
      }
    } catch (err) {
      console.error('Prompt enhancement error:', err);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if ((!trimmed && attachedFiles.length === 0) || isLoading) return;
    try {
      const raw = localStorage.getItem('byok_prompt_history');
      const history = raw ? JSON.parse(raw) : [];
      if (trimmed) {
        const updated = [trimmed, ...history.filter((p: string) => p !== trimmed)].slice(0, 30);
        localStorage.setItem('byok_prompt_history', JSON.stringify(updated));
      }
    } catch {}
    setHistoryIndex(-1);
    const selectedObj = availableModels.find((m) => m.id === selectedModel);
    onDispatch(trimmed, selectedModel, attachedFiles, selectedObj?.provider, selectedMode);
    setPrompt('');
    setAttachedFiles([]);
    setMentionOpen(false);
  };

  return (
    <div className="max-w-4xl w-full mx-auto p-4 z-20">
      <div className="relative rounded-3xl bg-[#1e1f20] border border-[#3c4043] shadow-2xl focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/40 transition-all backdrop-blur-md">
        {/* ================== Mention Popup Menu ================== */}
        {mentionOpen && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 w-80 max-h-72 bg-[#18191b] border border-[#3c4043] rounded-2xl shadow-2xl overflow-y-auto py-2 z-50 animate-in fade-in zoom-in-95 font-sans">
            <div className="px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between border-b border-[#282a2c] mb-1">
              <span>Invoke SubAgent, Skill, or File</span>
              <span>Use ↑ ↓ to navigate</span>
            </div>

            {(['SubAgents', 'Skills', 'Files'] as const).map((cat) => {
              const items = filteredMentions.filter((m) => m.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat} className="mb-1">
                  <div className="px-3 py-1 text-[10px] font-mono font-medium text-cyan-400 uppercase tracking-wider">
                    {cat}
                  </div>
                  {items.map((item) => {
                    const globalIdx = filteredMentions.indexOf(item);
                    const isSelected = globalIdx === mentionSelectedIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => insertMention(item.tag)}
                        className={`w-full flex items-center space-x-2.5 px-3 py-1.5 text-left text-xs transition-colors ${
                          isSelected ? 'bg-[#2b2c2e] text-white' : 'text-[#c4c7c5] hover:bg-[#242628]'
                        }`}
                      >
                        <div className="p-1 rounded-md bg-[#242628] border border-[#3c4043] shrink-0">
                          {item.icon}
                        </div>
                        <div className="truncate flex-1">
                          <div className="font-mono font-medium text-xs text-white truncate">
                            {item.tag}
                          </div>
                          <div className="text-[10px] text-[#8e918f] truncate">
                            {item.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* ================== Attached File Chips ================== */}
        {attachedFiles.length > 0 && (
          <div className="px-4 pt-3 pb-1 flex flex-wrap gap-2">
            {attachedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-[#242628] border border-[#3c4043] text-xs text-white animate-in fade-in"
              >
                <FileText className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="truncate max-w-[160px] font-mono text-[11px]">{file.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  ({Math.round(file.size / 1024)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(file.id)}
                  className="p-0.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-700 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ================== Follow-Up Thread Indicator ================== */}
        {parentRunId && (
          <div className="px-4 pt-2 flex items-center space-x-1.5 text-[11px] text-cyan-400 font-mono">
            <CornerDownLeft className="w-3 h-3 text-cyan-400" />
            <span>Multi-turn follow-up (grounded in previous research evidence)</span>
          </div>
        )}

        {/* ================== Text Input & Primary Actions ================== */}
        <div className="flex items-center px-4 py-2">
          {/* File Upload Hidden Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-2 text-[#8e918f] hover:text-white rounded-full hover:bg-[#282a2c] transition-colors"
            title="Attach files or datasets"
          >
            {isUploading ? (
              <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin inline-block" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </button>

          <textarea
            ref={textareaRef}
            id="react-user-input"
            rows={1}
            value={prompt}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={
              parentRunId
                ? 'Ask a follow-up question based on this evidence, or type @...'
                : 'Type prompt, question, or type @ to invoke subagents & skills...'
            }
            className="flex-1 bg-transparent px-3 py-1 text-sm text-[#e3e3e3] placeholder-[#8e918f] focus:outline-none resize-none max-h-32 leading-relaxed"
          />

          {/* Quick Copy Input Button */}
          {prompt.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(prompt);
                setCopiedInput(true);
                setTimeout(() => setCopiedInput(false), 2000);
              }}
              className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-[#282a2c] transition-colors shrink-0"
              title="Copy input text"
            >
              {copiedInput ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Prompt Enhancer Button */}
          {prompt.trim() && !isLoading && (
            <button
              type="button"
              onClick={handleEnhancePrompt}
              disabled={isEnhancing}
              className="p-2 text-zinc-400 hover:text-cyan-300 rounded-full hover:bg-[#282a2c] transition-colors shrink-0"
              title="Enhance prompt into a structured research directive"
            >
              <Wand2 className={`w-4 h-4 ${isEnhancing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          )}

          {/* Stop / Abort Button or Send Button */}
          {isLoading ? (
            <button
              type="button"
              onClick={onAbort}
              className="p-2 rounded-full bg-red-600 hover:bg-red-500 text-white transition-all shrink-0 ml-1 shadow-md hover:scale-105"
              title="Stop research generation"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!prompt.trim() && attachedFiles.length === 0}
              className="p-2 rounded-full bg-white text-black hover:bg-neutral-200 transition-colors disabled:opacity-40 disabled:hover:bg-white shrink-0 ml-1 shadow-sm"
              title="Dispatch research run (Enter)"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ================== Bottom Options Bar ================== */}
        <div className="px-4 py-2 border-t border-[#282a2c] flex items-center justify-between text-xs text-[#8e918f]">
          <div className="flex items-center space-x-3">
            {/* Model Selector Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsModelDropdownOpen((prev) => !prev)}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#141517] hover:bg-[#242628] text-white border border-[#3c4043] transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-mono text-xs truncate max-w-[170px]">{selectedModel}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#8e918f]" />
              </button>

              {isModelDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-72 max-h-64 bg-[#1a1b1d] border border-[#3c4043] rounded-2xl shadow-2xl overflow-y-auto py-1.5 z-40 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 border-b border-[#282a2c] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Configured Models ({availableModels.length})
                  </div>
                  {availableModels.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-zinc-500 italic">No models configured</div>
                  ) : (
                    availableModels.map((m) => {
                      const isSelected = m.id === selectedModel;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onModelChange(m.id, m.provider);
                            setIsModelDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors ${
                            isSelected ? 'bg-[#2b2c2e] text-white' : 'text-[#c4c7c5] hover:bg-[#242628]'
                          }`}
                        >
                          <div className="truncate">
                            <div className="font-mono text-xs truncate">{m.name}</div>
                            {m.providerLabel && (
                              <div className="text-[10px] text-[#8e918f]">{m.providerLabel}</div>
                            )}
                          </div>
                          {m.tags && m.tags.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#3c4043] text-cyan-300 font-mono shrink-0 ml-2">
                              {m.tags[0]}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Quick @ shortcut button */}
            <button
              type="button"
              onClick={() => {
                if (textareaRef.current) {
                  setPrompt((prev) => (prev ? prev + ' @' : '@'));
                  textareaRef.current.focus();
                  setMentionOpen(true);
                  setMentionQuery('');
                }
              }}
              className="flex items-center space-x-1 px-2 py-0.5 rounded-full hover:bg-[#282a2c] text-zinc-400 hover:text-white transition-colors"
              title="Invoke SubAgents, Skills, or Files"
            >
              <Bot className="w-3 h-3 text-cyan-400" />
              <span>@ agents & skills</span>
            </button>

            {/* Quick Evidence Ledger Toggle */}
            <button
              type="button"
              onClick={onToggleEvidence}
              className="flex items-center space-x-1 px-2 py-0.5 rounded-full hover:bg-[#282a2c] text-zinc-400 hover:text-emerald-300 transition-colors"
              title="Toggle SQLite FTS5 evidence drawer"
            >
              <Database className="w-3 h-3 text-emerald-400" />
              <span>Evidence</span>
            </button>
          </div>

          {/* Execution Mode Selector Pills */}
          <div className="flex items-center space-x-1.5">
            <div className="flex items-center bg-[#18191b] p-0.5 rounded-full border border-[#282a2c]">
              <button
                type="button"
                onClick={() => setSelectedMode('fast')}
                className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                  selectedMode === 'fast'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Fast Direct mode: Instant LLM response without web search (<3s)"
              >
                <Zap className="w-3 h-3 text-emerald-400" />
                <span>Fast</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMode('debate')}
                className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                  selectedMode === 'debate'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Court Debate Arena: Multi-agent adversarial cross-examination"
              >
                <Swords className="w-3 h-3 text-amber-400" />
                <span>Debate</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMode('deep_research')}
                className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                  selectedMode === 'deep_research'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Deep Research mode: Web discovery, FTS5 extraction, debate, and citation synthesis"
              >
                <Compass className="w-3 h-3 text-cyan-400" />
                <span>Deep</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
