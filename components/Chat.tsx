import React, { useState, useRef, useEffect, memo } from 'react';
import { Message, GroundingSource } from '../types';

interface ChatProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onReset: () => void;
  isProcessing: boolean;
}

const MessageBubble = memo(({ msg }: { msg: Message }) => (
  <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300 mb-4`}>
    <div className={`max-w-[95%] sm:max-w-[85%] md:max-w-[92%] rounded-2xl p-3 md:p-4 shadow-lg ${
      msg.role === 'user' 
        ? 'bg-emerald-600 text-white rounded-tr-none border border-emerald-500/30' 
        : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none'
    }`}>
      <div className="whitespace-pre-wrap text-[13px] md:text-sm leading-relaxed prose-invert prose-emerald">
        {msg.content || (msg.role === 'assistant' ? 'Connecting...' : '')}
      </div>
      
      {msg.sources && msg.sources.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-700/50">
          <p className="text-[8px] md:text-[9px] uppercase tracking-widest font-bold text-slate-500 mb-2">Neural Grounding</p>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {msg.sources.map((s, i) => (
              <a 
                key={i} 
                href={s.uri} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[9px] md:text-[10px] px-2 py-1 bg-slate-900/50 border border-slate-700 rounded-lg text-emerald-400 hover:text-white hover:border-emerald-500 transition-all flex items-center gap-1"
              >
                <i className="fa-solid fa-link text-[7px] md:text-[8px]"></i>
                <span className="truncate max-w-[100px] md:max-w-[120px]">{s.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className={`text-[8px] md:text-[9px] mt-2 opacity-60 uppercase font-bold tracking-widest ${msg.role === 'user' ? 'text-emerald-100' : 'text-slate-500'}`}>
        {msg.role === 'user' ? 'Transmit' : 'Synthesized'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  </div>
));

export const Chat: React.FC<ChatProps> = ({ messages, onSendMessage, onReset, isProcessing }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl shadow-2xl">
      {/* Header */}
      <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/40 backdrop-blur-md z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
            <i className="fa-solid fa-brain text-emerald-500 text-sm sm:text-lg"></i>
          </div>
          <div>
            <h2 className="font-semibold text-slate-100 text-xs sm:text-sm">Neural Link</h2>
            <div className="flex items-center gap-1">
              <span className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
              <span className={`text-[8px] sm:text-[10px] uppercase tracking-widest font-bold ${isProcessing ? 'text-amber-500' : 'text-emerald-500'}`}>
                {isProcessing ? 'Streaming' : 'Ready'}
              </span>
            </div>
          </div>
        </div>
        <button onClick={onReset} className="p-2 hover:bg-slate-700/50 rounded-lg transition-all text-slate-400 group active:scale-90">
          <i className="fa-solid fa-rotate group-active:rotate-180 transition-transform text-xs sm:text-base"></i>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-6 custom-scrollbar scroll-smooth overscroll-contain h-full min-h-0">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
            <i className="fa-solid fa-terminal text-3xl sm:text-4xl text-slate-600 mb-4"></i>
            <p className="text-slate-400 text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.3em]">Buffer Ready</p>
          </div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
      </div>

      {/* Footer / Input */}
      <div className="shrink-0 p-3 sm:p-4 bg-slate-800/80 border-t border-slate-700/50 backdrop-blur-lg">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            autoComplete="off"
            placeholder={isProcessing ? "Link busy..." : "Transmit..."}
            className="w-full bg-slate-950/90 border border-slate-700/80 text-slate-100 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-4 pr-12 sm:pr-14 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-600 text-[13px] sm:text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className={`absolute right-1.5 top-1.5 bottom-1.5 w-10 sm:w-12 flex items-center justify-center rounded-lg sm:rounded-xl transition-all ${
              input.trim() && !isProcessing ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xl' : 'bg-slate-800 text-slate-600'
            }`}
          >
            <i className={`fa-solid ${isProcessing ? 'fa-circle-notch animate-spin' : 'fa-paper-plane'} text-xs sm:text-base`}></i>
          </button>
        </form>
      </div>
    </div>
  );
};
