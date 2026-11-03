import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  RefreshCw,
  Search,
  Wand2,
  Trash2,
  Monitor,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react';
import type { SkillItem } from '../types';

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSkillsUpdated?: () => void;
}

export const SkillsModal: React.FC<SkillsModalProps> = ({
  isOpen,
  onClose,
  onSkillsUpdated,
}) => {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New Skill form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAllowedTools, setNewAllowedTools] = useState('Default all permissions');
  const [newInstructions, setNewInstructions] = useState('');

  const loadSkills = async () => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      if (data.skills) {
        setSkills(data.skills);
      }
    } catch (e) {
      console.error('Failed to load skills', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSkills();
      setIsCreatingNew(false);
    }
  }, [isOpen]);

  const handleToggle = async (id: string) => {
    try {
      await fetch(`/api/skills/${id}/toggle`, { method: 'PATCH' });
      setSkills((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_enabled: !s.is_enabled } : s))
      );
      if (onSkillsUpdated) onSkillsUpdated();
    } catch (e) {
      console.error('Failed to toggle skill', e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this skill?')) return;
    try {
      await fetch(`/api/skills/${id}`, { method: 'DELETE' });
      setSkills((prev) => prev.filter((s) => s.id !== id));
      if (onSkillsUpdated) onSkillsUpdated();
    } catch (e) {
      console.error('Failed to delete skill', e);
    }
  };

  const handleSaveNew = async () => {
    if (!newName.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || 'Custom skill workflow',
          allowed_tools: newAllowedTools,
          instructions: newInstructions.trim(),
          is_enabled: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setIsCreatingNew(false);
        setNewName('');
        setNewDescription('');
        setNewInstructions('');
        await loadSkills();
        if (onSkillsUpdated) onSkillsUpdated();
      }
    } catch (e) {
      console.error('Failed to save skill', e);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const filtered = skills.filter(
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
            <h2 className="text-2xl font-bold text-white tracking-tight">Skills</h2>
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
                <span className="font-semibold text-white">Skills {skills.length}</span>
              </div>

              {/* Right Search Input */}
              <div className="relative w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#8e918f]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search skills..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#141517] border border-[#2b2c2f] focus:border-[#a8c7fa] focus:outline-none text-xs text-white placeholder-[#8e918f] transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* ================= Content ================= */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#141517]">
          {isCreatingNew ? (
            /* ================= New Skill Form ================= */
            <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">New skill</h3>
                  <p className="text-xs text-[#8e918f] mt-0.5">
                    Define skill trigger rules, allowed permissions, and workflow execution prompts.
                  </p>
                </div>
                <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-[#1e1f20] border border-[#3c4043] text-xs text-zinc-300">
                  <Monitor className="w-3.5 h-3.5 text-[#8e918f]" />
                  <span>This computer · User</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#8e918f]" />
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#1a1b1d] border border-[#2c2d30] space-y-4">
                {/* Skill Name */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Skill Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="my-custom-skill"
                    className="w-full px-3 py-2 rounded-xl bg-[#141517] border border-[#3c4043] focus:border-[#a8c7fa] text-xs text-white focus:outline-none font-mono"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Description</label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Short description explaining when this skill is invoked"
                    className="w-full px-3 py-2 rounded-xl bg-[#141517] border border-[#3c4043] focus:border-[#a8c7fa] text-xs text-white focus:outline-none"
                  />
                </div>

                {/* Allowed Tools */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Allowed tools</label>
                  <select
                    value={newAllowedTools}
                    onChange={(e) => setNewAllowedTools(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#141517] border border-[#3c4043] focus:border-[#a8c7fa] text-xs text-white focus:outline-none"
                  >
                    <option value="Default all permissions">Default all permissions</option>
                    <option value="Web & Read-only">Web & Read-only</option>
                    <option value="Local Database only">Local Database only</option>
                  </select>
                </div>

                {/* Instructions Prompt */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Skill Instructions</label>
                  <textarea
                    rows={5}
                    value={newInstructions}
                    onChange={(e) => setNewInstructions(e.target.value)}
                    placeholder="Step-by-step instructions and guidelines for this skill..."
                    className="w-full px-3 py-2.5 rounded-xl bg-[#141517] border border-[#3c4043] focus:border-[#a8c7fa] text-xs text-white focus:outline-none leading-relaxed font-mono resize-none"
                  />
                </div>
              </div>

              {/* Actions */}
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
                  {isSaving ? 'Saving...' : 'Save Skill'}
                </button>
              </div>
            </div>
          ) : (
            /* ================= Image 3: Skills List View ================= */
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">
                  Installed <span className="text-white font-bold">{filtered.length}</span>
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    className="p-1.5 rounded-lg bg-[#1a1b1d] hover:bg-[#242628] text-zinc-400 hover:text-white border border-[#2b2c2f] transition-colors"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={loadSkills}
                    title="Refresh skills"
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

              {/* Skills Cards Container */}
              <div className="rounded-2xl border border-[#2b2c2f] bg-[#1a1b1d] divide-y divide-[#242628] overflow-hidden">
                {filtered.map((skill) => (
                  <div
                    key={skill.id}
                    className="p-4 flex items-center justify-between hover:bg-[#1f2022] transition-colors"
                  >
                    <div className="flex items-start space-x-3.5 truncate">
                      {/* Icon */}
                      <div className="w-8 h-8 rounded-xl bg-[#242628] border border-[#3c4043] flex items-center justify-center shrink-0 shadow-sm text-zinc-300">
                        <Wand2 className="w-4 h-4 text-purple-400" />
                      </div>

                      {/* Info */}
                      <div className="truncate">
                        <div className="text-xs font-bold text-white font-mono">{skill.name}</div>
                        <p className="text-[11px] text-[#8e918f] mt-1 truncate max-w-xl">
                          {skill.description || 'Custom workflow skill'}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-3 shrink-0 ml-4">
                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggle(skill.id)}
                        className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          skill.is_enabled ? 'bg-white' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full ${
                            skill.is_enabled ? 'bg-black translate-x-3' : 'bg-white translate-x-0'
                          } shadow-md ring-0 transition duration-200 ease-in-out`}
                        />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDelete(skill.id)}
                        title="Delete skill"
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
