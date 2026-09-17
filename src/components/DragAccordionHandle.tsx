import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';

interface DragAccordionHandleProps {
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  isDark: boolean;
  accentColor: string;
}

export const DragAccordionHandle: React.FC<DragAccordionHandleProps> = ({
  isOpen,
  onToggle,
  isDark,
  accentColor
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startY = useRef(0);
  const isClick = useRef(true);
  const handleRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only drag with left mouse click or touch
    setIsDragging(true);
    startY.current = e.clientY;
    setDragOffset(0);
    isClick.current = true;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      const currentY = e.clientY;
      const diff = currentY - startY.current;

      if (Math.abs(diff) > 4) {
        isClick.current = false;
      }

      // Drag constraints:
      // If closed (not open): resisting drag up
      // If open: resisting drag down
      if (!isOpen && diff < 0) {
        setDragOffset(diff * 0.12);
      } else if (isOpen && diff > 0) {
        setDragOffset(diff * 0.12);
      } else {
        setDragOffset(Math.max(-80, Math.min(80, diff)));
      }
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      setIsDragging(false);

      if (isClick.current) {
        // Toggle on simple click/tap
        onToggle(!isOpen);
      } else {
        // Dynamic drag gesture thresholds:
        // Dragging down (diff > 25) when closed -> open
        // Dragging up (diff < -25) when open -> close
        const finalDiff = e.clientY - startY.current;
        if (!isOpen && finalDiff > 25) {
          onToggle(true);
        } else if (isOpen && finalDiff < -25) {
          onToggle(false);
        }
      }

      setDragOffset(0);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [isDragging, isOpen, onToggle]);

  return (
    <div className="w-full flex flex-col items-center py-3 select-none">
      {/* Three Dots Interactive Drag/Click Handle */}
      <div 
        ref={handleRef}
        onPointerDown={handlePointerDown}
        className={cn(
          "flex items-center justify-center relative cursor-row-resize py-2 px-10 touch-none group",
          isDragging ? "scale-95" : "hover:scale-105"
        )}
        style={{
          transform: `translateY(${dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.30s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}
        title={isOpen ? "Arraste para cima ou clique para ocultar" : "Arraste para baixo ou clique para expandir"}
      >
        {/* Visual 3 Dots - minimal and sleek using the dynamic accentColor blue */}
        <div className="flex gap-1.5 items-center justify-center p-2 rounded-full transition-all duration-300 bg-transparent">
          <span 
            className="w-2 h-2 rounded-full transition-all duration-300 shadow-[0_0_4px_rgba(59,130,246,0.15)] group-hover:scale-110"
            style={{ 
              backgroundColor: isDragging 
                ? accentColor 
                : `${accentColor}85`, // Beautiful 52% opacity blue
              transform: isDragging ? 'scale(1.25)' : 'none'
            }} 
          />
          <span 
            className="w-2.5 h-2.5 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.3)] group-hover:scale-115"
            style={{ 
              backgroundColor: isDragging 
                ? accentColor 
                : accentColor, // Full solid blue
              transform: isDragging ? 'scale(1.4)' : 'none'
            }} 
          />
          <span 
            className="w-2 h-2 rounded-full transition-all duration-300 shadow-[0_0_4px_rgba(59,130,246,0.15)] group-hover:scale-110"
            style={{ 
              backgroundColor: isDragging 
                ? accentColor 
                : `${accentColor}85`, // Beautiful 52% opacity blue
              transform: isDragging ? 'scale(1.25)' : 'none'
            }} 
          />
        </div>
      </div>
    </div>
  );
};
