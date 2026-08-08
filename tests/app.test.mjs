import test from "node:test";
import assert from "node:assert/strict";
import { loadApp, plain } from "./harness.mjs";

const app = loadApp();
const ENTRY = (o) => ({ slug: "s", title: "T", date: "2026-08-08", ...o });

test("regionHue는 같은 지역에 늘 같은 각도를 준다", () => {
  assert.equal(app.regionHue("홍대"), app.regionHue("홍대"));
  const h = app.regionHue("홍대");
  assert.ok(Number.isInteger(h) && h >= 0 && h < 360);
});

test("regionHue는 실제 지역 6개를 서로 다른 각도로 나눈다", () => {
  const hues = ["홍대", "칭다오", "동탄", "신사", "킨텍스", "집"].map(app.regionHue);
  assert.equal(new Set(hues).size, hues.length);
});

test("entryHref: 부엌은 href로, 코스는 ?c=slug로", () => {
  assert.equal(
    app.entryHref({ kind: "kitchen", href: "kitchen/a.html", slug: "a" }),
    "kitchen/a.html",
  );
  assert.equal(app.entryHref({ slug: "sinsa-2026-07-26" }), "?c=sinsa-2026-07-26");
});

test("filterEntries: 필터 없으면 전부, 있으면 지역/태그로 거른다", () => {
  const es = [
    ENTRY({ slug: "a", region: "홍대", tags: ["실내"] }),
    ENTRY({ slug: "b", region: "신사", tags: ["카페", "산책"] }),
    ENTRY({ slug: "c" }),                       // region/tags 없는 항목
  ];
  assert.deepEqual(plain(app.filterEntries(es, null).map((e) => e.slug)), ["a", "b", "c"]);
  assert.deepEqual(plain(app.filterEntries(es, { type: "r", value: "홍대" }).map((e) => e.slug)), ["a"]);
  assert.deepEqual(plain(app.filterEntries(es, { type: "t", value: "산책" }).map((e) => e.slug)), ["b"]);
});

test("collectFilterValues는 존재하는 값만 등장 순서대로, 중복 없이 모은다", () => {
  const { regions, tags } = app.collectFilterValues([
    ENTRY({ region: "홍대", tags: ["실내", "맛집"] }),
    ENTRY({ region: "홍대", tags: ["맛집"] }),
    ENTRY({ region: "신사" }),
    ENTRY({}),
  ]);
  assert.deepEqual(plain(regions), ["홍대", "신사"]);
  assert.deepEqual(plain(tags), ["실내", "맛집"]);
});

test("groupByYear는 연도 내림차순으로 묶고 항목 순서를 유지한다", () => {
  const g = app.groupByYear([
    ENTRY({ slug: "a", date: "2026-08-08" }),
    ENTRY({ slug: "b", date: "2027-01-02" }),
    ENTRY({ slug: "c", date: "2026-07-25" }),
  ]);
  assert.deepEqual(
    plain(g).map(([y, es]) => [y, es.map((e) => e.slug)]),
    [["2027", ["b"]], ["2026", ["a", "c"]]],
  );
});

test("카드 폴백: region/tags/emoji 없어도 안 깨진다", () => {
  const html = app.renderArchCard({ slug: "x", title: "동탄역 영화 데이트", date: "2026-08-01" });
  assert.ok(html.includes("no-region"));      // 회색 커버
  assert.ok(html.includes(">동<"));            // emoji 없으면 제목 첫 글자
  assert.ok(!html.includes('class="bdgs"'));  // 뱃지 줄 통째로 생략
  assert.ok(html.includes('href="?c=x"'));
});

test("카드 뱃지: 지역 · 태그 · 복장 · 이모지", () => {
  const html = app.renderArchCard(ENTRY({
    region: "홍대", tags: ["실내", "술"], has_outfit: true, emoji: "🔓",
  }));
  assert.ok(html.includes(">홍대<"));
  assert.ok(html.includes(">실내<"));
  assert.ok(html.includes(">술<"));
  assert.ok(html.includes("👔"));
  assert.ok(html.includes(">🔓<"));
  assert.ok(html.includes(`--hue:${app.regionHue("홍대")}`));
});

test("부엌 카드는 href로 링크한다", () => {
  const html = app.renderArchCard(ENTRY({
    kind: "kitchen", href: "kitchen/mosu-steak-2026-08-02.html", emoji: "🍳",
  }));
  assert.ok(html.includes('href="kitchen/mosu-steak-2026-08-02.html"'));
});

test("연도가 하나면 연도 헤딩이 나오지 않는다", () => {
  const html = app.renderArchive({ courses: [ENTRY({ date: "2026-08-08" })] }, null);
  assert.ok(!html.includes('class="year"'));
});

test("연도가 둘 이상이면 연도 헤딩이 나온다", () => {
  const html = app.renderArchive({ courses: [
    ENTRY({ slug: "a", date: "2027-01-02" }),
    ENTRY({ slug: "b", date: "2026-08-08" }),
  ] }, null);
  assert.ok(html.includes('class="year"'));
  assert.ok(html.includes(">2027<"));
  assert.ok(html.includes(">2026<"));
});

test("필터 칩: 전체 + 존재하는 값, 선택된 칩에 on 클래스", () => {
  const index = { courses: [
    ENTRY({ slug: "a", region: "홍대", tags: ["실내"] }),
    ENTRY({ slug: "b", region: "신사" }),
  ] };
  const html = app.renderArchive(index, { type: "r", value: "홍대" });
  assert.ok(html.includes('href="?r=%ED%99%8D%EB%8C%80"'));   // 홍대
  assert.ok(html.includes('class="fchip on"'));
  assert.ok(html.includes('href="."'));                       // 전체
  assert.ok(html.includes(">신사<"));                          // 안 고른 칩도 남아 있다
});

test("필터를 걸면 목록이 실제로 걸러진다", () => {
  const index = { courses: [
    ENTRY({ slug: "a", region: "홍대" }),
    ENTRY({ slug: "b", region: "신사" }),
  ] };
  const html = app.renderArchive(index, { type: "r", value: "홍대" });
  assert.ok(html.includes('href="?c=a"'));
  assert.ok(!html.includes('href="?c=b"'));
});

test("필터 결과가 0건이면 안내와 전체 보기 링크를 준다", () => {
  const index = { courses: [ENTRY({ region: "홍대" })] };
  const html = app.renderArchive(index, { type: "r", value: "신사" });
  assert.ok(html.includes("맞는 기록이 없어요"));
  assert.ok(html.includes("fchips"));           // 칩은 남아 있어야 빠져나갈 수 있다
});

test("아카이브가 비면 필터 칩 없이 빈 상태만", () => {
  const html = app.renderArchive({ courses: [] }, null);
  assert.ok(html.includes("아직 저장된 코스가 없어요"));
  assert.ok(!html.includes("fchips"));
});

test("이모지로 시작하는 제목도 커버 글리프가 깨지지 않는다", () => {
  const html = app.renderArchCard({ slug: "x", title: "🍳 집마카세", date: "2026-08-02" });
  assert.ok(html.includes(">🍳<"));
  assert.ok(!html.includes("\ud83c<"));   // 서로게이트 반쪽이 새어나오면 안 된다
});

test("href 없는 부엌 항목은 죽은 링크 대신 ?c=로 떨어진다", () => {
  assert.equal(app.entryHref({ kind: "kitchen", slug: "x" }), "?c=x");
});
