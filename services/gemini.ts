import { GoogleGenAI, Modality } from "@google/genai";
import { GroundingSource } from "../types";

// Using Gemini 3 Flash for the best balance of tool usage and speed
const MODEL_NAME = 'gemini-3-flash-preview';

const getAI = () => {
  if (!process.env.API_KEY) throw new Error("API_KEY_MISSING");
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Intelligent Retry & Fallback Wrapper
 * Handles Rate Limiting (RPM) which is the primary cause of 429 errors on free tiers.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 1, baseDelay = 1500): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = (error.message || "").toLowerCase();
    const status = error.status || 0;
    
    // 429 is the 'Quota Exceeded' error usually caused by Minute Limits (RPM)
    if (status === 429) {
      // If it's specifically a search tool quota, we let the caller handle the fallback
      if (errorMsg.includes('search') || errorMsg.includes('grounding') || errorMsg.includes('tool')) {
        const toolErr = new Error("TOOL_LIMIT");
        (toolErr as any).status = 429;
        throw toolErr;
      }
      
      // Otherwise, try a brief exponential backoff
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, baseDelay));
        return withRetry(fn, retries - 1, baseDelay * 2);
      }
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
        sources.push({ title: chunk.web.title || 'Verified Resource', uri: chunk.web.uri });
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

/**
 * Universal Analyzer with Neural Fallback Strategy
 * Tries Grounded Search first, falls back to Internal Reasoning if Tool Quota (RPM) is hit.
 */
const internalAnalyze = async (url: string, type: 'youtube' | 'github', attemptWithSearch: boolean = true) => {
  const ai = getAI();
  const systemPrompt = type === 'github' 
    ? "Senior Systems Architect. Analyze the provided GitHub repo URL. Use technical knowledge to describe architecture and purpose."
    : "Video Intelligence Analyst. Analyze the YouTube URL and provide a detailed summary of likely content and key takeaways.";

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `SOURCE_URL: ${url}\nPerform a deep technical scan.`,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1,
        tools: attemptWithSearch ? [{ googleSearch: {} }] : undefined
      }
    });
    return {
      text: response.text || "Scan complete.",
      sources: extractSources(response)
    };
  } catch (error: any) {
    // If we hit a tool-specific quota or grounding isn't available, we FALLBACK to model-only reasoning
    if (attemptWithSearch && (error.status === 429 || error.message?.toLowerCase().includes('search'))) {
      console.warn(`[DOC-MIND] Tool RPM reached. Switching to Neural Fallback for: ${url}`);
      return internalAnalyze(url, type, false);
    }
    throw error;
  }
};

export const analyzeGithubRepo = async (url: string) => {
  return withRetry(() => internalAnalyze(url, 'github'));
};

export const analyzeYouTubeLink = async (url: string) => {
  return withRetry(() => internalAnalyze(url, 'youtube'));
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
  return withRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: "Provide a high-density, 3-bullet summary of this document." }
        ]
      },
      config: { systemInstruction: "Precision Document Intelligence Agent.", temperature: 0.1 }
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
      model: MODEL_NAME,
      contents: [...historyContents, { role: 'user', parts }],
      config: {
        systemInstruction: "You are DOC-MIND, an elite AI brain. Answer with technical precision using Markdown. Be helpful and concise.",
        temperature: 0.2,
        tools: useSearch ? [{ googleSearch: {} }] : undefined
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) yield { text: chunk.text, sources: extractSources(chunk) };
    }
  } catch (err: any) {
    // If the tool is blocked during a stream, pivot to non-search and continue
    if (useSearch && (err.status === 429 || err.message?.toLowerCase().includes('search'))) {
      yield { text: "\n\n*(Neural Fallback Active: Search Tool Rate-Limited)*\n\n", sources: [] };
      const ai = getAI();
      const retryStream = await ai.models.generateContentStream({
        model: MODEL_NAME,
        contents: [...historyContents, { role: 'user', parts }],
        config: { systemInstruction: "DOC-MIND Neural Reasoning (Internal Mode).", temperature: 0.2 }
      });
      for await (const chunk of retryStream) {
        if (chunk.text) yield { text: chunk.text, sources: [] };
      }
    } else {
      throw err;
    }
  }
}
