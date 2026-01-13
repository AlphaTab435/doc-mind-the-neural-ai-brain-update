
import React, { useState } from 'react';
import { ContentData } from '../types';
import { generateSpeech } from '../services/gemini';

interface ContentStatsProps {
  content: ContentData;
  onSelectQuery: (query: string) => void;
}

let sharedAudioContext: AudioContext | null = null;

export const DocumentStats: React.FC<ContentStatsProps> = ({ content, onSelectQuery }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const suggestedQueries = {
    pdf: ["Key takeaways", "Identify due dates", "Summarize risks"],
    youtube: ["Explain core message", "Action items", "Tone analysis"],
    github: ["Explain architecture", "Entry point location", "Folder responsibilities"]
  }[content.type];

  const handleSpeak = async () => {
    if (!content.summary || isSpeaking) return;
    try {
      setIsSpeaking(true);
      if (!sharedAudioContext) sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      else if (sharedAudioContext.state === 'suspended') await sharedAudioContext.resume();

      const base64Audio = await generateSpeech(content.summary.substring(0, 500));
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const dataInt16 = new Int16Array(bytes.buffer);
      const buffer = sharedAudioContext.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
      const source = sharedAudioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(sharedAudioContext.destination);
      source.onended = () => setIsSpeaking(false);
      source.start();
    } catch (err) {
      setIsSpeaking(false);
    }
  };

  const getYoutubeID = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const videoID = content.type === 'youtube' && content.url ? getYoutubeID(content.url) : null;
  const thumbnail = videoID ? `https://i3.ytimg.com/vi/${videoID}/hqdefault.jpg` : null;

  const colorClasses = {
    pdf: 'border-l-emerald-500 bg-emerald-500/20 text-emerald-500',
    youtube: 'border-l-red-500 bg-red-500/20 text-red-500',
    github: 'border-l-indigo-500 bg-indigo-500/20 text-indigo-500'
  };

  const iconClasses = {
    pdf: 'fa-file-pdf',
    youtube: 'fa-play',
    github: 'fa-code-branch'
  };

  return (
    <div className="space-y-6">
      <div className={`glass-panel rounded-2xl overflow-hidden border-l-4 ${colorClasses[content.type].split(' ')[0]}`}>
        {thumbnail && (
          <img src={thumbnail} alt="Video Preview" className="w-full h-32 object-cover opacity-60" />
        )}
        <div className="p-4 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[content.type].split(' ').slice(1).join(' ')}`}>
            <i className={`fa-solid ${iconClasses[content.type]} text-2xl`}></i>
          </div>
          <div className="overflow-hidden">
            <h3 className="font-bold text-slate-100 truncate text-sm">{content.name}</h3>
            <p className="text-xs text-slate-400 uppercase tracking-tighter">
              {content.type === 'pdf' ? 'Document Context' : content.type === 'youtube' ? 'Video Sync' : 'Repo Onboarding'}
            </p>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4 relative">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 ${colorClasses[content.type].split(' ').pop()}`}>
            <i className="fa-solid fa-wand-magic-sparkles"></i>
            <h4 className="text-xs font-bold uppercase tracking-widest">Brain Summary</h4>
          </div>
          {content.summary && (
            <button 
              onClick={handleSpeak}
              disabled={isSpeaking}
              className={`text-[10px] flex items-center gap-2 px-2 py-1 rounded-lg border transition-all ${
                isSpeaking ? 'bg-slate-100 text-slate-900' : 'text-slate-400 border-slate-700 hover:border-slate-500'
              }`}
            >
              <i className={`fa-solid ${isSpeaking ? 'fa-volume-high animate-pulse' : 'fa-play'}`}></i>
              {isSpeaking ? 'Speaking' : 'Read'}
            </button>
          )}
        </div>
        
        <div className="prose prose-invert prose-sm text-slate-300 max-h-64 overflow-y-auto custom-scrollbar pr-2 whitespace-pre-wrap">
          <div className="text-sm leading-relaxed">{content.summary || 'Synthesizing context...'}</div>
        </div>

        <div className="pt-4 border-t border-slate-700">
          <div className="flex flex-wrap gap-2">
            {suggestedQueries.map(q => (
              <button 
                key={q} 
                onClick={() => onSelectQuery(q)}
                className={`px-2 py-1 bg-slate-800/50 border border-slate-700 rounded text-[10px] text-slate-400 transition-all hover:bg-slate-700 hover:text-white`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
