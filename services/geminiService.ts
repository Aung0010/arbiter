import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const apiKey = process.env.API_KEY || 'AIzaSyD-B6fDc9zSMCJC8a-bdLVKFqjK4c0nBaA';

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

export const checkConsensus = async (inputs: string[]): Promise<{ isConsensus: boolean; answer: string; reasoning: string }> => {
  if (!ai) return { isConsensus: false, answer: "", reasoning: "" };
  
  const prompt = `
    Analyze the following perspectives from AI agents. Determine if they have reached a consensus/agreement that resolves the original query satisfactorily without major conflicts.
    Format your EXACT response as:
    CONSENSUS: [YES or NO]
    REASONING: [1-sentence explanation]
    ANSWER: [If YES, provide the unified answer formatted in clean markdown. Если NO, summarize the remaining disagreement.]
    
    Perspectives:
    ${inputs.join('\n---\n')}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    const text = response.text || "";
    
    const isConsensusMatch = text.match(/CONSENSUS:\s*(YES|NO)/i);
    const reasoningMatch = text.match(/REASONING:\s*(.*?)(?=\nANSWER:|$)/is);
    const answerMatch = text.match(/ANSWER:\s*(.*)/is);

    const isConsensus = isConsensusMatch ? isConsensusMatch[1].toUpperCase() === 'YES' : false;
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : "Unable to determine reasoning.";
    const answer = answerMatch ? answerMatch[1].trim() : text;

    return { isConsensus, answer, reasoning };
  } catch (e) {
    return { isConsensus: false, answer: "Error checking consensus", reasoning: "Error" };
  }
};