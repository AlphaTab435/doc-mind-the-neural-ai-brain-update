
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import { GroundingSource } from "../types";

const MODEL_NAME = 'gemini-3-flash-preview';

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Neural Terminal Key Missing. Ensure VITE_API_KEY is set in environment.");
  }
  return new GoogleGenAI({ apiKey });
};

// Robust retry wrapper for 429 (Rate Limit) errors
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.message?.includes('429') || error.status === 429)) {
      console.warn(`Rate limit hit. Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
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
        sources.push({ title: chunk.web.title || 'Web Source', uri: chunk.web.uri });
      }
    });
  }
  return sources;
};

export const generateSpeech = async (text: string) => {
  const ai = getAI();
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read this analysis: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Audio buffer empty.");
    return base64Audio;
  });
};

export const analyzeGithubRepo = async (url: string) => {
  const ai = getAI();
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `SEARCH AND ANALYZE: ${url}`,
      config: {
        systemInstruction: "You are an elite software auditor. You MUST use the googleSearch tool to fetch the README and file structure of this GitHub repo. Provide a summary of the stack, purpose, and entry points.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return {
      text: response.text || "Repository analysis successful.",
      sources: extractSources(response)
    };
  });
};

export const analyzeYouTubeLink = async (url: string) => {
  const ai = getAI();
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `FETCH AND SUMMARIZE VIDEO: ${url}`,
      config: {
        systemInstruction: "You are a video metadata specialist. You MUST use googleSearch to find the title, channel, and a content summary for this YouTube video. Be concise.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return {
      text: response.text || "Video synchronized.",
      sources: extractSources(response)
    };
  });
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
  const ai = getAI();
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: "Extract a professional 3-bullet summary." }
        ]
      },
      config: { 
        systemInstruction: "You are a high-speed document processing unit. Extract the core essence with absolute precision.",
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text || "Scan complete.";
  });
};

export async function* askQuestionStream(
  content: { base64?: string; type: 'pdf' | 'youtube' | 'github'; url?: string; mimeType?: string },
  question: string,
  history: { role: string; content: string }[],
  useSearch: boolean = false
) {
  const ai = getAI();
  const historyContents = history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const config: any = { 
    systemInstruction: "You are DOC-MIND. Answer questions based on the provided context. If the context is a URL, use search grounding to stay updated. Always be direct and technical.",
    temperature: 0.2,
    thinkingConfig: { thinkingBudget: 0 }
  };
  
  if (useSearch || content.type === 'youtube' || content.type === 'github') {
    config.tools = [{ googleSearch: {} }];
  }

  const parts: any[] = [];
  if (content.type === 'pdf' && content.base64) {
    parts.push({ inlineData: { data: content.base64, mimeType: content.mimeType } });
  }
  
  const contextPrefix = content.url ? `TARGET URL: ${content.url}\n` : '';
  parts.push({ text: `${contextPrefix}QUERY: ${question}` });

  try {
    const responseStream = await ai.models.generateContentStream({
      model: MODEL_NAME,
      contents: [...historyContents, { role: 'user', parts }],
      config
    });

    for await (const chunk of responseStream) {
      if (chunk.text) yield { text: chunk.text, sources: extractSources(chunk) };
    }
  } catch (err: any) {
    if (err.message?.includes('429')) {
      yield { text: "⚠️ Rate limit reached. The neural terminal is cooling down. Please wait 10 seconds before the next query.", sources: [] };
    } else {
      yield { text: "Connection error. Ensure the target is reachable and your API key is valid.", sources: [] };
    }
  }
}
