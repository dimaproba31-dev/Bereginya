// Сохраняет приложение на телефоне, чтобы оно открывалось без интернета.
// При изменении файлов приложения увеличьте номер версии.
const VERSION = 'otara-v12';
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const SHELL = [
  './', './index.html', './app.js', './config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/logo.png',
  FB + 'firebase-app.js', FB + 'firebase-firestore.js', FB + 'firebase-auth.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Запросы к базе и входу Firebase не трогаем — их обрабатывает сама библиотека.
  if (/googleapis\.com$/.test(url.hostname) && !url.hostname.startsWith('fonts.')) return;
  if (url.hostname.endsWith('firebaseapp.com')) return;

  const ownFile = url.origin === location.origin;
  if (ownFile) {
    // Свои файлы: сначала сеть (чтобы получать обновления), без сети — из кэша.
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    }).catch(() => caches.match(req, {ignoreSearch: true}).then(r => r || caches.match('./index.html'))));
    return;
  }
  if (url.hostname === 'www.gstatic.com' || url.hostname.startsWith('fonts.')) {
    // Библиотеки и шрифты не меняются: сначала кэш.
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    })));
  }
});
