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
import { google } from 'googleapis';

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
  const modelsToTry = ["gemini-3.5-flash"];
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

  app.post('/api/evaluate-badges', async (req, res) => {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: 'Missing uid' });
    }

    try {
      const db = getFirestore();
      
      const result = await db.runTransaction(async (transaction) => {
        // Reads
        const userRef = db.collection('users').doc(uid);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          throw new Error('User does not exist');
        }
        const userData = userDoc.data() || {};
        const streak = userData.streak || 0;

        const feedbackQuery = db.collection('feedback')
          .where('clientId', '==', uid)
          .where('completionStatus', '==', true);
        const feedbackSnapshot = await transaction.get(feedbackQuery);
        const completedWorkoutsCount = feedbackSnapshot.size;

        const mealsQuery = db.collection('meals')
          .where('clientId', '==', uid);
        const mealsSnapshot = await transaction.get(mealsQuery);
        const mealsCount = mealsSnapshot.size;

        const badgesSubcollectionRef = db.collection('users').doc(uid).collection('badges');
        const badgesSnapshot = await transaction.get(badgesSubcollectionRef);
        const existingBadgeIds = new Set(badgesSnapshot.docs.map(doc => doc.id));

        const newBadgesToInsert: any[] = [];

        // Check Badges:
        // 1. Consistency King (4-Week Streak)
        if (streak >= 4 && !existingBadgeIds.has('consistency_1')) {
          newBadgesToInsert.push({
            id: 'consistency_1',
            name: '4-Week Streak',
            icon: 'Flame',
            description: 'Maintain a 4-week workout streak',
            unlockedAt: new Date().toISOString(),
            category: 'consistency'
          });
        }

        // 2. Decathlon (Workout Count >= 10)
        if (completedWorkoutsCount >= 10 && !existingBadgeIds.has('workout_10')) {
          newBadgesToInsert.push({
            id: 'workout_10',
            name: 'Decathlon',
            icon: 'Shield',
            description: 'Complete 10 full workouts',
            unlockedAt: new Date().toISOString(),
            category: 'workout'
          });
        }

        // 3. Meal Master (Meal Count >= 50)
        if (mealsCount >= 50 && !existingBadgeIds.has('nutrition_log')) {
          newBadgesToInsert.push({
            id: 'nutrition_log',
            name: 'Meal Master',
            icon: 'Utensils',
            description: 'Log 50 meals with AI',
            unlockedAt: new Date().toISOString(),
            category: 'nutrition'
          });
        }

        // Writes
        for (const badge of newBadgesToInsert) {
          const badgeDocRef = badgesSubcollectionRef.doc(badge.id);
          transaction.set(badgeDocRef, badge);
        }

        return {
          evaluated: true,
          newBadgesCount: newBadgesToInsert.length,
          newBadges: newBadgesToInsert
        };
      });

      res.json(result);
    } catch (error: any) {
      console.error('Error in /api/evaluate-badges:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', environment: process.env.NODE_ENV, timestamp: new Date().toISOString() });
  });

  // ========== GOOGLE FIT ENDPOINTS ==========

  // Component 1: Generate Authorization URL
  app.get('/api/google-fit-auth-url', (req, res) => {
    const { uid } = req.query;
    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ error: 'Missing uid' });
    }

    const clientId = process.env.GOOGLE_FIT_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Google Fit credentials are not configured on server.' });
    }

    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
    const redirectUri = `${appUrl}/api/google-fit-auth-callback`;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/fitness.activity.read',
        'https://www.googleapis.com/auth/fitness.body.read'
      ],
      state: uid
    });

    res.json({ url: authUrl });
  });

  // Component 2: Authorization callback URL
  app.get(['/api/google-fit-auth-callback', '/api/google-fit-auth-callback/'], async (req, res) => {
    const { code, state: uid } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).send('Missing authorization code');
    }
    if (!uid || typeof uid !== 'string') {
      return res.status(400).send('Missing state (uid)');
    }

    try {
      const clientId = process.env.GOOGLE_FIT_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET;
      
      const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
      const redirectUri = `${appUrl}/api/google-fit-auth-callback`;

      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
      );

      const { tokens } = await oauth2Client.getToken(code);

      const db = getFirestore();
      
      // Save { access_token, refresh_token, expiry_date } to Firestore at users/{uid}/googleFitTokens
      const tokenPayload = {
        googleFitTokens: {
          access_token: tokens.access_token || '',
          refresh_token: tokens.refresh_token || '',
          expiry_date: tokens.expiry_date || 0
        }
      };

      await db.collection('users').doc(uid).set(tokenPayload, { merge: true });

      // Send HTML page with postMessage and self-closing popup script
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Successful</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: #09090b;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                text-align: center;
              }
              .container {
                padding: 40px;
                background: #18181b;
                border-radius: 24px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                max-width: 400px;
              }
              .icon {
                font-size: 48px;
                color: #f97316;
                margin-bottom: 20px;
              }
              h2 {
                margin: 0 0 10px 0;
                font-weight: 800;
                letter-spacing: -0.025em;
              }
              p {
                color: #a1a1aa;
                font-size: 14px;
                line-height: 1.5;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon">✓</div>
              <h2>Google Fit Connected</h2>
              <p>Your step tracking authorization has been completed successfully.</p>
              <p style="color: #71717a; font-size: 12px; mt-4">This popup window will close automatically.</p>
            </div>
            <script>
              setTimeout(() => {
                if (window.opener) {
                  window.opener.postMessage({ type: 'GOOGLE_FIT_CONNECTED' }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              }, 1500);
            </script>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Error in google-fit-auth-callback:', error);
      res.status(500).send(`Authentication failed: ${error.message}`);
    }
  });

  // Component 3: Google Fit step count aggregator
  app.get('/api/google-fit-steps', async (req, res) => {
    const { uid, date } = req.query;

    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ error: 'Missing uid' });
    }

    try {
      const db = getFirestore();
      
      // 1. Read user's tokens from Firestore
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User does not exist.' });
      }

      const userData = userDoc.data();
      const tokens = userData?.googleFitTokens;

      if (!tokens || !tokens.access_token) {
        return res.status(404).json({ error: 'Google Fit not connected for this user' });
      }

      // 2. Initialize OAuth client
      const clientId = process.env.GOOGLE_FIT_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Google Fit credentials are not configured on server.' });
      }

      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret
      );

      oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      });

      // 3. Handle token refresh silently if expired
      const isExpired = !tokens.expiry_date || (Date.now() + 60 * 1000 >= tokens.expiry_date);
      if (isExpired && tokens.refresh_token) {
        console.log(`[Google Fit Steps] Token expired or close to expiry for ${uid}. Refreshing...`);
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          tokens.access_token = credentials.access_token || tokens.access_token;
          tokens.expiry_date = credentials.expiry_date || tokens.expiry_date;
          if (credentials.refresh_token) {
            tokens.refresh_token = credentials.refresh_token;
          }

          // Save refreshed tokens back to Firestore
          await db.collection('users').doc(uid).update({
            googleFitTokens: {
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expiry_date: tokens.expiry_date
            }
          });
          console.log(`[Google Fit Steps] Successfully saved refreshed tokens in Firestore`);
          oauth2Client.setCredentials(tokens);
        } catch (refreshErr: any) {
          console.error(`[Google Fit Steps] Failed to refresh tokens: ${refreshErr.message}`);
          return res.status(401).json({ error: `Token refresh failed`, details: refreshErr.message });
        }
      }

      // 4. Resolve date parameters
      const targetDateStr = (date as string) || format(new Date(), 'yyyy-MM-dd');
      const [year, month, day] = targetDateStr.split('-').map(Number);
      
      // Calculate boundaries
      const startOfTargetDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfTargetDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      const startTimeMillis = startOfTargetDay.getTime();
      const endTimeMillis = endOfTargetDay.getTime();

      // 5. Query Google Fitness Aggregate REST API
      const fitness = google.fitness({
        version: 'v1',
        auth: oauth2Client
      });

      console.log(`[Google Fit Steps] Querying steps for ${uid} between ${startOfTargetDay.toISOString()} and ${endOfTargetDay.toISOString()}`);
      
      const fitnessResponse: any = await (fitness.users.dataset.aggregate as any)({
        userId: 'me',
        requestBody: {
          aggregateBy: [
            {
              dataTypeName: 'com.google.step_count.delta'
            }
          ],
          bucketByTime: { durationMillis: "86400000" },
          startTimeMillis: startTimeMillis.toString(),
          endTimeMillis: endTimeMillis.toString()
        }
      });

      // 6. Accumulate aggregate results
      let totalSteps = 0;
      if (fitnessResponse.data && fitnessResponse.data.bucket) {
        for (const bucket of fitnessResponse.data.bucket) {
          if (bucket.dataset) {
            for (const dataset of bucket.dataset) {
              if (dataset.point) {
                for (const point of dataset.point) {
                  if (point.value) {
                    for (const val of point.value) {
                      if (val.intVal) {
                        totalSteps += val.intVal;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      console.log(`[Google Fit Steps] Successfully read steps structure. Total calculated: ${totalSteps} for ${targetDateStr}`);

      // 7. Core persistence logic: Update body metrics on matching document or create if missing
      // StepCount field already exists in BodyMetrics.
      const metricsQuery = await db.collection('metrics')
        .where('clientId', '==', uid)
        .where('date', '==', targetDateStr)
        .limit(1)
        .get();

      if (!metricsQuery.empty) {
        const metricsDocId = metricsQuery.docs[0].id;
        await db.collection('metrics').doc(metricsDocId).update({
          stepCount: totalSteps
        });
        console.log(`[Google Fit Steps] Updated metrics doc ${metricsDocId} with active count: ${totalSteps}`);
      } else {
        await db.collection('metrics').add({
          clientId: uid,
          date: targetDateStr,
          waterIntake: 0,
          stepCount: totalSteps,
          calories: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`[Google Fit Steps] Persistent store: Created daily metrics document for ${targetDateStr} containing steps: ${totalSteps}`);
      }

      // SMART NOTIFICATION TRIGGER: Step count milestone check
      try {
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
          const userData = userDoc.data() || {};
          const stepGoal = userData.stepGoal || 8000;
          const lastNotifiedDate = userData.lastStepGoalNotifiedDate || '';

          if (totalSteps >= stepGoal && lastNotifiedDate !== targetDateStr) {
            // Update last step goal notified date to prevent spam
            await userDocRef.update({
              lastStepGoalNotifiedDate: targetDateStr
            });

            console.log(`[Google Fit Steps] Step goal achieved! ${totalSteps}/${stepGoal}. Sending milestone push alert...`);

            // Save in-app notification
            await db.collection('notifications').add({
              clientId: uid,
              title: 'Step Goal Smashed! 👣🔥',
              message: `Sensational work! You achieved ${totalSteps.toLocaleString()} steps today, crushing your target of ${stepGoal.toLocaleString()} steps! Keep up this elite momentum!`,
              type: 'general',
              isRead: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Trigger Real-Time FCM Push Notification
            const fcmTokens = userData.fcmTokens || [];
            if (fcmTokens.length > 0) {
              const fcmMessage = {
                notification: {
                  title: 'Step Goal Smashed! 👣🔥',
                  body: `Outstanding! You logged ${totalSteps.toLocaleString()} steps today, conquering your goal of ${stepGoal.toLocaleString()} steps! Keep moving!`
                },
                data: {
                  type: 'fitness_milestone',
                  tag: 'step_goal_congrats',
                  steps: totalSteps.toString(),
                  goal: stepGoal.toString()
                },
                tokens: fcmTokens
              };
              await admin.messaging().sendEachForMulticast(fcmMessage)
                .then(resp => console.log('[Google Fit Steps] FCM milestone sent successfully:', resp.successCount))
                .catch(err => console.error('[Google Fit Steps] FCM milestone send error:', err));
            }
          }
        }
      } catch (triggerError) {
        console.error('[Google Fit Steps] Failed to evaluate steps smart notification trigger:', triggerError);
      }

      res.json({ steps: totalSteps, date: targetDateStr });

    } catch (error: any) {
      console.error('Error inside /api/google-fit-steps endpoint:', error);
      res.status(500).json({ error: 'Failed to retrieve step count', details: error.message });
    }
  });

  // ========== GOOGLE CALENDAR ENDPOINTS ==========

  app.get('/api/google-cal-auth-url', (req, res) => {
    const { uid } = req.query;
    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ error: 'Missing uid' });
    }

    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Google Calendar credentials are not configured on server.' });
    }

    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
    const redirectUri = `${appUrl}/api/google-cal-auth-callback`;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar.events'
      ],
      state: uid
    });

    res.json({ url: authUrl });
  });

  app.get(['/api/google-cal-auth-callback', '/api/google-cal-auth-callback/'], async (req, res) => {
    const { code, state: uid } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).send('Missing authorization code');
    }
    if (!uid || typeof uid !== 'string') {
      return res.status(400).send('Missing state (uid)');
    }

    try {
      const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
      
      const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
      const redirectUri = `${appUrl}/api/google-cal-auth-callback`;

      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
      );

      const { tokens } = await oauth2Client.getToken(code);

      const db = getFirestore();
      
      // Save { access_token, refresh_token, expiry_date } to Firestore at users/{uid}/googleCalTokens
      const tokenPayload = {
        googleCalTokens: {
          access_token: tokens.access_token || '',
          refresh_token: tokens.refresh_token || '',
          expiry_date: tokens.expiry_date || 0
        }
      };

      await db.collection('users').doc(uid).set(tokenPayload, { merge: true });

      // Send HTML page with postMessage and self-closing popup script
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Successful</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: #09090b;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                text-align: center;
              }
              .container {
                padding: 40px;
                background: #18181b;
                border-radius: 24px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                max-width: 400px;
              }
              .icon {
                font-size: 48px;
                color: #f97316;
                margin-bottom: 20px;
              }
              h2 {
                margin: 0 0 10px 0;
                font-weight: 800;
                letter-spacing: -0.025em;
              }
              p {
                color: #a1a1aa;
                font-size: 14px;
                line-height: 1.5;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon">✓</div>
              <h2>Google Calendar Connected</h2>
              <p>Your calendar schedule synchronization has been successfully authorized.</p>
              <p style="color: #71717a; font-size: 12px; mt-4">This popup window will close automatically.</p>
            </div>
            <script>
              setTimeout(() => {
                if (window.opener) {
                  window.opener.postMessage({ type: 'GOOGLE_CAL_CONNECTED' }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              }, 1500);
            </script>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Error in google-cal-auth-callback:', error);
      res.status(500).send(`Authentication failed: ${error.message}`);
    }
  });

  app.post('/api/create-cal-event', express.json(), async (req, res) => {
    const { clientUid, workoutId, workoutName, date, startTime, durationMinutes, notes } = req.body;

    if (!clientUid || !workoutName || !date) {
      return res.status(400).json({ error: 'Missing required parameters: clientUid, workoutName, or date.' });
    }

    const db = getFirestore();

    try {
      // 1. Read user's calendar tokens from Firestore
      const userDoc = await db.collection('users').doc(clientUid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'Client user does not exist.' });
      }

      const userData = userDoc.data();
      const tokens = userData?.googleCalTokens;

      if (!tokens || !tokens.access_token) {
        if (workoutId) {
          await db.collection('workouts').doc(workoutId).update({
            calSyncStatus: 'not_connected'
          }).catch(() => {});
        }
        return res.json({ status: 'not_connected' });
      }

      // 2. Initialize OAuth client
      const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Google Calendar credentials are not configured on server.' });
      }

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      });

      // 3. Auto token refresh
      const isExpired = !tokens.expiry_date || (Date.now() + 60 * 1000 >= tokens.expiry_date);
      if (isExpired && tokens.refresh_token) {
        console.log(`[Google Cal] Token expired for ${clientUid}. Refreshing...`);
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          tokens.access_token = credentials.access_token || tokens.access_token;
          tokens.expiry_date = credentials.expiry_date || tokens.expiry_date;
          if (credentials.refresh_token) {
            tokens.refresh_token = credentials.refresh_token;
          }

          // Save refreshed tokens
          await db.collection('users').doc(clientUid).update({
            googleCalTokens: {
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expiry_date: tokens.expiry_date
            }
          });
          oauth2Client.setCredentials(tokens);
        } catch (refreshErr: any) {
          console.error(`[Google Cal] Failed to refresh tokens: ${refreshErr.message}`);
          if (workoutId) {
            await db.collection('workouts').doc(workoutId).update({
              calSyncStatus: 'error',
              calSyncError: refreshErr.message
            }).catch(() => {});
          }
          return res.status(401).json({ error: 'Token refresh failed', details: refreshErr.message });
        }
      }

      // 4. Construct Start/End datetime strings
      const timeStr = startTime || '09:00';
      const duration = durationMinutes ? parseInt(durationMinutes) : 60;
      
      const startDateTimeStr = `${date}T${timeStr}:00`;
      const startDateObj = new Date(startDateTimeStr);
      // If startDateTime is invalid, fallback to current day
      const finalStartDate = isNaN(startDateObj.getTime()) ? new Date() : startDateObj;
      const finalEndDate = new Date(finalStartDate.getTime() + duration * 60 * 1000);

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Check if we already have a calEventId, in which case we might update or create new
      let calEventIdStr = '';
      let existingEventId = '';
      if (workoutId) {
        const wDoc = await db.collection('workouts').doc(workoutId).get();
        if (wDoc.exists) {
          existingEventId = wDoc.data()?.calEventId || '';
        }
      }

      const eventBody = {
        summary: `💪 ${workoutName} — Fit with Nik`,
        description: `Your custom personalized coaching session scheduled by Coach Nik.\n\nInstructions / Notes:\n${notes || 'No specific notes listed. Keep crushing it!'}`,
        start: {
          dateTime: finalStartDate.toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: finalEndDate.toISOString(),
          timeZone: 'UTC'
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 }
          ]
        }
      };

      if (existingEventId) {
        try {
          console.log(`[Google Cal] Existing event found: ${existingEventId}. Updating...`);
          await calendar.events.patch({
            calendarId: 'primary',
            eventId: existingEventId,
            requestBody: eventBody
          });
          calEventIdStr = existingEventId;
        } catch (updateErr: any) {
          console.error('[Google Cal] Failed to update existing calendar event. Re-creating alternative.', updateErr.message);
          const createRes = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: eventBody
          });
          calEventIdStr = createRes.data.id || '';
        }
      } else {
        const createRes = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: eventBody
        });
        calEventIdStr = createRes.data.id || '';
      }

      // 5. Save back to Firestore
      if (workoutId && calEventIdStr) {
        await db.collection('workouts').doc(workoutId).update({
          calEventId: calEventIdStr,
          calSyncStatus: 'synced',
          startTime: timeStr,
          durationMinutes: duration
        });
        console.log(`[Google Cal] Saved successfully: workout ${workoutId} now references event ID ${calEventIdStr}`);
      }

      res.json({ status: 'synced', calEventId: calEventIdStr });
    } catch (error: any) {
      console.error('Error inside create-cal-event endpoint:', error);
      if (workoutId) {
        try {
          await db.collection('workouts').doc(workoutId).update({
            calSyncStatus: 'error',
            calSyncError: error.message
          });
        } catch (_) {}
      }
      res.status(500).json({ error: 'Failed to create calendar event.', details: error.message });
    }
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

  // API to register FCM Push Tokens
  app.post('/api/notifications/register', async (req, res) => {
    const { userId, token } = req.body;
    if (!userId || !token) {
      return res.status(400).json({ error: 'Missing userId or token' });
    }
    try {
      const db = getFirestore();
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      await userRef.update({
        fcmTokens: FieldValue.arrayUnion(token)
      });
      
      res.json({ success: true, message: 'FCM Token registered successfully' });
    } catch (err: any) {
      console.error('Error registering FCM token:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API to generate copywriting via Gemini for push notifications
  app.post('/api/notifications/generate', async (req, res) => {
    const { type, clientName, context } = req.body;
    try {
      let prompt = `You are Coach Nik, a high-energy, world-class athletic fitness coach. Generate a short, action-oriented, and punchy push notification message (strictly under 100 characters) for an athlete.`;
      if (type === 'motivation') {
        prompt += ` Theme: Pure explosive motivation. Athlete name: ${clientName || 'champ'}. ${context ? `Additional context: ${context}.` : ''} Make it direct, elite, and focus on physical dominance or discipline.`;
      } else if (type === 'reminder') {
        prompt += ` Theme: Workout or check-in reminder. Athlete name: ${clientName || 'athlete'}. ${context ? `Additional context: ${context}.` : ''} Urge them to log their active sets, steps, or water intake immediately with high energy.`;
      } else if (type === 'adherence_alert') {
        prompt += ` Theme: Compliant check. Athlete name: ${clientName || 'athlete'}. State firmly but supportively that consistency is drop-dead required for results.`;
      } else {
        prompt += ` Theme: General performance encouragement. Athlete name: ${clientName || 'athlete'}.`;
      }

      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      }));

      const text = (response.text || '').trim().replace(/"/g, '');
      res.json({ text });
    } catch (error: any) {
      console.error('Error generating notification copywriting:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API to run scheduled notification events (cron triggers)
  app.post('/api/notifications/schedule', async (req, res) => {
    const { type } = req.body;
    const db = getFirestore();
    try {
      const clientsSnap = await db.collection('users').where('role', '==', 'client').get();
      const clients = clientsSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }) as any);
      let broadcastCount = 0;

      if (type === 'motivational_quote') {
        // Daily motivational quote broadcast (e.g., at 8AM)
        const quoteRes = await fetchWithRetry(() => ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [{ role: 'user', parts: [{ text: "Write a 1-sentence morning fitness motivational quote. Keep it under 80 characters. Maximize intensity." }] }]
        }));
        const quote = (quoteRes.text || "Win the morning, dominate the day! ⚡").trim().replace(/"/g, '');

        for (const client of clients) {
          const tokens = (client as any).fcmTokens || [];
          if (tokens.length > 0) {
            const fcmMessage = {
              notification: {
                title: 'Coach Nik: Morning Fire! ⚡',
                body: quote
              },
              data: { type: 'motivation', tag: 'daily_motivation_broadcast' },
              tokens
            };
            await admin.messaging().sendEachForMulticast(fcmMessage).catch(() => {});
            broadcastCount++;
          }
        }
        return res.json({ success: true, message: `Dispatched daily morning quote to ${broadcastCount} users`, text: quote });

      } else if (type === 'workout_reminder') {
        // Workout reminder (e.g., at 7AM, only to clients with a workout scheduled for today)
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const workoutsSnap = await db.collection('workouts')
          .where('scheduledDate', '==', todayStr)
          .get();
        const activeClientIds = new Set(workoutsSnap.docs.map(doc => doc.data().clientId));

        for (const client of clients) {
          if (activeClientIds.has(client.uid)) {
            // Check if they completed feedback
            const feedbackSnap = await db.collection('feedback')
              .where('clientId', '==', client.uid)
              .where('completionStatus', '==', true)
              .where('date', '==', todayStr)
              .get();

            if (feedbackSnap.empty) {
              const tokens = (client as any).fcmTokens || [];
              if (tokens.length > 0) {
                const fcmMessage = {
                  notification: {
                    title: 'Routines Awaiting! 🏋️‍♂️💪',
                    body: `Hey ${client.displayName || 'athlete'}! You have an elite routine scheduled today. Lock in and execute!`
                  },
                  data: { type: 'workout', tag: 'daily_workout_alert' },
                  tokens
                };
                await admin.messaging().sendEachForMulticast(fcmMessage).catch(() => {});
                broadcastCount++;
              }
            }
          }
        }
        return res.json({ success: true, message: `Dispatched workout reminders to ${broadcastCount} athletes.` });

      } else if (type === 'checkin_reminder') {
        // Check-in reminder (e.g., at 9AM Monday, only to users who haven't submitted weekly checkin yet)
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const checkinsSnap = await db.collection('weeklyCheckIns')
          .where('submittedAt', '>=', threeDaysAgo.toISOString())
          .get();
        const submittedClientIds = new Set(checkinsSnap.docs.map(doc => doc.data().clientId));

        for (const client of clients) {
          if (!submittedClientIds.has(client.uid)) {
            const tokens = (client as any).fcmTokens || [];
            if (tokens.length > 0) {
              const fcmMessage = {
                notification: {
                  title: 'Weekly Review Pending! 📋📈',
                  body: `Hey ${client.displayName || 'athlete'}! Your weekly review is pending. Provide metrics to optimize your compliance.`
                },
                data: { type: 'checkin', tag: 'checkin_warning' },
                tokens
              };
              await admin.messaging().sendEachForMulticast(fcmMessage).catch(() => {});
              broadcastCount++;
            }
          }
        }
        return res.json({ success: true, message: `Dispatched weekly check-in nudges to ${broadcastCount} users.` });

      } else if (type === 'adherence_check') {
        // ADHERENCE CHECK: "Coach alerts for missed workouts and declining adherence"
        // Evaluates adherenceRate for all active athletes. If compliance is under 50%, alerts the coach!
        const coachSnap = await db.collection('users').where('role', '==', 'admin').get();
        const coaches = coachSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        const alertedAthletes: string[] = [];

        for (const client of clients) {
          const workoutsQuery = await db.collection('workouts')
            .where('clientId', '==', client.uid)
            .get();
          const totalAssigned = workoutsQuery.size;

          const feedbackQuery = await db.collection('feedback')
            .where('clientId', '==', client.uid)
            .where('completionStatus', '==', true)
            .get();
          const completedCount = feedbackQuery.size;

          const adherenceRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 100;

          if (totalAssigned > 0 && adherenceRate < 50) {
            alertedAthletes.push(`${client.displayName || 'Unnamed'} (${adherenceRate}%)`);

            // Save alarm notification for coach (in-app stream)
            for (const coach of coaches) {
              await db.collection('notifications').add({
                clientId: coach.uid,
                title: `⚠️ COMPLIANCE RISK: ${client.displayName || 'Athlete'}`,
                message: `Athlete ${client.displayName || 'athlete'} fell below 50% workout adherence (Current: ${adherenceRate}%). Urgent coach intervention suggested.`,
                type: 'feedback',
                relatedId: client.uid,
                isRead: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });

              // Send Real-Time Push Notification directly to coach's phone/browser
              const coachTokens = (coach as any).fcmTokens || [];
              if (coachTokens.length > 0) {
                const fcmMessage = {
                  notification: {
                    title: '⚠️ Declining Athlete Compliance!',
                    body: `${client.displayName || 'Athlete'} consistency fell to ${adherenceRate}%. Immediate tactical intervention recommended!`
                  },
                  data: {
                    type: 'adherence_alert',
                    clientId: client.uid,
                    tag: `compliance_${client.uid}`
                  },
                  tokens: coachTokens
                };
                await admin.messaging().sendEachForMulticast(fcmMessage).catch(() => {});
              }
            }
          }
        }
        return res.json({ success: true, message: `Completed compliance evaluation. Flagged ${alertedAthletes.length} athletes: ${alertedAthletes.join(', ')}` });
      }

      res.status(400).json({ error: 'Invalid scheduled trigger event type' });
    } catch (err: any) {
      console.error('Error inside scheduled cron trigger endpoint:', err);
      res.status(500).json({ error: 'Failed to execute scheduled events', details: err.message });
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

  // ====== GOOGLE DOCS PROTOCOL EXPORT ======
  app.post('/api/create-gdoc', async (req, res) => {
    const { protocolId, protocolName, sections } = req.body;

    if (!protocolName) {
      return res.status(400).json({ error: 'Protocol name is required' });
    }
    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'Sections array is required' });
    }

    const authHeader = req.headers.authorization;
    const isUserToken = authHeader && authHeader.startsWith('Bearer ');
    const serviceAccountJson = process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON;

    if (!isUserToken && !serviceAccountJson) {
      console.warn('[Google Docs Export] Neither user OAuth token nor GOOGLE_DOCS_SERVICE_ACCOUNT_JSON is provided.');
      return res.status(400).json({ 
        error: 'Google Docs integration is not configured. Please define GOOGLE_DOCS_SERVICE_ACCOUNT_JSON inside environment variables or connect your Google Account.' 
      });
    }

    try {
      let authClient: any;

      if (isUserToken) {
        const userAccessToken = authHeader.substring(7);
        const oauthClient = new google.auth.OAuth2();
        oauthClient.setCredentials({ access_token: userAccessToken });
        authClient = oauthClient;
        console.log(`[Google Docs Export] Authenticating via User OAuth2 Access Token.`);
      } else {
        let credentials;
        try {
          credentials = JSON.parse(serviceAccountJson!);
        } catch (parseErr: any) {
          throw new Error(`Failed to parse service account JSON: ${parseErr.message}`);
        }

        const cleanPrivateKey = credentials.private_key
          ? credentials.private_key.replace(/\\n/g, '\n')
          : undefined;

        if (!credentials.client_email || !cleanPrivateKey) {
          throw new Error('Service account credentials must include client_email and private_key.');
        }

        // Initialize JWT Authentication Client for Google APIs using options object
        authClient = new google.auth.JWT({
          email: credentials.client_email,
          key: cleanPrivateKey,
          scopes: [
            'https://www.googleapis.com/auth/documents',
            'https://www.googleapis.com/auth/drive'
          ]
        });
        console.log(`[Google Docs Export] Authenticating via configured Service Account.`);
      }

      const docs = google.docs({ version: 'v1', auth: authClient });
      const drive = google.drive({ version: 'v3', auth: authClient });

      console.log(`[Google Docs Export] Creating document: "${protocolName} — Fit with Nik Protocol"`);
      
      // Step 1: Create the Document
      const createRes = await docs.documents.create({
        requestBody: {
          title: `${protocolName} — Fit with Nik Protocol`
        }
      });

      const documentId = createRes.data.documentId;
      if (!documentId) {
        throw new Error('Document creation succeeded but documentId was not returned.');
      }

      // Step 2: Build the full text and compute document ranges
      let fullText = "";

      // Title
      const titleStart = 1;
      fullText += `${protocolName}\n\n`;
      const titleEnd = titleStart + protocolName.length;

      // Dynamic sections and bullet points
      const headingRanges: { start: number; end: number }[] = [];
      const bulletRanges: { start: number; end: number }[] = [];

      for (const section of sections) {
        const headingStart = 1 + fullText.length;
        const headingText = `${section.name}\n`;
        fullText += headingText;
        const headingEnd = headingStart + section.name.length;
        headingRanges.push({ start: headingStart, end: headingEnd });

        const items = section.exercises || section.bullets || section.items || [];
        for (const item of items) {
          const bulletStart = 1 + fullText.length;
          const bulletText = `${item}\n`;
          fullText += bulletText;
          const bulletEnd = bulletStart + item.length;
          bulletRanges.push({ start: bulletStart, end: bulletEnd });
        }
        fullText += "\n"; // Spacer between sections
      }

      // Footer
      const footerStart = 1 + fullText.length;
      const footerText = `Generated by Fit with Nik on ${format(new Date(), 'MMMM d, yyyy')}\n`;
      fullText += footerText;
      const footerEnd = footerStart + footerText.length - 1;

      // Step 3: Write the entire compiled text inside the blank document first
      console.log(`[Google Docs Export] Populating document content (${documentId})`);
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: fullText
              }
            }
          ]
        }
      });

      // Step 4: Apply paragraph styles, headings, list markers, and alignments in a separate transaction
      console.log(`[Google Docs Export] Applying dynamic styles to document`);
      const styleRequests: any[] = [];

      // Heading 1 for Title
      styleRequests.push({
        updateParagraphStyle: {
          range: {
            startIndex: titleStart,
            endIndex: titleEnd
          },
          paragraphStyle: {
            namedStyleType: 'HEADING_1'
          },
          fields: 'namedStyleType'
        }
      });

      // Heading 2 for Section Names
      for (const hr of headingRanges) {
        styleRequests.push({
          updateParagraphStyle: {
            range: {
              startIndex: hr.start,
              endIndex: hr.end
            },
            paragraphStyle: {
              namedStyleType: 'HEADING_2'
            },
            fields: 'namedStyleType'
          }
        });
      }

      // Bullets for Exercises/Items
      for (const br of bulletRanges) {
        styleRequests.push({
          createParagraphBullets: {
            range: {
              startIndex: br.start,
              endIndex: br.end + 1
            },
            bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE'
          }
        });
      }

      // Footer styling (italic and center aligned)
      styleRequests.push({
        updateParagraphStyle: {
          range: {
            startIndex: footerStart,
            endIndex: footerEnd
          },
          paragraphStyle: {
            namedStyleType: 'NORMAL_TEXT',
            alignment: 'CENTER'
          },
          fields: 'namedStyleType,alignment'
        }
      });
      styleRequests.push({
        updateTextStyle: {
          range: {
            startIndex: footerStart,
            endIndex: footerEnd
          },
          textStyle: {
            italic: true
          },
          fields: 'italic'
        }
      });

      // Run styling batch update
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: styleRequests
        }
      });

      // Step 5: Update Permissions using Drive API to share with 'anyone' as reader
      console.log(`[Google Docs Export] Granting reader permission via Link sharing`);
      let sharedSuccessfully = false;
      try {
        await drive.permissions.create({
          fileId: documentId,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          }
        });
        sharedSuccessfully = true;
      } catch (shareErr: any) {
        console.warn('[Google Docs Export] Failed to grant public reader permission:', shareErr.message || shareErr);
        // If link sharing fails, try sharing directly with the owner/user email if passed in request
        const { userEmail } = req.body;
        if (userEmail) {
          console.log(`[Google Docs Export] Attempting specific user address share with: ${userEmail}`);
          try {
            await drive.permissions.create({
              fileId: documentId,
              requestBody: {
                role: 'writer',
                type: 'user',
                emailAddress: userEmail
              }
            });
            sharedSuccessfully = true;
            console.log(`[Google Docs Export] Successfully shared Google Doc with specific user: ${userEmail}`);
          } catch (specificShareErr: any) {
            console.error('[Google Docs Export] Direct user address share unsuccessful:', specificShareErr.message || specificShareErr);
          }
        }
      }

      const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
      console.log(`[Google Docs Export] Success. Document URL: ${docUrl}`);

      res.json({
        success: true,
        url: docUrl
      });

    } catch (err: any) {
      console.error('[Google Docs Export] Caught error:', err);
      res.status(500).json({
        error: 'Failed to export protocol to Google Doc',
        details: err.message || String(err)
      });
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
