import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
