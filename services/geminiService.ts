
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Scene, GenerationMode } from "../types";

export class GeminiService {
  // Always create a new GoogleGenAI instance right before making an API call to ensure the most up-to-date API key is used.
  
  static async parseScript(rawScript: string): Promise<Scene[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Parse the following video script into a JSON array of scenes. 
      Format each scene with: 
      - id (string)
      - startTime (number, in seconds)
      - endTime (number, in seconds)
      - voiceover (string)
      - visualPrompt (string)
      
      Script:
      ${rawScript}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              startTime: { type: Type.NUMBER },
              endTime: { type: Type.NUMBER },
              voiceover: { type: Type.STRING },
              visualPrompt: { type: Type.STRING }
            },
            required: ["id", "startTime", "endTime", "voiceover", "visualPrompt"]
          }
        }
      }
    });

    try {
      // Use .text property to access generated content.
      const text = response.text || "[]";
      return JSON.parse(text.trim());
    } catch (e) {
      console.error("Failed to parse script", e);
      return [];
    }
  }

  static async generateVisual(prompt: string, mode: GenerationMode): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    if (mode === GenerationMode.VIDEO) {
      // Use Veo for video generation.
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '9:16'
        }
      });
      
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      // Append API key when fetching from the download link.
      const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      const blob = await videoResponse.blob();
      return URL.createObjectURL(blob);
    } else {
      // Use gemini-2.5-flash-image for general image generation tasks.
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `A cinematic 9:16 vertical high quality visual for a reel: ${prompt}` }]
        },
        config: {
          imageConfig: { aspectRatio: "9:16" }
        }
      });

      // Iterate through candidates and parts to find the image part.
      for (const candidate of response.candidates || []) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
      }
      throw new Error("No image data found in response");
    }
  }

  static async generateAudio(text: string): Promise<{ url: string, duration: number }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    // Extract raw PCM audio data from response.
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");

    const bytes = this.decodeBase64Audio(base64Audio);

    // Create a Blob from the PCM bytes.
    const blob = new Blob([bytes], { type: 'audio/pcm' });
    const url = URL.createObjectURL(blob);
    
    // Approximation for duration (24kHz, 16-bit mono PCM).
    const duration = bytes.length / (24000 * 2);

    return { url, duration };
  }

  // Implementation of base64 decoding for raw bytes as recommended by guidelines.
  static decodeBase64Audio(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Helper to wrap raw PCM in a WAV header for browser playback compatibility in <audio> tags.
  static async pcmToWavBlob(pcmData: Uint8Array, sampleRate: number = 24000): Promise<Blob> {
    const buffer = new ArrayBuffer(44 + pcmData.length);
    const view = new DataView(buffer);

    // RIFF identifier
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + pcmData.length, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // format chunk identifier
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);

    // data chunk identifier
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, pcmData.length, true);

    // write PCM data
    for (let i = 0; i < pcmData.length; i++) {
      view.setUint8(44 + i, pcmData[i]);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}
