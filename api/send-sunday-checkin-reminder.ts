import { admin, db as adminDb } from '../src/lib/firebase-admin';

export default async function handler(req: any, res: any) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().split('T')[0];
  
  const usersSnap = await adminDb.collection('users')
    .where('role', '==', 'client')
    .where('status', '==', 'active')
    .get();

  for (const userDoc of usersSnap.docs) {
    // Check if they already submitted this week's check-in
    const checkInSnap = await adminDb.collection('weeklyCheckIns')
      .where('uid', '==', userDoc.id)
      .where('weekOf', '==', today)
      .limit(1)
      .get();
    
    if (!checkInSnap.empty) continue; // Already submitted
    
    const user = userDoc.data();
    const tokens = user.fcmTokens || [];
    if (tokens.length === 0) continue;
    
    const firstName = user.displayName?.split(' ')[0] || 'there';
    
    try {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: "Sunday check-in 📋",
          body: `Hey ${firstName}, 2 minutes helps Nik tune next week's program just for you.`
        },
        data: { type: 'sunday_checkin', deepLink: '/checkin' }
      });
    } catch (fcmError: any) {
      console.warn(`FCM send failed for user ${userDoc.id} due to configuration/permissions:`, fcmError.message || fcmError);
    }
  }

  res.json({ success: true });
}
