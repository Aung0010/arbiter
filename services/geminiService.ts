import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const apiKey = process.env.API_KEY || '';

// Initialize client only if key exists to avoid immediate crash, though functionality will be limited
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateAgentResponse = async (
  modelName: string,
  systemInstruction: string,
  prompt: string
): Promise<string> => {
  if (!ai) throw new Error("API Key is missing.");

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7, // Balance between creativity and determinism
      },
    });

    return response.text || "No response generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error generating response. Please check API quota or connection.";
  }
};

export const generateSummary = async (inputs: string[]): Promise<string> => {
  if (!ai) return "";
  
  const prompt = `
    Analyze the following different perspectives on a topic and provide a brief 1-sentence summary of the current state of the debate.
    
    Perspectives:
    ${inputs.join('\n---\n')}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "";
  } catch (e) {
    return "Consolidating perspectives...";
  }
};