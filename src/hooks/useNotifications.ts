import { useState, useEffect } from 'react';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import app, { db } from '../lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

export interface UseNotificationsResult {
  permission: NotificationPermission;
  token: string | null;
  loading: boolean;
  error: string | null;
  requestPermission: () => Promise<string | null>;
}

export function useNotifications(userId: string | undefined): UseNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return (window as any).Notification.permission;
    }
    return 'default';
  });
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    let active = true;

    async function initFCM() {
      // Check if Service Worker is supported
      if (!('serviceWorker' in navigator)) {
        setError('Service Worker not supported in this browser.');
        return;
      }

      // Check if FCM is supported
      try {
        const supported = await isSupported();
        if (!supported) {
          console.log('[useNotifications] FCM messaging not supported on this device/browser.');
          return;
        }
      } catch (e) {
        console.warn('[useNotifications] Error checking isSupported:', e);
        return;
      }

      // Register Service Worker if not registered
      try {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('[useNotifications] Service Worker registered:', registration);
      } catch (err) {
        console.error('[useNotifications] Service Worker registration failed:', err);
      }

      // If permission is already granted, fetch token silently
      if (typeof window !== 'undefined' && 'Notification' in window && (window as any).Notification.permission === 'granted') {
        fetchTokenSilently(userId);
      }

      // Listen to foreground messages
      try {
        const messaging = getMessaging(app);
        const unsubscribe = onMessage(messaging, (payload) => {
          if (!active) return;
          console.log('[useNotifications] Foreground message received:', payload);
          // Dispatch custom event to notify our layout to show a toast
          const event = new CustomEvent('fcm-foreground-message', {
            detail: {
              title: payload.notification?.title || 'Notification',
              body: payload.notification?.body || '',
              data: payload.data
            }
          });
          window.dispatchEvent(event);

          // Trigger local native browser notification if tab is hidden
          if (document.hidden && typeof window !== 'undefined' && 'Notification' in window && (window as any).Notification.permission === 'granted') {
            showNotificationSafe(payload.notification?.title || 'FWN Coach Alert', {
              body: payload.notification?.body,
              icon: '/logo.png'
            });
          }
        });

        return unsubscribe;
      } catch (e) {
        console.warn('[useNotifications] FCM messaging initialization failed:', e);
      }
    }

    let unsub: (() => void) | undefined;
    initFCM().then((u) => {
      unsub = u;
    });

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, [userId]);

  const showNotificationSafe = (title: string, options: NotificationOptions) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if ((window as any).Notification.permission !== 'granted') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.showNotification(title, options);
        })
        .catch((err) => {
          console.warn('[useNotifications] Failed to show via SW, trying fallback:', err);
          try {
            new (window as any).Notification(title, options);
          } catch (fallbackErr) {
            console.error('[useNotifications] Fallback also failed:', fallbackErr);
          }
        });
    } else {
      try {
        new (window as any).Notification(title, options);
      } catch (err) {
        console.error('[useNotifications] Failed to construct Notification:', err);
      }
    }
  };

  const fetchTokenSilently = async (uid: string) => {
    try {
      const supported = await isSupported();
      if (!supported) return;

      const messaging = getMessaging(app);
      const vapidKey = (import.meta as any).env.VITE_FIREBASE_VAPID_KEY || 'BM6a-y_oF9Y_X7pWz8_Vz-5-3-X-X_X_X_X_X_X_X_X_X';
      const activeToken = await getToken(messaging, { vapidKey });
      if (activeToken) {
        setToken(activeToken);
        // Register token directly via Client SDK
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
          fcmTokens: arrayUnion(activeToken)
        }).catch((err) => {
          console.warn('[useNotifications] Failed to save token client-side:', err);
        });
        console.log('[useNotifications] FCM Token synchronized successfully client-side');
      }
    } catch (err: any) {
      console.error('[useNotifications] Failed to retrieve token silently:', err);
    }
  };

  const requestPermission = async (): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    setLoading(true);
    setError(null);

    if (!('Notification' in window)) {
      setError('Push notifications are not supported on this browser or device.');
      setLoading(false);
      return null;
    }

    try {
      const supported = await isSupported();
      if (!supported) {
        setError('Firebase messaging is not supported on this device/browser.');
        setLoading(false);
        return null;
      }

      // Support callback fallback for older Safari/iOS safely
      let result: NotificationPermission = 'default';
      const NotificationApi = (window as any).Notification;
      
      if (NotificationApi && typeof NotificationApi.requestPermission === 'function') {
        try {
          const req = NotificationApi.requestPermission();
          if (req && typeof req.then === 'function') {
            result = await req;
          } else {
            result = NotificationApi.permission;
          }
        } catch (modernErr) {
          console.warn('[useNotifications] Modern requestPermission failed, trying callback fallback:', modernErr);
          try {
            result = await new Promise<NotificationPermission>((resolve) => {
              NotificationApi.requestPermission(resolve);
            });
          } catch (callbackErr) {
            console.error('[useNotifications] Callback-based requestPermission also failed:', callbackErr);
            result = NotificationApi.permission || 'default';
          }
        }
      } else {
        console.warn('[useNotifications] Notification.requestPermission is not available on this device.');
        if (NotificationApi) {
          result = NotificationApi.permission || 'default';
        }
      }

      setPermission(result);

      if (result === 'granted' && userId) {
        const messaging = getMessaging(app);
        const vapidKey = (import.meta as any).env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
          console.warn('[useNotifications] VITE_FIREBASE_VAPID_KEY is missing from environment. Skipping FCM token retrieval.');
          setLoading(false);
          return null;
        }
        const activeToken = await getToken(messaging, { vapidKey });
        if (activeToken) {
          setToken(activeToken);
          // Sync directly via Client SDK
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(activeToken)
          });
          setLoading(false);
          return activeToken;
        }
      } else if (result === 'denied') {
        setError('Notification permission denied by user.');
      }
    } catch (err: any) {
      console.error('[useNotifications] Error requesting permission:', err);
      setError(err.message || 'Failed to obtain notifications subscription.');
    } finally {
      setLoading(false);
    }
    return null;
  };

  return { permission, token, loading, error, requestPermission };
}
