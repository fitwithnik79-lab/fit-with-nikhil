import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { format } from 'date-fns';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  return DATABASE_ID ? admin.firestore(DATABASE_ID) : admin.firestore();
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Google OAuth Config
  const CLIENT_ID = process.env.GOOGLE_FIT_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_FIT_CLIENT_SECRET;
  
  // Use a fallback or the provided APP_URL for redirect URI
  const REDIRECT_URI = `${process.env.APP_URL || `http://localhost:${PORT}`}/auth/callback`;

  app.use(express.json());

  // API to get Authorization URL
  app.get('/api/auth/google-fit/url', (req, res) => {
    if (!CLIENT_ID) {
      return res.status(500).json({ error: 'GOOGLE_FIT_CLIENT_ID is not configured' });
    }

    // Determine redirect URI dynamically based on the current origin
    const protocol = req.get('x-forwarded-proto') || 'https';
    const host = req.get('host');
    const dynamicRedirectUri = `${protocol}://${host}/auth/callback`;

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
      return res.send('No code provided');
    }

    try {
      const protocol = req.get('x-forwarded-proto') || 'https';
      const host = req.get('host');
      const dynamicRedirectUri = `${protocol}://${host}/auth/callback`;

      const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, dynamicRedirectUri);
      const { tokens } = await oauth2Client.getToken(code);

      // Return tokens to the client via postMessage
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_FIT_AUTH_SUCCESS', 
                  tokens: ${JSON.stringify(tokens)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
              <h2>Authentication successful!</h2>
              <p>Closing window...</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Error exchanging token:', error);
      res.status(500).send('Error during authentication');
    }
  });

  // API to refresh token (proxy)
  app.post('/api/auth/google-fit/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'No refresh token provided' });

    try {
      const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
      oauth2Client.setCredentials({ refresh_token });
      const { credentials } = await oauth2Client.refreshAccessToken();
      res.json(credentials);
    } catch (error) {
      console.error('Error refreshing token:', error);
      res.status(500).json({ error: 'Failed to refresh token' });
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
                dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps'
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
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens)
        });
      }

      res.json({ success: true, response });
    } catch (error) {
      console.error('Error sending notification:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
