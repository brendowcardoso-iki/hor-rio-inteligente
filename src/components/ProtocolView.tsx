import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, FileText, RefreshCw, Target, Plus, Trash2, CheckCircle2, ChevronRight, ListTodo, Edit3, X, Check } from 'lucide-react';
import { cn, getContrastColor } from '../lib/utils';
import { CATEGORY_MAP } from '../constants';

interface Step {
  title: string;
  description?: string;
  completed?: boolean;
}

interface ActivityCustomization {
  objective?: string;
  steps?: Step[];
}

interface ProtocolViewProps {
  loading: boolean;
  syncPercentage?: number | null;
  schedule: any[];
  displayedActivity: any;
  isCurrentActivity: boolean;
  selectedActivityOverride: any;
  onResetOverride: () => void;
  getDuration: (start: string, end: string) => string;
  currentTimeStr: string;
  theme: any;
  accentColor?: string;
  customizations: Record<string, ActivityCustomization>;
  onUpdateCustomization: (data: ActivityCustomization) => void;
  onSelectActivity?: (activity: any) => void;
  onUpdateActivityTime?: (activity: any, newStartTime: string, newEndTime: string) => void;
  onTriggerFeedback?: (activity: any) => void;
}

export const ProtocolView = React.memo(({
  loading,
  syncPercentage = null,
  schedule,
  displayedActivity,
  isCurrentActivity,
  selectedActivityOverride,
  onResetOverride,
  getDuration,
  currentTimeStr,
  theme,
  accentColor = '#1e5fe6',
  customizations,
  onUpdateCustomization,
  onSelectActivity,
  onUpdateActivityTime,
  onTriggerFeedback
}: ProtocolViewProps) => {
  const isDark = theme?.id === 'dark' || theme?.id === 'oled';
  
  // If the active panel is white (which is when isDark is false), we MUST use dark text colors.
  // This is especially important for 'monochrome-dark' (Escuro P&B), where the general theme colors are white (text-white)
  // but this main area is actually white, requiring dark text!
  const colors = isDark 
    ? (theme?.colors || { text: 'text-white', sub: 'text-[#cccccc]' })
    : { text: 'text-[#1f1f1f]', sub: 'text-[#5f6368]' };
  const categoryInfo = CATEGORY_MAP[displayedActivity?.category || 'Outros'] || CATEGORY_MAP['Outros'];
  
  const [showSteps, setShowSteps] = React.useState(false);
  const [editingObjective, setEditingObjective] = React.useState(false);
  const [isAddingStep, setIsAddingStep] = React.useState(false);
  const [newStep, setNewStep] = React.useState('');
  const [newStepDesc, setNewStepDesc] = React.useState('');
  const [objectiveInput, setObjectiveInput] = React.useState('');
  const [isEditingTime, setIsEditingTime] = React.useState(false);
  const [newStartTime, setNewStartTime] = React.useState('');
  const [newEndTime, setNewEndTime] = React.useState('');

  const activityKey = React.useMemo(() => {
    if (!displayedActivity) return '';
    return `${displayedActivity.activity}-${displayedActivity.startTime}-${displayedActivity.endTime}`;
  }, [displayedActivity]);

  const currentCustomization = React.useMemo(() => {
    const raw = customizations[activityKey] || { objective: '', steps: [] };
    // Migration: normalize string[] to Step[]
    const normalizedSteps = (raw.steps || []).map((s: any) => 
      typeof s === 'string' ? { title: s, description: '' } : s
    );
    return { ...raw, steps: normalizedSteps } as ActivityCustomization;
  }, [customizations, activityKey]);

  React.useEffect(() => {
    setObjectiveInput(currentCustomization.objective || '');
  }, [activityKey, currentCustomization.objective]);

  React.useEffect(() => {
    if (displayedActivity) {
      setNewStartTime(displayedActivity.startTime || '');
      setNewEndTime(displayedActivity.endTime || '');
      setIsEditingTime(false);
    }
  }, [displayedActivity]);

  const handleSaveTime = () => {
    if (!newStartTime || !newEndTime) return;
    if (onUpdateActivityTime) {
      onUpdateActivityTime(displayedActivity, newStartTime, newEndTime);
    }
    setIsEditingTime(false);
  };

  const handleAddStep = () => {
    if (!newStep.trim()) return;
    const steps = [...(currentCustomization.steps || []), { title: newStep.trim(), description: newStepDesc.trim() }];
    onUpdateCustomization({ ...currentCustomization, steps });
    setNewStep('');
    setNewStepDesc('');
  };

  const handleRemoveStep = (index: number) => {
    const steps = (currentCustomization.steps || []).filter((_, i) => i !== index);
    onUpdateCustomization({ ...currentCustomization, steps });
  };

  const handleSaveObjective = () => {
    onUpdateCustomization({ ...currentCustomization, objective: objectiveInput });
    setEditingObjective(false);
  };

  const handleToggleStep = (index: number) => {
    const steps = (currentCustomization.steps || []).map((s, i) => 
      i === index ? { ...s, completed: !s.completed } : s
    );
    onUpdateCustomization({ ...currentCustomization, steps });
  };

  const progress = React.useMemo(() => {
    if (!isCurrentActivity || !displayedActivity) return 0;
    try {
      const [sh, sm] = displayedActivity.startTime.split(':').map(Number);
      const [eh, em] = displayedActivity.endTime.split(':').map(Number);
      const [ch, cm] = currentTimeStr.split(':').map(Number);
      
      const startTotal = sh * 60 + sm;
      const endTotal = eh * 60 + em;
      const currentTotal = ch * 60 + cm;
      
      let duration = endTotal - startTotal;
      if (duration < 0) duration += 24 * 60;
      
      let elapsed = currentTotal - startTotal;
      if (elapsed < 0) elapsed += 24 * 60;
      
      return Math.min(100, Math.max(0, (elapsed / duration) * 100));
    } catch {
      return 0;
    }
  }, [isCurrentActivity, displayedActivity, currentTimeStr]);

  if (loading && schedule.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        className={cn("h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto p-8", colors.text)}
      >
        <div className="relative w-28 h-28 flex items-center justify-center mb-8">
          {/* Ambient Glow Pulse */}
          <motion.div
            className="absolute inset-0 rounded-full blur-xl opacity-20"
            style={{ backgroundColor: accentColor }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.35, 0.15] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          
          {/* Inner Glowing Track Ring */}
          <div 
            className="absolute inset-2 rounded-full border border-current opacity-10" 
            style={{ color: accentColor }}
          />

          {/* Slow Clockwise Dashed Outer Ring */}
          <motion.div
            className="absolute inset-0 rounded-full border border-dashed text-current opacity-40"
            style={{ borderColor: accentColor }}
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          />

          {/* Fast Counter-Clockwise Solid Primary Accent Ring */}
          <motion.div
            className="absolute inset-1 rounded-full border-2 border-transparent"
            style={{ borderTopColor: accentColor, borderRightColor: `${accentColor}40` }}
            animate={{ rotate: -360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          />

          {/* Core Technical Monospace Percentage Display */}
          <div className="absolute flex flex-col items-center justify-center">
            <span className={cn("text-xl font-bold font-mono tracking-tighter", colors.text)}>
              {syncPercentage !== null ? `${Math.min(100, Math.max(0, syncPercentage))}%` : '0%'}
            </span>
          </div>
        </div>

        <h3 className={cn("text-[22px] font-bold tracking-tight mb-2", colors.text)}>
          Sincronizando agendas
        </h3>
        <p className={cn("text-xs font-semibold uppercase tracking-widest", isDark ? "text-white/40" : "text-[#5f6368]")}>
          Aguarde
        </p>
      </motion.div>
    );
  }

  if (!displayedActivity) {
    return (
      <div className={cn("h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto", colors.text)}>
        <div className={cn("w-20 h-20 rounded-none flex items-center justify-center mb-6 border transition-colors", isDark ? "bg-white/5 border-white/10" : "bg-white border-[#f1f3f4]")}>
          <Clock className={cn("w-8 h-8", isDark ? "text-white/20" : "text-[#dadce0]")} />
        </div>
        <h3 className="text-2xl font-medium">Olá Brendow</h3>
        <p className="text-sm mt-2 font-medium opacity-60">Selecione uma atividade para começar.</p>
      </div>
    );
  }

  return (
    <motion.div 
      key={displayedActivity.activity + displayedActivity.startTime}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn("max-w-3xl mx-auto py-12 px-6", colors.text)}
    >
      <div className="flex items-center gap-3 mb-10">
          <span className={cn(
            "px-3 py-1 rounded-none text-[10px] font-bold uppercase tracking-wider",
            isCurrentActivity 
              ? "" 
              : (isDark ? "bg-white/5 text-white/40" : "bg-black/5 text-[#5f6368]")
          )}
          style={isCurrentActivity ? { backgroundColor: `${accentColor}1A`, color: accentColor } : {}}>
          {isCurrentActivity ? 'Agora' : 'Períodos selecionados'}
        </span>

      </div>

      <header className="mb-12 space-y-4">
        <h1 className={cn("text-4xl lg:text-5xl font-medium tracking-tight leading-[1.1]", colors.text)}>
          {displayedActivity.activity}
        </h1>
        
        <div className="flex flex-wrap items-center gap-2">
          {isEditingTime ? (
            <div className={cn("flex items-center gap-2 px-3 py-1 rounded-none border", isDark ? "bg-[#1e1f20] border-white/10" : "bg-white border-[#dadce0]")}>
              <span className="text-[10px] font-bold uppercase text-zinc-400">Início:</span>
              <input
                type="time"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                className={cn("bg-transparent border-0 p-0 text-sm font-mono font-bold focus:outline-none focus:ring-0 w-16", isDark ? "text-white" : "text-black")}
              />
              <span className="text-xs opacity-50 px-1">—</span>
              <span className="text-[10px] font-bold uppercase text-zinc-400">Fim:</span>
              <input
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                className={cn("bg-transparent border-0 p-0 text-sm font-mono font-bold focus:outline-none focus:ring-0 w-16", isDark ? "text-white" : "text-black")}
              />
              <button
                onClick={handleSaveTime}
                className="p-1 text-xs font-bold rounded-none hover:bg-black/5 dark:hover:bg-white/5 ml-1 transition-colors"
                style={{ color: accentColor }}
                title="Salvar"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setNewStartTime(displayedActivity.startTime || '');
                  setNewEndTime(displayedActivity.endTime || '');
                  setIsEditingTime(false);
                }}
                className="p-1 text-xs font-bold rounded-none hover:bg-black/5 dark:hover:bg-white/5 text-rose-500 transition-colors"
                title="Cancelar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setNewStartTime(displayedActivity.startTime || '');
                setNewEndTime(displayedActivity.endTime || '');
                setIsEditingTime(true);
              }}
              className={cn("flex items-center gap-2 px-3 py-1.5 rounded-none border transition-all hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer group", isDark ? "bg-white/5 border-white/5 hover:border-white/10" : "bg-white border-[#dadce0] hover:border-[#b5b7b9]")}
              title="Clique para alterar o horário"
            >
              <Clock className="w-3.5 h-3.5" style={{ color: accentColor }} />
              <span className={cn("text-xs md:text-sm font-semibold tracking-wide", colors.text)}>
                {displayedActivity.startTime} — {displayedActivity.endTime}
              </span>
              <Edit3 className="w-3 h-3 opacity-30 group-hover:opacity-100 ml-1 transition-opacity text-zinc-400" />
            </button>
          )}
          <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-none border", isDark ? "bg-white/5 border-white/5" : "bg-white border-[#dadce0]")}>
            <span className={cn("text-xs font-bold opacity-60", colors.text)}>
              {getDuration(displayedActivity.startTime, displayedActivity.endTime)}
            </span>
          </div>

          {onTriggerFeedback && (
            <button
              onClick={() => onTriggerFeedback(displayedActivity)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-none border text-xs font-bold transition-all cursor-pointer", 
                isDark ? "bg-white/5 border-white/5 hover:bg-white/10" : "bg-white border-[#dadce0] hover:bg-black/5"
              )}
              style={{ color: accentColor }}
              title="Clique para dar feedback sobre este período"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Dar Feedback</span>
            </button>
          )}
        </div>

        {isCurrentActivity && progress > 0 && (
          <div className="pt-4 space-y-2">
            <div className={cn("h-1.5 w-full rounded-none overflow-hidden", isDark ? "bg-white/5" : "bg-[#f1f3f4]")}>
              <motion.div 
                className="h-full rounded-none" 
                style={{ backgroundColor: accentColor }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <p className={cn("text-[9px] font-bold uppercase tracking-wider", isDark ? "text-white/40" : "text-[#5f6368]")}>
              {Math.round(progress)}% do período concluído
            </p>
          </div>
        )}
      </header>

      <section className="space-y-16">
        {/* Description Section - Always on Top */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
             <h3 className={cn("text-[11px] font-bold uppercase tracking-[0.2em]", isDark ? "text-white/40" : "text-[#5f6368]")}>Diretriz da Atividade (AI)</h3>
          </div>

          <div className={cn(
            "prose prose-sm max-w-none leading-relaxed",
            isDark ? "prose-invert text-[#e3e3e3]" : "text-[#1f1f1f]"
          )}>
            {displayedActivity.instructions || displayedActivity.instruction ? (
              <div 
                className={cn(
                  "p-8 rounded-none border transition-all shadow-sm",
                  isDark ? "bg-white/2 border-white/5" : "border-opacity-10"
                )}
                style={!isDark ? { backgroundColor: `${accentColor}0D`, borderColor: `${accentColor}1A` } : {}}
              >
                <p className="text-lg font-medium leading-relaxed">
                  {displayedActivity.instructions || displayedActivity.instruction}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4 opacity-30 italic p-8 rounded-none border border-dashed text-center justify-center">
                <p>Nenhuma descrição adicional disponível.</p>
              </div>
            )}
          </div>
        </div>

        <div className="h-[1px] w-full bg-current opacity-5" />

        {/* Objectives and Steps Area */}
        <div className="space-y-12">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-none flex items-center justify-center" style={{ backgroundColor: `${accentColor}1A` }}>
                  <Target className="w-4 h-4" style={{ color: accentColor }} />
                </div>
                <h3 className={cn("text-[11px] font-bold uppercase tracking-[0.2em]", isDark ? "text-white/40" : "text-[#5f6368]")}>Objetivo Estratégico</h3>
              </div>
              {!editingObjective ? (
                <button onClick={() => setEditingObjective(true)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-none transition-colors opacity-40 hover:opacity-100">
                  <Edit3 className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button onClick={handleSaveObjective} className="p-2 hover:bg-opacity-10 rounded-none transition-colors" style={{ color: accentColor }}>
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditingObjective(false); setObjectiveInput(currentCustomization.objective || ''); }} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-none transition-colors opacity-40">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {editingObjective ? (
              <input
                autoFocus
                type="text"
                value={objectiveInput}
                onChange={(e) => setObjectiveInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveObjective()}
                placeholder="Defina o objetivo principal..."
                className={cn(
                  "w-full bg-transparent border-b-2 py-4 text-2xl font-medium focus:outline-none",
                  colors.text
                )}
                style={{ borderBottomColor: accentColor }}
              />
            ) : (
              <p className={cn(
                "text-2xl font-medium leading-tight",
                objectiveInput ? colors.text : "opacity-30 italic"
              )}>
                {objectiveInput || "Defina um objetivo estratégico para este período."}
              </p>
            )}
          </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-none flex items-center justify-center" style={{ backgroundColor: `${accentColor}1A` }}>
                    <CheckCircle2 className="w-4 h-4" style={{ color: accentColor }} />
                  </div>
                  <h3 className={cn("text-[11px] font-bold uppercase tracking-[0.2em]", isDark ? "text-white/40" : "text-[#5f6368]")}>Passos da Execução</h3>
                </div>
                <button 
                  onClick={() => setIsAddingStep(!isAddingStep)}
                  className={cn(
                    "p-2 rounded-none transition-all",
                    isAddingStep 
                      ? "bg-red-500/10 text-red-500" 
                      : (isDark ? "bg-white/5 text-white/40 hover:text-white" : "bg-black/5 text-[#3c4043] font-semibold hover:text-black")
                  )}
                >
                  {isAddingStep ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>

              <div className="space-y-3">
                {currentCustomization.steps?.map((step, idx) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={idx} 
                    className={cn(
                      "flex items-start justify-between p-4 rounded-none group transition-all",
                      isDark ? "bg-white/5 hover:bg-white/8" : "bg-black/2 hover:bg-black/5",
                      step.completed && "opacity-60"
                    )}
                  >
                    <div className="flex items-start gap-4 flex-1 mr-2">
                       <button 
                        onClick={() => handleToggleStep(idx)}
                        className={cn(
                          "w-6 h-6 rounded-none flex items-center justify-center shrink-0 mt-0.5 transition-all text-white border",
                          step.completed ? "border-transparent" : (isDark ? "border-white/20 bg-transparent" : "border-black/20 bg-transparent")
                        )}
                        style={{ backgroundColor: step.completed ? accentColor : undefined }}
                      >
                        {step.completed && <Check className="w-4 h-4" style={{ color: getContrastColor(accentColor) }} />}
                      </button>
                      <div className="space-y-1">
                        <span className={cn(
                          "text-sm font-bold transition-all", 
                          colors.text,
                          step.completed && "line-through opacity-50"
                        )}>
                          {step.title}
                        </span>
                        {step.description && (
                          <p className={cn("text-xs leading-relaxed", isDark ? "text-white/60" : "text-[#475569]")}>{step.description}</p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleRemoveStep(idx)} className="p-2 opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-500/10 rounded-none transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}

                <AnimatePresence>
                  {isAddingStep && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div 
                        className={cn(
                          "flex flex-col gap-3 p-4 rounded-none border border-dashed transition-all mt-4",
                          isDark ? "border-white/10 focus-within:border-white/40" : "border-black/10"
                        )}
                        style={{ borderColor: !isDark && accentColor ? `${accentColor}4D` : undefined }}
                      >
                        <input
                          autoFocus
                          type="text"
                          value={newStep}
                          onChange={(e) => setNewStep(e.target.value)}
                          placeholder="Título do passo..."
                          className={cn(
                            "w-full bg-transparent py-1 text-sm font-bold focus:outline-none",
                            colors.text
                          )}
                        />
                        <textarea
                          rows={2}
                          value={newStepDesc}
                          onChange={(e) => setNewStepDesc(e.target.value)}
                          placeholder="Descrição opcional..."
                          className={cn(
                            "w-full bg-transparent py-1 text-xs font-medium focus:outline-none resize-none",
                            isDark ? "text-white/60" : "text-[#475569]"
                          )}
                        />
                        <div className="flex justify-end">
                          <button 
                            onClick={handleAddStep}
                            disabled={!newStep.trim()}
                            className={cn(
                              "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-none transition-all shadow-sm cursor-pointer",
                              !newStep.trim() 
                                ? "bg-neutral-150 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 border border-neutral-200 dark:border-neutral-700 opacity-60 pointer-events-none"
                                : "hover:scale-[1.02] active:scale-95"
                            )}
                            style={newStep.trim() ? { 
                              backgroundColor: accentColor, 
                              color: getContrastColor(accentColor) 
                            } : {}}
                          >
                            <Plus className="w-4 h-4" />
                            <span>Confirmar Passo</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
        </div>
      </section>

      <footer className={cn("mt-20 pt-8 border-t flex items-center justify-between", isDark ? "border-white/5" : "border-black/5")}>
        <div className="flex items-center gap-2 opacity-30">
          <FileText className="w-4 h-4" />
          <span className="text-[10px] font-medium truncate max-w-[200px]">{displayedActivity.sourceFile}</span>
        </div>
      </footer>
    </motion.div>
  );
});

ProtocolView.displayName = 'ProtocolView';
