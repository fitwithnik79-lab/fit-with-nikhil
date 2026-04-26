import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import app from './firebase';

export async function triggerPushNotification(userId: string, title: string, body: string, data?: any) {
  try {
    await fetch('/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title, body, data })
    });
  } catch (error) {
    console.error('Failed to trigger push notification:', error);
  }
}

export async function requestNotificationPermission(userId: string) {
  try {
    const messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: 'BM6a-y_oF9Y_X7pWz8_Vz-5-3-X-X_X_X_X_X_X_X_X_X' // I need a real VAPID key usually
      });
      
      if (token) {
        console.log('FCM Token:', token);
        // Save token to user profile
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          fcmTokens: arrayUnion(token)
        });
        return token;
      }
    }
  } catch (error) {
    console.error('An error occurred while retrieving token:', error);
  }
  return null;
}

export function onForegroundMessage() {
  const messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);
    // You can show a custom toast or UI notification here
    if (payload.notification) {
      new Notification(payload.notification.title || 'New Notification', {
        body: payload.notification.body,
      });
    }
  });
}
