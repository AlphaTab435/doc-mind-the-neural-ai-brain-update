
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

export const generateSpeech = async (text: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say naturally: ${text}` }] }],
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
    if (!base64Audio) throw new Error("No audio data received");
    return base64Audio;
  } catch (error) {
    throw error;
  }
};

export const analyzeGithubRepo = async (url: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Explicitly command the model to use the tool
  const prompt = `I need you to use the googleSearch tool to fetch and analyze the content of this GitHub repository: ${url}. 
  Do not guess. Use the search tool to find the README, file structure, and main purpose.
  Provide a professional summary:
  1. Primary Programming Languages
  2. Core Tech Stack
  3. High-level architecture (Monolith, Microservices, etc.)
  4. Project Goal.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    return response.text || "Neural mapping complete. You can now ask questions about this codebase.";
  } catch (error: any) {
    console.error("Repo Analysis Error:", error);
    throw new Error("Repository analysis failed. Ensure it is a public repository.");
  }
};

export const analyzeYouTubeLink = async (url: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Explicitly command the model to use the tool
  const prompt = `I need you to use the googleSearch tool to retrieve details about this YouTube video: ${url}.
  Do not guess. Fetch the title, channel name, and a summary of the topics discussed.
  Provide:
  - Video Title & Author
  - 3-5 Main takeaways from the content.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    return response.text || "Video synchronized. Brain terminal is ready for queries.";
  } catch (error: any) {
    console.error("YouTube Analysis Error:", error);
    throw new Error("YouTube integration failed. Check the URL and try again.");
  }
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Perform a high-speed neural scan of this document. Provide 3 core bullet points summarizing its content and purpose.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: prompt }
        ]
      }
    });
    return response.text || "";
  } catch (error: any) {
    throw new Error("Document analysis failed.");
  }
};

export async function* askQuestionStream(
  content: { base64?: string; type: 'pdf' | 'youtube' | 'github'; url?: string; mimeType?: string },
  question: string,
  history: { role: string; content: string }[],
  useSearch: boolean = false
) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const historyContents = history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const config: any = { temperature: 0.1 };
  // URLs ALWAYS require search grounding for context updates
  if (useSearch || content.type === 'youtube' || content.type === 'github') {
    config.tools = [{ googleSearch: {} }];
  }

  const parts: any[] = [];
  if (content.type === 'pdf' && content.base64) {
    parts.push({ inlineData: { data: content.base64, mimeType: content.mimeType } });
  }
  
  const contextHeader = content.url ? `SOURCE URL: ${content.url}\n` : '';
  parts.push({ text: `${contextHeader}Analyze the context and answer: ${question}` });

  const responseStream = await ai.models.generateContentStream({
    model: 'gemini-3-pro-preview',
    contents: [...historyContents, { role: 'user', parts }],
    config
  });

  for await (const chunk of responseStream) {
    const text = chunk.text;
    if (text) yield text;
  }
}
