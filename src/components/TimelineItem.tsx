import React from 'react';
import { motion } from 'motion/react';
import { Clock, FileText } from 'lucide-react';
import { cn } from '../lib/utils';

interface TimelineItemProps {
  item: any;
  idx: number;
  isActive: boolean;
  isPast: boolean;
  isCurrent: boolean;
  currentTimeStr: string;
  onClick: () => void;
  getDuration: (start: string, end: string) => string;
  theme: any;
  accentColor?: string;
}

export const TimelineItem = React.memo(({ 
  item, 
  idx, 
  isActive, 
  isPast, 
  isCurrent, 
  onClick, 
  getDuration,
  theme,
  accentColor = '#3b82f6'
}: TimelineItemProps) => {
  const isDark = ['dark', 'oled', 'monochrome-dark', 'neon-cyan'].includes(theme?.id);
  const colors = theme?.colors || { text: 'text-[#1f1f1f]', sub: 'text-[#444746]' };
  
  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(idx * 0.03, 1) }}
      className={cn(
        "relative px-4 py-4 rounded-none cursor-pointer transition-all duration-300 flex flex-col gap-1 border",
        isActive 
          ? (isDark ? "bg-white/10 border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.3)]" : "bg-white shadow-lg") 
          : cn(
              isDark ? "bg-[#1e1f20] border-white/5 hover:bg-[#2d2e30]" : "bg-white border-[#f1f3f4] hover:bg-[#f8f9fa] hover:border-[#dadce0]",
              colors.text
            ),
        isPast && !isActive ? "opacity-50 grayscale-[0.2]" : "opacity-100"
      )}
      style={isActive && !isDark ? { borderColor: accentColor + '20', boxShadow: `0 8px 16px ${accentColor}14` } : {}}
    >
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-2">
          {isActive ? (
             <div className="w-1.5 h-1.5 rounded-none shadow-[0_0_8px_rgba(0,0,0,0.2)]" style={{ backgroundColor: accentColor }} />
          ) : (
             <Clock className={cn("w-3 h-3", isDark ? "text-white/20" : "text-[#5d5f5e]")} />
          )}
          <span className={cn("text-[9px] font-black tracking-widest uppercase", isActive ? "" : "opacity-40")} style={isActive ? { color: accentColor } : {}}>
            {item.startTime} — {item.endTime}
          </span>
        </div>
      </div>
      <span className={cn("text-sm font-semibold leading-tight tracking-tight", isActive ? "" : colors.text)} style={isActive ? { color: accentColor } : {}}>
        {item.activity}
      </span>
      <div className={cn("flex items-center gap-1.5 mt-1 transition-opacity", isActive ? "opacity-80" : "opacity-30")}>
        <FileText className="w-2.5 h-2.5" />
        <span className="text-[8px] font-bold uppercase tracking-wider truncate max-w-[170px]">{item.sourceFile}</span>
      </div>
    </motion.div>
  );
});

TimelineItem.displayName = 'TimelineItem';
