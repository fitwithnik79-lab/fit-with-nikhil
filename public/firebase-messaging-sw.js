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
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png' // You can provide a real icon path here
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
