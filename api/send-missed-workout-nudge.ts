import { admin, db as adminDb } from '../src/lib/firebase-admin';

export default async function handler(req: any, res: any) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  
  const usersSnap = await adminDb.collection('users')
    .where('role', '==', 'client')
    .where('status', '==', 'active')
    .get();

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    if (!user.notificationPreferences?.missedWorkoutAlertEnabled) continue;
    
    // Check last workout completion using correct 'feedback' collection
    const feedbackSnap = await adminDb.collection('feedback')
      .where('clientId', '==', userDoc.id)
      .where('completionStatus', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    const lastWorkout = feedbackSnap.empty ? null : feedbackSnap.docs[0].data().createdAt?.toDate?.()?.toISOString();
    
    // If no workout in 3 days (or never worked out)
    if (lastWorkout && lastWorkout > threeDaysAgo) continue;
    
    // Check we haven't sent this nudge in the last 3 days
    const nudgeSnap = await adminDb.collection('notificationLogs')
      .where('userId', '==', userDoc.id)
      .where('type', '==', 'missed_workout_nudge')
      .where('sentAt', '>', threeDaysAgo)
      .limit(1)
      .get();
    
    if (!nudgeSnap.empty) continue; // Already sent recently
    
    const tokens = user.fcmTokens || [];
    if (tokens.length === 0) continue;
    
    const firstName = user.displayName?.split(' ')[0] || 'there';
    
    try {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `Hey ${firstName} 👋`,
          body: "Your program is waiting — even 20 minutes today keeps the momentum alive 🔥"
        },
        data: { type: 'missed_workout_nudge' }
      });
      
      // Log that we sent this nudge (prevent spam)
      await adminDb.collection('notificationLogs').add({
        userId: userDoc.id,
        type: 'missed_workout_nudge',
        sentAt: new Date().toISOString()
      });
    } catch (fcmError: any) {
      console.warn(`FCM send failed for user ${userDoc.id} due to configuration/permissions:`, fcmError.message || fcmError);
    }
  }

  res.json({ success: true });
}
