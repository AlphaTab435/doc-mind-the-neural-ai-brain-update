import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

// Standardizing on process.env.API_KEY as per GenAI guidelines
// Removed local getAIClient and reference to vite/client to resolve environment typing issues

export const generateSpeech = async (text: string) => {
  // Initialize AI client right before use as per guidelines
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
    // response.text is a property, but for AUDIO we extract from inlineData
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data received");
    return base64Audio;
  } catch (error) {
    throw error;
  }
};

export const analyzeGithubRepo = async (url: string) => {
  // Initialize AI client right before use
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Perform a deep architecture analysis of this GitHub repo: ${url}. 
  Describe:
  1. High-level architecture (Monolith, Microservices, etc.)
  2. Tech stack identified
  3. Key folder responsibilities
  4. Where major logic (Auth, API, UI) is likely located.
  Keep it professional and structured for a new developer onboarding.`;
  
  try {
    // Use gemini-3-pro-preview for complex reasoning tasks like architecture analysis
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    // Accessing text as a property, not a method
    return response.text || "";
  } catch (error: any) {
    throw new Error("Repository analysis failed. Ensure it is a public repo.");
  }
};

export const analyzeYouTubeLink = async (url: string) => {
  // Initialize AI client right before use
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Analyze this YouTube video: ${url}. Provide a concise summary: title, channel name, and 3 key takeaways based on your search grounding or knowledge. No fluff.`;
  
  try {
    // Use gemini-3-flash-preview for basic summarization tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    // Accessing text as a property
    return response.text || "";
  } catch (error: any) {
    throw new Error("Video integration failed.");
  }
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
  // Initialize AI client right before use
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Quickly summarize this doc: type, main purpose, 3 bullet points. No fluff.`;
  try {
    // Basic text task uses flash model
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: prompt }
        ]
      }
    });
    // Accessing text as a property
    return response.text || "";
  } catch (error: any) {
    throw new Error("Analysis failed.");
  }
};

export async function* askQuestionStream(
  content: { base64?: string; type: 'pdf' | 'youtube' | 'github'; url?: string; mimeType?: string },
  question: string,
  history: { role: string; content: string }[],
  useSearch: boolean = false
) {
  // Initialize AI client right before use
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const historyContents = history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const config: any = { temperature: 0.1 };
  // Search grounding tool is enabled for web-based content or explicit user request
  if (useSearch || content.type === 'youtube' || content.type === 'github') {
    config.tools = [{ googleSearch: {} }];
  }

  const parts: any[] = [];
  if (content.type === 'pdf' && content.base64) {
    parts.push({ inlineData: { data: content.base64, mimeType: content.mimeType } });
  }
  
  const contextPrefix = {
    pdf: "Document analysis active.",
    youtube: `YouTube Video analysis (${content.url}) via Search Grounding.`,
    github: `GitHub Repository Onboarding (${content.url}) via Search Grounding.`
  }[content.type];

  parts.push({ text: `${contextPrefix} User Question: ${question}` });

  // Use gemini-3-pro-preview for high-quality complex reasoning in conversation
  const responseStream = await ai.models.generateContentStream({
    model: 'gemini-3-pro-preview',
    contents: [...historyContents, { role: 'user', parts }],
    config
  });

  for await (const chunk of responseStream) {
    // Accessing chunk.text as a property in the stream
    const text = chunk.text;
    if (text) yield text;
  }
}