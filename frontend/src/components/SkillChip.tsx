import React from 'react';
import { Wand2 } from 'lucide-react';
import type { SkillEvent } from '../types';

interface SkillChipProps {
  event: SkillEvent;
  onClick?: () => void;
}

export const SkillChip: React.FC<SkillChipProps> = ({ event, onClick }) => {
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
      <Wand2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
      <span className="font-bold text-[#c4c7c5]">Skill</span>
      <span className="text-[#e3e3e3] font-medium">{event.name}</span>
      {event.detail && (
        <span className="text-[#8e918f] text-[11px] truncate">{event.detail}</span>
      )}
      {onClick && (
        <span className="ml-auto text-[10px] text-zinc-500 group-hover:text-purple-300 font-mono pl-2">
          Inspect ↗
        </span>
      )}
    </div>
  );
};
