import { admin, db as adminDb } from '../src/lib/firebase-admin';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Pre-generate ONE quote per client type per day (not per client — saves API calls)
async function generateQuoteForType(clientType: string): Promise<string> {
  const typeDescription: Record<string, string> = {
    'fitness': 'general fitness clients focused on strength and body composition',
    'knee_injury': 'clients recovering from knee injuries doing rehabilitation',
    'back_injury': 'clients recovering from back injuries and improving posture',
    'shoulder_injury': 'clients recovering from shoulder injuries rebuilding strength',
  };
  const desc = typeDescription[clientType] || 'fitness clients';

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const result = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: `You are Coach Nik, a personal fitness and rehabilitation coach based in India.
Today is ${today}.
Write ONE powerful, motivating morning message for ${desc}.
Rules:
- Maximum 2 sentences
- Must feel personal and genuine, not generic gym-poster text
- For rehab clients: acknowledge the difficulty of recovery, celebrate small wins
- For fitness clients: challenge them, reference their discipline
- Do NOT use clichés like "no pain no gain" or "rise and grind"
- End with a specific action or mindset for today
- Tone: warm coach, not drill sergeant
Return ONLY the message text. No quotes, no labels.`
  });

  return result.text?.trim() || 
    "Today is another chance to be 1% better than yesterday. Show up for yourself. 💪";
}

export default async function handler(req: any, res: any) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Generate one quote per client type (4 types × 1 Gemini call = 4 API calls total)
    const clientTypes = ['fitness', 'knee_injury', 'back_injury', 'shoulder_injury'];
    const quotes: Record<string, string> = {};
    
    for (const type of clientTypes) {
      quotes[type] = await generateQuoteForType(type);
    }
    
    // Save today's quotes to Firestore for reference
    const today = new Date().toISOString().split('T')[0];
    await adminDb.collection('dailyQuotes').doc(today).set({ quotes, generatedAt: new Date().toISOString() });
    
    // Get all active clients
    const usersSnap = await adminDb.collection('users')
      .where('role', '==', 'client')
      .where('status', '==', 'active')
      .get();

    let sent = 0;

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      
      // Skip if client opted out of daily quotes
      if (user.notificationPreferences?.dailyQuoteEnabled === false) continue;
      
      const tokens = user.fcmTokens || [];
      if (tokens.length === 0) continue;
      
      // Use the quote for their client type, default to fitness
      const clientType = user.clientType || 'fitness';
      const quote = quotes[clientType] || quotes['fitness'];
      
      const firstName = user.displayName?.split(' ')[0] || 'there';
      
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title: `Good morning, ${firstName} 🌅`,
            body: quote
          },
          data: {
            type: 'daily_quote',
            date: today
          },
          // Android specific: make it show even if app is in foreground
          android: {
            priority: 'high',
            notification: {
              channelId: 'daily_motivation',
              color: '#f97316', // orange
            }
          },
          // Web push specific
          webpush: {
            notification: {
              icon: '/logo.png',
              badge: '/badge-72.png',
              requireInteraction: false, // auto-dismiss after a few seconds
            },
            fcmOptions: {
              link: '/' // clicking opens the app
            }
          }
        });
        
        // Clean up invalid tokens
        if (response.failureCount > 0) {
          const failedTokens: string[] = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) failedTokens.push(tokens[idx]);
          });
          if (failedTokens.length > 0) {
            await adminDb.collection('users').doc(userDoc.id).update({
              fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens)
            });
          }
        }
        
        sent++;
      } catch (fcmError: any) {
        console.warn(`FCM send failed for user ${userDoc.id} due to configuration/permissions:`, fcmError.message || fcmError);
      }
    }

    res.json({ success: true, sent, quotesGenerated: Object.keys(quotes).length });
  } catch (error) {
    console.error('Daily quote error:', error);
    res.status(500).json({ error: 'Failed to send daily quotes' });
  }
}
