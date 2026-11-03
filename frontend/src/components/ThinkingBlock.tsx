import React, { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface ThinkingBlockProps {
  thoughts: string;
  isStreaming: boolean;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ thoughts, isStreaming }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as new thoughts stream in
  useEffect(() => {
    if (isStreaming && scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts, isStreaming, isExpanded]);

  if (!thoughts.trim()) return null;

  return (
    <div className="rounded-2xl border border-[#2e3033] bg-[#161718]/90 overflow-hidden shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-medium text-zinc-300 hover:text-white hover:bg-[#1f2022] transition-colors"
      >
        <div className="flex items-center space-x-2">
          {isStreaming ? (
            <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
          ) : (
            <Brain className="w-4 h-4 text-cyan-400" />
          )}
          <span className="font-semibold text-white tracking-wide">Thought Process</span>
          {isStreaming && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800 animate-pulse font-mono">
              THINKING...
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2 text-[11px] text-[#8e918f]">
          <span>{isExpanded ? 'Hide thoughts' : 'Show thoughts'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className="px-4 py-3 border-t border-[#242628] font-mono text-xs text-[#b8bab9] leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap select-text bg-[#121314]/80"
        >
          {thoughts}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3 ml-1 bg-cyan-400 animate-pulse align-middle" />
          )}
        </div>
      )}
    </div>
  );
};
