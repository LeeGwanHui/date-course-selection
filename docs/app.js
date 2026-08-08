/* 데이트 코스 공유 PWA
   라우팅:
     #<mode>:<payload>  → 공유받은 1회성 코스(URL에 데이터, 서버 저장 없음)
     ?c=<slug>          → 아카이브에 저장된 코스(docs/courses/<slug>.json)
     ?f=<slug>          → 심리 근거 요인 상세 / ?f (값 없음) → 요인 목록(가이드)
     (파라미터 없음)      → '우리 데이트 기록' 홈(아카이브 목록)
   코스 렌더 마크업/클래스는 스킬의 render_course.py(build_html/render_course/render_stop)와 1:1.
   인코딩 규약은 share_link.py와 일치: "<mode>:<base64url>", mode z=deflate(zlib), j=plain. */

const BADGE = { peak: ["🎯", "피크"], finale: ["🏁", "피날레"] };

/* ---------- 아카이브 홈: 순수 로직 ---------- */

/* 지역 이름 → 색상 각도(0~359). 팔레트를 손으로 관리하지 않으려는 것 —
   새 지역이 와도 색이 자동으로 정해지고, 채도·밝기는 CSS가 고정해 톤이 통일된다. */
function regionHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/* 부엌 페이지는 SPA 라우팅 밖의 독립 HTML이라 ?c= 가 아니라 실제 경로로 간다. */
function entryHref(e) {
  return e.kind === "kitchen" ? e.href : "?c=" + encodeURIComponent(e.slug);
}

function filterEntries(entries, filter) {
  if (!filter) return entries;
  if (filter.type === "r") return entries.filter((e) => e.region === filter.value);
  return entries.filter((e) => (e.tags || []).includes(filter.value));
}

/* 목록에 실제로 존재하는 값만 모은다(등장 순서 유지).
   어휘 전체를 칩으로 깔면 결과가 0건인 죽은 버튼이 생긴다. */
function collectFilterValues(entries) {
  const regions = [];
  const tags = [];
  for (const e of entries) {
    if (e.region && !regions.includes(e.region)) regions.push(e.region);
    for (const t of e.tags || []) if (!tags.includes(t)) tags.push(t);
  }
  return { regions, tags };
}

/* [[연도, 항목들], ...] 연도 내림차순. 연도 안의 순서는 입력 순서 그대로. */
function groupByYear(entries) {
  const map = new Map();
  for (const e of entries) {
    const y = (e.date || "").slice(0, 4) || "?";
    if (!map.has(y)) map.set(y, []);
    map.get(y).push(e);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

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

function renderOutfit(course) {
  const o = course.outfit;
  if (!o || !o.items || !o.items.length) return "";
  const head = "👔 복장" + (o.formula ? ` · ${esc(o.formula)}` : "");
  const bits = [`<div class="outfit-head">${head}</div>`];
  bits.push(`<div class="outfit-items">${esc(o.items.join(" + "))}</div>`);
  for (const sw of o.swaps || []) bits.push(`<div class="outfit-swap">⚠️ ${esc(sw)}</div>`);
  if (o.why) bits.push(`<div class="outfit-why">↳ ${esc(o.why)}</div>`);
  if (o.checks && o.checks.length) bits.push(`<div class="outfit-check">✓ ${esc(o.checks.join(" · "))}</div>`);
  return `<div class="outfit">${bits.join("")}</div>`;
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
    ${renderOutfit(course)}
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

function renderArchCard(e) {
  const emoji = esc(e.emoji || String(e.title || "?").trim().charAt(0));
  const hue = e.region ? regionHue(e.region) : 0;
  const coverCls = e.region ? "cover" : "cover no-region";

  const badges = [];
  if (e.region) badges.push(`<span class="bdg bdg-region">${esc(e.region)}</span>`);
  for (const t of e.tags || []) badges.push(`<span class="bdg">${esc(t)}</span>`);
  if (e.has_outfit) badges.push(`<span class="bdg bdg-icon">👔</span>`);
  const bdgs = badges.length ? `<div class="bdgs">${badges.join("")}</div>` : "";

  return `<a class="arch-card" href="${esc(entryHref(e))}" style="--hue:${hue}">
      <div class="${coverCls}"><span>${emoji}</span></div>
      <div class="arch-body">
        <div class="date">${esc(e.date || "")}</div>
        <div class="t">${esc(e.title || "데이트 코스")}</div>
        ${e.meta ? `<div class="m">${esc(e.meta)}</div>` : ""}
        ${bdgs}
      </div>
    </a>`;
}

function renderFilterChips(entries, filter) {
  const { regions, tags } = collectFilterValues(entries);
  if (!regions.length && !tags.length) return "";
  const chip = (label, href, on) =>
    `<a class="fchip${on ? " on" : ""}" href="${href}">${esc(label)}</a>`;
  const isOn = (type, v) => !!filter && filter.type === type && filter.value === v;
  const bits = [chip("전체", ".", !filter)];
  for (const r of regions) bits.push(chip(r, "?r=" + encodeURIComponent(r), isOn("r", r)));
  for (const t of tags) bits.push(chip(t, "?t=" + encodeURIComponent(t), isOn("t", t)));
  return `<div class="fchips">${bits.join("")}</div>`;
}

function renderArchive(index, filter) {
  document.title = "우리 데이트 기록";
  const all = (index && index.courses) || [];
  const head = `${nav([["?f", "💡 심리 근거 가이드"]])}<h1>💞 우리 데이트 기록</h1>`;

  if (!all.length) {
    return head + `<p class="subtitle">아직 저장된 코스가 없어요.</p>
      <div class="empty"><p>코스를 만들면 여기에 하나씩 쌓여 지난 데이트를 다시 볼 수 있어요.</p>
      <p class="hint">저장: <code>save_course.py</code></p></div>`;
  }

  const chips = renderFilterChips(all, filter);
  const shown = filterEntries(all, filter);
  if (!shown.length) {
    return head + chips + `<div class="empty"><p>이 조건에 맞는 기록이 없어요.</p>
      <p><a href=".">전체 보기</a></p></div>`;
  }

  const groups = groupByYear(shown);
  const showYear = groups.length > 1;   // 연도가 하나뿐이면 헤딩은 소음이다
  const body = groups
    .map(([y, es]) =>
      (showYear ? `<h2 class="year">${esc(y)}</h2>\n` : "") +
      es.map(renderArchCard).join("\n"))
    .join("\n");
  return head + chips + `<p class="subtitle">기록 ${shown.length}개</p>\n${body}`;
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
    // 홈: 우리 데이트 기록 (?r=지역 / ?t=태그는 이 분기의 하위 상태)
    let index = { courses: [] };
    try { index = await fetchJSON("courses/index.json"); } catch {}
    let filter = null;
    if (params.has("r")) filter = { type: "r", value: params.get("r") };
    else if (params.has("t")) filter = { type: "t", value: params.get("t") };
    app().innerHTML = renderArchive(index, filter);
  } catch (e) {
    showMessage(`<h1>⚠️ 열 수 없어요</h1>
      <p>링크가 손상됐거나 코스를 찾지 못했습니다.</p>
      <p class="hint">${esc(e.message || e)}</p>
      <p><a href=".">🏠 우리 데이트 기록으로</a></p>`);
  }
}

window.addEventListener("hashchange", main);
window.addEventListener("popstate", main);
/* 필터 칩은 이동 대신 URL만 바꾸고 다시 그린다(모바일에서 즉시 반응).
   href는 진짜 링크로 남겨 두어 새 탭·공유·크롤링이 그대로 동작한다.
   뒤로가기는 위의 popstate 리스너가 받는다. */
document.addEventListener("click", (ev) => {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const a = ev.target.closest && ev.target.closest("a.fchip");
  if (!a) return;
  ev.preventDefault();
  history.pushState(null, "", a.getAttribute("href"));
  main();
});
main();

/* 서비스워커 등록(오프라인/설치) — 실패해도 앱은 동작 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
