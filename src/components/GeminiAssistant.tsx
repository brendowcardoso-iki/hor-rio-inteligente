import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Send, BrainCircuit, RefreshCw, Trash2, HelpCircle } from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from '../lib/utils';

interface GeminiAssistantProps {
  schedule: any[];
  currentActivities: any[];
  displayedActivity: any | null;
  connectedAgendas: any[];
  currentTimeStr: string;
  theme: string;
  accentColor: string;
  isDark: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

const SUGGESTED_PROMPTS = [
  { text: 'O que devo fazer agora? ⏰', prompt: 'O que devo fazer agora no meu cronograma atual?' },
  { text: 'Resumo da rotina 📝', prompt: 'Faça um resumo analítico e profissional da minha rotina hoje, agrupando por categorias.' },
  { text: 'Intervalos Livres 📂', prompt: 'Quais são os principais intervalos livres do meu cronograma hoje?' },
  { text: 'Dicas de alta performance 🔥', prompt: 'Dê-me 3 dicas personalizadas para melhorar minha performance hoje de acordo com esta agenda.' }
];

export const GeminiAssistant = ({
  schedule,
  currentActivities,
  displayedActivity,
  connectedAgendas,
  currentTimeStr,
  theme,
  accentColor,
  isDark,
}: GeminiAssistantProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('gemini_assistant_chat_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
      }
    } catch (e) {
      console.error('Error recovering Gemini chat history:', e);
    }
    return [
      {
        id: 'welcome',
        role: 'assistant',
        text: 'Olá! Sou seu **Co-piloto de Rotinas & Protocolos**. Tenho acesso em tempo real a todas as suas agendas conectadas, cronogramas ativos e ao que você está fazendo agora.\n\nComo posso ajudar na sua performance militar ou científica hoje? ⚡',
        timestamp: new Date()
      }
    ];
  });
  
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Synchronize with LocalStorage
  useEffect(() => {
    localStorage.setItem('gemini_assistant_chat_v1', JSON.stringify(messages));
  }, [messages]);

  // Autoscroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Small timeout to allow transition to finish
      setTimeout(scrollToBottom, 150);
    }
  }, [isOpen, messages, scrollToBottom]);

  // Clear Chat History
  const handleClearHistory = () => {
    if (window.confirm('Deseja limpar todo o histórico de conversa com o Co-piloto?')) {
      const defaultState: Message[] = [
        {
          id: 'welcome-reset',
          role: 'assistant',
          text: 'Histórico redefinido. Como posso ajudar com os seus horários e protocolos agora? 🔬',
          timestamp: new Date()
        }
      ];
      setMessages(defaultState);
      setErrorStatus(null);
    }
  };

  // Submit Text Message
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputValue.trim();
    if (!textToSend || isLoading) return;

    if (!customText) {
      setInputValue('');
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}-${Math.random()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setErrorStatus(null);

    // Prepare full state description for Gemini co-pilot
    const appState = {
      currentTime: currentTimeStr,
      theme: theme,
      connectedAgendas: connectedAgendas.map(f => ({ id: f.id, name: f.name })),
      schedule: schedule.map(s => ({
        startTime: s.startTime,
        endTime: s.endTime,
        activity: s.activity,
        instructions: s.instructions || '',
        category: s.category
      })),
      currentActivities: currentActivities.map(c => ({
        startTime: c.startTime,
        endTime: c.endTime,
        activity: c.activity,
        category: c.category
      })),
      displayedActivity: displayedActivity ? {
        startTime: displayedActivity.startTime,
        endTime: displayedActivity.endTime,
        activity: displayedActivity.activity,
        instructions: displayedActivity.instructions || '',
        category: displayedActivity.category
      } : null
    };

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: textToSend,
          history: messages.filter(m => m.id !== 'welcome' && m.id !== 'welcome-reset').slice(-15), // send last 15 messages max
          appState: appState
        }),
      });

      if (!response.ok) {
        throw new Error('Falha na resposta do servidor.');
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-${Math.random()}`,
        role: 'assistant',
        text: data.text || 'Não consegui obter uma resposta.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (e: any) {
      console.error('Co-pilot API communication error:', e);
      setErrorStatus('Não foi possível conectar ao co-piloto. Verifique sua conexão e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Sparkles Bubble Trigger Button */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
        <AnimatePresence>
          {!isOpen && (
            <motion.button
              id="gemini-chat-trigger"
              onClick={() => setIsOpen(true)}
              initial={{ scale: 0, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0, opacity: 0, y: 20 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              className="relative w-14 h-14 rounded-full flex items-center justify-center cursor-pointer shadow-[0_12px_36px_rgba(0,0,0,0.18)] transition-all bg-gradient-to-tr from-[#3b82f6] via-[#8b5cf6] to-[#ec4899] text-white overflow-hidden group border border-white/20"
              title="Perguntar ao Co-piloto IA"
            >
              {/* Pulsing halo */}
              <span className="absolute inset-0 rounded-full bg-white/10 scale-100 group-hover:scale-110 duration-500 transition-transform" />
              <Sparkles className="w-6 h-6 animate-pulse group-hover:rotate-12 transition-transform duration-300" />
              
              {/* Mini Sparkle particles */}
              <span className="absolute w-1.5 h-1.5 rounded-full bg-yellow-200 top-2 right-3 animate-ping" />
              <span className="absolute w-1 h-1 rounded-full bg-teal-200 bottom-3 left-3 animate-ping [animation-delay:0.3s]" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Dynamic Chat Window panel */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              id="gemini-chat-panel"
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className={cn(
                "relative w-[92vw] sm:w-[440px] h-[600px] max-h-[82vh] rounded-[32px] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.22)] border flex flex-col z-[110]",
                isDark 
                  ? "bg-[#18191b] border-white/10 text-white" 
                  : "bg-white border-neutral-100 text-neutral-800"
              )}
            >
              {/* Header */}
              <div 
                className="p-5 flex items-center justify-between border-b shrink-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 relative"
                style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}
              >
                {/* Visual Accent Bar */}
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#3b82f6] via-[#8b5cf6] to-[#ec4899]" />
                
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#3b82f6] via-[#8b5cf6] to-[#ec4899] shadow-md border border-white/10">
                    <BrainCircuit className="w-5.5 h-5.5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold tracking-tight">Co-piloto Gemini</h3>
                      <span className="flex h-1.5 w-1.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                      </span>
                    </div>
                    <p className={cn("text-[9.5px] uppercase font-semibold tracking-wider opacity-60")}>
                      Conectado ao seu App
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* Reset chat */}
                  <button 
                    onClick={handleClearHistory}
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer",
                      isDark ? "hover:bg-white/5 text-neutral-400 hover:text-white" : "hover:bg-neutral-100 text-neutral-500 hover:text-black"
                    )}
                    title="Limpar histórico"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  
                  {/* Close window */}
                  <button 
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer",
                      isDark ? "hover:bg-white/5 text-neutral-400 hover:text-white" : "hover:bg-neutral-100 text-neutral-500 hover:text-black"
                    )}
                    title="Minimizar co-piloto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Chat Viewport Area */}
              <div 
                className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-[#fafafa]/25 dark:bg-[#121314]/25"
              >
                {/* Dynamic messages cards list */}
                {messages.map((message) => {
                  const isAssistant = message.role === 'assistant';
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex gap-3 max-w-[88%]",
                        isAssistant ? "mr-auto self-start" : "ml-auto self-end flex-row-reverse"
                      )}
                    >
                      {/* Avatar */}
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs",
                        isAssistant 
                          ? "bg-gradient-to-tr from-[#3b82f6] to-[#8b5cf6] text-white" 
                          : "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-bold"
                      )}>
                        {isAssistant ? <Sparkles className="w-3.5 h-3.5" /> : 'U'}
                      </div>

                      {/* Content Bubble */}
                      <div className="space-y-1">
                        <div className={cn(
                          "p-3.5 rounded-2xl text-xs leading-relaxed border shadow-xs transition-colors",
                          isAssistant 
                            ? isDark 
                              ? "bg-neutral-900 border-neutral-800 text-neutral-100" 
                              : "bg-neutral-50 border-neutral-100 text-neutral-900"
                            : "bg-gradient-to-r text-white border-transparent"
                        )}
                        style={!isAssistant ? { backgroundImage: `linear-gradient(to right, ${accentColor}, ${accentColor}dd)` } : {}}
                        >
                          {/* Rich formatting on response */}
                          <div className="markdown-body space-y-2 prose dark:prose-invert max-w-none prose-xs text-xs">
                            <Markdown>{message.text}</Markdown>
                          </div>
                        </div>
                        {/* Status message time under bubble */}
                        <div className="text-[9px] opacity-40 px-1 text-right">
                          {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Loading/Analysing Animation */}
                {isLoading && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3 max-w-[80%]"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-tr from-[#3b82f6] to-[#8b5cf6] text-white flex-shrink-0">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    </div>
                    <div className={cn(
                      "p-3.5 rounded-2xl border bg-neutral-50 dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800 text-xs flex items-center gap-2",
                      isDark ? "text-neutral-400" : "text-neutral-500"
                    )}>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
                      </span>
                      <span>Analisando protocolo...</span>
                    </div>
                  </motion.div>
                )}

                {/* Error warning message inside viewport */}
                {errorStatus && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl text-xs font-semibold">
                    {errorStatus}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Suggestions chips panel if messages history is simple */}
              {messages.length <= 2 && (
                <div className={cn(
                  "px-4 py-2 border-t flex flex-wrap gap-1.5 shrink-0 bg-neutral-500/5",
                  isDark ? "border-white/5" : "border-neutral-100"
                )}>
                  {SUGGESTED_PROMPTS.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => handleSendMessage(item.prompt)}
                      className={cn(
                        "text-[10px] font-semibold px-2.5 py-1.5 rounded-full transition-all border cursor-pointer hover:scale-[1.02] active:scale-95",
                        isDark 
                          ? "bg-white/5 border-white/5 hover:bg-white/10 text-neutral-300 hover:text-white" 
                          : "bg-white border-neutral-150 hover:bg-neutral-50 hover:border-neutral-250 text-neutral-600 hover:text-black"
                      )}
                    >
                      {item.text}
                    </button>
                  ))}
                </div>
              )}

              {/* Input Control Bottom Form */}
              <div 
                className="p-4 border-t flex gap-2 shrink-0 bg-neutral-50 dark:bg-[#1a1b1d]"
                style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={isLoading}
                  placeholder="Pergunte sobre sua rotina, horários..."
                  className={cn(
                    "flex-1 px-4 py-2.5 text-xs rounded-2xl border focus:outline-hidden transition-all",
                    isDark 
                      ? "bg-[#111213] border-white/10 text-white focus:border-white/20" 
                      : "bg-white border-neutral-200 text-neutral-800 focus:border-neutral-350"
                  )}
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isLoading || !inputValue.trim()}
                  className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer text-white shadow-xs shrink-0 disabled:opacity-40"
                  style={{ backgroundColor: accentColor }}
                  title="Enviar mensagem"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
