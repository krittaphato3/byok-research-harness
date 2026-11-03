import React, { useState, useEffect } from 'react';
import {
  Clock,
  Zap,
  Layers,
  Square,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export interface TelemetryStats {
  stage: string;
  tokensUsed: number;
  tokensPerSec: number;
  elapsedSeconds: number;
  sourcesCount: number;
  chunksCount: number;
  status: 'idle' | 'running' | 'completed' | 'aborted' | 'failed';
}

interface TelemetryHUDProps {
  stats: TelemetryStats;
  onAbort?: () => void;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({ stats, onAbort }) => {
  const [displaySeconds, setDisplaySeconds] = useState(stats.elapsedSeconds);

  useEffect(() => {
    setDisplaySeconds(stats.elapsedSeconds);
  }, [stats.elapsedSeconds]);

  if (stats.status === 'idle') return null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m > 0 ? `${m}m ` : ''}${s}s`;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[#18191b]/95 border border-[#2e3035] shadow-lg backdrop-blur-md text-xs font-mono select-none">
      {/* Active Phase / Status */}
      <div className="flex items-center space-x-2.5">
        {stats.status === 'running' && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
          </span>
        )}
        {stats.status === 'completed' && (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        )}
        {stats.status === 'aborted' && (
          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
        )}
        {stats.status === 'failed' && (
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        )}

        <span className="font-semibold text-white tracking-wide font-sans">
          {stats.stage || (stats.status === 'running' ? 'Processing' : 'Completed')}
        </span>
      </div>

      {/* Metrics Row */}
      <div className="flex items-center space-x-4 text-zinc-400 text-[11px]">
        {/* Elapsed Time */}
        <div className="flex items-center space-x-1" title="Elapsed research duration">
          <Clock className="w-3 h-3 text-zinc-500" />
          <span>{formatTime(displaySeconds)}</span>
        </div>

        {/* Tokens & Velocity */}
        {stats.tokensUsed > 0 && (
          <div className="flex items-center space-x-1" title="Tokens generated">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>{stats.tokensUsed.toLocaleString()} tokens</span>
            {stats.tokensPerSec > 0 && (
              <span className="text-zinc-500 text-[10px]">
                ({Math.round(stats.tokensPerSec)} t/s)
              </span>
            )}
          </div>
        )}

        {/* Evidence & Chunks */}
        <div className="flex items-center space-x-1" title="Indexed SQLite FTS5 evidence">
          <Layers className="w-3 h-3 text-cyan-400" />
          <span>
            {stats.sourcesCount} sources
            {stats.chunksCount > 0 ? ` · ${stats.chunksCount} chunks` : ''}
          </span>
        </div>

        {/* Stop / Abort Button */}
        {stats.status === 'running' && onAbort && (
          <button
            onClick={onAbort}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-300 font-sans text-[11px] font-medium transition-all hover:scale-105"
            title="Stop research run"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            <span>Stop</span>
          </button>
        )}
      </div>
    </div>
  );
};
