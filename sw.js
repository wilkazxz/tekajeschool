// Service Worker — TKJ SMKN 2 Tembilahan
// Strategi: NETWORK-FIRST. Tiap buka app, selalu coba ambil file TERBARU dari server dulu.
// Cache cuma dipakai sebagai cadangan kalau internetnya mati/timeout.
//
// Efeknya buat kamu: kapan pun index.html diedit dan diupload ulang ke server, user
// LANGSUNG dapat versi terbaru saat itu juga — tidak perlu naikkan angka versi apa pun
// di file ini, tidak perlu edit sw.js sama sekali walau index.html sering diubah.
// File ini cukup diupload SEKALI, lalu dibiarkan begitu saja selamanya.

const CACHE = 'tkj-shell';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { self.clients.claim(); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Hanya tangani GET ke file di server sendiri (index.html, logo, banner, tkj.apk, dst).
  // Request ke luar (CDN font, Font Awesome, Firebase, API cuaca/bitcoin/dsb) dibiarkan
  // lewat jaringan seperti biasa — datanya memang harus selalu segar.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request)) // offline / server mati → pakai cache terakhir
  );
});
