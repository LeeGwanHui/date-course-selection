/* 데이트 코스 PWA 서비스워커
   - 셸(index.html, app.js, manifest, 아이콘, factors.json): 캐시 우선 + 프리캐시 → 오프라인/설치.
   - 내비게이션(?c=, ?f= 포함): 셸(index.html)을 돌려줘 SPA 라우팅이 오프라인에서도 동작.
   - JSON 데이터(courses/, factors.json): 네트워크 우선 + 캐시 폴백(최신 우선, 오프라인 대비 캐시). */
const CACHE = "date-course-v4";
const SHELL = [
  ".", "index.html", "app.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "factors.json",
];

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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 외부(카카오맵 등)는 관여 안 함

  // 내비게이션 → 앱 셸
  // ⚠️ 단, kitchen/ 같은 독립 정적 페이지는 SPA 셸로 가로채면 안 된다.
  //    가로채면 그 URL을 열어도 PWA 홈이 뜬다 (2026-08-02에 실제로 그랬다).
  if (req.mode === "navigate") {
    if (url.pathname.includes("/kitchen/")) {
      e.respondWith(fetch(req).catch(() => caches.match(req)));
      return;
    }
    e.respondWith(caches.match("index.html").then((hit) => hit || fetch(req)));
    return;
  }

  // JSON 데이터 → 네트워크 우선, 성공 시 캐시 갱신, 실패 시 캐시
  if (url.pathname.endsWith(".json")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 그 외 셸 자산 → 캐시 우선
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
