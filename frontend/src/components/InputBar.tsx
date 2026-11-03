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
} from 'lucide-react';
import type { AttachedFile } from '../types';

export interface ModelOption {
  id: string;
  name: string;
  provider?: string;
  providerLabel?: string;
  tags?: string[];
}

interface InputBarProps {
  onDispatch: (prompt: string, model: string, files: AttachedFile[], provider?: string) => void;
  isLoading: boolean;
  selectedModel: string;
  onModelChange: (model: string, provider?: string) => void;
  onToggleEvidence: () => void;
  availableModels?: ModelOption[];
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
  // SubAgents
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
    icon: <FileCode className="w-3.5 h-3.5 text-blue-400" />,
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
  selectedModel,
  onModelChange,
  onToggleEvidence,
  availableModels = [],
}) => {
  const [prompt, setPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Mention State
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Compute all available mentions (SubAgents + Skills + Attached Files)
  const allMentions: MentionOption[] = [
    ...DEFAULT_MENTIONS,
    ...attachedFiles.map((file) => ({
      id: `file-${file.id}`,
      tag: `@file:${file.name}`,
      label: file.name,
      description: `Attached document (${Math.round(file.size / 1024)} KB)`,
      category: 'Files' as const,
      icon: <FileText className="w-3.5 h-3.5 text-amber-300" />,
    })),
  ];

  const filteredMentions = allMentions.filter((m) =>
    m.tag.toLowerCase().includes(mentionQuery.toLowerCase()) ||
    m.label.toLowerCase().includes(mentionQuery.toLowerCase()) ||
    m.description.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPrompt(val);

    // Check for @ mention trigger
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      // Ensure @ is preceded by space, newline, or start of input
      if (charBeforeAt === ' ' || charBeforeAt === '\n' || lastAtIndex === 0) {
        const query = textBeforeCursor.slice(lastAtIndex + 1);
        if (!query.includes(' ') && !query.includes('\n')) {
          setMentionQuery(query);
          setMentionOpen(true);
          setMentionSelectedIndex(0);
          return;
        }
      }
    }

    setMentionOpen(false);
  };

  const insertMention = (mentionTag: string) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart || 0;
    const textBeforeCursor = prompt.slice(0, cursorPos);
    const textAfterCursor = prompt.slice(cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const beforeAt = prompt.slice(0, lastAtIndex);
      const newPrompt = beforeAt + mentionTag + ' ' + textAfterCursor;
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

  const handleSubmit = () => {
    if ((!prompt.trim() && attachedFiles.length === 0) || isLoading) return;
    const currentModelObj = availableModels.find((m) => m.id === selectedModel);
    onDispatch(prompt.trim(), selectedModel, attachedFiles, currentModelObj?.provider);
    setPrompt('');
    setAttachedFiles([]);
    setMentionOpen(false);
  };

  // Grouped mention categories for cleaner list presentation
  const mentionCategories: ('SubAgents' | 'Skills' | 'Files')[] = ['SubAgents', 'Skills', 'Files'];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-6 z-20">
      <div className="relative bg-[#1e1f20] border border-[#3c4043] rounded-3xl shadow-2xl hover:border-[#5e6368] transition-all focus-within:border-[#a8c7fa] focus-within:ring-1 focus-within:ring-[#a8c7fa]">
        
        {/* ================== Mention Popup Menu ================== */}
        {mentionOpen && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-4 mb-3 w-80 max-h-72 bg-[#1a1b1d] border border-[#3c4043] rounded-2xl shadow-2xl overflow-y-auto py-2 z-50 animate-in fade-in zoom-in-95 backdrop-blur-md">
            <div className="px-3 pb-1.5 border-b border-[#282a2c] flex items-center justify-between text-[11px] text-[#8e918f]">
              <span className="font-semibold uppercase tracking-wider">Mention Agents & Skills</span>
              <span>Use ↑↓ Enter</span>
            </div>

            {mentionCategories.map((cat) => {
              const catItems = filteredMentions.filter((m) => m.category === cat);
              if (catItems.length === 0) return null;

              return (
                <div key={cat} className="pt-2">
                  <div className="px-3 pb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    {cat}
                  </div>
                  {catItems.map((item) => {
                    const globalIdx = filteredMentions.findIndex((m) => m.id === item.id);
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
            {isUploading && (
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-[#242628] border border-[#3c4043] text-xs text-zinc-400 animate-pulse">
                <span>Uploading file...</span>
              </div>
            )}
          </div>
        )}

        {/* ================== Input Text Area & Actions ================== */}
        <div className="px-4 pt-3 pb-2 flex items-center">
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
            className="p-2 text-[#8e918f] hover:text-white rounded-full hover:bg-[#282a2c] transition-colors"
            title="Attach files or datasets"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <textarea
            ref={textareaRef}
            id="react-user-input"
            rows={1}
            value={prompt}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Type prompt or type @ for subagents & skills..."
            className="flex-1 bg-transparent px-3 py-1 text-sm text-[#e3e3e3] placeholder-[#8e918f] focus:outline-none resize-none max-h-32 leading-relaxed"
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || (!prompt.trim() && attachedFiles.length === 0)}
            className="p-2 rounded-full bg-white text-black hover:bg-neutral-200 transition-colors disabled:opacity-40 disabled:hover:bg-white shrink-0 ml-1 shadow-sm"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
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
                            <div className="font-mono font-medium truncate">{m.name || m.id}</div>
                            {m.providerLabel && (
                              <div className="text-[10px] text-[#8e918f]">{m.providerLabel}</div>
                            )}
                          </div>
                          {m.tags && m.tags.length > 0 && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-[#141517] text-[#8e918f] border border-[#3c4043] shrink-0 font-mono ml-1">
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

            <button
              type="button"
              onClick={onToggleEvidence}
              className="text-[11px] text-[#8e918f] hover:text-white transition-colors"
            >
              Evidence Provenance
            </button>
          </div>

          <div className="text-[10px] text-zinc-500 font-mono">
            Type <span className="text-cyan-400">@</span> to call agents
          </div>
        </div>
      </div>
    </div>
  );
};
