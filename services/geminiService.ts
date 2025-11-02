
import { GoogleGenAI, Modality, Chat, GenerateContentResponse, GenerateContentStreamResult, Operation, GenerateVideosResponse } from "@google/genai";

// This file assumes `process.env.API_KEY` is available globally.
// In a real application, you might manage this differently, but per instructions, we use it directly.

export const getAiClient = () => {
  if (!process.env.API_KEY) {
    // This is a fallback for local development if the key isn't set.
    // The main app logic will handle prompting the user to select a key for Veo.
    console.warn("API_KEY environment variable not set.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY! });
};

export const createChatSession = (): Chat => {
  const ai = getAiClient();
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      tools: [{ googleSearch: {} }],
    },
  });
};

export const streamChat = (chat: Chat, prompt: string): Promise<GenerateContentStreamResult> => {
  return chat.sendMessageStream({ message: prompt });
};

export const generateImage = async (prompt: string, aspectRatio: string): Promise<string> => {
  const ai = getAiClient();
  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt,
    config: {
      numberOfImages: 1,
      outputMimeType: 'image/jpeg',
      aspectRatio,
    },
  });

  const base64ImageBytes = response.generatedImages[0].image.imageBytes;
  return `data:image/jpeg;base64,${base64ImageBytes}`;
};

export const editImage = async (prompt: string, image: { data: string; mimeType: string }): Promise<string> => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                {
                    inlineData: {
                        data: image.data,
                        mimeType: image.mimeType,
                    },
                },
                {
                    text: prompt,
                },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
    throw new Error("No image generated from edit.");
};

export const generateVideo = async (prompt: string, image: { data: string; mimeType: string }, aspectRatio: '16:9' | '9:16'): Promise<Operation<GenerateVideosResponse>> => {
  const ai = getAiClient();
  return await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt,
    image: {
      imageBytes: image.data,
      mimeType: image.mimeType,
    },
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio,
    }
  });
};


export const checkVideoStatus = async (operation: Operation<GenerateVideosResponse>): Promise<Operation<GenerateVideosResponse>> => {
    const ai = getAiClient();
    return await ai.operations.getVideosOperation({ operation });
};
