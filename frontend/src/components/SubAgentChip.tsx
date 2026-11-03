import React from 'react';
import { Bot } from 'lucide-react';
import type { SubAgentEvent } from '../types';

interface SubAgentChipProps {
  event: SubAgentEvent;
  onClick?: () => void;
}

export const SubAgentChip: React.FC<SubAgentChipProps> = ({ event, onClick }) => {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      className={`flex items-center space-x-2 text-xs py-1.5 px-3 rounded-lg bg-[#1e1f20]/70 border border-[#282a2c] font-mono tracking-tight transition-all ${
        onClick
          ? 'cursor-pointer hover:border-[#a8c7fa] hover:bg-[#282a2c] group'
          : 'hover:border-[#3c4043]'
      }`}
    >
      <Bot className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
      <span className="font-bold text-[#c4c7c5]">SubAgent</span>
      <span className="text-[#a8c7fa] font-medium">{event.name}</span>
      <span className="text-[#8e918f]">·</span>
      <span className="text-[#8e918f] truncate">{event.action}</span>
      {onClick && (
        <span className="ml-auto text-[10px] text-zinc-500 group-hover:text-cyan-300 font-mono pl-2">
          Inspect ↗
        </span>
      )}
    </div>
  );
};
