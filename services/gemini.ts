
import { GoogleGenAI, Modality } from "@google/genai";
import { GroundingSource } from "../types";

const LITE_MODEL = 'gemini-3-flash-preview';
const SEARCH_MODEL = 'gemini-3-flash-preview'; 

const getAI = () => {
  if (!process.env.API_KEY) throw new Error("API_KEY_MISSING");
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelay = 5000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = (error.message || "").toLowerCase();
    const status = error.status || 0;
    
    // Check for Daily Quota (RPD)
    // The API returns "exceeded your current quota" for daily limits on the free tier.
    if (status === 429 && (
      errorMsg.includes('daily') || 
      errorMsg.includes('day') || 
      errorMsg.includes('quota exhausted') || 
      errorMsg.includes('exceeded your current quota')
    )) {
      const dailyErr = new Error("DAILY_QUOTA_EXHAUSTED");
      (dailyErr as any).status = 429;
      throw dailyErr;
    }

    // Standard Rate Limit (RPM)
    const isRateLimit = errorMsg.includes('429') || status === 429;
    
    if (retries > 0 && isRateLimit) {
      await new Promise(resolve => setTimeout(resolve, baseDelay));
      return withRetry(fn, retries - 1, baseDelay * 2);
    }
    throw error;
  }
}

const extractSources = (response: any): GroundingSource[] => {
  const sources: GroundingSource[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    chunks.forEach((chunk: any) => {
      if (chunk.web) {
        sources.push({ title: chunk.web.title || 'Source Verified', uri: chunk.web.uri });
      }
    });
  }
  return sources;
};

export const generateSpeech = async (text: string) => {
  return withRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Neural Readout: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("AUDIO_EMPTY");
    return base64Audio;
  });
};

export const analyzeGithubRepo = async (url: string) => {
  return withRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: SEARCH_MODEL,
      contents: `Architectural analysis for: ${url}`,
      config: {
        systemInstruction: "You are a senior systems architect. Provide high-level technical metadata. Use Search grounding only to identify core tech stack.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1
      }
    });
    return {
      text: response.text || "Scan complete.",
      sources: extractSources(response)
    };
  });
};

export const analyzeYouTubeLink = async (url: string) => {
  return withRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: SEARCH_MODEL,
      contents: `Summarize video context: ${url}`,
      config: {
        systemInstruction: "Video analyst. Concise technical summary.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1
      }
    });
    return {
      text: response.text || "Sync complete.",
      sources: extractSources(response)
    };
  });
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
  return withRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: LITE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: "Provide a 3-bullet summary." }
        ]
      },
      config: { systemInstruction: "Document analyst.", temperature: 0.1 }
    });
    return response.text || "Analysis complete.";
  });
};

export async function* askQuestionStream(
  content: { base64?: string; type: 'pdf' | 'youtube' | 'github'; url?: string; mimeType?: string },
  question: string,
  history: { role: string; content: string }[],
  useSearch: boolean = false
) {
  const historyContents = history.map(msg => ({
    role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const parts: any[] = [];
  if (content.type === 'pdf' && content.base64) {
    parts.push({ inlineData: { data: content.base64, mimeType: content.mimeType } });
  }
  
  const contextPrefix = content.url ? `CONTEXT_URL: ${content.url}\n` : '';
  parts.push({ text: `${contextPrefix}INQUIRY: ${question}` });

  try {
    const ai = getAI();
    const responseStream = await ai.models.generateContentStream({
      model: LITE_MODEL,
      contents: [...historyContents, { role: 'user', parts }],
      config: {
        systemInstruction: "You are DOC-MIND. Precise technical markdown.",
        temperature: 0.2,
        tools: useSearch ? [{ googleSearch: {} }] : undefined
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) yield { text: chunk.text, sources: extractSources(chunk) };
    }
  } catch (err: any) {
    const errorMsg = (err.message || "").toLowerCase();
    
    if (errorMsg.includes('daily') || errorMsg.includes('day') || errorMsg.includes('quota exhausted') || errorMsg.includes('exceeded your current quota')) {
       yield { 
        text: "🛑 **DAILY NEURAL EXHAUSTION**: You have used 100% of your Gemini API daily quota (RPD). \n\n**Next Steps:** \n1. Wait until Midnight Pacific Time for reset.\n2. Or, toggle 'Search Off' to continue chatting without grounding.", 
        sources: [] 
      };
    } else if (err.status === 429) {
      yield { 
        text: "⏳ **MINUTE LIMIT REACHED (RPM)**: Your 60-second window is currently full. \n\n**Solution:** \n1. Wait 60 seconds for the buffer to clear.", 
        sources: [] 
      };
    }
    throw err;
  }
}
