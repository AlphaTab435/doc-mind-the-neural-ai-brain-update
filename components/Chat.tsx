
import React, { useState, useRef, useEffect, memo } from 'react';
import { Message } from '../types';

interface ChatProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onReset: () => void;
  isProcessing: boolean;
}

const MessageBubble = memo(({ msg }: { msg: Message }) => (
  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
    <div className={`max-w-[85%] rounded-2xl p-4 shadow-lg ${
      msg.role === 'user' 
        ? 'bg-emerald-600 text-white rounded-tr-none border border-emerald-500/30' 
        : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none'
    }`}>
      <div className="whitespace-pre-wrap text-sm leading-relaxed prose-invert prose-emerald">
        {msg.content || (msg.role === 'assistant' ? 'Thinking...' : '')}
      </div>
      <div className={`text-[9px] mt-2 opacity-60 uppercase font-bold tracking-widest ${msg.role === 'user' ? 'text-emerald-100' : 'text-slate-500'}`}>
        {msg.role === 'user' ? 'Transmit' : 'Synthesized'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  </div>
));

export const Chat: React.FC<ChatProps> = ({ messages, onSendMessage, onReset, isProcessing }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="flex flex-col h-full glass-panel rounded-3xl overflow-hidden shadow-2xl">
      <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
            <i className="fa-solid fa-brain text-emerald-500 text-lg"></i>
          </div>
          <div>
            <h2 className="font-semibold text-slate-100">Brain Terminal</h2>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
              <span className={`text-[10px] uppercase tracking-widest font-bold ${isProcessing ? 'text-amber-500' : 'text-emerald-500'}`}>
                {isProcessing ? 'Processing' : 'Neural Active'}
              </span>
            </div>
          </div>
        </div>
        <button onClick={onReset} className="p-2 hover:bg-slate-700 rounded-xl transition-colors text-slate-400 group">
          <i className="fa-solid fa-rotate group-active:rotate-180 transition-transform"></i>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar scroll-smooth">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
              <i className="fa-regular fa-comment-dots text-3xl text-slate-500"></i>
            </div>
            <p className="text-slate-400 max-w-xs text-sm">Brain ready for document extraction.</p>
          </div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
      </div>

      <div className="p-4 bg-slate-800/50 border-t border-slate-700">
        <form onSubmit={handleSubmit} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder={isProcessing ? "Processing..." : "Ask your document anything..."}
            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl px-5 py-4 pr-14 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder:text-slate-600 shadow-inner"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className={`absolute right-2 top-2 bottom-2 w-12 flex items-center justify-center rounded-xl transition-all ${
              input.trim() && !isProcessing ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg' : 'bg-slate-800 text-slate-600'
            }`}
          >
            <i className={`fa-solid ${isProcessing ? 'fa-circle-notch animate-spin' : 'fa-paper-plane'}`}></i>
          </button>
        </form>
      </div>
    </div>
  );
};
