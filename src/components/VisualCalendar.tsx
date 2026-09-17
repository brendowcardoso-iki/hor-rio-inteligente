import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Navigation2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { CATEGORY_MAP } from '../constants';

interface ScheduleItem {
  startTime: string;
  endTime: string;
  activity: string;
  category?: string;
  sourceFile?: string;
  id?: string;
}

interface VisualCalendarProps {
  schedule: ScheduleItem[];
  onSelectActivity: (item: ScheduleItem) => void;
  displayedActivity: ScheduleItem | null;
  isDark: boolean;
  currentTimeStr: string;
  accentColor?: string;
}

const HOUR_HEIGHT = 100;

export const VisualCalendar: React.FC<VisualCalendarProps> = ({
  schedule,
  onSelectActivity,
  displayedActivity,
  isDark,
  currentTimeStr,
  accentColor = '#3b82f6'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showNowBtn, setShowNowBtn] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const timeToMinutes = (time: string) => {
    if (!time || typeof time !== 'string') return 0;
    const parts = time.split(':');
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    return Math.max(0, Math.min(1440, h * 60 + m));
  };

  const scrollToNow = () => {
    if (containerRef.current) {
      const currentMinutes = timeToMinutes(currentTimeStr);
      const scrollPos = (currentMinutes / 60) * HOUR_HEIGHT - 200;
      containerRef.current.scrollTo({
        top: Math.max(0, scrollPos),
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToNow();
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentMinutes = timeToMinutes(currentTimeStr);
    const nowPos = (currentMinutes / 60) * HOUR_HEIGHT;
    const scrollPos = e.currentTarget.scrollTop;
    setShowNowBtn(Math.abs(scrollPos - (nowPos - 200)) > 400);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const sortedSchedule = [...schedule].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-white">
      {/* Legend / Menu - Premium selection toolbar */}
      <div className="px-6 py-4 border-b border-zinc-100 flex flex-col gap-2 shrink-0 bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 mr-2 select-none">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-rose-500 opacity-75" />
                <span className="relative inline-flex rounded-none h-1.5 w-1.5 bg-rose-500" />
              </span>
              Destaque de categoria:
            </span>
            <div className="flex items-center gap-2.5">
              {Object.entries(CATEGORY_MAP).map(([cat, info]) => {
                const isSelected = selectedCategory === cat;
                const someCategorySelected = selectedCategory !== null;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                    title={`Exibir apenas ${info.label}`}
                    className={cn(
                      "w-7 h-7 rounded-none flex items-center justify-center transition-all duration-300 border-2 cursor-pointer active:scale-95 relative select-none touch-none",
                      isSelected 
                        ? "shadow-sm scale-110"
                        : "bg-transparent border-transparent hover:scale-110",
                      someCategorySelected && !isSelected ? "opacity-30 hover:opacity-85 grayscale-[40%] scale-90" : "opacity-100"
                    )}
                    style={{ 
                      borderColor: isSelected ? info.color : 'transparent',
                      backgroundColor: isSelected ? `${info.color}1E` : 'transparent'
                    }}
                  >
                    <div 
                      className={cn(
                        "w-3.5 h-3.5 rounded-none transition-all duration-300 shadow-sm",
                        isSelected ? "scale-110" : "hover:scale-110"
                      )} 
                      style={{ backgroundColor: info.color }} 
                    />
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Active selection tag container */}
          <AnimatePresence mode="wait">
            {selectedCategory ? (
              <motion.div
                key={selectedCategory}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="px-3.5 py-1.5 rounded-none text-xs font-bold flex items-center gap-2.5 border self-start md:self-auto shadow-sm bg-zinc-50 border-zinc-200/60"
                style={{ color: CATEGORY_MAP[selectedCategory]?.color }}
              >
                <span className="w-2.5 h-2.5 rounded-none" style={{ backgroundColor: CATEGORY_MAP[selectedCategory]?.color }} />
                <span>Exibindo: <strong>{CATEGORY_MAP[selectedCategory]?.label}</strong> (Outras em cinza)</span>
                <button 
                  onClick={() => setSelectedCategory(null)}
                  className="ml-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-none transition-all cursor-pointer bg-zinc-200/50 hover:bg-zinc-200/85 text-zinc-700 hover:text-zinc-900 border border-zinc-300/30"
                >
                  Limpar
                </button>
              </motion.div>
            ) : (
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] uppercase font-bold tracking-widest text-zinc-400"
              >
                Clique em uma cor para destacar a categoria
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Grid Canvas on White Background */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar relative px-0 transition-colors scroll-smooth bg-white"
      >
        <div className="relative" style={{ height: 24 * HOUR_HEIGHT + 100 }}>
          {/* Grid Lines */}
          {hours.map(hour => (
            <div 
              key={hour}
              className="absolute left-0 right-0 flex items-start"
              style={{ top: hour * HOUR_HEIGHT }}
            >
              <div className="w-16 flex flex-col items-center shrink-0 -mt-2 bg-transparent">
                <span className="text-[10px] font-semibold tabular-nums text-zinc-400 select-none">
                  {String(hour).padStart(2, '0')}:00
                </span>
              </div>
              <div className="flex-1 h-[1px] bg-zinc-100" />
            </div>
          ))}

          {/* Current Time Indicator (Pill + Line) */}
          {(() => {
            const minutes = timeToMinutes(currentTimeStr);
            const top = (minutes / 60) * HOUR_HEIGHT;
            return (
              <div 
                className="absolute left-0 right-0 z-40 flex items-center pointer-events-none animate-pulse-slow"
                style={{ top }}
              >
                <div className="w-16 flex justify-center shrink-0 pr-0">
                  <div className="bg-rose-500 text-white text-[9px] font-extrabold px-2 py-0.5 rounded shadow-lg z-50 tabular-nums select-none flex items-center gap-1 border border-rose-400/20 tracking-wider">
                    <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                    {currentTimeStr}
                  </div>
                </div>
                <div className="flex-1 h-[1.5px] bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)] bg-opacity-95" />
              </div>
            );
          })()}

          {/* Activity Rectangles Container */}
          <div className="absolute left-16 right-4 top-0 bottom-0 pointer-events-none">
            {sortedSchedule.map((item, idx) => {
              const startMin = timeToMinutes(item.startTime);
              const endMin = timeToMinutes(item.endTime);
              const duration = Math.max(endMin - startMin, 15);
              const top = (startMin / 60) * HOUR_HEIGHT;
              const height = (duration / 60) * HOUR_HEIGHT;
              
              const isActive = item === displayedActivity;
              const categoryInfo = CATEGORY_MAP[item.category || 'Outros'] || CATEGORY_MAP['Outros'];
              
              const isOtherGray = selectedCategory !== null && item.category !== selectedCategory;
              const catColor = categoryInfo.color;

              // Design values calculated for Swiss White look with high-constrast ratios
              const cardBg = isOtherGray 
                ? 'linear-gradient(135deg, #f4f4f5cc, #fafafacc)' 
                : `linear-gradient(135deg, ${catColor}14, ${catColor}05)`;
              
              const cardBorder = isOtherGray 
                ? '#e4e4e7' 
                : `${catColor}3b`;

              const stripColor = isOtherGray 
                ? '#a1a1aa' 
                : catColor;

              const titleTextColor = isOtherGray 
                ? '#71717a' 
                : '#18181b';

              const categoryTextColor = isOtherGray 
                ? '#a1a1aa' 
                : catColor;

              const timeTextColor = isOtherGray 
                ? '#a1a1aa' 
                : '#52525b';

              // Add spacing gaps so period rectangles never touch each other
              const gapY = 3.5;
              const visualTop = top + gapY;
              const visualHeight = Math.max(height - (gapY * 2), 26);

              return (
                <motion.div
                  key={`${item.startTime}-${idx}`}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectActivity(item);
                  }}
                  className={cn(
                    "absolute pointer-events-auto cursor-pointer transition-all duration-300 overflow-hidden flex flex-col group rounded-none select-none border-l-[5px]",
                    isActive 
                      ? "z-20 scale-[1.012] shadow-md" 
                      : "z-10 hover:scale-[1.004] hover:shadow-sm",
                    isOtherGray ? "opacity-50 hover:opacity-100" : "opacity-100"
                  )}
                  style={{ 
                    top: visualTop, 
                    height: visualHeight,
                    left: 6,
                    right: 6,
                    background: cardBg,
                    borderColor: cardBorder,
                    borderWidth: '1px',
                    borderLeftWidth: '5px',
                    borderStyle: 'solid',
                    borderLeftColor: stripColor,
                    boxShadow: isActive 
                      ? `0 12px 28px -4px ${catColor}24, inset 0 1px 0 0 rgba(255,255,255,0.7)` 
                      : `0 3px 8px -2px rgba(0,0,0,0.02), inset 0 1px 0 0 rgba(255,255,255,0.5)`,
                  }}
                >
                  <div className="pl-4 pr-4 py-2 h-full flex flex-col justify-between">
                    <div className="flex flex-col gap-0.5">
                      <p 
                        className="text-[12.5px] font-bold leading-snug tracking-tight truncate transition-colors duration-200"
                        style={{ color: titleTextColor }}
                      >
                        {item.activity}
                      </p>
                      <p 
                        className="text-[9px] font-bold font-mono tracking-wider uppercase transition-colors duration-200" 
                        style={{ color: categoryTextColor }}
                      >
                        {item.category || 'Geral'}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span 
                        className="text-[10px] font-semibold font-mono tracking-tight tabular-nums transition-colors duration-200"
                        style={{ color: timeTextColor }}
                      >
                        {item.startTime} — {item.endTime}
                      </span>
                      {item.sourceFile && (
                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1.5 bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-200/40">
                          <FileText className="w-2.5 h-2.5" />
                          Doc
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showNowBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToNow}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[60] bg-rose-500 hover:bg-rose-600 active:scale-95 text-white px-5 py-2.5 rounded-none shadow-2xl flex items-center gap-2 text-xs font-extrabold tracking-wider uppercase transition-all duration-200 border border-rose-400/20"
          >
            <Navigation2 className="w-4 h-4 rotate-45" />
            VAI PARA O AGORA
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
