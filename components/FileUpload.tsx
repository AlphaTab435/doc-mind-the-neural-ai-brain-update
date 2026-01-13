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
    <div className="w-full max-w-xl mx-auto space-y-4 md:space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="flex p-1 bg-slate-900/80 rounded-xl md:rounded-2xl border border-slate-700 w-full sm:w-fit mx-auto overflow-hidden">
        <button 
          onClick={() => { setMode('file'); setInput(''); }}
          className={`flex-1 sm:flex-none px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'file' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          PDF
        </button>
        <button 
          onClick={() => { setMode('link'); setInput(''); }}
          className={`flex-1 sm:flex-none px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'link' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          YouTube
        </button>
        <button 
          onClick={() => { setMode('repo'); setInput(''); }}
          className={`flex-1 sm:flex-none px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'repo' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
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
        className={`relative h-56 md:h-64 w-full rounded-2xl md:rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center
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
            <div className="text-center p-4 md:p-6 pointer-events-none">
              <div className="mb-3 md:mb-4 text-slate-400 group-hover:text-emerald-400 transition-colors text-4xl md:text-5xl">
                <i className="fa-solid fa-file-pdf"></i>
              </div>
              <h3 className="text-lg md:text-xl font-semibold mb-1 md:mb-2 text-slate-100">Drop PDF</h3>
              <p className="text-[10px] md:text-sm text-slate-400">Contracts, Resumes, or Manuals.</p>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="w-full px-6 md:px-8 text-center space-y-4 md:space-y-6">
            <div className={`${mode === 'link' ? 'text-red-500' : 'text-indigo-400'} text-4xl md:text-5xl mb-1`}>
              <i className={`fa-solid ${mode === 'link' ? 'fa-brands fa-youtube' : 'fa-brands fa-github'}`}></i>
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-slate-100">
              {mode === 'link' ? 'Video Context' : 'Repo Onboarding'}
            </h3>
            <div className="relative">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mode === 'link' ? "YouTube Link..." : "GitHub URL..."}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 text-[13px] md:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500/50"
              />
              <button 
                type="submit" 
                className={`absolute right-1.5 top-1.5 bottom-1.5 px-3 md:px-4 text-white rounded-lg md:rounded-xl text-[10px] font-bold uppercase transition-colors ${mode === 'link' ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
              >
                Sync
              </button>
            </div>
            <p className="text-[8px] md:text-[10px] text-slate-500 italic">Neural engine will map content via Deep Search.</p>
          </form>
        )}

        {isLoading && (
          <div className="absolute inset-0 bg-slate-900/60 rounded-2xl md:rounded-3xl flex items-center justify-center backdrop-blur-sm z-10">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 border-3 border-slate-700 border-t-white rounded-full animate-spin`}></div>
              <span className="mt-4 font-medium animate-pulse text-slate-100 text-[10px] md:text-sm px-4 text-center">{loadingMessage || 'Mapping Context...'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};