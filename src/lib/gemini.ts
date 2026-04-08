import { GoogleGenAI } from "@google/genai";

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
