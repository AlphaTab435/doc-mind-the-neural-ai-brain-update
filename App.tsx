
import React, { useState, useCallback } from 'react';
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

  const handleFileUpload = async (file: File, base64: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Parsing Neural PDF...');
    setCurrentContent({ name: file.name, size: (file.size / 1024).toFixed(1) + ' KB', type: 'pdf', base64: base64 });
    try {
      const summary = await analyzeDocument(base64, file.type);
      setCurrentContent(prev => prev ? { ...prev, summary } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Neural link established. PDF context parsed.`, timestamp: Date.now() }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      if (error.message?.includes('429') || error.status === 429) setHasQuotaError(true);
    }
  };

  const handleLinkUpload = async (url: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Syncing Video...');
    setCurrentContent({ name: 'YouTube Video', type: 'youtube', url: url });
    try {
      const result = await analyzeYouTubeLink(url);
      setCurrentContent(prev => prev ? { ...prev, summary: result.text, sources: result.sources } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Video synchronized. Web grounding active.`, timestamp: Date.now(), sources: result.sources }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      if (error.message?.includes('429') || error.status === 429) setHasQuotaError(true);
    }
  };

  const handleRepoUpload = async (url: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Mapping Repo...');
    setCurrentContent({ name: url.split('/').pop() || 'Repository', type: 'github', url: url });
    try {
      const result = await analyzeGithubRepo(url);
      setCurrentContent(prev => prev ? { ...prev, summary: result.text, sources: result.sources } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Repository indexed. Operational architecture mapped.`, timestamp: Date.now(), sources: result.sources }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      if (error.message?.includes('429') || error.status === 429) setHasQuotaError(true);
    }
  };

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
        messages.map(m => ({ role: m.role, content: m.content })),
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
    } catch (error: any) {
      if (error.message?.includes('429') || error.status === 429) setHasQuotaError(true);
    } finally {
      setIsProcessing(false);
    }
  }, [currentContent, isProcessing, messages, useSearch]);

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-950 overflow-hidden selection:bg-emerald-500/30">
      <nav className="border-b border-white/5 bg-slate-900/40 backdrop-blur-xl shrink-0 h-16">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.location.reload()}>
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95">
              <i className="fa-solid fa-brain text-white text-sm"></i>
            </div>
            <h1 className="text-xl font-bold tracking-tighter text-slate-100">DOC<span className="text-emerald-500">MIND</span></h1>
          </div>
          
          <div className="flex items-center gap-3">
            {hasQuotaError && (
              <button 
                onClick={handleSwitchKey}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400 text-[10px] font-bold uppercase tracking-widest animate-pulse hover:bg-red-500 hover:text-white transition-all"
              >
                <i className="fa-solid fa-key"></i>
                Key Saturated - Switch?
              </button>
            )}
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

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 flex flex-col min-h-0 overflow-hidden">
        {!currentContent ? (
          <div className="h-full flex flex-col items-center justify-center animate-fade-up">
            <h2 className="text-4xl md:text-6xl font-black text-slate-100 mb-4 text-center leading-tight tracking-tighter">Instant <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Intelligence.</span></h2>
            <p className="text-slate-400 text-sm mb-12 text-center max-w-lg font-medium opacity-80 uppercase tracking-widest">Neural Document Terminal</p>
            <FileUpload 
              onUpload={handleFileUpload} 
              onLink={handleLinkUpload} 
              onRepo={handleRepoUpload}
              isLoading={status === AnalysisStatus.ANALYZING} 
              loadingMessage={loadingMsg}
            />
          </div>
        ) : (
          <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
            <div className="lg:col-span-4 h-full overflow-y-auto custom-scrollbar pr-1">
              <DocumentStats content={currentContent} onSelectQuery={handleSendMessage} />
            </div>
            <div className="lg:col-span-8 h-full min-h-0">
              <Chat messages={messages} onSendMessage={handleSendMessage} onReset={() => setCurrentContent(null)} isProcessing={isProcessing} />
            </div>
          </div>
        )}
      </main>
      
      {hasQuotaError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-red-600/90 backdrop-blur-md text-white px-6 py-2 rounded-full shadow-2xl flex items-center gap-4 border border-white/20">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Neural Rate Limit Hit (15 RPM)</span>
          <button onClick={handleSwitchKey} className="bg-white text-red-600 px-3 py-1 rounded-full text-[9px] font-black uppercase">
            Use My Key
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
