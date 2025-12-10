import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { AnalysisResult } from "../types";

// Helper to encode ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to decode Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export class GeminiService {
  // Retry wrapper for API calls to handle 429 (Rate Limit) and 5xx (Server) errors
  private async withRetry<T>(operation: () => Promise<T>, retries = 6, initialDelay = 5000): Promise<T> {
    let lastError: any;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Extract status from various potential locations in the error object structure
        // Checks: top level, inside 'error', inside 'response', etc.
        const status = 
            error?.status || 
            error?.code || 
            error?.error?.code || 
            error?.error?.status ||
            error?.response?.status;
        
        // Safely extract message for detection
        let message = "Unknown error";
        try {
            message = error?.message || error?.error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
        } catch (e) {
            message = "Non-serializable error object";
        }
        
        const isRateLimit = status === 429 || message.includes('429') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED');
        const isServerError = (status >= 500 && status < 600) || message.includes('Internal error') || message.includes('INTERNAL');
        
        if ((isRateLimit || isServerError) && i < retries - 1) {
          // Exponential backoff with longer delays: 5s, 10s, 20s, 40s, 80s...
          const delay = initialDelay * Math.pow(2, i); 
          console.warn(`API Error (${status || 'Unknown'}). Retrying in ${delay/1000}s... (Attempt ${i + 1}/${retries})`, message);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
    throw lastError;
  }

  async analyzeImage(file: File, duration: number = 15): Promise<{ analysis: AnalysisResult; script: string }> {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key missing. Please restart the app or select a key.");
    
    // Create client instance per request
    const client = new GoogleGenAI({ apiKey });

    const arrayBuffer = await file.arrayBuffer();
    const base64Image = arrayBufferToBase64(arrayBuffer);

    const prompt = `
      Act as an expert advertising creative director for the Mexican market. 
      Analyze this image (flyer, banner, or product photo).
      
      1. Identify the main Headline, colors (hex codes), mood, and key products.
      2. Write a highly engaging, ${duration}-second radio/video spot script in Mexican Spanish.
         - The script should be catchy, professional, and drive sales.
         - Do not include scene directions like [Music starts], just the spoken text.
         - Use local Mexican nuance if appropriate for the visual context.
         - IMPORTANT: The length of the text must correspond to approximately ${duration} seconds of speaking time.
      
      Return the response in JSON format.
    `;

    // Wrap API call with retry
    const response = await this.withRetry<GenerateContentResponse>(() => client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.type,
              data: base64Image,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            brandColors: { type: Type.ARRAY, items: { type: Type.STRING } },
            mood: { type: Type.STRING },
            detectedProducts: { type: Type.ARRAY, items: { type: Type.STRING } },
            script: { type: Type.STRING, description: "The generated advertising script text" },
          },
          required: ["headline", "brandColors", "mood", "script"],
        },
      },
    }));

    // Clean any potential markdown wrapping which can sometimes occur
    const jsonText = response.text ? response.text.replace(/```json|```/g, "").trim() : "{}";
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse JSON response:", jsonText);
      data = {
         headline: "Oferta Especial",
         brandColors: ["#ffffff"],
         mood: "Energetic",
         detectedProducts: [],
         script: "No se pudo generar el guion automáticamente."
      };
    }

    return {
      analysis: {
        headline: data.headline || "Promo",
        brandColors: data.brandColors || [],
        mood: data.mood || "Neutral",
        detectedProducts: data.detectedProducts || [],
      },
      script: data.script || "",
    };
  }

  async rewriteScript(analysis: AnalysisResult, duration: number): Promise<string> {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key missing");
    
    // Create client instance per request
    const client = new GoogleGenAI({ apiKey });

    const prompt = `
      Act as an expert copywriter for the Mexican market.
      Based on the following analysis of a product/image:
      - Headline: ${analysis.headline}
      - Products: ${analysis.detectedProducts.join(', ')}
      - Mood: ${analysis.mood}

      Write a new advertising script in Mexican Spanish that fits exactly ${duration} seconds when read aloud.
      - Make it punchy, persuasive, and natural.
      - Return ONLY the raw script text. No JSON, no markdown, no labels like "Script:".
    `;

    // Wrap API call with retry
    const response = await this.withRetry<GenerateContentResponse>(() => client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ text: prompt }]
    }));

    return response.text ? response.text.trim() : "";
  }

  async generateSpeech(text: string, voiceName: string, styleInstruction: string = "Speak naturally."): Promise<ArrayBuffer> {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key missing");
    
    const client = new GoogleGenAI({ apiKey });

    const makeRequest = (instruction?: string) => {
        // Build config conditionally
        const config: any = {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceName },
                },
            },
        };

        // Only add systemInstruction if it's meaningful. 
        // Sending complex system instructions to the preview TTS model can cause 500 errors.
        if (instruction && instruction !== "Speak naturally." && instruction.trim() !== "") {
            config.systemInstruction = instruction;
        }

        return client.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: config,
        });
    };

    try {
      // 1. Attempt with the requested style
      const response = await this.withRetry<GenerateContentResponse>(() => makeRequest(styleInstruction));
      return this.processAudioResponse(response);
    } catch (error: any) {
      const status = error?.status || error?.code || error?.error?.code;
      const message = error?.message || "";

      // 2. Fallback: If style generation failed (500 error), try with a neutral instruction.
      const isServerError = (status >= 500 && status < 600) || message.includes('Internal') || message.includes('INTERNAL');

      if (isServerError && styleInstruction !== "Speak naturally.") {
        console.warn("Speech generation with style failed. Retrying with neutral style...");
        try {
          // Retry without any specific instruction
          const fallbackResponse = await this.withRetry<GenerateContentResponse>(() => makeRequest("Speak naturally."), 2, 2000);
          return this.processAudioResponse(fallbackResponse);
        } catch (fallbackError) {
          throw error; // If fallback fails, throw original error
        }
      }
      throw error;
    }
  }

  private processAudioResponse(response: GenerateContentResponse): ArrayBuffer {
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("Failed to generate speech audio. Empty response from API.");
    }
    // This returns raw PCM 16-bit 24kHz data (Int16)
    return base64ToArrayBuffer(base64Audio);
  }
}

export const geminiService = new GeminiService();