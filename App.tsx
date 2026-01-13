
import React, { useState, useCallback, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { Chat } from './components/Chat';
import { DocumentStats } from './components/DocumentStats';
import { Message, ContentData, AnalysisStatus, GroundingSource } from './types';
import { analyzeDocument, analyzeYouTubeLink, analyzeGithubRepo, askQuestionStream } from './services/gemini';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [currentContent, setCurrentContent] = useState<ContentData | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [loadingMsg, setLoadingMsg] = useState('Standby...');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [hasQuotaError, setHasQuotaError] = useState(false);
  
  // Ref-based history allows handleSendMessage to be stable (no dependency changes)
  const conversationHistory = useRef<{role: string, content: string}[]>([]);
  const analysisLock = useRef<string | null>(null);

  const handleSwitchKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setHasQuotaError(false);
        window.location.reload();
      } else {
        window.open('https://ai.google.dev/gemini-api/docs/billing', '_blank');
      }
    } catch (e) {
      console.error("Key selection failed", e);
    }
  };

  const resetSession = () => {
    analysisLock.current = null;
    conversationHistory.current = [];
    setCurrentContent(null);
    setMessages([]);
    setHasQuotaError(false);
  };

  const handleFileUpload = async (file: File, base64: string) => {
    if (analysisLock.current === base64) return;
    analysisLock.current = base64;
    
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Scanning Neural PDF...');
    setCurrentContent({ name: file.name, size: (file.size / 1024).toFixed(1) + ' KB', type: 'pdf', base64: base64 });
    
    try {
      const summary = await analyzeDocument(base64, file.type);
      setCurrentContent(prev => prev ? { ...prev, summary } : null);
      setStatus(AnalysisStatus.READY);
      const initMsg = "Neural link established. PDF context parsed successfully.";
      setMessages([{ id: 'init', role: 'assistant', content: initMsg, timestamp: Date.now() }]);
      conversationHistory.current = [{ role: 'model', content: initMsg }];
    } catch (error: any) {
      analysisLock.current = null;
      setStatus(AnalysisStatus.ERROR);
      if (error.message?.includes('429') || error.status === 429) setHasQuotaError(true);
    }
  };

  const handleLinkUpload = async (url: string) => {
    if (analysisLock.current === url) return;
    analysisLock.current = url;

    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Syncing YouTube...');
    setCurrentContent({ name: 'YouTube Video', type: 'youtube', url: url });
    
    try {
      const result = await analyzeYouTubeLink(url);
      setCurrentContent(prev => prev ? { ...prev, summary: result.text, sources: result.sources } : null);
      setStatus(AnalysisStatus.READY);
      const initMsg = "Video context retrieved. High-speed grounding active.";
      setMessages([{ id: 'init', role: 'assistant', content: initMsg, timestamp: Date.now(), sources: result.sources }]);
      conversationHistory.current = [{ role: 'model', content: initMsg }];
    } catch (error: any) {
      analysisLock.current = null;
      setStatus(AnalysisStatus.ERROR);
      if (error.message?.includes('429') || error.status === 429) setHasQuotaError(true);
    }
  };

  const handleRepoUpload = async (url: string) => {
    if (analysisLock.current === url) return;
    analysisLock.current = url;

    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Scanning Repo...');
    setCurrentContent({ name: url.split('/').pop() || 'Repository', type: 'github', url: url });
    
    try {
      const result = await analyzeGithubRepo(url);
      setCurrentContent(prev => prev ? { ...prev, summary: result.text, sources: result.sources } : null);
      setStatus(AnalysisStatus.READY);
      const initMsg = "Repository indexed. Operational architecture mapped.";
      setMessages([{ id: 'init', role: 'assistant', content: initMsg, timestamp: Date.now(), sources: result.sources }]);
      conversationHistory.current = [{ role: 'model', content: initMsg }];
    } catch (error: any) {
      analysisLock.current = null;
      setStatus(AnalysisStatus.ERROR);
      if (error.message?.includes('429') || error.status === 429) setHasQuotaError(true);
    }
  };

  // stable function with zero dependencies prevents rerender logic loops
  const handleSendMessage = useCallback(async (text: string) => {
    if (!currentContent || isProcessing) return;

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
        if (chunk.sources && chunk.sources.length > 0) {
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
      if (error.message?.includes('429') || error.status === 429) setHasQuotaError(true);
    } finally {
      setIsProcessing(false);
    }
  }, [currentContent, isProcessing, useSearch]);

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-950 overflow-hidden selection:bg-emerald-500/30">
      <nav className="border-b border-white/5 bg-slate-900/40 backdrop-blur-xl shrink-0 h-16">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.location.reload()}>
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95">
              <i className="fa-solid fa-brain text-white text-sm"></i>
            </div>
            <h1 className="text-xl font-bold tracking-tighter text-slate-100">DOC<span className="text-emerald-500">MIND</span></h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setUseSearch(!useSearch)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-widest ${
                useSearch ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
            >
              <i className={`fa-solid ${useSearch ? 'fa-globe' : 'fa-magnifying-glass'}`}></i>
              {useSearch ? 'Grounding On' : 'Search Off'}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 flex flex-col min-h-0 overflow-hidden relative">
        {!currentContent ? (
          <div className="h-full flex flex-col items-center justify-center animate-fade-up">
            <h2 className="text-4xl md:text-6xl font-black text-slate-100 mb-4 text-center leading-tight tracking-tighter">Instant <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Intelligence.</span></h2>
            <p className="text-slate-400 text-sm mb-12 text-center max-w-lg font-medium opacity-80 uppercase tracking-widest">Neural AI Terminal</p>
            <FileUpload 
              onUpload={handleFileUpload} 
              onLink={handleLinkUpload} 
              onRepo={handleRepoUpload}
              isLoading={status === AnalysisStatus.ANALYZING} 
              loadingMessage={loadingMsg}
            />
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden h-full">
            <div className="lg:col-span-4 h-full overflow-y-auto custom-scrollbar pr-1 shrink-0">
              <DocumentStats content={currentContent} onSelectQuery={handleSendMessage} />
            </div>
            <div className="lg:col-span-8 h-full min-h-0 flex flex-col overflow-hidden bg-slate-900/20 rounded-3xl border border-white/5 shadow-2xl">
              <Chat messages={messages} onSendMessage={handleSendMessage} onReset={resetSession} isProcessing={isProcessing} />
            </div>
          </div>
        )}
      </main>
      
      {hasQuotaError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-red-600/95 backdrop-blur-md text-white px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-4 border border-white/20 animate-in slide-in-from-bottom-5">
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Neural Congestion (429)</span>
          <button onClick={handleSwitchKey} className="bg-white text-red-600 px-3 py-1 rounded-full text-[9px] font-black uppercase hover:bg-slate-100 transition-colors">
            Switch Key
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
