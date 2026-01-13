
import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { Chat } from './components/Chat';
import { DocumentStats } from './components/DocumentStats';
import { Message, ContentData, AnalysisStatus, GroundingSource } from './types';
import { analyzeDocument, analyzeYouTubeLink, analyzeGithubRepo, askQuestionStream } from './services/gemini';

const App: React.FC = () => {
  const [currentContent, setCurrentContent] = useState<ContentData | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [loadingMsg, setLoadingMsg] = useState('Initializing...');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useSearch, setUseSearch] = useState(true);

  const handleFileUpload = async (file: File, base64: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Scanning Document...');
    setCurrentContent({ name: file.name, size: file.size.toString(), type: 'pdf', base64: base64 });
    try {
      const summary = await analyzeDocument(base64, file.type);
      setCurrentContent(prev => prev ? { ...prev, summary } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Neural link established. Document context analyzed.`, timestamp: Date.now() }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      setCurrentContent(null);
      alert(error.message?.includes('429') ? "Rate limit reached. Please wait a minute before uploading." : error.message);
    }
  };

  const handleLinkUpload = async (url: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Grounding YouTube...');
    setCurrentContent({ name: 'YouTube Context', type: 'youtube', url: url });
    try {
      const result = await analyzeYouTubeLink(url);
      setCurrentContent(prev => prev ? { ...prev, summary: result.text, sources: result.sources } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Video context synchronized. Source verified via Deep Search.`, timestamp: Date.now(), sources: result.sources }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      setCurrentContent(null);
      alert(error.message?.includes('429') ? "Rate limit reached. YouTube grounding requires a brief cooldown." : error.message);
    }
  };

  const handleRepoUpload = async (url: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Grounding Repository...');
    setCurrentContent({ name: url.split('/').pop() || 'Repository', type: 'github', url: url });
    try {
      const result = await analyzeGithubRepo(url);
      setCurrentContent(prev => prev ? { ...prev, summary: result.text, sources: result.sources } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Codebase mapped. Architecture analysis is active.`, timestamp: Date.now(), sources: result.sources }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      setCurrentContent(null);
      alert(error.message?.includes('429') ? "Rate limit reached. Repository analysis is resource-intensive." : error.message);
    }
  };

  const handleSendMessage = async (text: string) => {
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
          // Merge unique sources
          chunk.sources.forEach(s => {
            if (!allSources.find(as => as.uri === s.uri)) allSources.push(s);
          });
        }
        
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: fullContent, sources: allSources };
          return newMsgs;
        });
      }
    } catch (error: any) {
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content = "The Neural Brain is temporarily overloaded (429 Rate Limit). Please retry in a moment.";
        return newMsgs;
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-slate-950 selection:bg-emerald-500/30">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => window.location.reload()}>
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform">
              <i className="fa-solid fa-brain text-white text-xs"></i>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">DOC<span className="text-emerald-500">MIND</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setUseSearch(!useSearch)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-[10px] font-bold uppercase tracking-widest ${
                useSearch ? 'bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
            >
              <i className={`fa-solid ${useSearch ? 'fa-globe' : 'fa-magnifying-glass'}`}></i>
              {useSearch ? 'Grounding Active' : 'Grounding Off'}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 flex flex-col overflow-hidden">
        {!currentContent ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <h2 className="text-3xl md:text-5xl font-bold text-slate-100 mb-4 text-center leading-tight tracking-tight">Intelligence <span className="text-emerald-500">Accelerated.</span></h2>
            <p className="text-slate-400 text-sm mb-10 text-center max-w-lg">Neural analysis for PDFs, YouTube, and Repositories via Flash-3 Engine.</p>
            <FileUpload 
              onUpload={handleFileUpload} 
              onLink={handleLinkUpload} 
              onRepo={handleRepoUpload}
              isLoading={status === AnalysisStatus.ANALYZING} 
              loadingMessage={loadingMsg}
            />
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-0 overflow-hidden">
            <div className="lg:col-span-4 overflow-y-auto custom-scrollbar"><DocumentStats content={currentContent} onSelectQuery={handleSendMessage} /></div>
            <div className="lg:col-span-8 h-full min-h-0"><Chat messages={messages} onSendMessage={handleSendMessage} onReset={() => setCurrentContent(null)} isProcessing={isProcessing} /></div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
