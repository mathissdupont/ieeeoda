// basit cache-first sw
const CACHE = "techops-v1";
const ASSETS = [
  "/",
  "/panel.html",
  "/login.html",
  "/assets/techops.ico",
  "https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // firebase rtdb çağrılarını cache’leme (canlı kalsın)
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("firebasedatabase.app")) {
    return; // network
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
