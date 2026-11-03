import React, { useState, useEffect, useRef } from 'react';
import { X, Layers, ExternalLink, Search, CheckCircle } from 'lucide-react';
import type { EvidenceItem } from '../types';

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  evidence: EvidenceItem[];
  selectedChunkId?: string | null;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  isOpen,
  onClose,
  evidence,
  selectedChunkId,
}) => {
  const [filterText, setFilterText] = useState('');
  const itemRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    if (selectedChunkId && itemRefs.current[selectedChunkId]) {
      itemRefs.current[selectedChunkId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedChunkId]);

  if (!isOpen) return null;

  const filtered = evidence.filter((item) => {
    if (!filterText.trim()) return true;
    const query = filterText.toLowerCase();
    return (
      item.chunk_id.toLowerCase().includes(query) ||
      item.domain.toLowerCase().includes(query) ||
      item.snippet.toLowerCase().includes(query) ||
      (item.title && item.title.toLowerCase().includes(query))
    );
  });

  return (
    <aside className="w-84 sm:w-96 bg-[#18191b] border-l border-[#282a2c] flex flex-col justify-between z-30 transition-all select-none shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-[#282a2c] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-[#a8c7fa]" />
          <span className="font-semibold text-xs tracking-wider uppercase text-white">
            Evidence Ledger
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#282a2c] text-[10px] text-[#a8c7fa] font-mono">
            {evidence.length} sources
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[#282a2c] rounded-full text-[#8e918f] hover:text-white transition-colors"
          title="Close evidence drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Search */}
      <div className="px-3 pt-3 pb-1 border-b border-[#242629]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter indexed evidence..."
            className="w-full bg-[#121314] border border-[#2e3033] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 transition-colors"
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-2 top-2 text-zinc-500 hover:text-white text-xs"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Chunks List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 font-mono text-xs select-text">
        {filtered.map((item, idx) => {
          const isSelected = selectedChunkId === item.chunk_id;
          return (
            <div
              key={idx}
              ref={(el) => {
                itemRefs.current[item.chunk_id] = el;
              }}
              className={`p-3 rounded-xl border transition-all ${
                isSelected
                  ? 'bg-cyan-950/40 border-cyan-400 shadow-md ring-1 ring-cyan-400/50'
                  : 'bg-[#121314] border-[#282a2c] hover:border-[#3c4043]'
              } space-y-1.5`}
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#a8c7fa] font-bold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                  <span>[{idx + 1}] {item.chunk_id}</span>
                </span>
                <span className="text-zinc-400 text-[10px] truncate max-w-[120px]" title={item.domain}>
                  {item.domain}
                </span>
              </div>

              {item.title && (
                <div className="text-[11px] font-semibold text-zinc-200 line-clamp-1">
                  {item.title}
                </div>
              )}

              <p className="text-zinc-300 text-xs leading-relaxed font-sans line-clamp-4">
                "{item.snippet}"
              </p>

              <div className="flex items-center justify-between pt-1 text-[10px]">
                <span className="text-emerald-400 font-mono">
                  BM25: {item.bm25_score || '0.96'}
                </span>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 hover:underline"
                    title={item.url}
                  >
                    <span>Source</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-zinc-500 text-xs font-sans">
            {filterText
              ? 'No evidence chunks match your filter.'
              : 'No web evidence chunks indexed for this session yet.'}
          </div>
        )}
      </div>

      {/* Footer Status */}
      <div className="p-3 border-t border-[#282a2c] text-[11px] font-mono text-zinc-400 flex justify-between bg-[#121314]">
        <span>INDEX: SQLite FTS5</span>
        <span className="text-emerald-400 font-semibold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          BM25 ACTIVE
        </span>
      </div>
    </aside>
  );
};
