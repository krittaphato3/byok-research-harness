import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  RefreshCw,
  Search,
  Bot,
  Trash2,
  Monitor,
  ChevronDown,
} from 'lucide-react';
import type { SubagentItem } from '../types';

interface SubagentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubagentsUpdated?: () => void;
}

const COLOR_PALETTE = [
  '#eab308', // gold/yellow
  '#ef4444', // crimson red
  '#f97316', // orange
  '#10b981', // emerald green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink/magenta
];

export const SubagentsModal: React.FC<SubagentsModalProps> = ({
  isOpen,
  onClose,
  onSubagentsUpdated,
}) => {
  const [subagents, setSubagents] = useState<SubagentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New subagent form state
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLOR_PALETTE[0]);
  const [newModel, setNewModel] = useState('Inherit');
  const [newDescription, setNewDescription] = useState('');
  const [newAllowedTools, setNewAllowedTools] = useState('Default all permissions');
  const [newSystemPrompt, setNewSystemPrompt] = useState('');
  const [newInjectAgentsMd, setNewInjectAgentsMd] = useState(true);

  const loadSubagents = async () => {
    try {
      const res = await fetch('/api/subagents');
      const data = await res.json();
      if (data.subagents) {
        setSubagents(data.subagents);
      }
    } catch (e) {
      console.error('Failed to load subagents', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSubagents();
      setIsCreatingNew(false);
    }
  }, [isOpen]);

  const handleToggle = async (id: string) => {
    try {
      await fetch(`/api/subagents/${id}/toggle`, { method: 'PATCH' });
      setSubagents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_enabled: !s.is_enabled } : s))
      );
      if (onSubagentsUpdated) onSubagentsUpdated();
    } catch (e) {
      console.error('Failed to toggle subagent', e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this subagent?')) return;
    try {
      await fetch(`/api/subagents/${id}`, { method: 'DELETE' });
      setSubagents((prev) => prev.filter((s) => s.id !== id));
      if (onSubagentsUpdated) onSubagentsUpdated();
    } catch (e) {
      console.error('Failed to delete subagent', e);
    }
  };

  const handleSaveNew = async () => {
    if (!newName.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/subagents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || '>-',
          color: newColor,
          model: newModel,
          allowed_tools: newAllowedTools,
          system_prompt: newSystemPrompt.trim(),
          inject_agents_md: newInjectAgentsMd,
          is_enabled: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setIsCreatingNew(false);
        setNewName('');
        setNewDescription('');
        setNewSystemPrompt('');
        await loadSubagents();
        if (onSubagentsUpdated) onSubagentsUpdated();
      }
    } catch (e) {
      console.error('Failed to save subagent', e);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const filtered = subagents.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl h-[720px] max-h-[90vh] bg-[#1a1b1d] border border-[#2c2d30] rounded-2xl shadow-2xl flex flex-col text-[#e3e3e3] overflow-hidden">
        {/* ================= Header ================= */}
        <div className="px-6 pt-5 pb-4 border-b border-[#282a2c] bg-[#1a1b1d] flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white tracking-tight">Subagents</h2>
            <button
              onClick={onClose}
              className="p-2 text-[#8e918f] hover:text-white rounded-lg hover:bg-[#242628] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!isCreatingNew && (
            <div className="flex items-center justify-between">
              {/* Left Scope Pill & Count */}
              <div className="flex items-center space-x-3 text-xs">
                <button
                  type="button"
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-[#141517] border border-[#3c4043] text-zinc-300 hover:text-white transition-colors"
                >
                  <Monitor className="w-3.5 h-3.5 text-[#8e918f]" />
                  <span>This computer · User</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#8e918f]" />
                </button>
                <span className="text-[#3c4043]">|</span>
                <span className="font-semibold text-white">Subagents {subagents.length}</span>
              </div>

              {/* Right Search Input */}
              <div className="relative w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#8e918f]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search subagents..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#141517] border border-[#2b2c2f] focus:border-[#a8c7fa] focus:outline-none text-xs text-white placeholder-[#8e918f] transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* ================= Content ================= */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#141517]">
          {isCreatingNew ? (
            /* ================= Image 2: New Subagent View ================= */
            <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">New subagent</h3>
                  <p className="text-xs text-[#8e918f] mt-0.5">
                    Fill in the subagent name, tools, and system prompt, then save to return to the list.
                  </p>
                </div>
                <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-[#1e1f20] border border-[#3c4043] text-xs text-zinc-300">
                  <Monitor className="w-3.5 h-3.5 text-[#8e918f]" />
                  <span>This computer · User</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#8e918f]" />
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#1a1b1d] border border-[#2c2d30] space-y-4">
                {/* Row: Name, Color, Model */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Name</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="code-reviewer"
                      className="w-full px-3 py-2 rounded-xl bg-[#141517] border border-[#3c4043] focus:border-[#a8c7fa] text-xs text-white focus:outline-none font-mono"
                    />
                  </div>

                  {/* Color Palette */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Color</label>
                    <div className="flex items-center space-x-1.5 h-9 px-2.5 rounded-xl bg-[#141517] border border-[#3c4043]">
                      {COLOR_PALETTE.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewColor(c)}
                          style={{ backgroundColor: c }}
                          className={`w-4 h-4 rounded-full transition-transform ${
                            newColor === c ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Model */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Model</label>
                    <select
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#141517] border border-[#3c4043] focus:border-[#a8c7fa] text-xs text-white focus:outline-none"
                    >
                      <option value="Inherit">Inherit</option>
                      <option value="auto/qwen">auto/qwen</option>
                      <option value="auto/coding">auto/coding</option>
                      <option value="antigravity/gemini-3.8-flash-high">antigravity/gemini-3.8-flash-high</option>
                      <option value="antigravity/claude-sonnet-4-6">antigravity/claude-sonnet-4-6</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Description</label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Short description shown to the model"
                    className="w-full px-3 py-2 rounded-xl bg-[#141517] border border-[#3c4043] focus:border-[#a8c7fa] text-xs text-white focus:outline-none"
                  />
                </div>

                {/* Allowed Tools */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Allowed tools</label>
                  <div className="flex items-center space-x-3">
                    <select
                      value={newAllowedTools}
                      onChange={(e) => setNewAllowedTools(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-[#141517] border border-[#3c4043] focus:border-[#a8c7fa] text-xs text-white focus:outline-none"
                    >
                      <option value="Default all permissions">Default all permissions</option>
                      <option value="Read-only (No shell)">Read-only (No shell)</option>
                      <option value="Strict TDD (Tests only)">Strict TDD (Tests only)</option>
                    </select>
                    <span className="text-[11px] text-zinc-500">Control which tools this SubAgent can use.</span>
                  </div>
                </div>

                {/* System Prompt */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">System prompt</label>
                  <textarea
                    rows={4}
                    value={newSystemPrompt}
                    onChange={(e) => setNewSystemPrompt(e.target.value)}
                    placeholder="Describe this subagent's role and rules..."
                    className="w-full px-3 py-2.5 rounded-xl bg-[#141517] border border-[#3c4043] focus:border-[#a8c7fa] text-xs text-white focus:outline-none leading-relaxed font-mono resize-none"
                  />
                </div>

                {/* Inject AGENTS.md Toggle */}
                <div className="p-3.5 rounded-xl bg-[#141517] border border-[#2b2c2f] flex items-center justify-between">
                  <span className="text-xs font-medium text-white">Inject AGENTS.md</span>
                  <button
                    type="button"
                    onClick={() => setNewInjectAgentsMd((prev) => !prev)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      newInjectAgentsMd ? 'bg-white' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full ${
                        newInjectAgentsMd ? 'bg-black translate-x-4' : 'bg-white translate-x-0'
                      } shadow-md ring-0 transition duration-200 ease-in-out`}
                    />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNew}
                  disabled={isSaving || !newName.trim()}
                  className="px-5 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors shadow-sm disabled:opacity-40"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            /* ================= Image 1: Subagents List View ================= */
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">
                  Installed <span className="text-white font-bold">{filtered.length} items</span>
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={loadSubagents}
                    title="Refresh subagents"
                    className="p-1.5 rounded-lg bg-[#1a1b1d] hover:bg-[#242628] text-zinc-400 hover:text-white border border-[#2b2c2f] transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(true)}
                    className="px-3 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors flex items-center space-x-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New</span>
                  </button>
                </div>
              </div>

              {/* List Cards */}
              <div className="rounded-2xl border border-[#2b2c2f] bg-[#1a1b1d] divide-y divide-[#242628] overflow-hidden">
                {filtered.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-4 flex items-center justify-between hover:bg-[#1f2022] transition-colors"
                  >
                    <div className="flex items-start space-x-3.5 truncate">
                      {/* Icon */}
                      <div
                        style={{ backgroundColor: sub.color || '#eab308' }}
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm text-black"
                      >
                        <Bot className="w-4 h-4 text-black" />
                      </div>

                      {/* Info */}
                      <div className="truncate">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-white font-mono">{sub.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#242628] text-zinc-400 border border-[#3c4043] font-mono">
                            {sub.model || 'Inherit'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#242628] text-zinc-400 border border-[#3c4043] font-mono">
                            {sub.allowed_tools || 'All tools'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#8e918f] mt-1 truncate max-w-xl">
                          {sub.description || '>-'}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-3 shrink-0 ml-4">
                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggle(sub.id)}
                        className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          sub.is_enabled ? 'bg-white' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full ${
                            sub.is_enabled ? 'bg-black translate-x-3' : 'bg-white translate-x-0'
                          } shadow-md ring-0 transition duration-200 ease-in-out`}
                        />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDelete(sub.id)}
                        title="Delete subagent"
                        className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
