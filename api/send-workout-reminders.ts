import { admin, db as adminDb } from '../src/lib/firebase-admin';

export default async function handler(req: any, res: any) {
  // Security: verify it's a cron call
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  const currentHour = now.getUTCHours();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Get all active clients
  const usersSnap = await adminDb.collection('users')
    .where('role', '==', 'client')
    .where('status', '==', 'active')
    .get();

  const results = [];

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    const prefs = user.notificationPreferences;
    
    // Skip if reminders disabled
    if (!prefs?.workoutReminderEnabled) continue;
    
    // Parse preferred reminder time (e.g. "18:00") 
    const [prefHour, prefMin] = (prefs.workoutReminderTime || "17:00").split(':').map(Number);
    
    // Convert preferred local time to UTC based on timezone offset
    // For IST (UTC+5:30): local 18:00 = UTC 12:30
    const tzOffset = prefs.timezone === 'Asia/Kolkata' ? 330 : 0; // minutes
    const prefUTCMinutes = prefHour * 60 + prefMin - tzOffset;
    const prefUTCHour = Math.floor(((prefUTCMinutes % 1440) + 1440) % 1440 / 60);
    
    // Only send if current UTC time matches their preference (within this hour)
    if (prefUTCHour !== currentHour) continue;
    
    // Check if they have a workout scheduled today
    const workoutSnap = await adminDb.collection('workouts')
      .where('clientId', '==', userDoc.id)
      .where('scheduledDate', '>=', todayStr)
      .where('scheduledDate', '<=', todayStr + '\uf8ff')
      .limit(1)
      .get();
    
    if (workoutSnap.empty) continue; // No workout today, skip
    
    const workout = workoutSnap.docs[0].data();
    const tokens = user.fcmTokens || [];
    if (tokens.length === 0) continue;
    
    try {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: "Time to train! 💪",
          body: `Your Week ${workout.weekNumber} Day ${workout.dayNumber} session is ready — Coach Nik built this one for you.`
        },
        data: { type: 'workout_reminder', workoutId: workoutSnap.docs[0].id }
      });
      results.push({ userId: userDoc.id, sent: true });
    } catch (fcmError: any) {
      console.warn(`FCM send failed for user ${userDoc.id} due to configuration/permissions:`, fcmError.message || fcmError);
      results.push({ userId: userDoc.id, sent: false, error: fcmError.message || String(fcmError) });
    }
  }

  res.json({ success: true, sent: results.length });
}
