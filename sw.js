/* sw.js — TKJ SMKN 2 Tembilahan
   1) Offline shell dasar (cache-first untuk request GET sesama origin).
   2) Penerima push notification dari Firebase Cloud Messaging, supaya notifikasi tetap
      muncul walau aplikasi/browser sedang tertutup (dikirim oleh Cloud Function di server,
      lihat functions/index.js — bukan disimulasikan dari sini).
   Catatan: konfigurasi Firebase HARUS sama persis dengan FIREBASE_CONFIG di index.html.
*/
const CACHE='tkj-shell-v1';
const SHELL=['./','./index.html'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));
});
self.addEventListener('activate',e=>{
  self.clients.claim();
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==location.origin)return; // jangan cache API pihak ketiga
  e.respondWith(
    caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      return res;
    }).catch(()=>cached))
  );
});

/* ===== Firebase Cloud Messaging (background) ===== */
try{
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey:"AIzaSyCL-KRiZQkGvFqJDbshY1-ab9g-HIjguq8",
    authDomain:"wilka-5e33d.firebaseapp.com",
    databaseURL:"https://wilka-5e33d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:"wilka-5e33d",
    storageBucket:"wilka-5e33d.firebasestorage.app",
    messagingSenderId:"269739240644",
    appId:"1:269739240644:web:693e7944eb595cdcfded91"
  });

  const messaging=firebase.messaging();
  messaging.onBackgroundMessage(payload=>{
    const n=(payload&&payload.notification)||{};
    const data=(payload&&payload.data)||{};
    self.registration.showNotification(n.title||'TKJ SMKN 2 Tembilahan',{
      body:n.body||'',
      icon:data.icon||undefined,
      badge:data.icon||undefined,
      data:{url:data.url||'./'},
      tag:'tkj-broadcast'
    });
  });
}catch(e){
  /* Kalau gagal load (mis. offline saat SW pertama kali install), abaikan diam-diam —
     offline shell di atas tetap jalan tanpa push. */
}

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil(clients.matchAll({type:'window'}).then(list=>{
    for(const c of list){if(c.url.includes(location.origin)&&'focus' in c)return c.focus()}
    if(clients.openWindow)return clients.openWindow(url);
  }));
});
