
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { Chat } from './components/Chat';
import { DocumentStats } from './components/DocumentStats';
import { Message, ContentData, AnalysisStatus, GroundingSource } from './types';
import { analyzeDocument, analyzeYouTubeLink, analyzeGithubRepo, askQuestionStream } from './services/gemini';

const App: React.FC = () => {
  const [currentContent, setCurrentContent] = useState<ContentData | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [loadingMsg, setLoadingMsg] = useState('Standby...');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [quotaCooldown, setQuotaCooldown] = useState(0);
  const [isDailyLocked, setIsDailyLocked] = useState(false);
  const [showSummaryMobile, setShowSummaryMobile] = useState(false);
  
  const conversationHistory = useRef<{role: string, content: string}[]>([]);
  const isExecutingAnalysis = useRef<boolean>(false);

  useEffect(() => {
    if (quotaCooldown > 0) {
      const timer = setTimeout(() => setQuotaCooldown(quotaCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [quotaCooldown]);

  const resetSession = () => {
    isExecutingAnalysis.current = false;
    conversationHistory.current = [];
    setCurrentContent(null);
    setMessages([]);
    setQuotaCooldown(0);
    setIsDailyLocked(false);
    setUseSearch(false);
    setShowSummaryMobile(false);
  };

  const handleQuotaError = (error: any) => {
    const msg = (error.message || "").toLowerCase();
    // Your log shows 21/20 RPD. This matches "exceeded your current quota" or specific Daily triggers.
    if (msg.includes('daily') || msg.includes('day') || msg.includes('quota exhausted') || msg.includes('exceeded your current quota')) {
      setIsDailyLocked(true);
    } else {
      setQuotaCooldown(60);
    }
    setStatus(AnalysisStatus.ERROR);
  };

  const startAnalysis = async (type: 'pdf' | 'youtube' | 'github', action: () => Promise<any>, data: Partial<ContentData>) => {
    if (isExecutingAnalysis.current || isDailyLocked) return;
    isExecutingAnalysis.current = true;
    
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg(`Scanning ${type.toUpperCase()}...`);
    setCurrentContent(data as ContentData);
    
    try {
      const result = await action();
      const summary = typeof result === 'string' ? result : result.text;
      const sources = typeof result === 'string' ? [] : result.sources;
      
      setCurrentContent(prev => prev ? { ...prev, summary, sources } : null);
      setStatus(AnalysisStatus.READY);
      
      const welcome = `Neural mapping complete. Grounding (Web Search) is ${useSearch ? 'ACTIVE' : 'OFF'}. Transmit inquiries below.`;
      setMessages([{ id: 'init', role: 'assistant', content: welcome, timestamp: Date.now(), sources }]);
      conversationHistory.current = [{ role: 'model', content: welcome }];
    } catch (error: any) {
      console.error("Analysis Error:", error);
      if (error.status === 429) {
        handleQuotaError(error);
      } else {
        setStatus(AnalysisStatus.ERROR);
      }
    } finally {
      isExecutingAnalysis.current = false;
    }
  };

  const handleFileUpload = (file: File, base64: string) => 
    startAnalysis('pdf', () => analyzeDocument(base64, file.type), { name: file.name, size: (file.size / 1024).toFixed(1) + ' KB', type: 'pdf', base64 });

  const handleLinkUpload = (url: string) => 
    startAnalysis('youtube', () => analyzeYouTubeLink(url), { name: 'YouTube Video', type: 'youtube', url });

  const handleRepoUpload = (url: string) => 
    startAnalysis('github', () => analyzeGithubRepo(url), { name: url.split('/').pop() || 'Repository', type: 'github', url });

  const handleSendMessage = useCallback(async (text: string) => {
    if (!currentContent || isProcessing || quotaCooldown > 0 || isDailyLocked) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    const aiMsgPlaceholder: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', timestamp: Date.now(), sources: [] };

    setMessages(prev => [...prev, userMsg, aiMsgPlaceholder]);
    setIsProcessing(true);

    try {
      const stream = askQuestionStream(
        { 
          base64: currentContent.base64, 
          type: currentContent.type, 
          url: currentContent.url,
          mimeType: currentContent.type === 'pdf' ? 'application/pdf' : undefined 
        }, 
        text, 
        conversationHistory.current,
        useSearch
      );

      let fullContent = '';
      let allSources: GroundingSource[] = [];
      
      for await (const chunk of stream) {
        fullContent += chunk.text;
        if (chunk.sources) {
          chunk.sources.forEach(s => {
            if (!allSources.find(as => as.uri === s.uri)) allSources.push(s);
          });
        }
        
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: fullContent, sources: [...allSources] };
          return newMsgs;
        });
      }

      conversationHistory.current.push({ role: 'user', content: text });
      conversationHistory.current.push({ role: 'model', content: fullContent });
    } catch (error: any) {
      if (error.status === 429) handleQuotaError(error);
    } finally {
      setIsProcessing(false);
    }
  }, [currentContent, isProcessing, useSearch, quotaCooldown, isDailyLocked]);

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden relative">
      <div className="scanline"></div>
      
      <nav className="shrink-0 h-16 border-b border-white/5 bg-slate-900/40 backdrop-blur-xl z-50 px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => window.location.reload()}>
          <div className="w-8 h-8 md:w-9 md:h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg md:rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <i className="fa-solid fa-brain text-white text-xs md:text-sm"></i>
          </div>
          <h1 className="text-lg md:text-xl font-bold tracking-tighter text-slate-100">DOC<span className="text-emerald-500">MIND</span></h1>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              if (isDailyLocked) return;
              setUseSearch(!useSearch);
            }}
            disabled={isDailyLocked}
            className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl border transition-all text-[9px] md:text-[10px] font-black uppercase tracking-widest ${
              isDailyLocked ? 'bg-slate-900 border-slate-800 text-slate-700 opacity-50' :
              useSearch ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
          >
            <i className={`fa-solid ${useSearch ? 'fa-globe' : 'fa-magnifying-glass-slash'}`}></i>
            <span className="hidden sm:inline">{isDailyLocked ? 'Exhausted' : (useSearch ? 'Search On' : 'Search Off')}</span>
            <span className="sm:hidden">{isDailyLocked ? 'Lock' : (useSearch ? 'On' : 'Off')}</span>
          </button>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-3 md:p-6 flex flex-col min-h-0 overflow-hidden relative z-10">
        {isDailyLocked ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto animate-in fade-in zoom-in px-4">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/30 mb-6 md:mb-8 animate-pulse">
              <i className="fa-solid fa-battery-empty text-2xl md:text-3xl text-red-500"></i>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-100 mb-4 tracking-tighter uppercase">Daily Quota <span className="text-red-500">Exhausted</span></h2>
            <p className="text-slate-400 text-xs md:text-sm mb-8 leading-relaxed">
              Based on your logs (21/20), you have exceeded your **Daily Limit (RPD)**. Neural link will reset at Midnight Pacific Time.
            </p>
            <button 
              onClick={resetSession}
              className="px-6 py-3 md:px-8 md:py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all shadow-xl"
            >
              Reset Session Buffer
            </button>
          </div>
        ) : !currentContent ? (
          <div className="h-full flex flex-col items-center justify-center animate-fade-up px-4">
            <h2 className="text-3xl md:text-6xl font-black text-slate-100 mb-2 text-center tracking-tighter uppercase">Terminal <span className="text-emerald-500">Active.</span></h2>
            <p className="text-slate-500 text-[8px] md:text-[10px] mb-8 md:mb-12 text-center uppercase tracking-[0.4em] font-bold opacity-60">Neural Engine v3.1 Deployment</p>
            <FileUpload 
              onUpload={handleFileUpload} 
              onLink={handleLinkUpload} 
              onRepo={handleRepoUpload} 
              isLoading={status === AnalysisStatus.ANALYZING} 
              loadingMessage={loadingMsg} 
            />
            {quotaCooldown > 0 && (
              <div className="mt-8 text-amber-500 font-bold text-[10px] uppercase tracking-widest animate-pulse">
                Minute Cooling: {quotaCooldown}s
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-4 md:gap-6 min-h-0 overflow-hidden">
            <div className={`lg:col-span-4 shrink-0 transition-all duration-300 ${showSummaryMobile ? 'block' : 'hidden lg:block'} overflow-y-auto custom-scrollbar pr-1`}>
               <div className="lg:hidden mb-4">
                  <button onClick={() => setShowSummaryMobile(false)} className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                    <i className="fa-solid fa-chevron-left"></i> Back to Link
                  </button>
               </div>
               <DocumentStats content={currentContent} onSelectQuery={(q) => { setShowSummaryMobile(false); handleSendMessage(q); }} />
            </div>
            
            <div className={`lg:col-span-8 flex flex-col min-h-0 relative ${showSummaryMobile ? 'hidden lg:flex' : 'flex'}`}>
              <div className="lg:hidden mb-2 flex justify-between items-center bg-slate-900/40 p-2 rounded-xl border border-white/5">
                <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest ml-2 truncate max-w-[50%]">{currentContent.name}</span>
                <button onClick={() => setShowSummaryMobile(true)} className="bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border border-emerald-500/20">
                  Summary
                </button>
              </div>
              <Chat messages={messages} onSendMessage={handleSendMessage} onReset={resetSession} isProcessing={isProcessing} />
              {quotaCooldown > 0 && (
                <div className="absolute top-16 lg:top-4 left-1/2 -translate-x-1/2 bg-amber-600/90 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest shadow-2xl z-50">
                  Minute Limit: {quotaCooldown}s Cooldown
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
