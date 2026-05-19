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
import { GoogleGenAI } from '@google/genai';

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

  app.use(express.json({ limit: '10mb' }));

  // Shared Gemini API routes for client functionality
  app.post('/api/gemini/motivate', async (req, res) => {
    const { clientName, weekNumber } = req.body;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: `You are Nik, a high-energy fitness coach. Write a short, powerful motivational message for your client ${clientName} who just finished Week ${weekNumber} of their program. Keep it under 3 sentences. Be specific about their progress and encourage them for next week.` }] }]
      });
      res.json({ text: response.text || "Great job this week! Keep pushing!" });
    } catch (error: any) {
      console.error("Motivational message error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/search-videos', async (req, res) => {
    const { exerciseName } = req.body;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: `Find 3 high-quality YouTube demonstration video links for the exercise: "${exerciseName}". 
        
        CRITICAL VIDEO SELECTION CRITERIA:
        1. RELEVANCE: The video must be exactly about "${exerciseName}".
        2. CONCISE: Prioritize "YouTube Shorts" or very short, direct explanatory videos (under 2 minutes) that show proper form without long intros.
        3. QUALITY: Select videos from reputable fitness channels.
        
        Return the result as a JSON array of objects, each with 'title' and 'url' properties.` }]}],
        config: { responseMimeType: "application/json" }
      });
      res.json(JSON.parse(response.text || "[]"));
    } catch (error: any) {
      console.error("Search videos error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/analyze-meal-image', async (req, res) => {
    const { image, mimeType } = req.body;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: image, mimeType } },
            { text: "Analyze this meal image. Identify the food items and estimate calories, protein, carbs, and fats FOR EACH ITEM separately. Return the result as a JSON object with a 'mealName' and an 'items' array. Each item should have 'name', 'calories', 'protein', 'carbs', and 'fats'. Also include a general 'advice' string." }
          ]
        }],
        config: { responseMimeType: "application/json" }
      });
      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Analyze meal image error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/analyze-meal-text', async (req, res) => {
    const { mealDescription } = req.body;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: `You are an elite performance nutritionist. Analyze the following meal description: "${mealDescription}". 
        
        CRITICAL INSTRUCTION: Be extremely detailed. If a user enters a simple item like "Tea", "Coffee", "Pasta", or "Cereal", do NOT just analyze the dry ingredient. 
        - "Tea" usually means milk tea (assume 100ml milk + 2 tsp sugar unless they say black).
        - "Coffee" usually means with milk/cream + sugar.
        - "Pasta" implies sauce, oil, and cheese.
        Break down the implicit ingredients that make up the real-world version of this meal.
        
        Return the result as a JSON object with a 'mealName' and an 'items' array. 
        Each item should have 'name', 'calories', 'protein', 'carbs', and 'fats'. 
        Also include a general 'advice' string.` }]}],
        config: { responseMimeType: "application/json" }
      });
      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Analyze meal text error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/batch-macros', async (req, res) => {
    const { items } = req.body;
    const itemsDescription = items.map((i: any) => `${i.quantity} of ${i.name}`).join(", ");
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: `Calculate the calories, protein, carbs, and fats for the following food items and their specific quantities: "${itemsDescription}". 
        Return the result as a JSON object with an 'items' array. 
        Each item should have 'name', 'quantity', 'calories', 'protein', 'carbs', and 'fats'.` }]}],
        config: { responseMimeType: "application/json" }
      });
      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Batch macros error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/analyze-daily-nutrition', async (req, res) => {
    const { summary, goals } = req.body;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
      });
      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Daily nutrition analysis error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/parse-workout-file', async (req, res) => {
    const { fileContent, fileName } = req.body;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: `You are an expert fitness coach. Parse the following workout routine content from a file named "${fileName}". 
        The content might be a list of exercises, a spreadsheet-like structure, or a document.
        Convert it into a structured Program Template.
        
        CRITICAL INSTRUCTIONS:
        1. Be extremely accurate to the original plan. If it says "Day 1: Legs", ensure Day 1 is Legs.
        2. For EVERY exercise identified, find a high-quality YouTube demonstration video link.
        3. VIDEO SELECTION: Prioritize "YouTube Shorts" or very short, direct explanatory videos (under 2 minutes) that show proper form immediately. Ensure the video is highly relevant to the specific exercise.
        4. Populate the 'youtubeLink' field for every exercise.
        5. Identify the session "block" for each exercise based on the layout or section title (e.g., "Warm-Up", "Conditioning", "Cool Down"). If no block is evident, default to "Conditioning".
        
        Content:
        ${fileContent}
        
        Return a JSON object representing a ProgramTemplate.` }]}],
        config: { responseMimeType: "application/json" }
      });
      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Parse workout file error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/analyze-nutrition-file', async (req, res) => {
    const { fileContent, fileName } = req.body;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
      });
      res.json(JSON.parse(response.text || "{}"));
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

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
        }
      });

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

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
      });

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

  // Google OAuth Config
  const CLIENT_ID = process.env.GOOGLE_FIT_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_FIT_CLIENT_SECRET;
  
  // Use a fallback or the provided APP_URL for redirect URI
  const REDIRECT_URI = `${process.env.APP_URL || `http://localhost:${PORT}`}/auth/callback`;

  // Helper to get consistent dynamic redirect URI
  const getRedirectUri = (req: express.Request) => {
    const protocol = req.get('x-forwarded-proto') || 'https';
    const host = req.get('host');
    return `${protocol}://${host}/auth/callback`;
  };

  // API to get Authorization URL
  app.get('/api/auth/google-fit/url', (req, res) => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ error: 'Google Fit credentials (ID/Secret) are not configured in system environment variables.' });
    }

    const dynamicRedirectUri = getRedirectUri(req);
    const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, dynamicRedirectUri);

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/fitness.activity.read'
      ],
    });

    res.json({ url, redirectUri: dynamicRedirectUri });
  });

  // OAuth Callback Handler
  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const code = req.query.code as string;
    
    if (!code) {
      return res.status(400).send('No code provided by Google');
    }

    try {
      const dynamicRedirectUri = getRedirectUri(req);
      const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, dynamicRedirectUri);
      const { tokens } = await oauth2Client.getToken(code);

      // Return tokens to the client via postMessage
      res.send(`
        <html>
          <body style="background: #09090b; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_FIT_AUTH_SUCCESS', 
                  tokens: ${JSON.stringify(tokens)} 
                }, '*');
                setTimeout(() => window.close(), 1000);
              } else {
                window.location.href = '/';
              }
            </script>
            <div style="text-align: center;">
              <h2 style="color: #f97316;">Connection Successful!</h2>
              <p>Closing this window to return to the app...</p>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Error exchanging token:', error);
      res.status(500).send('Error during authentication: ' + error.message);
    }
  });

  // API to refresh token
  app.post('/api/auth/google-fit/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'No refresh token provided' });

    try {
      const dynamicRedirectUri = getRedirectUri(req);
      const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, dynamicRedirectUri);
      oauth2Client.setCredentials({ refresh_token });
      const { credentials } = await oauth2Client.refreshAccessToken();
      res.json(credentials);
    } catch (error: any) {
      console.error('Error refreshing token:', error);
      res.status(500).json({ error: 'Failed to refresh token: ' + error.message });
    }
  });

  // API to sync all clients' steps from Google Fit
  app.post('/api/sync/all-steps', async (req, res) => {
    try {
      const firestore = getFirestore();
      const usersSnap = await firestore.collection('users').where('role', '==', 'client').get();
      const clients = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

      const syncResults = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startTimeMillis = today.getTime();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const endTimeMillis = tomorrow.getTime();

      for (const client of clients) {
        const tokens = (client as any).googleFitTokens;
        if (!tokens || !tokens.refresh_token) continue;

        try {
          const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
          oauth2Client.setCredentials(tokens);
          
          // Check if expired and refresh if needed
          let accessToken = tokens.access_token;
          if (!tokens.expiry_date || Date.now() > tokens.expiry_date - 300000) {
            const { credentials } = await oauth2Client.refreshAccessToken();
            accessToken = credentials.access_token;
            // Update tokens in firestore
            await firestore.collection('users').doc(client.uid).update({
              googleFitTokens: { ...tokens, ...credentials }
            });
          }

          // Fetch steps
          const aggregateUrl = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';
          const fitResponse = await fetch(aggregateUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              aggregateBy: [{
                dataTypeName: 'com.google.step_count.delta',
                dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas'
              }],
              bucketByTime: { durationMillis: 86400000 },
              startTimeMillis,
              endTimeMillis
            })
          });

          if (fitResponse.ok) {
            const fitData = await fitResponse.json();
            let totalSteps = 0;
            const buckets = fitData.bucket;
            if (buckets && buckets.length > 0) {
              buckets.forEach((bucket: any) => {
                bucket.dataset?.forEach((dataset: any) => {
                  dataset.point?.forEach((point: any) => {
                    totalSteps += point.value[0].intVal || 0;
                  });
                });
              });
            }

            // Save steps to a metrics collection or directly to user
            const dateStr = format(today, 'yyyy-MM-dd');
            const stepDocId = `${client.uid}_${dateStr}`;
            
            // 1. Save to dedicated daily_steps
            await firestore.collection('daily_steps').doc(stepDocId).set({
              clientId: client.uid,
              steps: totalSteps,
              date: dateStr,
              updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            // 2. Sync to metrics collection for the app's existing tracking system
            const metricsQuery = await firestore.collection('metrics')
              .where('clientId', '==', client.uid)
              .where('date', '==', dateStr)
              .limit(1)
              .get();

            if (!metricsQuery.empty) {
              await firestore.collection('metrics').doc(metricsQuery.docs[0].id).update({
                stepCount: totalSteps,
                updatedAt: FieldValue.serverTimestamp()
              });
            } else {
              // Create default metrics for today if they don't exist
              await firestore.collection('metrics').add({
                clientId: client.uid,
                date: dateStr,
                stepCount: totalSteps,
                waterIntake: 0,
                calories: 0,
                weight: Number((client as any).weight) || 0,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
              });
            }

            syncResults.push({ uid: client.uid, steps: totalSteps, status: 'success' });
          } else {
            syncResults.push({ uid: client.uid, status: 'failed', error: 'Fit API error' });
          }
        } catch (error: any) {
          console.error(`Failed to sync steps for ${client.uid}:`, error);
          syncResults.push({ uid: client.uid, status: 'error', message: error.message });
        }
      }

      res.json({ success: true, results: syncResults });
    } catch (error: any) {
      console.error('Global sync error:', error);
      res.status(500).json({ error: error.message });
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

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
      });

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
