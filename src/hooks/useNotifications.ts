import { useState, useEffect } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import app from '../lib/firebase';

export interface UseNotificationsResult {
  permission: NotificationPermission;
  token: string | null;
  loading: boolean;
  error: string | null;
  requestPermission: () => Promise<string | null>;
}

export function useNotifications(userId: string | undefined): UseNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' ? Notification.permission : 'default'
  );
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    // Check if Service Worker is supported
    if (!('serviceWorker' in navigator)) {
      setError('Service Worker not supported in this browser.');
      return;
    }

    // Register Service Worker if not registered
    navigator.serviceWorker
      .register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('[useNotifications] Service Worker registered:', registration);
      })
      .catch((err) => {
        console.error('[useNotifications] Service Worker registration failed:', err);
      });

    // If permission is already granted, fetch token silently
    if (Notification.permission === 'granted') {
      fetchTokenSilently(userId);
    }

    // Listen to foreground messages
    try {
      const messaging = getMessaging(app);
      const unsubscribe = onMessage(messaging, (payload) => {
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

        // Also trigger native browser notification if allowed and tab is out of focus
        if (document.hidden && Notification.permission === 'granted') {
          new Notification(payload.notification?.title || 'FWN Coach Alert', {
            body: payload.notification?.body,
            icon: '/logo.png'
          });
        }
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('[useNotifications] FCM messaging not supported or failed to initialize:', e);
    }
  }, [userId]);

  const fetchTokenSilently = async (uid: string) => {
    try {
      const messaging = getMessaging(app);
      const activeToken = await getToken(messaging, {
        vapidKey: 'BM6a-y_oF9Y_X7pWz8_Vz-5-3-X-X_X_X_X_X_X_X_X_X'
      });
      if (activeToken) {
        setToken(activeToken);
        // Register token with backend
        await fetch('/api/notifications/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, token: activeToken })
        });
        console.log('[useNotifications] FCM Token synchronized successfully');
      }
    } catch (err: any) {
      console.error('[useNotifications] Failed to retrieve token silently:', err);
    }
  };

  const requestPermission = async (): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    setLoading(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted' && userId) {
        const messaging = getMessaging(app);
        const activeToken = await getToken(messaging, {
          vapidKey: 'BM6a-y_oF9Y_X7pWz8_Vz-5-3-X-X_X_X_X_X_X_X_X_X'
        });
        if (activeToken) {
          setToken(activeToken);
          // Sync with server
          await fetch('/api/notifications/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, token: activeToken })
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
