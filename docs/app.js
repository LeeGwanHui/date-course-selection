/* 데이트 코스 공유 PWA
   라우팅:
     #<mode>:<payload>  → 공유받은 1회성 코스(URL에 데이터, 서버 저장 없음)
     ?c=<slug>          → 아카이브에 저장된 코스(docs/courses/<slug>.json)
     ?f=<slug>          → 심리 근거 요인 상세 / ?f (값 없음) → 요인 목록(가이드)
     (파라미터 없음)      → '우리 데이트 기록' 홈(아카이브 목록)
   코스 렌더 마크업/클래스는 스킬의 render_course.py(build_html/render_course/render_stop)와 1:1.
   인코딩 규약은 share_link.py와 일치: "<mode>:<base64url>", mode z=deflate(zlib), j=plain. */

const BADGE = { peak: ["🎯", "피크"], finale: ["🏁", "피날레"] };

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

const app = () => document.getElementById("app");

/* ---------- 디코드(공유 링크) ---------- */
function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function inflate(bytes) {
  const ds = new DecompressionStream("deflate");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
async function decodeFragment(frag) {
  const sep = frag.indexOf(":");
  if (sep < 0) throw new Error("형식 오류: 모드 구분자(:)가 없습니다.");
  const mode = frag.slice(0, sep);
  let bytes = b64urlToBytes(frag.slice(sep + 1));
  if (mode === "z") bytes = await inflate(bytes);
  else if (mode !== "j") throw new Error("알 수 없는 인코딩 모드: " + mode);
  return JSON.parse(new TextDecoder("utf-8").decode(bytes));
}

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url + " (" + r.status + ")");
  return r.json();
}

/* factors.json 캐시(요인 slug→객체). 실패해도(오프라인 등) 앱은 동작. */
let FACTORS = null;
async function loadFactors() {
  if (FACTORS) return FACTORS;
  try {
    const d = await fetchJSON("factors.json");
    FACTORS = new Map(d.factors.map((f) => [f.slug, f]));
  } catch {
    FACTORS = new Map();
  }
  return FACTORS;
}

/* ---------- 코스 렌더 (render_course.py 이식) ---------- */
function renderStop(stop) {
  let badgeHtml = "";
  const b = stop.badge;
  if (b && BADGE[b]) {
    const [emoji, label] = BADGE[b];
    badgeHtml = `<span class="badge ${esc(b)}">${emoji} ${label}</span>`;
  }
  let name = esc(stop.name || "");
  if (stop.place_url) {
    name = `<a href="${esc(stop.place_url)}" target="_blank" rel="noopener">${name} ↗</a>`;
  }
  const metaBits = [];
  if (stop.stay) metaBits.push(`체류 ${esc(stop.stay)}`);
  const metaLine = metaBits.length ? `<div class="stop-meta">${metaBits.join(" · ")}</div>` : "";
  const reason = stop.reason ? `<div class="stop-reason">${esc(stop.reason)}</div>` : "";
  const move = stop.move ? `<div class="move"><span>🚶 ${esc(stop.move)}</span></div>` : "";
  return `      <li class="stop">
        <div class="dot"></div>
        <div class="stop-body">
          <div class="stop-head"><span class="time">${esc(stop.time || "")}</span> ${badgeHtml}</div>
          <div class="stop-name">${name}</div>
          ${reason}
          ${metaLine}
        </div>
      </li>
      ${move ? `<li class="move-row">${move}</li>` : ""}`;
}

/* 코스에 연결된 심리 근거 요인 slug 수집: course.factors + stop.factors + 배지(peak/finale→peak-end) */
function collectFactorSlugs(course) {
  const out = [];
  const add = (s) => { if (s && !out.includes(s)) out.push(s); };
  (course.factors || []).forEach(add);
  for (const st of course.stops || []) {
    (st.factors || []).forEach(add);
    if (st.badge === "peak" || st.badge === "finale") add("peak-end");
  }
  return out;
}

function renderFactorChips(course, factorMap) {
  if (!factorMap || factorMap.size === 0) return "";
  const slugs = collectFactorSlugs(course).filter((s) => factorMap.has(s));
  if (!slugs.length) return "";
  const chips = slugs
    .map((s) => `<a class="chip" href="?f=${encodeURIComponent(s)}">${esc(factorMap.get(s).name)}</a>`)
    .join(" ");
  return `<div class="factors-why"><span class="why-label">💡 이 코스의 심리 근거</span>${chips}</div>`;
}

function renderCourse(course, idx, factorMap) {
  const headerBits = [];
  if (course.concept) headerBits.push(`<p class="concept">${esc(course.concept)}</p>`);
  const facts = [];
  if (course.route_summary) facts.push(`<span>🗺️ ${esc(course.route_summary)}</span>`);
  if (course.cost) facts.push(`<span>💰 ${esc(course.cost)}</span>`);
  const factsHtml = facts.length ? `<div class="facts">${facts.join("")}</div>` : "";
  const stopsHtml = (course.stops || []).map(renderStop).join("\n");
  const footerBits = [];
  if (course.plan_b) footerBits.push(`<div class="note">☔ <b>Plan B</b> — ${esc(course.plan_b)}</div>`);
  for (const tip of course.tips || []) footerBits.push(`<div class="note">${esc(tip)}</div>`);
  return `  <section class="course">
    <h2>${esc(course.name || `코스 ${idx + 1}`)}</h2>
    ${headerBits.join("")}
    ${factsHtml}
    <ul class="timeline">
${stopsHtml}
    </ul>
    ${footerBits.join("")}
    ${renderFactorChips(course, factorMap)}
  </section>`;
}

function renderCourseDoc(data, factorMap, navHtml = "") {
  const title = esc(data.title || "데이트 코스");
  const meta = data.meta ? `<p class="subtitle">${esc(data.meta)}</p>` : "";
  const sections = (data.courses || []).map((c, i) => renderCourse(c, i, factorMap)).join("\n");
  document.title = data.title || "데이트 코스";
  return `${navHtml}<h1>${title}</h1>\n${meta}\n${sections}`;
}

/* ---------- 아카이브 / 근거 가이드 ---------- */
function nav(links) {
  return `<div class="topnav">${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</div>`;
}

function renderArchive(index) {
  document.title = "우리 데이트 기록";
  const courses = (index && index.courses) || [];
  const head = `${nav([["?f", "💡 심리 근거 가이드"]])}<h1>💞 우리 데이트 기록</h1>`;
  if (!courses.length) {
    return head + `<p class="subtitle">아직 저장된 코스가 없어요.</p>
      <div class="empty"><p>코스를 만들면 여기에 하나씩 쌓여 지난 데이트를 다시 볼 수 있어요.</p>
      <p class="hint">저장: <code>save_course.py</code></p></div>`;
  }
  const cards = courses.map((c) => `<a class="arch-card" href="?c=${encodeURIComponent(c.slug)}">
      <div class="date">${esc(c.date || "")}</div>
      <div class="t">${esc(c.title || "데이트 코스")}</div>
      ${c.meta ? `<div class="m">${esc(c.meta)}</div>` : ""}
    </a>`).join("\n");
  return head + `<p class="subtitle">지난 코스 ${courses.length}개</p>\n${cards}`;
}

function factorBlock(label, text) {
  return text ? `<div class="factor-block"><h3>${label}</h3><p>${esc(text)}</p></div>` : "";
}

function renderFactorDetail(f) {
  document.title = f.name;
  return `${nav([[".", "🏠 기록"], ["?f", "💡 가이드"]])}
    <div class="factor-detail">
      <div class="cat">${esc(f.category)}</div>
      <h1>${esc(f.name)}</h1>
      ${f.summary ? `<p class="subtitle">${esc(f.summary)}</p>` : ""}
      ${factorBlock("정의·중요성", f.definition)}
      ${factorBlock("심리 근거", f.psychology)}
      ${factorBlock("적용법", f.how_to)}
      ${factorBlock("흔한 실수", f.mistakes)}
    </div>`;
}

function renderFactorIndex(factors) {
  document.title = "심리 근거 가이드";
  const groups = [];
  const seen = new Map();
  for (const f of factors) {
    if (!seen.has(f.category)) { seen.set(f.category, []); groups.push(f.category); }
    seen.get(f.category).push(f);
  }
  const body = groups.map((g) => `<div class="factor-group"><h2>${esc(g)}</h2>
      <div class="factor-list">${seen.get(g).map((f) => `<a href="?f=${encodeURIComponent(f.slug)}">
        <span class="fn">${esc(f.name)}</span><span class="fs">${esc(f.summary)}</span></a>`).join("")}</div>
    </div>`).join("\n");
  return `${nav([[".", "🏠 우리 데이트 기록"]])}<h1>💡 심리 근거 가이드</h1>
    <p class="subtitle">데이트 코스를 뒷받침하는 15개 요인</p>${body}`;
}

function showMessage(html) {
  app().innerHTML = `<div class="empty">${html}</div>`;
}

/* ---------- 라우터 ---------- */
async function main() {
  const frag = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
  const params = new URLSearchParams(location.search);

  try {
    if (frag) {                                   // 공유받은 1회성 코스
      const data = await decodeFragment(frag);
      app().innerHTML = renderCourseDoc(data, await loadFactors());
      return;
    }
    if (params.has("c")) {                        // 아카이브 코스
      const data = await fetchJSON("courses/" + encodeURIComponent(params.get("c")) + ".json");
      app().innerHTML = renderCourseDoc(data, await loadFactors(), nav([[".", "🏠 우리 데이트 기록"]]));
      return;
    }
    if (params.has("f")) {                         // 근거 요인
      const factors = await loadFactors();
      const slug = params.get("f");
      if (slug && factors.has(slug)) { app().innerHTML = renderFactorDetail(factors.get(slug)); return; }
      app().innerHTML = renderFactorIndex([...factors.values()]);
      return;
    }
    // 홈: 우리 데이트 기록
    let index = { courses: [] };
    try { index = await fetchJSON("courses/index.json"); } catch {}
    app().innerHTML = renderArchive(index);
  } catch (e) {
    showMessage(`<h1>⚠️ 열 수 없어요</h1>
      <p>링크가 손상됐거나 코스를 찾지 못했습니다.</p>
      <p class="hint">${esc(e.message || e)}</p>
      <p><a href=".">🏠 우리 데이트 기록으로</a></p>`);
  }
}

window.addEventListener("hashchange", main);
window.addEventListener("popstate", main);
main();

/* 서비스워커 등록(오프라인/설치) — 실패해도 앱은 동작 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
