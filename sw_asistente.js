var CACHE = "zh-asistente-v3";
var FILES = ["/asistente.html", "/manifest.json", "/icon_zh_192.png", "/icon_zh_512.png", "/logger_zh.js"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (k) {
    return Promise.all(k.filter(function (x) { return x !== CACHE; }).map(function (x) { return caches.delete(x); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  if (e.request.url.indexOf("/api/") >= 0) {
    e.respondWith(fetch(e.request).catch(function () { return new Response("", { status: 503 }); }));
    return;
  }
  // navegación: SIEMPRE a la red (así la app siempre tiene lo último)
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then(function (res) {
      var c = res.clone();
      caches.open(CACHE).then(function (ca) { ca.put(e.request, c); });
      return res;
    }).catch(function () { return caches.match(e.request) || caches.match("/asistente.html"); }));
    return;
  }
  // el resto: cache-first
  e.respondWith(caches.match(e.request).then(function (cached) {
    return cached || fetch(e.request).then(function (res) {
      var c = res.clone();
      caches.open(CACHE).then(function (ca) { ca.put(e.request, c); });
      return res;
    });
  }));
});

// ─── PUSH NOTIFICATIONS (llegan como app normal al celular) ───
self.addEventListener("push", function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  var title = data.title || "🔔 ZonaHack";
  var body = data.body || "Aviso";
  var url = data.url || "/asistente.html";
  e.waitUntil(self.registration.showNotification(title, {
    body: body,
    icon: "/icon_zh_192.png",
    badge: "/icon_zh_192.png",
    data: { url: url },
    vibrate: [200, 100, 200]
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/asistente.html";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(location.origin) === 0) { return list[i].focus(); }
    }
    return clients.openWindow(url);
  }));
});