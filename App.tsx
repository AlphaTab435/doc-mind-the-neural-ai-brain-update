
import React, { useState, useCallback, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { Chat } from './components/Chat';
import { DocumentStats } from './components/DocumentStats';
import { Message, ContentData, AnalysisStatus, GroundingSource } from './types';
import { analyzeDocument, analyzeYouTubeLink, analyzeGithubRepo, askQuestionStream } from './services/gemini';

// Global declaration for AI Studio key management
// Use existing AIStudio type and optional modifier to resolve type collision errors
declare global {
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

  // Check if a user key is available
  const handleSwitchKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setHasQuotaError(false);
        // Key selection is assumed successful per guidelines to avoid race condition delays
      }
    } catch (e) {
      console.error("Key selection failed", e);
    }
  };

  const handleFileUpload = async (file: File, base64: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Parsing PDF...');
    setCurrentContent({ name: file.name, size: (file.size / 1024).toFixed(1) + ' KB', type: 'pdf', base64: base64 });
    try {
      const summary = await analyzeDocument(base64, file.type);
      setCurrentContent(prev => prev ? { ...prev, summary } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Neural link established. I have scanned the document.`, timestamp: Date.now() }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      // Handle quota issues or missing entity errors which require key refresh
      if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
        setHasQuotaError(true);
      } else if (error.message?.includes('Requested entity was not found')) {
        handleSwitchKey();
      }
      alert("Neural analysis failed. Check your connection or quota.");
    }
  };

  const handleLinkUpload = async (url: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Syncing YouTube...');
    setCurrentContent({ name: 'YouTube Content', type: 'youtube', url: url });
    try {
      const result = await analyzeYouTubeLink(url);
      setCurrentContent(prev => prev ? { ...prev, summary: result.text, sources: result.sources } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Video context retrieved via Deep Grounding.`, timestamp: Date.now(), sources: result.sources }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
        setHasQuotaError(true);
      } else if (error.message?.includes('Requested entity was not found')) {
        handleSwitchKey();
      }
      alert("Grounding error. YouTube links require search quota.");
    }
  };

  const handleRepoUpload = async (url: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Scanning Repo...');
    setCurrentContent({ name: url.split('/').pop() || 'Repository', type: 'github', url: url });
    try {
      const result = await analyzeGithubRepo(url);
      setCurrentContent(prev => prev ? { ...prev, summary: result.text, sources: result.sources } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Repository successfully indexed. Mapping architecture...`, timestamp: Date.now(), sources: result.sources }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
        setHasQuotaError(true);
      } else if (error.message?.includes('Requested entity was not found')) {
        handleSwitchKey();
      }
      alert("Repo Grounding Error. Repo must be public.");
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
      if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
        setHasQuotaError(true);
      } else if (error.message?.includes('Requested entity was not found')) {
        handleSwitchKey();
      }
    } finally {
      setIsProcessing(false);
    }
  }, [currentContent, isProcessing, messages, useSearch]);

  return (
    <div className="flex-1 flex flex-col relative bg-slate-950 selection:bg-emerald-500/30">
      <nav className="border-b border-white/5 bg-slate-900/40 backdrop-blur-xl shrink-0">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
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
                Switch Neural Key
              </button>
            )}
            <button 
              onClick={() => setUseSearch(!useSearch)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-widest ${
                useSearch ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
            >
              <i className={`fa-solid ${useSearch ? 'fa-globe' : 'fa-magnifying-glass'}`}></i>
              {useSearch ? 'Search Active' : 'Search Off'}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 flex flex-col min-h-0">
        {!currentContent ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 animate-fade-up">
            <h2 className="text-4xl md:text-6xl font-black text-slate-100 mb-4 text-center leading-tight tracking-tighter">Instant <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Intelligence.</span></h2>
            <p className="text-slate-400 text-sm mb-12 text-center max-w-lg font-medium opacity-80 uppercase tracking-widest">Powered by Gemini Engine</p>
            <FileUpload 
              onUpload={handleFileUpload} 
              onLink={handleLinkUpload} 
              onRepo={handleRepoUpload}
              isLoading={status === AnalysisStatus.ANALYZING} 
              loadingMessage={loadingMsg}
            />
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-0">
            <div className="lg:col-span-4 overflow-y-auto custom-scrollbar pr-1 animate-fade-up">
              <DocumentStats content={currentContent} onSelectQuery={handleSendMessage} />
            </div>
            <div className="lg:col-span-8 h-full min-h-0 animate-fade-up" style={{ animationDelay: '0.1s' }}>
              <Chat messages={messages} onSendMessage={handleSendMessage} onReset={() => setCurrentContent(null)} isProcessing={isProcessing} />
            </div>
          </div>
        )}
      </main>
      
      {hasQuotaError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-10">
          <span className="text-xs font-bold uppercase tracking-widest">Quota Exhausted. Billing required.</span>
          <button onClick={handleSwitchKey} className="bg-white text-red-600 px-4 py-1 rounded-full text-[10px] font-black uppercase hover:bg-slate-100 transition-colors">
            Provide Personal Key
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
