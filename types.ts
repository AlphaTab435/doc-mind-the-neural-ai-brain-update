
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ContentData {
  name: string;
  size?: string;
  type: 'pdf' | 'youtube' | 'github';
  base64?: string; // For PDFs
  url?: string;    // For YouTube/GitHub
  summary?: string;
  thumbnail?: string;
}

export enum AnalysisStatus {
  IDLE = 'idle',
  UPLOADING = 'uploading',
  ANALYZING = 'analyzing',
  READY = 'ready',
  ERROR = 'error'
}
