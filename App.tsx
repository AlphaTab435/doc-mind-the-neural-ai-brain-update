import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { Chat } from './components/Chat';
import { DocumentStats } from './components/DocumentStats';
import { Message, ContentData, AnalysisStatus } from './types';
import { analyzeDocument, analyzeYouTubeLink, analyzeGithubRepo, askQuestionStream } from './services/gemini';

const App: React.FC = () => {
  const [currentContent, setCurrentContent] = useState<ContentData | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [loadingMsg, setLoadingMsg] = useState('Initializing Brain...');
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
      alert(error.message);
    }
  };

  const handleLinkUpload = async (url: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Neural Grounding: YouTube...');
    setCurrentContent({ name: 'YouTube Context', type: 'youtube', url: url });
    try {
      const summary = await analyzeYouTubeLink(url);
      setCurrentContent(prev => prev ? { ...prev, summary } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Video context synchronized via Deep Search.`, timestamp: Date.now() }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      setCurrentContent(null);
      alert(error.message);
    }
  };

  const handleRepoUpload = async (url: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setLoadingMsg('Neural Grounding: GitHub...');
    setCurrentContent({ name: url.split('/').pop() || 'Repository', type: 'github', url: url });
    try {
      const summary = await analyzeGithubRepo(url);
      setCurrentContent(prev => prev ? { ...prev, summary } : null);
      setStatus(AnalysisStatus.READY);
      setMessages([{ id: 'init', role: 'assistant', content: `Codebase mapped. I am ready to analyze this architecture.`, timestamp: Date.now() }]);
    } catch (error: any) {
      setStatus(AnalysisStatus.ERROR);
      setCurrentContent(null);
      alert(error.message);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!currentContent || isProcessing) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    const aiMsgPlaceholder: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', timestamp: Date.now() };

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
      for await (const chunk of stream) {
        fullContent += chunk;
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: fullContent };
          return newMsgs;
        });
      }
    } catch (error: any) {
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content = "The Neural connection timed out. Search grounding can be slow on large repositories or restricted videos.";
        return newMsgs;
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-slate-950">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => window.location.reload()}>
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <i className="fa-solid fa-brain text-white text-sm"></i>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">DOC<span className="text-emerald-500">MIND</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setUseSearch(!useSearch)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-[10px] font-bold uppercase tracking-widest ${
                useSearch ? 'bg-blue-500/20 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
            >
              <i className={`fa-solid ${useSearch ? 'fa-globe' : 'fa-magnifying-glass'}`}></i>
              {useSearch ? 'Grounding On' : 'Grounding Off'}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 flex flex-col">
        {!currentContent ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <h2 className="text-4xl md:text-6xl font-bold text-slate-100 mb-6 text-center leading-tight">Neural Intelligence.<br/><span className="text-emerald-500 text-3xl md:text-5xl">Ultra Fast.</span></h2>
            <FileUpload 
              onUpload={handleFileUpload} 
              onLink={handleLinkUpload} 
              onRepo={handleRepoUpload}
              isLoading={status === AnalysisStatus.ANALYZING} 
              loadingMessage={loadingMsg}
            />
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
            <div className="lg:col-span-4"><DocumentStats content={currentContent} onSelectQuery={handleSendMessage} /></div>
            <div className="lg:col-span-8 h-full"><Chat messages={messages} onSendMessage={handleSendMessage} onReset={() => setCurrentContent(null)} isProcessing={isProcessing} /></div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;