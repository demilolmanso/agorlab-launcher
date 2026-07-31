importScripts("idb.js");

const CACHE = "nexo-shell-v1"; // sube el número cuando cambies archivos del launcher
const SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/idb.js", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const MIME = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", txt: "text/plain; charset=utf-8",
  wasm: "application/wasm", gltf: "application/json", glb: "model/gltf-binary", xml: "application/xml",
};

/* El corazón del launcher: servir apps instaladas desde IndexedDB
   como si fueran un sitio HTTPS normal bajo /run/<appId>/ */
async function serveLocalApp(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["run", appId, ...resto]
  const appId = decodeURIComponent(parts[1] || "");
  let path = parts.slice(2).map(decodeURIComponent).join("/");
  if (!path || path.endsWith("/")) path += "index.html";

  const blob = await NexoIDB.getFile(`${appId}/${path}`);
  if (!blob) {
    return new Response(
      `<body style="font-family:monospace;background:#0a1517;color:#ff6b6b;padding:40px">
       <h3>404 local</h3><p>La app no incluye el archivo: ${path}</p></body>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  const ext = (path.split(".").pop() || "").toLowerCase();
  return new Response(blob, {
    status: 200,
    headers: { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-cache" },
  });
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // 1) Apps locales → siempre desde el dispositivo (funciona offline)
  if (url.origin === self.location.origin && url.pathname.startsWith("/run/")) {
    e.respondWith(serveLocalApp(e.request));
    return;
  }

  // 2) Navegación → red primero, caché como respaldo
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/index.html")))
    );
    return;
  }

  // 3) Assets del launcher → stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const network = fetch(e.request)
          .then((res) => {
            if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })
    );
  }
  // Firebase, fuentes y CDNs externos pasan directo a la red
});
