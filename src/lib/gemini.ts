import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateMotivationalMessage(clientName: string, weekNumber: number) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are Nik, a high-energy fitness coach. Write a short, powerful motivational message for your client ${clientName} who just finished Week ${weekNumber} of their program. Keep it under 3 sentences. Be specific about their progress and encourage them for next week.`,
    });
    return response.text || "Great job this week! Keep pushing!";
  } catch (error) {
    console.error("Error generating motivational message:", error);
    return "Amazing work this week! You're getting stronger every day.";
  }
}

export async function searchExerciseVideos(exerciseName: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Find 3 high-quality YouTube demonstration video links for the exercise: "${exerciseName}". 
      Return the result as a JSON array of objects, each with 'title' and 'url' properties.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              url: { type: Type.STRING }
            },
            required: ["title", "url"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error searching exercise videos:", error);
    return [];
  }
}
