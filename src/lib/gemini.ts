/**
 * Gemini API Bridge
 * All logic has been migrated to the server-side for security and performance.
 * The client now calls /api/gemini/* endpoints.
 */

export async function generateMotivationalMessage(clientName: string, weekNumber: number) {
  try {
    const response = await fetch('/api/gemini/motivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName, weekNumber }),
    });
    const data = await response.json();
    return data.text || "Great job this week! Keep pushing!";
  } catch (error) {
    console.error("Error generating motivational message:", error);
    return "Amazing work this week! You're getting stronger every day.";
  }
}

export async function searchExerciseVideos(exerciseName: string) {
  try {
    const response = await fetch('/api/gemini/search-videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseName }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error searching exercise videos:", error);
    return [];
  }
}

export async function analyzeMealImage(base64Image: string, mimeType: string) {
  try {
    const response = await fetch('/api/gemini/analyze-meal-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image, mimeType }),
    });
    if (!response.ok) {
      let errMsg = `Server responded with ${response.status}`;
      try {
        const body = await response.json();
        if (body?.error) errMsg = body.error;
      } catch (e) {}
      throw new Error(errMsg);
    }
    return await response.json();
  } catch (error: any) {
    console.error("Error analyzing meal image:", error);
    throw error;
  }
}

export async function analyzeMealText(mealDescription: string) {
  try {
    const response = await fetch('/api/gemini/analyze-meal-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealDescription }),
    });
    if (!response.ok) {
      let errMsg = `Server responded with ${response.status}`;
      try {
        const body = await response.json();
        if (body?.error) errMsg = body.error;
      } catch (e) {}
      throw new Error(errMsg);
    }
    return await response.json();
  } catch (error: any) {
    console.error("Error analyzing meal text:", error);
    throw error;
  }
}

export async function getMacrosForItemsWithQuantities(items: { name: string, quantity: string }[]) {
  try {
    const response = await fetch('/api/gemini/batch-macros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error getting macros for quantities:", error);
    return null;
  }
}

export async function analyzeDailyNutrition(meals: any[], profile: any) {
  try {
    const mealsSummary = meals.map(m => `- ${m.type}: ${m.name} (${m.totalCalories} kcal, ${m.totalProtein}g P, ${m.totalCarbs}g C, ${m.totalFats}g F)`).join("\n");
    const goalsSummary = `Goal: ${profile.fitnessGoal || "Overall Health"}, Height: ${profile.height}cm, Weight: ${profile.weight}kg. Target Protein: ${profile.macroGoals?.protein || "balanced"}g, Carbs: ${profile.macroGoals?.carbs || "balanced"}g.`;

    const response = await fetch('/api/gemini/analyze-daily-nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: mealsSummary, goals: goalsSummary }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error analyzing daily nutrition:", error);
    return null;
  }
}

export async function parseWorkoutFile(fileContent: string, fileName: string, userRangeInstructions?: string) {
  try {
    const response = await fetch('/api/gemini/parse-workout-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileContent, fileName, userRangeInstructions }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error parsing workout file:", error);
    return null;
  }
}

export async function analyzeNutritionFile(fileContent: string, fileName: string) {
  try {
    const response = await fetch('/api/gemini/analyze-nutrition-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileContent, fileName }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error analyzing nutrition file:", error);
    return null;
  }
}
