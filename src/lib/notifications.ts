import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import app from './firebase';

export async function sendInAppNotification(clientId: string, title: string, message: string, type: 'message' | 'workout' | 'feedback' | 'general', relatedId?: string) {
  try {
    await addDoc(collection(db, 'notifications'), {
      clientId,
      title,
      message,
      type,
      relatedId: relatedId || null,
      isRead: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error sending in-app notification:', error);
  }
}

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
        vapidKey: (import.meta as any).env.VITE_FIREBASE_VAPID_KEY
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
