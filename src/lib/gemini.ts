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
      
      CRITICAL VIDEO SELECTION CRITERIA:
      1. RELEVANCE: The video must be exactly about "${exerciseName}".
      2. CONCISE: Prioritize "YouTube Shorts" or very short, direct explanatory videos (under 2 minutes) that show proper form without long intros.
      3. QUALITY: Select videos from reputable fitness channels.
      
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

export async function analyzeMealImage(base64Image: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: "Analyze this meal image. Identify the food items and estimate calories, protein, carbs, and fats FOR EACH ITEM separately. Return the result as a JSON object with a 'mealName' and an 'items' array. Each item should have 'name', 'calories', 'protein', 'carbs', and 'fats'. Also include a general 'advice' string.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mealName: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  calories: { type: Type.NUMBER },
                  protein: { type: Type.NUMBER },
                  carbs: { type: Type.NUMBER },
                  fats: { type: Type.NUMBER }
                },
                required: ["name", "calories", "protein", "carbs", "fats"]
              }
            },
            advice: { type: Type.STRING, description: "Short nutritional advice for this meal" }
          },
          required: ["mealName", "items", "advice"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error analyzing meal image:", error);
    return null;
  }
}

export async function analyzeMealText(mealDescription: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following meal description: "${mealDescription}". 
      Identify the food items and estimate calories, protein, carbs, and fats FOR EACH ITEM separately.
      Return the result as a JSON object with a 'mealName' and an 'items' array. 
      Each item should have 'name', 'calories', 'protein', 'carbs', and 'fats'. 
      Also include a general 'advice' string.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mealName: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  calories: { type: Type.NUMBER },
                  protein: { type: Type.NUMBER },
                  carbs: { type: Type.NUMBER },
                  fats: { type: Type.NUMBER }
                },
                required: ["name", "calories", "protein", "carbs", "fats"]
              }
            },
            advice: { type: Type.STRING, description: "Short nutritional advice for this meal" }
          },
          required: ["mealName", "items", "advice"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error analyzing meal text:", error);
    return null;
  }
}

export async function getMacrosForItemsWithQuantities(items: { name: string, quantity: string }[]) {
  try {
    const itemsDescription = items.map(i => `${i.quantity} of ${i.name}`).join(", ");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Calculate the calories, protein, carbs, and fats for the following food items and their specific quantities: "${itemsDescription}". 
      Return the result as a JSON object with an 'items' array. 
      Each item should have 'name', 'quantity', 'calories', 'protein', 'carbs', and 'fats'.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  quantity: { type: Type.STRING },
                  calories: { type: Type.NUMBER },
                  protein: { type: Type.NUMBER },
                  carbs: { type: Type.NUMBER },
                  fats: { type: Type.NUMBER }
                },
                required: ["name", "quantity", "calories", "protein", "carbs", "fats"]
              }
            }
          },
          required: ["items"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error getting macros for quantities:", error);
    return null;
  }
}

export async function analyzeDailyNutrition(meals: any[], profile: any) {
  try {
    const mealsSummary = meals.map(m => `- ${m.type}: ${m.name} (${m.totalCalories} kcal, ${m.totalProtein}g P, ${m.totalCarbs}g C, ${m.totalFats}g F)`).join("\n");
    const goalsSummary = `Goal: ${profile.fitnessGoal || "Overall Health"}, Height: ${profile.height}cm, Weight: ${profile.weight}kg. Target Protein: ${profile.macroGoals?.protein || "balanced"}g, Carbs: ${profile.macroGoals?.carbs || "balanced"}g.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are Nik, a world-class performance nutritionist. Analyze today's logged meals for this client and provide personalized actionable advice.
      
      Client Goals: ${goalsSummary}
      Today's Meals:
      ${mealsSummary}
      
      Provide your response in JSON format focusing on:
      1. Overall Score (1-10)
      2. Key Wins (what they did well)
      3. Areas for Improvement
      4. Specific suggestions for tomorrow or their next meal (e.g., "Add 30g more protein", "Swap white rice for quinoa")
      5. Educational tip related to their goal.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            wins: { type: Type.ARRAY, items: { type: Type.STRING } },
            improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            educationalTip: { type: Type.STRING }
          },
          required: ["score", "wins", "improvements", "suggestions", "educationalTip"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error analyzing daily nutrition:", error);
    return null;
  }
}

export async function parseWorkoutFile(fileContent: string, fileName: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert fitness coach. Parse the following workout routine content from a file named "${fileName}". 
      The content might be a list of exercises, a spreadsheet-like structure, or a document.
      Convert it into a structured Program Template.
      
      CRITICAL INSTRUCTIONS:
      1. Be extremely accurate to the original plan. If it says "Day 1: Legs", ensure Day 1 is Legs.
      2. For EVERY exercise identified, find a high-quality YouTube demonstration video link.
      3. VIDEO SELECTION: Prioritize "YouTube Shorts" or very short, direct explanatory videos (under 2 minutes) that show proper form immediately. Ensure the video is highly relevant to the specific exercise.
      4. Populate the 'youtubeLink' field for every exercise.
      
      Content:
      ${fileContent}
      
      Return a JSON object representing a ProgramTemplate.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            description: { type: Type.STRING },
            weeks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  weekNumber: { type: Type.NUMBER },
                  days: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        dayNumber: { type: Type.NUMBER },
                        label: { type: Type.STRING },
                        exercises: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              name: { type: Type.STRING },
                              sets: { type: Type.NUMBER },
                              reps: { type: Type.STRING },
                              weight: { type: Type.STRING },
                              rest: { type: Type.STRING },
                              coachNote: { type: Type.STRING },
                              youtubeLink: { type: Type.STRING }
                            },
                            required: ["name", "sets", "reps", "rest", "youtubeLink"]
                          }
                        }
                      },
                      required: ["dayNumber", "label", "exercises"]
                    }
                  }
                },
                required: ["weekNumber", "days"]
              }
            }
          },
          required: ["name", "category", "description", "weeks"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error parsing workout file:", error);
    return null;
  }
}

export async function analyzeNutritionFile(fileContent: string, fileName: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert performance nutritionist. Parse the following nutrition plan content from a file named "${fileName}". 
      Extact the structured data for a Nutrition Plan.
      
      Content:
      ${fileContent}
      
      Return a JSON object with:
      1. name: string
      2. description: string
      3. targetMacros: { calories: number, protein: number, carbs: number, fats: number }
      4. guidelines: string[] (Key nutritional instructions)
      5. recommendedFoods: string[]
      6. restrictedFoods: string[]
      7. plannedMeals: array of { id: string, time: string, name: string, notes: string } (Typical meal schedule if present, else synthesize based on common protocols like 4 meals/day).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            targetMacros: {
              type: Type.OBJECT,
              properties: {
                calories: { type: Type.NUMBER },
                protein: { type: Type.NUMBER },
                carbs: { type: Type.NUMBER },
                fats: { type: Type.NUMBER }
              },
              required: ["calories", "protein", "carbs", "fats"]
            },
            guidelines: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedFoods: { type: Type.ARRAY, items: { type: Type.STRING } },
            restrictedFoods: { type: Type.ARRAY, items: { type: Type.STRING } },
            plannedMeals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  time: { type: Type.STRING },
                  name: { type: Type.STRING },
                  notes: { type: Type.STRING }
                },
                required: ["id", "time", "name"]
              }
            }
          },
          required: ["name", "description", "targetMacros", "guidelines", "plannedMeals"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error analyzing nutrition file:", error);
    return null;
  }
}
