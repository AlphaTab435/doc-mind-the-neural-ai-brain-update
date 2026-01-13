
import { GoogleGenAI, Modality } from "@google/genai";
import { GroundingSource } from "../types";

const LITE_MODEL = 'gemini-3-flash-preview';
const SEARCH_MODEL = 'gemini-3-flash-preview'; 

const getAI = () => {
  const apiKey = (process as any).env?.API_KEY || (import.meta as any).env?.VITE_API_KEY;
  if (!apiKey) throw new Error("API_KEY_MISSING");
  return new GoogleGenAI({ apiKey });
};

/**
 * Robust retry logic for the free tier. 
 * Free tier is 15 RPM. 
 * If a 429 is hit, we wait 15s base to ensure the window clears.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 5, baseDelay = 15000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message || "";
    const isRateLimit = errorMsg.includes('429') || error.status === 429 || errorMsg.includes('RESOURCE_EXHAUSTED');
    
    if (retries > 0 && isRateLimit) {
      const retryCount = 6 - retries;
      const delay = baseDelay * retryCount + Math.random() * 2000;
      console.warn(`[429] Neural link congested. Retrying (${retryCount}/5) in ${Math.round(delay)}ms...`);
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
        sources.push({ title: chunk.web.title || 'Verified Source', uri: chunk.web.uri });
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
      contents: `Quick architectural scan: ${url}. List core tech stack and 3 main features.`,
      config: {
        systemInstruction: "You are a repository indexer. Provide technical metadata only. NO CONVERSATION.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 }
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
      contents: `Summary of video context: ${url}`,
      config: {
        systemInstruction: "You are a video metadata agent. Summarize core topics. NO FILLER.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 }
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
          { text: "Provide a 3-bullet summary of the core message." }
        ]
      },
      config: { 
        systemInstruction: "Document analyst. Technical only. No conversational filler. No search tools needed.",
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 }
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
    role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const parts: any[] = [];
  if (content.type === 'pdf' && content.base64) {
    parts.push({ inlineData: { data: content.base64, mimeType: content.mimeType } });
  }
  
  const contextPrefix = content.url ? `TARGET: ${content.url}\n` : '';
  parts.push({ text: `${contextPrefix}INQUIRY: ${question}` });

  try {
    const ai = getAI();
    const responseStream = await ai.models.generateContentStream({
      model: LITE_MODEL,
      contents: [...historyContents, { role: 'user', parts }],
      config: {
        systemInstruction: "You are DOC-MIND. Technical precision is required. Use Markdown.",
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
      yield { text: "⚠️ COOLDOWN: Neural link saturated (Gemini RPM Limit). System is backing off to clear the window...", sources: [] };
    } else {
      yield { text: "Neural connection interrupted. This often happens due to content safety filters.", sources: [] };
    }
    throw err;
  }
}
