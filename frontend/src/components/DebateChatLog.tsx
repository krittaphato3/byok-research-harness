import React, { useState } from 'react';
import {
  Swords,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ShieldAlert,
  Bot,
  Scale,
  Sparkles,
} from 'lucide-react';
import type { DebateMessage } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface DebateChatLogProps {
  debateTurns: DebateMessage[];
  isDebating: boolean;
  defaultExpanded?: boolean;
}

export const DebateChatLog: React.FC<DebateChatLogProps> = ({
  debateTurns,
  isDebating,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [filterSpeaker, setFilterSpeaker] = useState<'all' | 'proposer' | 'skeptic' | 'moderator'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (debateTurns.length === 0 && !isDebating) return null;

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const filtered = debateTurns.filter((turn) => {
    if (filterSpeaker === 'all') return true;
    return turn.speaker === filterSpeaker;
  });

  const getSpeakerIcon = (speaker: DebateMessage['speaker']) => {
    switch (speaker) {
      case 'proposer':
        return <Bot className="w-3.5 h-3.5 text-sky-400" />;
      case 'skeptic':
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />;
      case 'moderator':
        return <Scale className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-cyan-400" />;
    }
  };

  const getSpeakerBadgeStyle = (speaker: DebateMessage['speaker']) => {
    switch (speaker) {
      case 'proposer':
        return 'bg-sky-950/70 border-sky-800/80 text-sky-300';
      case 'skeptic':
        return 'bg-amber-950/70 border-amber-800/80 text-amber-300';
      case 'moderator':
        return 'bg-purple-950/70 border-purple-800/80 text-purple-300';
      default:
        return 'bg-zinc-800 border-zinc-700 text-zinc-300';
    }
  };

  return (
    <div className="w-full rounded-2xl bg-[#18191b] border border-[#2e3035] shadow-xl overflow-hidden transition-all select-text">
      {/* Header Bar */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="px-4 py-3 bg-[#1e2023] hover:bg-[#232529] border-b border-[#2e3035] flex items-center justify-between cursor-pointer select-none transition-colors"
      >
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-amber-950/60 border border-amber-800/80 text-amber-400">
            <Swords className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-xs text-white uppercase tracking-wider">
                Multi-Agent Adversarial Debate Arena
              </span>
              {isDebating ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-900/60 text-amber-300 border border-amber-700/60 animate-pulse">
                  DEBATING LIVE
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                  {debateTurns.length} TURNS CONCLUDED
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 font-sans">
              Proposer and Skeptic cross-examination with Adjudicator consensus
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            className="p-1 text-zinc-400 hover:text-white rounded-lg transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Debate Body */}
      {isExpanded && (
        <div className="p-4 space-y-3 font-sans text-xs">
          {/* Speaker Filter Pills */}
          <div className="flex items-center space-x-1.5 pb-2 border-b border-[#282a2c] text-[11px] select-none">
            <span className="text-zinc-500 font-mono text-[10px] uppercase mr-1">Filter:</span>
            {(['all', 'proposer', 'skeptic', 'moderator'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFilterSpeaker(filter);
                }}
                className={`px-2.5 py-0.5 rounded-full capitalize font-medium transition-colors ${
                  filterSpeaker === filter
                    ? 'bg-zinc-200 text-black font-semibold'
                    : 'bg-[#222427] text-zinc-400 hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Turns List */}
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {filtered.map((turn) => {
              const isStreaming = turn.status === 'streaming';
              return (
                <div
                  key={turn.id}
                  className="p-3.5 rounded-xl bg-[#131416] border border-[#282a2c] hover:border-[#383a3d] transition-all space-y-2 relative group"
                >
                  {/* Speaker Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="p-1 rounded-md bg-[#1a1c1e] border border-[#323438]">
                        {getSpeakerIcon(turn.speaker)}
                      </div>
                      <span className="font-semibold text-xs text-white">
                        {turn.speakerName}
                      </span>
                      <span
                        className={`px-2 py-0.2 rounded-full border text-[10px] font-mono font-medium ${getSpeakerBadgeStyle(
                          turn.speaker
                        )}`}
                      >
                        Round {turn.round}
                      </span>
                      <span className="text-zinc-500 text-[10px] font-mono">
                        {turn.speakerRole}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {turn.timestamp && (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {turn.timestamp}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopy(turn.id, turn.content)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#282a2c] text-zinc-400 hover:text-white transition-opacity"
                        title="Copy turn statement"
                      >
                        {copiedId === turn.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Turn Content */}
                  <div className="text-zinc-200 leading-relaxed pl-7 text-[12px]">
                    <MarkdownRenderer content={turn.content} className="text-[12px]" />
                    {isStreaming && (
                      <span className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-1 animate-pulse align-middle" />
                    )}
                  </div>
                </div>
              );
            })}

            {isDebating && (
              <div className="flex items-center space-x-2 text-[11px] text-zinc-400 pl-2 pt-1 font-mono animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Agents cross-examining assertions and boundary conditions...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
