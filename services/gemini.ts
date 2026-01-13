
import { GoogleGenAI, Modality } from "@google/genai";
import { GroundingSource } from "../types";

// gemini-3-flash-preview is the most robust for high-frequency tasks
const LITE_MODEL = 'gemini-3-flash-preview';
const SEARCH_MODEL = 'gemini-3-flash-preview'; 

/**
 * Strictly uses process.env.API_KEY.
 */
const getAI = () => {
  const apiKey = (process as any).env.API_KEY;
  if (!apiKey) throw new Error("API_KEY_MISSING");
  return new GoogleGenAI({ apiKey });
};

/**
 * Enhanced retry logic for the free tier. 
 * Free tier is 15 RPM. If we hit 429, we must wait significantly.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 5, baseDelay = 5000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message || "";
    const isRateLimit = errorMsg.includes('429') || error.status === 429 || errorMsg.includes('RESOURCE_EXHAUSTED');
    
    if (retries > 0 && isRateLimit) {
      // Free tier requires patience. 5s, 10s, 15s...
      const retryCount = 6 - retries;
      const delay = baseDelay * retryCount + Math.random() * 2000;
      console.warn(`[429] Neural Congestion. Attempt ${retryCount}/5. Cooldown: ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, baseDelay);
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
      contents: `Perform brief architectural scan of: ${url}. List core features and tech stack.`,
      config: {
        systemInstruction: "You are a senior repo auditor. Use googleSearch strictly for README discovery. Conciseness is mandatory.",
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
      contents: `Quick summary of YouTube video: ${url}`,
      config: {
        systemInstruction: "You are a video agent. Use googleSearch to find metadata. Response limit: 100 words.",
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
          { text: "Brief 3-bullet summary." }
        ]
      },
      config: { 
        systemInstruction: "Technical document analyzer. No preamble.",
        temperature: 0.1
      }
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
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const activeModel = LITE_MODEL;
  const parts: any[] = [];
  if (content.type === 'pdf' && content.base64) {
    parts.push({ inlineData: { data: content.base64, mimeType: content.mimeType } });
  }
  
  const contextPrefix = content.url ? `TARGET: ${content.url}\n` : '';
  parts.push({ text: `${contextPrefix}INQUIRY: ${question}` });

  try {
    const ai = getAI();
    const responseStream = await ai.models.generateContentStream({
      model: activeModel,
      contents: [...historyContents, { role: 'user', parts }],
      config: {
        systemInstruction: "You are DOC-MIND. Technical precision only. Use Markdown.",
        temperature: 0.2,
        tools: (useSearch || content.type !== 'pdf') ? [{ googleSearch: {} }] : undefined
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) yield { text: chunk.text, sources: extractSources(chunk) };
    }
  } catch (err: any) {
    const errorMsg = err.message || "";
    const isRateLimit = errorMsg.includes('429') || err.status === 429 || errorMsg.includes('RESOURCE_EXHAUSTED');
    if (isRateLimit) {
      yield { text: "⚠️ SYSTEM COOLDOWN: Neural link is saturated (15 RPM Limit). Retrying automatically in a few seconds... If this persists, please use your own key.", sources: [] };
    } else {
      yield { text: "Neural link interrupted. Session expired or content restricted.", sources: [] };
    }
    throw err;
  }
}
