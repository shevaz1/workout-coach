/* 한 번 연 뒤에는 인터넷 없이도 열리게 파일을 휴대폰에 담아 둔다.
   파일을 고치면 아래 버전 글자를 바꿔야 새 파일이 내려간다. */
var CACHE = 'workout-coach-v3';
var FILES = ['./', 'index.html', 'data.js', 'logic.js', 'app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// 담아 둔 것을 먼저 보여주고, 인터넷이 되면 뒤에서 새것으로 바꿔 둔다
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; });
      if (hit) { net.catch(function () {}); return hit; }
      return net.catch(function () { return req.mode === 'navigate' ? c.match('index.html') : Response.error(); });
    });
  }));
});
