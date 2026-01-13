
import { GoogleGenAI, Modality } from "@google/genai";
import { GroundingSource } from "../types";

const LITE_MODEL = 'gemini-flash-lite-latest';
const SEARCH_MODEL = 'gemini-3-pro-preview';

/**
 * Creates a fresh AI instance.
 * Always call this right before an API request to ensure the latest API key is used.
 */
const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey });
};

async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 4000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error.message?.includes('429') || error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED');
    if (retries > 0 && isRateLimit) {
      const delay = baseDelay + Math.random() * 2000;
      console.warn(`Quota limit reached. Retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
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
        sources.push({ title: chunk.web.title || 'Verified Web Link', uri: chunk.web.uri });
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
      contents: `Perform architectural scan of GitHub repo: ${url}`,
      config: {
        systemInstruction: "You are a senior repo auditor. Use googleSearch to find the README and project structure. Respond in technical bullet points.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1
      }
    });
    return {
      text: response.text || "Scanning complete.",
      sources: extractSources(response)
    };
  });
};

export const analyzeYouTubeLink = async (url: string) => {
  return withRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: SEARCH_MODEL,
      contents: `Neural synchronization of YouTube video: ${url}`,
      config: {
        systemInstruction: "You are a video intelligence agent. Use googleSearch to identify the video title and core topics.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1
      }
    });
    return {
      text: response.text || "Video synchronized.",
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
          { text: "Briefly summarize the main points." }
        ]
      },
      config: { 
        systemInstruction: "Document analysis engine. Provide 3 core bullets.",
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

  const activeModel = (useSearch || content.type !== 'pdf') ? SEARCH_MODEL : LITE_MODEL;

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
        systemInstruction: "You are DOC-MIND. Respond with absolute technical precision.",
        temperature: 0.2,
        tools: (useSearch || content.type !== 'pdf') ? [{ googleSearch: {} }] : undefined
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) yield { text: chunk.text, sources: extractSources(chunk) };
    }
  } catch (err: any) {
    const isRateLimit = err.message?.includes('429') || err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED');
    if (isRateLimit) {
      yield { text: "⚠️ QUOTA EXHAUSTED: This shared key has reached its limit. Please click 'Switch Neural Key' in the top bar to use your own key.", sources: [] };
    } else {
      yield { text: "Neural link interrupted. This usually occurs if the source link is restricted or grounding takes too long.", sources: [] };
    }
    throw err;
  }
}
