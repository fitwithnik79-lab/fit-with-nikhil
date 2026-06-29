import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, serverTimestamp } from 'firebase/firestore';
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
    // Read tokens on client side
    let fcmTokens: string[] = [];
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        fcmTokens = userDocSnap.data()?.fcmTokens || [];
      }
    } catch (dbErr) {
      console.warn('[Notifications] Client failed to read tokens from Firestore:', dbErr);
    }

    const response = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title, body, data, fcmTokens })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.failedTokens && result.failedTokens.length > 0) {
        try {
          // Cleanup failed tokens client-side where we have permission
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, {
            fcmTokens: arrayRemove(...result.failedTokens)
          });
          console.log('[Notifications] Cleaned up failed tokens client-side:', result.failedTokens);
        } catch (cleanupErr) {
          console.error('[Notifications] Client failed to clean up failed tokens:', cleanupErr);
        }
      }
    }
  } catch (error) {
    console.error('Failed to trigger push notification:', error);
  }
}

/**
 * Safely shows a local browser notification using ServiceWorker registration if possible,
 * falling back to standard Notification constructor to avoid "TypeError: Illegal constructor" on mobile devices.
 */
export function showNativeNotification(title: string, body?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if ((window as any).Notification.permission !== 'granted') return;

  const options: NotificationOptions = {
    body,
    icon: '/logo.png'
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.showNotification(title, options);
      })
      .catch((err) => {
        console.warn('[Notifications] SW native notification show failed, falling back:', err);
        try {
          new (window as any).Notification(title, options);
        } catch (fallbackErr) {
          console.error('[Notifications] Both SW and fallback Notification constructor failed:', fallbackErr);
        }
      });
  } else {
    try {
      new (window as any).Notification(title, options);
    } catch (err) {
      console.error('[Notifications] Direct Notification constructor failed:', err);
    }
  }
}

export async function requestNotificationPermission(userId: string) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('[Notifications] Web notifications not supported on this device/browser.');
      return null;
    }

    const supported = await isSupported();
    if (!supported) {
      console.log('[Notifications] Firebase messaging not supported on this browser/device.');
      return null;
    }

    const messaging = getMessaging(app);
    
    // Support callback style in older iOS versions where requestPermission doesn't return a promise
    let permission: NotificationPermission = 'default';
    const NotificationApi = (window as any).Notification;
    
    if (NotificationApi && typeof NotificationApi.requestPermission === 'function') {
      try {
        const req = NotificationApi.requestPermission();
        if (req && typeof req.then === 'function') {
          permission = await req;
        } else {
          permission = NotificationApi.permission;
        }
      } catch (modernErr) {
        console.warn('[Notifications] Modern requestPermission failed, trying callback fallback:', modernErr);
        try {
          permission = await new Promise<NotificationPermission>((resolve) => {
            NotificationApi.requestPermission(resolve);
          });
        } catch (callbackErr) {
          console.error('[Notifications] Callback-based requestPermission also failed:', callbackErr);
          permission = NotificationApi.permission || 'default';
        }
      }
    } else {
      console.warn('[Notifications] Notification.requestPermission is not a function or not available.');
      if (NotificationApi) {
        permission = NotificationApi.permission || 'default';
      }
    }
    
    if (permission === 'granted') {
      const vapidKey = (import.meta as any).env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        console.warn('[Notifications] VITE_FIREBASE_VAPID_KEY is missing from environment. Skipping FCM token retrieval.');
        return null;
      }
      const token = await getToken(messaging, { vapidKey });
      
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

export async function onForegroundMessage() {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const supported = await isSupported();
    if (!supported) return;

    const messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
      // Dispatch custom event so UI can show local notification toast
      const event = new CustomEvent('fcm-foreground-message', {
        detail: {
          title: payload.notification?.title || 'Notification',
          body: payload.notification?.body || '',
          data: payload.data
        }
      });
      window.dispatchEvent(event);

      if (payload.notification) {
        showNativeNotification(
          payload.notification.title || 'New Notification',
          payload.notification.body
        );
      }
    });
  } catch (error) {
    console.warn('[Notifications] Failed to initialize foreground message listener:', error);
  }
}
