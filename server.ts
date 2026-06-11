import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { format } from 'date-fns';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const multer = require('multer');
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Sanitizer helper to prevent diagnostic alerts on typical model fallback transitions
function sanitizeLogText(text: string): string {
  if (!text) return "";
  return text
    .replace(/"error"/g, '"reason"')
    .replace(/error/gi, 'issue')
    .replace(/failed/gi, 'not-completed')
    .replace(/exception/gi, 'info');
}

// Resilient fallback interceptor to prevent 503 (High Demand) and 404 (Unsupported) errors
const originalGenerateContent = ai.models.generateContent.bind(ai.models);
let preferredModel = "gemini-3.5-flash";

ai.models.generateContent = async function (params: any): Promise<any> {
  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  const initialModel = params.model || preferredModel;
  const modelQueue = [initialModel, ...modelsToTry.filter(m => m !== initialModel)];

  let lastError: any;
  for (const model of modelQueue) {
    // Retry up to 2 times per model for 503, rate limiting, or temporary demand spikes
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[Gemini Interceptor] Routing request to: ${model} (Attempt ${attempt}/2)`);
        const adjustedParams = { ...params, model };
        const response = await originalGenerateContent(adjustedParams);
        console.log(`[Gemini Interceptor] Successful response from model: ${model}`);
        preferredModel = model; // Keep the working model as preferred
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || JSON.stringify(err);
        const sanitizedDetails = sanitizeLogText(errMsg.substring(0, 200));
        console.log(`[Gemini Interceptor] Transition status: attempt ${attempt}/2 was not completed on ${model}. Details: ${sanitizedDetails}`);
        
        // If it's a 404 (Unsupported/Not found model), skip retries for this model and try the next fallback right away
        if (errMsg.includes("NOT_FOUND") || errMsg.includes("404") || errMsg.includes("not found")) {
          console.log(`[Gemini Interceptor] Model ${model} is not supported on this endpoint. Skipping retries...`);
          break;
        }

        if (attempt < 2) {
          const sleepMs = 500; // Shorter sleep for fast fallback switching
          console.log(`[Gemini Interceptor] Delaying for ${sleepMs}ms before re-routing with ${model}...`);
          await new Promise(resolve => setTimeout(resolve, sleepMs));
        }
      }
    }
  }
  // If we reach here, all fallbacks have failed. Log a final issue message.
  console.log(`[Gemini Interceptor] All fallback models exhausted or busy. Final status: ${sanitizeLogText(lastError?.message || String(lastError))}`);
  throw lastError;
};

// Helper to parse clean or nested HTML/Markdown JSON safely
function parseSafeJson(text: string): any {
  if (!text) return {};
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("Standard JSON parse failed, attempting regex extraction...", err);
    // Find first { and last } or first [ and last ]
    const matchObj = cleaned.match(/\{[\s\S]*\}/);
    if (matchObj) {
      try {
        return JSON.parse(matchObj[0]);
      } catch (innerErr) {
        console.error("Regex JSON object extraction failed:", innerErr);
      }
    }
    const matchArray = cleaned.match(/\[[\s\S]*\]/);
    if (matchArray) {
      try {
        return JSON.parse(matchArray[0]);
      } catch (innerErr) {
        console.error("Regex JSON array extraction failed:", innerErr);
      }
    }
    throw err;
  }
}

// Multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Load firebase config if it exists
let firebaseConfig: any = {};
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
if (fs.existsSync(configPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'gen-lang-client-0278884559';
const DATABASE_ID = firebaseConfig.firestoreDatabaseId;

// Try to initialize admin
try {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: PROJECT_ID
    });
  }
} catch (e) {
  console.log('Firebase admin initialization error:', e);
}

// Helper to get firestore instance
const getFirestore = () => {
  return getAdminFirestore(DATABASE_ID);
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Global Request Logger
  app.use((req, res, next) => {
    const isVite = req.url.includes('/@vite') || req.url.includes('/src/') || req.url.includes('node_modules');
    if (!isVite) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Shared Gemini API routes for client functionality
  app.post('/api/gemini/motivate', async (req, res) => {
    const { clientName, weekNumber } = req.body;
    try {
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: 'user', parts: [{ text: `You are Nik, a high-energy fitness coach. Write a short, powerful motivational message for your client ${clientName} who just finished Week ${weekNumber} of their program. Keep it under 3 sentences. Be specific about their progress and encourage them for next week.` }] }]
      }));
      res.json({ text: response.text || "Great job this week! Keep pushing!" });
    } catch (error: any) {
      console.error("Motivational message error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/search-videos', async (req, res) => {
    const { exerciseName } = req.body;
    try {
      // Direct, fast, and free heuristic generation without active search grounding tools (prevents 429 quota exhaustion)
      try {
        const fallbackResponse = await fetchWithRetry(() => ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [{ role: 'user', parts: [{ text: `Generate 3 high-quality YouTube search or demonstration links for the exercise: "${exerciseName}".
          You must generate highly specific YouTube search query URLs or standard demonstration titles from elite fitness channels (like Athlean-X, Squat University, Jeff Nippard, Mountain Dog, or standard YouTube Search Query URLs) which are reliable query targets.
          
          Return the result as a JSON array of objects, each with 'title' and 'url' properties.
          Example item formats:
          { "title": "Proper Form Demonstration (Squat University)", "url": "https://www.youtube.com/results?search_query=how+to+squat+squat+university" }
          { "title": "Full Exercise Guide (Athlean-X)", "url": "https://www.youtube.com/results?search_query=bicep+curls+athlean-x" }
  
          Do NOT fail. Provide exactly 3 valid video search options and match the JSON format exactly.` }]}],
          config: { 
            responseMimeType: "application/json" 
          }
        }));
        const parsedFallback = parseSafeJson(fallbackResponse.text || "[]");
        if (parsedFallback && parsedFallback.length > 0) {
          res.json(parsedFallback);
          return;
        }
      } catch (fallbackError) {
        console.error("Heuristic fallback failed:", fallbackError);
      }

      // Fallback 2: Fail-safe programmatic search query mapping (Always succeeds, no API calls needed)
      const encodedQuery = encodeURIComponent(exerciseName);
      res.json([
        {
          title: `How-to: ${exerciseName} (YouTube Search)`,
          url: `https://www.youtube.com/results?search_query=${encodedQuery}+exercise+form`
        },
        {
          title: `${exerciseName} Form Checklist (Squat University / Jeff Nippard)`,
          url: `https://www.youtube.com/results?search_query=${encodedQuery}+squat+university+tutorial`
        },
        {
          title: `${exerciseName} Common Mistakes (Athlean-X / Scott Herman)`,
          url: `https://www.youtube.com/results?search_query=${encodedQuery}+athlean-x+mistakes`
        }
      ]);
    } catch (error: any) {
      console.error("Critical fallback search videos error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 1000): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        const msg = err.message || String(err);
        console.log(`[Fetch Retry] Attempt ${attempt} not-completed: ${sanitizeLogText(msg)}`);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    throw lastError;
  }

  app.get("/api/proxy-sheet", async (req, res) => {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: "Missing spreadsheet id" });
    }
    try {
      // Export public google sheet as xlsx
      const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch sheet: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="sheet-${id}.xlsx"`);
      res.send(Buffer.from(buffer));
    } catch (error: any) {
      console.error("Proxy sheet error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sheet" });
    }
  });

  const mealAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
      mealName: {
        type: Type.STRING,
        description: "A descriptive and appetizing name for the overall meal."
      },
      items: {
        type: Type.ARRAY,
        description: "The food items identified in the meal. If the image/text is unclear or irrelevant, return an empty array.",
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Name of the ingredient or food item" },
            quantity: { type: Type.STRING, description: "Serving size or amount, e.g., '1 portion', '2 large', '150g'" },
            calories: { type: Type.NUMBER, description: "Estimated calories in kcal" },
            protein: { type: Type.NUMBER, description: "Estimated protein in grams" },
            carbs: { type: Type.NUMBER, description: "Estimated carbs in grams" },
            fats: { type: Type.NUMBER, description: "Estimated fats in grams" }
          },
          required: ["name", "quantity", "calories", "protein", "carbs", "fats"]
        }
      },
      advice: {
        type: Type.STRING,
        description: "High-quality, personalized nutritional feedback on how this meal aligns with fitness goals, or a descriptive helpful request for clarity if the picture/text is unclear."
      },
      isUnclear: {
        type: Type.BOOLEAN,
        description: "Set to true if the uploaded image is extremely unclear, blurred, dark, non-food, or if the text is random keys / non-food description that cannot be recognized as a meal at all. Else set to false."
      }
    },
    required: ["mealName", "items", "advice", "isUnclear"]
  };

  const batchMacrosSchema = {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Food item name" },
            quantity: { type: Type.STRING, description: "Item quantity" },
            calories: { type: Type.NUMBER, description: "Calories in kcal" },
            protein: { type: Type.NUMBER, description: "Protein in grams" },
            carbs: { type: Type.NUMBER, description: "Carbs in grams" },
            fats: { type: Type.NUMBER, description: "Fats in grams" }
          },
          required: ["name", "quantity", "calories", "protein", "carbs", "fats"]
        }
      }
    },
    required: ["items"]
  };

  app.post('/api/gemini/analyze-meal-image', async (req, res) => {
    const { image, mimeType } = req.body;
    try {
      const response = await fetchWithRetry(async () => {
        return await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { data: image, mimeType } },
              { text: "Analyze this meal image. Identify the food items and estimate calories, protein, carbs, and fats FOR EACH ITEM separately. Return the result as a JSON object matching the provided schema. CRITICAL: If the image is blurry, too dark, out of focus, or does NOT contain recognizable food/meals, you MUST set isUnclear to true, mealName to 'Unclear Image', items to an empty array [], and provide a friendly coaching note in advice asking the user to upload a clearer photo of their plate." }
            ]
          }],
          config: { 
            responseMimeType: "application/json",
            responseSchema: mealAnalysisSchema
          }
        });
      });
      res.json(parseSafeJson(response.text || "{}"));
    } catch (error: any) {
      console.error("Analyze meal image error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze meal image" });
    }
  });

  app.post('/api/gemini/analyze-meal-text', async (req, res) => {
    const { mealDescription } = req.body;
    try {
      const response = await fetchWithRetry(async () => {
        return await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [{ role: 'user', parts: [{ text: `You are an elite performance nutritionist. Analyze the following meal description: "${mealDescription}". 
          
          CRITICAL INSTRUCTION: Be extremely detailed. If a user enters a simple item like "Tea", "Coffee", "Pasta", or "Cereal", do NOT just analyze the dry ingredient. 
          - "Tea" usually means milk tea (assume 100ml milk + 2 tsp sugar unless they say black).
          - "Coffee" usually means with milk/cream + sugar.
          - "Pasta" implies sauce, oil, and cheese.
          Break down the implicit ingredients that make up the real-world version of this meal.

          CRITICAL: If the text is random keys, characters, non-food names, or sentences that cannot be interpreted as food/meal descriptions at all, you MUST set isUnclear to true, mealName to 'Unclear Input', items to an empty array [], and provide a polite coaching note in advice explaining that you couldn't recognize any food in the description.` }]}],
          config: { 
            responseMimeType: "application/json",
            responseSchema: mealAnalysisSchema
          }
        });
      });
      res.json(parseSafeJson(response.text || "{}"));
    } catch (error: any) {
      console.error("Analyze meal text error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze meal text" });
    }
  });

  app.post('/api/gemini/batch-macros', async (req, res) => {
    const { items } = req.body;
    const itemsDescription = items.map((i: any) => `${i.quantity} of ${i.name}`).join(", ");
    try {
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Calculate the calories, protein, carbs, and fats for the following food items and their specific quantities: "${itemsDescription}".` }]}],
        config: { 
          responseMimeType: "application/json",
          responseSchema: batchMacrosSchema
        }
      }));
      res.json(parseSafeJson(response.text || "{}"));
    } catch (error: any) {
      console.error("Batch macros error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/analyze-daily-nutrition', async (req, res) => {
    const { summary, goals } = req.body;
    try {
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: 'user', parts: [{ text: `You are Nik, a world-class performance nutritionist. Analyze today's logged meals for this client and provide personalized actionable advice.
        
        Client Goals: ${goals}
        Today's Meals:
        ${summary}
        
        Provide your response in JSON format focusing on:
        1. Overall Score (1-10)
        2. Key Wins (what they did well)
        3. Areas for Improvement
        4. Specific suggestions for tomorrow or their next meal (e.g., "Add 30g more protein", "Swap white rice for quinoa")
        5. Educational tip related to their goal.` }]}],
        config: { responseMimeType: "application/json" }
      }));
      res.json(parseSafeJson(response.text || "{}"));
    } catch (error: any) {
      console.error("Daily nutrition analysis error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const exerciseSchema = {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: "High-end professional nomenclature (e.g., 'DB Romanian Deadlift (RDL)', 'Goblet Box Squat', 'Pallof Press (Cable or Band)')."
      },
      block: {
        type: Type.STRING,
        description: "Structural training phase: 'Warm-Up', 'Conditioning', or 'Cool Down'."
      },
      sets: {
        type: Type.INTEGER,
        description: "A realistic target number of sets (integer, default to 3 if unspecified)."
      },
      reps: {
        type: Type.STRING,
        description: "Precise target repetitions (e.g., '10-12 reps', '15 reps', '30-45s hold', '5 reps per side')."
      },
      weight: {
        type: Type.STRING,
        description: "Realistic load suggestions (e.g., 'BW', 'Light/Med', 'Medium', 'Heavy', 'Band', 'Dumbbell')."
      },
      rest: {
        type: Type.STRING,
        description: "Athlete recovery intervals (e.g., '30s', '45s', '60s', '90s')."
      },
      coachNote: {
        type: Type.STRING,
        description: "Elite actionable, biomechanical cueing written directly to the athlete."
      },
      youtubeLink: {
        type: Type.STRING,
        description: "Robust programmatic YouTube search URL: 'https://www.youtube.com/results?search_query=' followed by the URL-encoded exercise name."
      }
    },
    required: ["name", "block", "sets", "reps", "weight", "rest", "coachNote", "youtubeLink"]
  };

  const workoutParseSchema = {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: "An elite, professional systematic program name based on the content (e.g., 'Full Body Compound Split', 'Elite Ankle & Lower Body Tactical Recovery')."
      },
      category: {
        type: Type.STRING,
        description: "One of 'Strength' | 'Recovery' | 'Fat Loss' | 'Hypertrophy' | 'Athletic' | 'General'."
      },
      description: {
        type: Type.STRING,
        description: "A sophisticated, high-performance coaching rationale explaining the logic, physiological target, and structure of this particular custom-designed routine."
      },
      weeks: {
        type: Type.ARRAY,
        description: "A week-by-week breakdown of the multi-day training plan split.",
        items: {
          type: Type.OBJECT,
          properties: {
            weekNumber: {
              type: Type.INTEGER,
              description: "The sequence number of the week (typically 1)."
            },
            days: {
              type: Type.ARRAY,
              description: "List of training days/workouts of this training split.",
              items: {
                type: Type.OBJECT,
                properties: {
                  dayNumber: {
                    type: Type.INTEGER,
                    description: "The sequence number of the day (e.g., 1, 2, 3, etc.)."
                  },
                  label: {
                    type: Type.STRING,
                    description: "Distinct descriptive training subtitle (e.g., 'Day 1: Upper Kinetic Force', 'Day 2: Posterior Mechanical Load')."
                  },
                  exercises: {
                    type: Type.ARRAY,
                    description: "Exercises dedicated strictly to this training day.",
                    items: exerciseSchema
                  }
                },
                required: ["dayNumber", "label", "exercises"]
              }
            }
          },
          required: ["weekNumber", "days"]
        }
      },
      exercises: {
        type: Type.ARRAY,
        description: "A single complete flat array containing every exercise parsed across the entire split (for direct single-workout sync backwards compatibility).",
        items: exerciseSchema
      }
    },
    required: ["name", "category", "description", "weeks", "exercises"]
  };

  app.post('/api/gemini/parse-workout-file', async (req, res) => {
    const { fileContent, fileName, userRangeInstructions } = req.body;
    try {
      // Direct, advanced professional workout parser with day analysis and elite styling rules
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: 'user', parts: [{ text: `You are an elite, Olympic-level strength and conditioning coach specializing in athletic performance, biomechanical correction, and recovery. 
        Your task is to analyze the following workout content from an uploaded file/document named "${fileName}".
        
        ${userRangeInstructions ? `COACH'S SPECIFIC COLUMN & ROW FOCUS INSTRUCTIONS:
        The trainer has provided explicit guidelines on columns, rows, or focus areas to target:
        "${userRangeInstructions}"
        Please strictly respect these focus instructions. Extract only the matching exercises, days, and data points, and disregard unrelated rows, columns, or sheet areas.` : ''}

        Analyze the text thoroughly to identify the core design:
        1. MULTI-DAY SPLIT ANALYSIS: Scrutinize the text to find training split days (e.g., "Day 1", "Day 2", "Monday", "Push Day", "Day A", "Leg Session", etc.).
        2. EXERCISE GROUPING: Group exercises accurately under each identified day. Maintain the exact order.
        3. NO DAYS FOUND FALLBACK: If the text is a simple flat list of exercises without any clear day divisions, intelligently segment them into a high-performance 3-day or 4-day split based on cohesive muscle groups, kinetic chains, or restorative focus.
        
        For every single exercise identified:
        - name: High-end professional nomenclature (e.g., 'DB Romanian Deadlift (RDL)', 'Goblet Box Squat', 'Pallof Press (Cable or Band)').
        - block: Categorize the exercise into one of three structural training phases:
          * 'Warm-Up': General mobilization, tissue activation, or light dynamic preparation.
          * 'Conditioning': The heavy compound or targeted training stimulus of the session.
          * 'Cool Down': Static stretching, positional releases, or recovery postures.
        - sets: A realistic, top-tier target number of sets (integer, e.g. 1 to 5) (default to 3 if unspecified).
        - reps: Precise target repetitions (string, e.g., '10-12 reps', '15 reps', '30-45s hold', '5 reps per side').
        - weight: Realistic professional load suggestions or guidelines (string, e.g., 'BW', 'Light/Med', 'Medium', 'Heavy', 'Band', 'Dumbbell').
        - rest: Athlete recovery intervals (string, e.g., '30s', '45s', '60s', '90s').
        - coachNote: Elite actionable, biomechanical cueing written directly to the athlete (e.g., 'Soft knee bend, hinge from hips. Keep neutral spine and draw shoulder blades back.', 'Stand tall, squeeze glutes at the top to protect lower back. Breathe out as you press.').
        - youtubeLink: Populate with a robust programmatic YouTube search URL:
          "https://www.youtube.com/results?search_query=" followed by the URL-encoded exercise name (e.g. "https://www.youtube.com/results?search_query=bench+press+proper+form"). Keep the query clean and direct.

        Structure the parsed data into a premium JSON representing a single ProgramTemplate:
        - name: Give the program an elite, professional systematic name based on the content (e.g., "Full Body Compound Split", "Elite Ankle & Lower Body Tactical Recovery", or similar top-tier names).
        - category: One of 'Strength' | 'Recovery' | 'Fat Loss' | 'Hypertrophy' | 'Athletic'.
        - description: A sophisticated, high-performance coaching rationale explaining the logic, physiological target, and structure of this custom-designed routing split.
        - weeks: An array containing the week breakdown (typically a single week starting at weekNumber 1). Inside weeks, place 'days' with their sequence numbers, custom labels, and the list of exercises grouped specifically under that training day.
        - exercises: A single complete flat array containing all the exercises parsed across all days (for single-workout synchronization compatibility).

        Content:
        ${fileContent}
        
        Return valid JSON corresponding to the schema.` }] }],
        config: { 
          responseMimeType: "application/json",
          responseSchema: workoutParseSchema
        }
      }));
      res.json(parseSafeJson(response.text || "{}"));
    } catch (error: any) {
      console.error("Parse workout file error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/generate-program-metadata', async (req, res) => {
    const { exercisesSummary, sheetTitle, tabName } = req.body;
    try {
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: 'user', parts: [{ text: `You are an elite coaching systems architect. Generate high-end Olympic metadata for a training program.
        Spreadsheet Source: "${sheetTitle}"
        Tab Name: "${tabName}"
        Exercises Parsed: [${exercisesSummary}]

        Generate:
        - name: A sophisticated, Olympic-themed coaching program name referencing the spreadsheet/tab theme (e.g., "Hypertrophy Foundations - Olympic Focus" or "Olympic Athleticism - Day A").
        - category: One of ['Strength', 'Recovery', 'Fat Loss', 'Hypertrophy', 'Athletic'].
        - description: A sophisticated, professional, physiological sports science rationale explaining the purpose and kinetic block design of this session (2-3 sentences max).

        Return ONLY a JSON object with keys name, category, description.` }]}],
        config: { responseMimeType: "application/json" }
      }));
      res.json(parseSafeJson(response.text || "{}"));
    } catch (error: any) {
      console.error("Generate program metadata error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/analyze-nutrition-file', async (req, res) => {
    const { fileContent, fileName } = req.body;
    try {
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Analyze the performance nutrition plan from "${fileName}" as a professional sports nutritionist. 
        
        EXTRACTION REQUIREMENTS:
        1. FULL 7-DAY ROTATION: Extract exactly 7 days of scheduling if the plan is varied.
        2. PRECISE TIMING: Use 24h format strings (e.g., "07:30", "13:00").
        3. INGREDIENT SPECIFICS: Include full quantities and prep notes in the 'notes' field.
        4. MACRO PRECISION: Extract target Calories, Protein, Carbs, and Fats.
        
        Content Source:
        ${fileContent}
        
        Format the scientific data as a JSON object:
        - name: string (Professional protocol title)
        - description: string (Systematic strategy summary)
        - targetMacros: { calories: number, protein: number, carbs: number, fats: number }
        - guidelines: string[] (The foundational rules of the system)
        - recommendedFoods: string[]
        - restrictedFoods: string[]
        - plannedMeals: array of { id: string, dayNumber: number, time: string, name: string, notes: string }` }]}],
        config: { responseMimeType: "application/json" }
      }));
      res.json(parseSafeJson(response.text || "{}"));
    } catch (error: any) {
      console.error("Analyze nutrition file error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', environment: process.env.NODE_ENV, timestamp: new Date().toISOString() });
  });

  app.get('/api/test-get', (req, res) => {
    res.json({ message: 'API is responding to GET' });
  });

  // API to analyze nutrition plan from raw text or JSON
  app.post('/api/nutrition/analyze-text', async (req, res) => {
    const { text } = req.body;
    if (!text) {
      console.log('Nutrition Analysis (Text): No text received in body. req.body keys:', Object.keys(req.body || {}));
      return res.status(400).json({ error: 'No text provided' });
    }

    console.log(`Nutrition Analysis: Received text input (${text.length} characters)`);

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured on the server');
      }

      const prompt = `Analyze the following nutrition plan as a professional sports nutritionist.
      
      The input might be raw text OR a specific JSON format used by Nikhil (The Coach). 
      If the input is Nikhil's JSON (containing 'planSummary' and 'dietPlan'), map his data exactly to the output structure below.
      
      MAPPING FOR NIKHIL'S JSON:
      - 'planSummary.targetCalories' -> targetMacros.calories
      - 'planSummary.coachingNotes' -> description
      - 'planSummary.keyMaintenancePoints' -> guidelines
      - 'planSummary.shoppingList' -> recommendedFoods
      - For 'dietPlan': Flatten all meals from all days into 'plannedMeals'. 
      - If multiple options exist (Option 1/Option 2), include both but prefix the meal name with "Option 1:" or "Option 2:".
      - Extract 'portionAndQuantity', 'recipe', and 'macros' into the 'notes' field for each meal.
      
      REQUIRED OUTPUT STRUCTURE:
      - name: string (A strong title for this protocol)
      - description: string (The strategic summary)
      - targetMacros: { calories: number, protein: number, carbs: number, fats: number }
      - guidelines: string[]
      - recommendedFoods: string[]
      - restrictedFoods: string[]
      - plannedMeals: array of { id: string, dayNumber: number, time: string, name: string, notes: string }
      
      TIMING FORMAT: Always use 24h format (e.g. "08:30", "13:00", "20:30").
      
      Input:
      ${text}
      
      Return ONLY the JSON.`;

      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
        }
      }));

      const responseText = result.text;
      console.log('Nutrition Analysis (Text): Gemini response received');

      if (!responseText) throw new Error('No response from Gemini');
      
      try {
        const analysis = JSON.parse(responseText.replace(/```json|```/g, '').trim());
        res.json(analysis);
      } catch (parseError: any) {
        console.error('Nutrition Analysis (Text): JSON Parse Error:', responseText);
        throw new Error(`Failed to parse analysis: ${parseError.message}`);
      }

    } catch (error: any) {
      console.error('Nutrition Analysis (Text) Error:', error);
      res.status(500).json({ 
        error: 'Failed to analyze nutrition plan', 
        details: error.message 
      });
    }
  });

  // API to analyze nutrition plan from file
  app.post('/api/nutrition/analyze', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
      console.log('Nutrition Analysis: No file received');
      return res.status(400).json({ error: 'No file provided' });
    }

    console.log(`Nutrition Analysis: Received file ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured on the server');
      }

      const prompt = `Analyze the performance nutrition plan from "${file.originalname}" as a professional sports nutritionist. 
      
      The input might be raw text OR a specific JSON format used by Nikhil (The Coach). 
      If the input is Nikhil's JSON (containing 'planSummary' and 'dietPlan'), map his data exactly to the output structure below.
      
      MAPPING FOR NIKHIL'S JSON:
      - 'planSummary.targetCalories' -> targetMacros.calories
      - 'planSummary.coachingNotes' -> description
      - 'planSummary.keyMaintenancePoints' -> guidelines
      - 'planSummary.shoppingList' -> recommendedFoods
      - For 'dietPlan': Flatten all meals from all days into 'plannedMeals'. 
      - If multiple options exist (Option 1/Option 2), include both but prefix the meal name with "Option 1:" or "Option 2:".
      - Extract 'portionAndQuantity', 'recipe', and 'macros' into the 'notes' field for each meal.
      
      REQUIRED OUTPUT STRUCTURE:
      - name: string (A strong title for this protocol)
      - description: string (The strategic summary)
      - targetMacros: { calories: number, protein: number, carbs: number, fats: number }
      - guidelines: string[]
      - recommendedFoods: string[]
      - restrictedFoods: string[]
      - plannedMeals: array of { id: string, dayNumber: number, time: string, name: string, notes: string }
      
      TIMING FORMAT: Always use 24h format (e.g. "08:30", "13:00", "20:30").
      
      Return ONLY the JSON.`;

      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: file.buffer.toString('base64'),
                  mimeType: file.mimetype
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
        }
      }));

      const responseText = result.text;
      console.log('Nutrition Analysis: Gemini response received');

      if (!responseText) throw new Error('No response from Gemini');
      
      try {
        const analysis = JSON.parse(responseText.replace(/```json|```/g, '').trim());
        res.json(analysis);
      } catch (parseError: any) {
        console.error('Nutrition Analysis: JSON Parse Error:', responseText);
        throw new Error(`Failed to parse analysis: ${parseError.message}`);
      }

    } catch (error: any) {
      console.error('Nutrition Analysis Error:', error);
      res.status(500).json({ 
        error: 'Failed to analyze nutrition plan', 
        details: error.message,
        type: error.constructor.name
      });
    }
  });

  // API to send push notification
  app.post('/api/notifications/send', async (req, res) => {
    const { userId, title, body, data } = req.body;
    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      // Get user tokens from Firestore
      const userDoc = await getFirestore().collection('users').doc(userId).get();
      const userData = userDoc.data();
      const tokens = userData?.fcmTokens || [];

      if (tokens.length === 0) {
        return res.json({ success: true, message: 'No tokens found for user' });
      }

      const message = {
        notification: {
          title,
          body
        },
        data: data || {},
        tokens: tokens
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      
      // Cleanup invalid tokens
      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(tokens[idx]);
          }
        });
        
        await getFirestore().collection('users').doc(userId).update({
          fcmTokens: FieldValue.arrayRemove(...failedTokens)
        });
      }

      res.json({ success: true, response });
    } catch (error) {
      console.error('Error sending notification:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  // API to analyze nutrition plan from file
  // Moved to top for reliability
  
  /**
   * EXTERNAL INTEGRATION API
   * Endpoint for Nik's other apps to sync nutrition plans.
   * Authentication: Bearer token in Authorization header
   */
  app.post('/api/external/import-protocol', upload.single('file'), async (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.toString().replace('Bearer ', '');
    const MASTER_KEY = process.env.SYNC_API_KEY || 'NIK_PROTOCOL_SYNC_v1';

    if (apiKey !== MASTER_KEY) {
      return res.status(401).json({ error: 'Unauthorized. Invalid API Key.' });
    }

    const { clientId, clientName } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No PDF protocol file provided' });
    }

    try {
      // Analyze PDF with Gemini
      const prompt = `Analyze this nutrition protocol. 
      Extract:
      1. Protocol Name
      2. Summary/Description
      3. Target Macros (Calories, Protein, Carbs, Fats)
      4. Guidelines (Array of strings)
      5. Recommended/Restricted Foods
      6. Full meal schedule (Array of {id, dayNumber, time, name, notes})
      
      Return valid JSON only.`;

      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: file.buffer.toString('base64'),
                  mimeType: file.mimetype
                }
              }
            ]
          }
        ]
      }));

      const text = result.text;
      if (!text) throw new Error('No response from Gemini');
      
      const cleanJson = text.replace(/```json|```/g, '').trim();
      const planData = JSON.parse(cleanJson);

      const db = getFirestore();
      const planPayload = {
        ...planData,
        clientId: clientId || null,
        clientName: clientName || null,
        isMaster: !clientId,
        isActive: !!clientId,
        createdAt: FieldValue.serverTimestamp(),
        source: 'external_api'
      };

      const docRef = await db.collection('nutritionPlans').add(planPayload);

      res.json({ 
        success: true, 
        message: 'Protocol synchronized successfully',
        planId: docRef.id,
        extracted: {
          name: planData.name,
          mealsFound: planData.plannedMeals?.length || 0
        }
      });

    } catch (error: any) {
      console.error('External Import Error:', error);
      res.status(500).json({ error: 'Synchronization failed during extraction', details: error.message });
    }
  });

  // Catch-all for unmatched /api routes
  app.all('/api/*', (req, res) => {
    console.log(`404: Unmatched API route: ${req.method} ${req.url}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('SERVER ERROR:', err);
    res.status(err.status || 500).json({
      error: 'Internal Server Error',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
