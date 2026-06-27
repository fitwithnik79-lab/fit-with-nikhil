importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCmZZkxAgL3GsvbE3ClSeuzYYsy1PbWp4g",
  authDomain: "gen-lang-client-0278884559.firebaseapp.com",
  projectId: "gen-lang-client-0278884559",
  storageBucket: "gen-lang-client-0278884559.firebasestorage.app",
  messagingSenderId: "653761570519",
  appId: "1:653761570519:web:1731a10a7aaf870f98f292"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'Fit with Nik';
  
  // Collapse duplicate notifications by setting a specific 'tag' (based on type or title)
  const tag = payload.data?.tag || payload.data?.type || notificationTitle;

  const notificationOptions = {
    body: payload.notification?.body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: tag,
    renotify: true,
    data: {
      url: payload.data?.url || '',
      type: payload.data?.type || '',
      week: payload.data?.week || '',
      day: payload.data?.day || ''
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle click action: close notification, find existing tab or open new window to correct tab/subpage
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  let targetUrl = '/';
  if (event.notification.data) {
    const data = event.notification.data;
    if (data.url) {
      targetUrl = data.url;
    } else if (data.type === 'workout') {
      targetUrl = '/?tab=workouts';
    } else if (data.type === 'checkin' || data.type === 'feedback') {
      targetUrl = '/?tab=calendar';
    } else if (data.type === 'meal') {
      targetUrl = '/?tab=nutrition';
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

