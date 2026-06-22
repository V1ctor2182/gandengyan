// 干瞪眼记分 离线缓存。改了 app 文件就把 CACHE 版本号 +1，触发更新。
const CACHE = "gdy-v1";
const SHELL = [
  "./", "./index.html", "./supabase.js", "./manifest.json",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // 跨域（Supabase）交给网络，不缓存

  if (req.mode === "navigate") {                          // 页面导航：联网优先，断网回退缓存壳
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html").then(r => r || caches.match("./")))
    );
    return;
  }
  // 其余同源资源：缓存优先 + 后台更新（stale-while-revalidate）
  e.respondWith(
    caches.open(CACHE).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { if (res && res.status === 200) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }))
  );
});
