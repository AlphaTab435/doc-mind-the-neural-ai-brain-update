
import React, { useCallback, useState } from 'react';

interface FileUploadProps {
  onUpload: (file: File, base64: string) => void;
  onLink: (url: string) => void;
  onRepo: (url: string) => void;
  isLoading: boolean;
  loadingMessage?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUpload, onLink, onRepo, isLoading, loadingMessage }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'file' | 'link' | 'repo'>('file');

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true);
    else if (e.type === 'dragleave') setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Please upload a valid PDF file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      onUpload(file, base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;
    if (mode === 'link') onLink(input);
    else if (mode === 'repo') onRepo(input);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="flex p-1 bg-slate-900/80 rounded-2xl border border-slate-700 w-fit mx-auto">
        <button 
          onClick={() => { setMode('file'); setInput(''); }}
          className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'file' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Neural PDF
        </button>
        <button 
          onClick={() => { setMode('link'); setInput(''); }}
          className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'link' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          YouTube
        </button>
        <button 
          onClick={() => { setMode('repo'); setInput(''); }}
          className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'repo' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Repo
        </button>
      </div>

      <div
        onDragEnter={mode === 'file' ? handleDrag : undefined}
        onDragLeave={mode === 'file' ? handleDrag : undefined}
        onDragOver={mode === 'file' ? handleDrag : undefined}
        onDrop={mode === 'file' ? (e) => {
          e.preventDefault(); setIsDragging(false);
          if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
        } : undefined}
        className={`relative h-64 w-full rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center
          ${isDragging 
            ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
            : mode === 'file' ? 'border-slate-700 hover:border-emerald-500/50 bg-slate-800/50' 
            : mode === 'link' ? 'border-slate-700 hover:border-red-500/50 bg-slate-800/50'
            : 'border-slate-700 hover:border-indigo-500/50 bg-slate-800/50'
          }
          ${isLoading ? 'pointer-events-none opacity-50' : ''}`}
      >
        {mode === 'file' ? (
          <>
            <input type="file" accept=".pdf" onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="text-center p-6 pointer-events-none">
              <div className="mb-4 text-slate-400 group-hover:text-emerald-400 transition-colors text-5xl">
                <i className="fa-solid fa-file-pdf"></i>
              </div>
              <h3 className="text-xl font-semibold mb-2 text-slate-100">Drop PDF to Analyze</h3>
              <p className="text-sm text-slate-400">Scan contracts, resumes, or manuals.</p>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="w-full px-8 text-center space-y-6">
            <div className={`${mode === 'link' ? 'text-red-500' : 'text-indigo-400'} text-5xl mb-2`}>
              <i className={`fa-solid ${mode === 'link' ? 'fa-brands fa-youtube' : 'fa-brands fa-github'}`}></i>
            </div>
            <h3 className="text-xl font-semibold text-slate-100">
              {mode === 'link' ? 'Sync Video Content' : 'Repo Onboarding'}
            </h3>
            <div className="relative">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mode === 'link' ? "Paste YouTube Link..." : "GitHub Repository URL..."}
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4 text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500/50"
              />
              <button 
                type="submit" 
                className={`absolute right-2 top-2 bottom-2 px-4 text-white rounded-xl text-xs font-bold uppercase transition-colors ${mode === 'link' ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
              >
                Connect
              </button>
            </div>
            <p className="text-xs text-slate-500 italic">Neural engine will map content via Deep Search Grounding.</p>
          </form>
        )}

        {isLoading && (
          <div className="absolute inset-0 bg-slate-900/60 rounded-3xl flex items-center justify-center backdrop-blur-sm z-10">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 border-4 border-slate-700 border-t-white rounded-full animate-spin`}></div>
              <span className="mt-4 font-medium animate-pulse text-slate-100 text-sm">{loadingMessage || 'Mapping Context...'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
