import React, { useState } from 'react';
import {
  Edit3,
  Search,
  Layers,
  Settings,
  Sliders,
  Bot,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { ResearchRun } from '../types';

interface SidebarProps {
  isExpanded: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onOpenVault: () => void;
  onOpenSubagents?: () => void;
  onOpenSkills?: () => void;
  onToggleEvidence: () => void;
  runs: ResearchRun[];
  onSelectRun: (run: ResearchRun) => void;
  currentRunId?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isExpanded,
  onToggle,
  onNewChat,
  onOpenVault,
  onOpenSubagents,
  onOpenSkills,
  onToggleEvidence,
  runs,
  onSelectRun,
  currentRunId,
}) => {
  const [isLogoHovered, setIsLogoHovered] = useState(false);

  return (
    <aside
      id="gemini-sidebar"
      className={`${
        isExpanded ? 'w-72' : 'w-[68px]'
      } bg-[#131314] border-r border-[#282a2c] h-full flex flex-col justify-between transition-all duration-300 ease-in-out z-30 select-none overflow-hidden flex-shrink-0`}
    >
      {/* Top Portion */}
      <div className="flex flex-col p-3 space-y-3">
        {/* Header / Logo Row */}
        <div className="flex items-center justify-between h-10 px-1 relative">
          {!isExpanded ? (
            /* Collapsed Rail Logo Button with Hover Reveal & White Pill Tooltip */
            <div
              className="relative group flex items-center justify-center w-10 h-10 cursor-pointer"
              onMouseEnter={() => setIsLogoHovered(true)}
              onMouseLeave={() => setIsLogoHovered(false)}
              onClick={onToggle}
              title="Open sidebar"
            >
              <button
                id="collapsed-logo-btn"
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#282a2c] transition-all"
              >
                {isLogoHovered ? (
                  <PanelLeftOpen className="w-5 h-5 text-white animate-fade-in" />
                ) : (
                  <svg className="w-6 h-6" viewBox="0 0 28 28" fill="none">
                    <path
                      d="M14 28C14 20.268 7.732 14 0 14C7.732 14 14 7.732 14 0C14 7.732 20.268 14 28 14C20.268 14 14 20.268 14 28Z"
                      fill="url(#gemini_grad)"
                    />
                    <defs>
                      <linearGradient
                        id="gemini_grad"
                        x1="0"
                        y1="0"
                        x2="28"
                        y2="28"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop offset="0%" stopColor="#4285F4" />
                        <stop offset="35%" stopColor="#9B72CB" />
                        <stop offset="70%" stopColor="#D96570" />
                        <stop offset="100%" stopColor="#F2A60C" />
                      </linearGradient>
                    </defs>
                  </svg>
                )}
              </button>

              {/* Exact Gemini White Pill Tooltip on Hover */}
              <div className="absolute left-12 top-1.5 bg-[#e3e3e3] text-[#131314] text-xs font-medium px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                Open sidebar
              </div>
            </div>
          ) : (
            /* Expanded Full Header */
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-2.5">
                <svg className="w-5 h-5" viewBox="0 0 28 28" fill="none">
                  <path
                    d="M14 28C14 20.268 7.732 14 0 14C7.732 14 14 7.732 14 0C14 7.732 20.268 14 28 14C20.268 14 14 20.268 14 28Z"
                    fill="url(#gemini_grad_exp)"
                  />
                  <defs>
                    <linearGradient
                      id="gemini_grad_exp"
                      x1="0"
                      y1="0"
                      x2="28"
                      y2="28"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#4285F4" />
                      <stop offset="35%" stopColor="#9B72CB" />
                      <stop offset="70%" stopColor="#D96570" />
                      <stop offset="100%" stopColor="#F2A60C" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="font-semibold text-sm tracking-wide text-white">
                  BYOK Harness
                </span>
              </div>
              <button
                id="expanded-collapse-btn"
                onClick={onToggle}
                className="p-1.5 hover:bg-[#282a2c] rounded-full text-[#8e918f] hover:text-white transition-colors"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Action Button: New Research */}
        {isExpanded ? (
          <button
            onClick={onNewChat}
            className="flex items-center space-x-3 w-full px-4 py-3 bg-[#1e1f20] hover:bg-[#282a2c] border border-transparent hover:border-[#3c4043] rounded-full text-white text-sm font-medium transition-all shadow-sm"
          >
            <Edit3 className="w-4 h-4 text-[#8e918f]" />
            <span>New Research</span>
          </button>
        ) : (
          <div className="relative group flex items-center justify-center">
            <button
              onClick={onNewChat}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#8e918f] hover:text-white hover:bg-[#282a2c] transition-colors"
              title="New Research"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <div className="absolute left-12 top-2 bg-[#e3e3e3] text-[#131314] text-xs font-medium px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              New Research
            </div>
          </div>
        )}

        {/* Nav Links */}
        <div className="space-y-1 pt-1">
          {/* Key Vault */}
          <div className="relative group">
            <button
              onClick={onOpenVault}
              className={`flex items-center ${
                isExpanded ? 'space-x-3 px-3 w-full' : 'justify-center w-10 mx-auto'
              } py-2 rounded-lg hover:bg-[#282a2c] text-[#8e918f] hover:text-white text-xs font-medium transition-colors`}
            >
              <Sliders className="w-4 h-4 flex-shrink-0 text-cyan-400" />
              {isExpanded && (
                <>
                  <span>Model Settings</span>
                  <span className="ml-auto text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    ACTIVE
                  </span>
                </>
              )}
            </button>
            {!isExpanded && (
              <div className="absolute left-12 top-1.5 bg-[#e3e3e3] text-[#131314] text-xs font-medium px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                Model Settings
              </div>
            )}
          </div>

          {/* Subagents Navigation Item */}
          {onOpenSubagents && (
            <div className="relative group">
              <button
                onClick={onOpenSubagents}
                className={`flex items-center ${
                  isExpanded ? 'space-x-3 px-3 w-full' : 'justify-center w-10 mx-auto'
                } py-2 rounded-lg hover:bg-[#282a2c] text-[#8e918f] hover:text-white text-xs font-medium transition-colors`}
              >
                <Bot className="w-4 h-4 flex-shrink-0 text-cyan-400" />
                {isExpanded && <span>Subagents</span>}
              </button>
              {!isExpanded && (
                <div className="absolute left-12 top-1.5 bg-[#e3e3e3] text-[#131314] text-xs font-medium px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Subagents
                </div>
              )}
            </div>
          )}

          {/* Skills Navigation Item */}
          {onOpenSkills && (
            <div className="relative group">
              <button
                onClick={onOpenSkills}
                className={`flex items-center ${
                  isExpanded ? 'space-x-3 px-3 w-full' : 'justify-center w-10 mx-auto'
                } py-2 rounded-lg hover:bg-[#282a2c] text-[#8e918f] hover:text-white text-xs font-medium transition-colors`}
              >
                <Wand2 className="w-4 h-4 flex-shrink-0 text-purple-400" />
                {isExpanded && <span>Skills</span>}
              </button>
              {!isExpanded && (
                <div className="absolute left-12 top-1.5 bg-[#e3e3e3] text-[#131314] text-xs font-medium px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Skills
                </div>
              )}
            </div>
          )}

          {/* Evidence Drawer */}
          <div className="relative group">
            <button
              onClick={onToggleEvidence}
              className={`flex items-center ${
                isExpanded ? 'space-x-3 px-3 w-full' : 'justify-center w-10 mx-auto'
              } py-2 rounded-lg hover:bg-[#282a2c] text-[#8e918f] hover:text-white text-xs font-medium transition-colors`}
            >
              <Layers className="w-4 h-4 flex-shrink-0" />
              {isExpanded && <span>Evidence & Claims</span>}
            </button>
            {!isExpanded && (
              <div className="absolute left-12 top-1.5 bg-[#e3e3e3] text-[#131314] text-xs font-medium px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                Evidence & Claims
              </div>
            )}
          </div>
        </div>

        {/* Recent History (Only visible when expanded) */}
        {isExpanded && (
          <div className="flex flex-col flex-1 overflow-hidden pt-2">
            <div className="flex items-center justify-between px-3 py-2 text-[11px] font-medium tracking-wider text-[#8e918f] uppercase border-t border-[#282a2c]">
              <span>Recent Research</span>
              <Search className="w-3.5 h-3.5 hover:text-white cursor-pointer" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5 text-xs">
              {runs.map((run) => {
                const isActive =
                  currentRunId === run.id ||
                  (Boolean(currentRunId) &&
                    currentRunId?.replace(/^run_/, '') === run.id.replace(/^run_/, ''));
                return (
                  <div
                    key={run.id}
                    onClick={() => onSelectRun(run)}
                    className={`px-3 py-2 rounded-lg cursor-pointer truncate transition-all text-xs flex items-center justify-between ${
                      isActive
                        ? 'bg-[#282a2c] text-white font-medium border-l-2 border-cyan-400'
                        : 'text-[#e3e3e3] hover:bg-[#1e1f20] hover:text-white'
                    }`}
                  >
                    <span className="truncate">{run.title}</span>
                  </div>
                );
              })}
              {runs.length === 0 && (
                <div className="p-3 text-center text-[#8e918f] text-xs">
                  No recent runs.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Profile Row */}
      <div className="p-3 border-t border-[#282a2c]">
        {isExpanded ? (
          <div
            onClick={onOpenVault}
            className="flex items-center justify-between p-2 rounded-xl hover:bg-[#282a2c] cursor-pointer transition-colors"
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-full bg-[#1a73e8] flex items-center justify-center font-semibold text-xs text-white">
                K
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-white">Local BYOK User</span>
                <span className="text-[10px] text-[#8e918f]">Host :20128 Active</span>
              </div>
            </div>
            <Settings className="w-4 h-4 text-[#8e918f] hover:text-white" />
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-3">
            <div className="relative group">
              <button
                onClick={onOpenVault}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#8e918f] hover:text-white hover:bg-[#282a2c] transition-colors"
              >
                <Settings className="w-4 h-4" />
              </button>
              <div className="absolute left-12 top-1.5 bg-[#e3e3e3] text-[#131314] text-xs font-medium px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                Settings
              </div>
            </div>
            <div className="w-7 h-7 rounded-full bg-[#1a73e8] flex items-center justify-center font-semibold text-xs text-white cursor-pointer">
              K
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
