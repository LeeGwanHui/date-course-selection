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
