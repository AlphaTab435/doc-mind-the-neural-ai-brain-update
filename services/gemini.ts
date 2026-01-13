import { GoogleGenAI, Modality } from "@google/genai";

// Standardizing on Flash for maximum speed and reliable tool usage
const MODEL_NAME = 'gemini-3-flash-preview';

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Neural Terminal Key Missing. Ensure VITE_API_KEY is set in environment.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateSpeech = async (text: string) => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `System Message: Read the following clearly and naturally: ${text}` }] }],
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
  } catch (error) {
    console.error("Neural Voice Error:", error);
    throw error;
  }
};

export const analyzeGithubRepo = async (url: string) => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Perform a deep neural scan of this repository: ${url}`,
      config: {
        systemInstruction: "You are a senior software architect with real-time web access. You MUST use the googleSearch tool to browse the provided GitHub URL. Summarize the stack, architecture, and purpose based ONLY on the live repository data.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text || "Neural mapping complete. Repository context indexed.";
  } catch (error: any) {
    console.error("Repo Error:", error);
    throw new Error("Repository link failed. Check if the repo is public and the URL is correct.");
  }
};

export const analyzeYouTubeLink = async (url: string) => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Synchronize and analyze this video: ${url}`,
      config: {
        systemInstruction: "You are a video intelligence agent. You MUST use the googleSearch tool to fetch metadata and content details for the provided YouTube URL. Provide the video title, channel, and a 3-point core summary.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text || "Video context synchronized.";
  } catch (error: any) {
    console.error("YouTube Error:", error);
    throw new Error("YouTube integration failed. The neural search tool could not reach the content.");
  }
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: "Extract a concise 3-bullet point summary of this document." }
        ]
      },
      config: { 
        systemInstruction: "You are an elite document analyst. Provide high-density summaries with zero fluff.",
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text || "Scan successful.";
  } catch (error: any) {
    console.error("PDF Error:", error);
    throw new Error("Document neural scan failed.");
  }
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
    systemInstruction: "You are DOC-MIND, a super-intelligent neural brain. Use the provided context (PDF or Search results) to answer precisely. If the user asks about something external and grounding is enabled, use the search tool.",
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
  
  const contextPrefix = content.url ? `TARGET: ${content.url}\nCONTEXT_TYPE: ${content.type}\n` : '';
  parts.push({ text: `${contextPrefix}INQUIRY: ${question}` });

  try {
    const responseStream = await ai.models.generateContentStream({
      model: MODEL_NAME,
      contents: [...historyContents, { role: 'user', parts }],
      config
    });

    for await (const chunk of responseStream) {
      if (chunk.text) yield chunk.text;
    }
  } catch (err: any) {
    console.error("Stream Error:", err);
    yield "Neural connection unstable. This can happen if the grounding search takes too long or the link is restricted.";
  }
}