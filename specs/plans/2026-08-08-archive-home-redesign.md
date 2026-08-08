# 아카이브 홈 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/courses/index.json`에 `region`/`tags`/`emoji`/`has_outfit`를 추가하고, 그 데이터로 아카이브 홈에 커버·뱃지·필터·연도 그룹을 붙이며, 부엌 목록을 `app.js` 하드코딩에서 데이터로 옮긴다.

**Architecture:** 무빌드 정적 PWA다. `save_course.py`(stdlib 전용)가 저장 시점에 구조화된 필드를 `index.json`에 쓰고, `docs/app.js`가 그 데이터만 보고 홈을 그린다. 필터는 URL 쿼리(`?r=` / `?t=`)에 담아 기존 라우터의 홈 분기 하위 상태로 붙인다. 스타일은 `docs/index.html`의 인라인 `<style>`에 그대로 추가한다.

**Tech Stack:** Python 3 표준 라이브러리, 브라우저 JS(모듈/번들 없음), pytest 9, `node --test` + `node:vm`(내장, npm 의존성 없음)

**설계 문서:** `specs/2026-08-08-archive-home-redesign-design.md`

## Global Constraints

- `save_course.py`는 **표준 라이브러리만** 쓴다. 새 pip 의존성 금지.
- `docs/`는 **빌드 단계가 없다.** 번들러·트랜스파일러 금지. `docs/app.js`는 지금처럼
  `<script src="app.js">`로 로드되는 전역 스크립트로 유지한다 (ESM 전환 금지 — 서비스워커
  프리캐시 목록과 얽힌다).
- 테스트에 **npm 패키지를 설치하지 않는다.** JS 테스트는 Node 내장 `node:test` + `node:vm`만 쓴다.
- **스킬의 `render_course.py`를 수정하지 않는다.** 이 작업은 아카이브 목록 전용 메타만 다룬다.
- **`docs/sw.js`의 `/kitchen/` navigate 예외를 삭제하지 않는다.** SW가 앱 셸을 돌려주는
  별개 회귀를 막는 장치다.
- UI 문자열은 **한국어**다.
- 리포는 PUBLIC이다. 사진·인물 정보·사후 평점을 추가하지 않는다.
- 태그 고정 어휘 (정확히 이 11개, 이 순서):
  `맛집` `카페` `술` `영화` `액티비티` `페스티벌` `전시` `산책` `실내` `야외` `여행`
- 계획 문서/스펙은 `specs/` 아래 둔다. `docs/`는 GitHub Pages 배포 디렉터리라 넣으면 공개된다.

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `save_course.py` | 코스 JSON → `docs/courses/<slug>.json` + `index.json` 업서트. 태그 어휘 검증, `has_outfit` 파생 | 수정 |
| `docs/app.js` | PWA 라우터 + 렌더. 아카이브 홈의 카드·필터·그룹 | 수정 |
| `docs/index.html` | 인라인 CSS (카드 2단 레이아웃, 커버, 뱃지, 필터 칩, 연도 헤딩) | 수정 |
| `docs/courses/index.json` | 아카이브 목록 데이터 (부엌 항목 포함) | 수정 |
| `docs/sw.js` | `CACHE` 버전 | 수정 |
| `CLAUDE.md` | 스키마·플래그 문서 | 수정 |
| `tests/conftest.py` | pytest가 리포 루트를 import 경로에 넣도록 | 신규 |
| `tests/test_save_course.py` | `save_course.py` 단위 + CLI 통합 테스트 | 신규 |
| `tests/harness.mjs` | `docs/app.js`를 `node:vm`에 최소 DOM 스텁과 함께 올려 함수를 꺼내는 로더 | 신규 |
| `tests/app.test.mjs` | 아카이브 홈 로직/렌더 테스트 | 신규 |

**테스트 인프라에 대한 메모:** 이 리포에는 테스트가 없었다. `docs/app.js`는 `<script>`로
로드되는 전역 스크립트라 `import`가 안 된다. 프로덕션 코드를 모듈로 바꾸는 대신
(전역 제약 참조), `node:vm`에 최소 DOM 스텁을 깔고 파일을 통째로 평가해 순수 함수를
꺼내 쓴다. 프로덕션 코드 변경 0으로 테스트가 가능해진다.

---

### Task 1: `save_course.py` — 태그 어휘, `has_outfit` 파생, 새 플래그

**Files:**
- Create: `tests/conftest.py`
- Create: `tests/test_save_course.py`
- Modify: `save_course.py`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `TAGS: tuple[str, ...]` — 허용 태그 11개
  - `parse_tags(raw: str | None) -> list[str]` — 쉼표 구분 파싱. 어휘 밖 값이 있으면 `ValueError`
  - `derive_has_outfit(data: dict) -> bool`
  - `build_entry(data: dict, slug: str, date: str, region: str | None = None, tags: list[str] | None = None, emoji: str | None = None) -> dict`
  - CLI 플래그 `--region` `--tags` `--emoji`

- [ ] **Step 1: `tests/conftest.py` 작성 (리포 루트를 import 경로에 추가)**

```python
# -*- coding: utf-8 -*-
"""save_course.py는 리포 루트에 있는 단일 파일 스크립트라 패키지가 아니다.
   pytest가 그대로 import할 수 있도록 루트를 sys.path에 넣는다."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```

- [ ] **Step 2: 실패하는 단위 테스트 작성**

`tests/test_save_course.py` 를 만든다:

```python
# -*- coding: utf-8 -*-
import json
import os
import shutil
import subprocess
import sys

import pytest

import save_course


def test_parse_tags_splits_and_strips():
    assert save_course.parse_tags("맛집, 실내 ,술") == ["맛집", "실내", "술"]


def test_parse_tags_empty_gives_empty_list():
    assert save_course.parse_tags("") == []
    assert save_course.parse_tags(None) == []


def test_parse_tags_rejects_unknown_tag():
    with pytest.raises(ValueError) as err:
        save_course.parse_tags("맛집,인도어")
    msg = str(err.value)
    assert "인도어" in msg       # 뭐가 틀렸는지
    assert "실내" in msg         # 허용 목록도 함께 보여준다


def test_derive_has_outfit_true_when_any_course_has_one():
    data = {"courses": [{"name": "A"}, {"name": "B", "outfit": {"items": ["린넨 셔츠"]}}]}
    assert save_course.derive_has_outfit(data) is True


def test_derive_has_outfit_false_when_none():
    assert save_course.derive_has_outfit({"courses": [{"name": "A"}]}) is False
    assert save_course.derive_has_outfit({}) is False


def test_build_entry_omits_optional_fields_when_absent():
    entry = save_course.build_entry({"title": "T", "meta": "M"}, "s", "2026-08-08")
    assert "region" not in entry
    assert "tags" not in entry
    assert "emoji" not in entry
    assert entry["has_outfit"] is False
    assert entry["slug"] == "s"
    assert entry["date"] == "2026-08-08"


def test_build_entry_includes_optional_fields_when_given():
    entry = save_course.build_entry(
        {"title": "T", "meta": "M", "courses": [{"outfit": {"items": ["린넨 셔츠"]}}]},
        "s", "2026-08-08", region="홍대", tags=["실내"], emoji="🔓",
    )
    assert entry["region"] == "홍대"
    assert entry["tags"] == ["실내"]
    assert entry["emoji"] == "🔓"
    assert entry["has_outfit"] is True
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `python3 -m pytest tests/test_save_course.py -v`
Expected: FAIL — `AttributeError: module 'save_course' has no attribute 'parse_tags'`

- [ ] **Step 4: `save_course.py`에 `TAGS` / `parse_tags` / `derive_has_outfit` / `build_entry` 추가**

`INDEX_PATH = ...` 줄 바로 아래에 상수를 넣는다:

```python
# 아카이브 필터 칩의 고정 어휘. 축 3개(활동 / 환경 / 규모)로 나뉜다.
# 자유 입력을 허용하면 '실내'/'인도어'/'실내데이트'처럼 흩어져 칩이 지저분해진다.
TAGS = (
    "맛집", "카페", "술", "영화", "액티비티", "페스티벌", "전시", "산책",  # 활동
    "실내", "야외",                                                      # 환경
    "여행",                                                              # 규모(1박 이상)
)
```

`sanitize_slug` 아래에 함수 3개를 넣는다:

```python
def parse_tags(raw):
    """쉼표 구분 태그 문자열 → 리스트. 어휘 밖의 값이 하나라도 있으면 ValueError."""
    if not raw:
        return []
    tags = [t.strip() for t in raw.split(",") if t.strip()]
    bad = [t for t in tags if t not in TAGS]
    if bad:
        raise ValueError(
            "허용되지 않은 태그: " + ", ".join(bad)
            + "\n허용 태그: " + ", ".join(TAGS)
        )
    return tags


def derive_has_outfit(data):
    """코스 중 하나라도 outfit이 있으면 True (홈 카드의 👔 뱃지)."""
    return any(c.get("outfit") for c in data.get("courses", []))


def build_entry(data, slug, date, region=None, tags=None, emoji=None):
    """index.json 한 항목. 선택 필드는 값이 있을 때만 넣는다 —
       없는 항목도 홈에서 기존 카드 모양으로 폴백되게 하기 위해서다."""
    entry = {
        "slug": slug,
        "title": data.get("title", "데이트 코스"),
        "meta": data.get("meta", ""),
        "date": date,
        "added": dt.datetime.now().isoformat(timespec="seconds"),
    }
    if region:
        entry["region"] = region
    if tags:
        entry["tags"] = tags
    if emoji:
        entry["emoji"] = emoji
    entry["has_outfit"] = derive_has_outfit(data)
    return entry
```

- [ ] **Step 5: 단위 테스트 통과 확인**

Run: `python3 -m pytest tests/test_save_course.py -v`
Expected: PASS (7 passed)

- [ ] **Step 6: 실패하는 CLI 통합 테스트 추가**

`tests/test_save_course.py` 끝에 붙인다:

```python
def _sandbox(tmp_path):
    """save_course.py를 임시 디렉터리로 복사한다.
       스크립트가 __file__ 기준으로 docs/courses 경로를 잡으므로,
       복사본을 돌리면 실제 리포를 건드리지 않고 통합 테스트가 된다."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    shutil.copy(os.path.join(root, "save_course.py"), str(tmp_path / "save_course.py"))
    return tmp_path


def _run(sandbox, course_path, *args):
    return subprocess.run(
        [sys.executable, str(sandbox / "save_course.py"), str(course_path), *args],
        capture_output=True, text=True,
    )


def _write_course(path, **kw):
    data = {"title": "T", "meta": "M", "courses": []}
    data.update(kw)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def test_cli_writes_entry_with_new_fields(tmp_path):
    sandbox = _sandbox(tmp_path)
    course = tmp_path / "course.json"
    _write_course(course, title="홍대 방탈출 데이트", meta="오후 5시",
                  courses=[{"name": "A", "outfit": {"items": ["린넨 셔츠"]}}])

    r = _run(sandbox, course, "--slug", "hongdae", "--date", "2026-08-08",
             "--region", "홍대", "--tags", "액티비티,실내", "--emoji", "🔓")
    assert r.returncode == 0, r.stderr

    index = json.loads((sandbox / "docs" / "courses" / "index.json").read_text(encoding="utf-8"))
    assert len(index["courses"]) == 1
    e = index["courses"][0]
    assert e["slug"] == "hongdae"
    assert e["region"] == "홍대"
    assert e["tags"] == ["액티비티", "실내"]
    assert e["emoji"] == "🔓"
    assert e["has_outfit"] is True


def test_cli_without_new_flags_omits_them(tmp_path):
    sandbox = _sandbox(tmp_path)
    course = tmp_path / "course.json"
    _write_course(course)

    r = _run(sandbox, course, "--slug", "plain", "--date", "2026-08-08")
    assert r.returncode == 0, r.stderr

    e = json.loads((sandbox / "docs" / "courses" / "index.json").read_text(encoding="utf-8"))["courses"][0]
    assert "region" not in e
    assert "tags" not in e
    assert "emoji" not in e
    assert e["has_outfit"] is False


def test_cli_rejects_unknown_tag_before_writing_anything(tmp_path):
    sandbox = _sandbox(tmp_path)
    course = tmp_path / "course.json"
    _write_course(course)

    r = _run(sandbox, course, "--slug", "x", "--date", "2026-08-08", "--tags", "인도어")
    assert r.returncode != 0
    assert "인도어" in (r.stderr + r.stdout)
    # 검증이 파일 쓰기보다 먼저 일어나야 한다
    assert not (sandbox / "docs" / "courses" / "index.json").exists()
    assert not (sandbox / "docs" / "courses" / "x.json").exists()


def test_cli_upserts_same_slug(tmp_path):
    sandbox = _sandbox(tmp_path)
    course = tmp_path / "course.json"
    _write_course(course, title="1차")
    assert _run(sandbox, course, "--slug", "x", "--date", "2026-08-08").returncode == 0

    _write_course(course, title="2차")
    assert _run(sandbox, course, "--slug", "x", "--date", "2026-08-08",
                "--region", "홍대").returncode == 0

    index = json.loads((sandbox / "docs" / "courses" / "index.json").read_text(encoding="utf-8"))
    assert len(index["courses"]) == 1
    assert index["courses"][0]["title"] == "2차"
    assert index["courses"][0]["region"] == "홍대"
```

- [ ] **Step 7: 통합 테스트가 실패하는지 확인**

Run: `python3 -m pytest tests/test_save_course.py -v`
Expected: 단위 7개 PASS, 통합 4개 FAIL — `--region` 등이 미정의 인자라 argparse가 exit 2

- [ ] **Step 8: `main()`에 플래그를 붙이고 `build_entry`를 쓰도록 고친다**

`ap.add_argument("--date", ...)` 아래에 세 줄을 추가한다:

```python
    ap.add_argument("--region", help="대표 지역 1개 (홈 카드 커버 색·필터 칩)")
    ap.add_argument("--tags", help="쉼표 구분 태그. 허용: " + ", ".join(TAGS))
    ap.add_argument("--emoji", help="홈 카드 커버에 쓸 이모지 1개")
```

`args = ap.parse_args()` 바로 다음 줄에 태그 검증을 넣는다. **입력 파일을 읽기 전에**
둬서, 어휘 오류일 때 아무 파일도 쓰지 않게 한다:

```python
    try:
        tags = parse_tags(args.tags)
    except ValueError as e:
        sys.exit("ERROR: " + str(e))
```

기존의 `entry = { ... }` 딕셔너리 리터럴 블록을 통째로 아래로 교체한다:

```python
    entry = build_entry(data, slug, date,
                        region=args.region, tags=tags, emoji=args.emoji)
```

모듈 docstring의 사용법 예시에 한 줄을 더한다:

```
  python3 save_course.py course.json --slug hongdae-escape-2026-08-08 --date 2026-08-08 \
      --region 홍대 --tags 액티비티,실내,맛집,술 --emoji 🔓
```

- [ ] **Step 9: 전체 테스트 통과 확인**

Run: `python3 -m pytest tests/test_save_course.py -v`
Expected: PASS (11 passed)

- [ ] **Step 10: 실제 리포가 안 더럽혀졌는지 확인**

Run: `git status --short`
Expected: `save_course.py` 수정과 `tests/` 신규만. `docs/courses/` 변경 없음.

- [ ] **Step 11: 커밋**

```bash
git add save_course.py tests/conftest.py tests/test_save_course.py
git commit -m "save_course.py에 region/tags/emoji 플래그와 태그 어휘 검증 추가

index.json 항목에 아카이브 홈용 구조화 필드를 넣는다. tags는 고정
어휘 11개 밖의 값을 거부하고, has_outfit은 코스 JSON에서 파생한다.
선택 필드는 값이 있을 때만 기록해 기존 항목과 섞여도 되게 했다."
```

---

### Task 2: `docs/app.js` 순수 로직 + Node 테스트 하네스

**Files:**
- Create: `tests/harness.mjs`
- Create: `tests/app.test.mjs`
- Modify: `docs/app.js`

**Interfaces:**
- Consumes: 없음 (Task 1과 독립)
- Produces (`docs/app.js`의 전역 함수):
  - `regionHue(name: string) -> number` — 0~359 정수, 결정적
  - `entryHref(e: object) -> string` — `kind === "kitchen"`이면 `e.href`, 아니면 `"?c=" + encodeURIComponent(e.slug)`
  - `filterEntries(entries: object[], filter: {type: "r"|"t", value: string} | null) -> object[]`
  - `collectFilterValues(entries: object[]) -> {regions: string[], tags: string[]}`
  - `groupByYear(entries: object[]) -> [string, object[]][]` — 연도 내림차순
- 이 태스크에서 만든 `loadApp()`은 Task 3의 테스트도 그대로 쓴다.

- [ ] **Step 1: 테스트 하네스 작성**

`tests/harness.mjs`:

```js
/* docs/app.js는 <script src>로 로드되는 무빌드 전역 스크립트라 import가 안 된다.
   ESM으로 바꾸면 서비스워커 프리캐시와 얽히므로, 프로덕션 코드는 그대로 두고
   node:vm에 최소 DOM 스텁을 깔아 통째로 평가한 뒤 순수 함수를 꺼내 쓴다. */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = new URL("../docs/app.js", import.meta.url);

export function loadApp() {
  const el = { innerHTML: "" };
  const ctx = {
    document: { title: "", getElementById: () => el, addEventListener() {} },
    window: { addEventListener() {} },
    location: { hash: "", search: "" },
    history: { pushState() {} },
    navigator: {},                    // serviceWorker 없음 → SW 등록 분기 안 탐
    URLSearchParams,
    TextDecoder,
    console,
    // app.js 하단의 main()이 즉시 돌면서 index.json을 부른다.
    // 실패시켜 catch 분기로 보내고(오류 화면), 테스트는 함수를 직접 호출한다.
    fetch: async () => { throw new Error("no network in tests"); },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(SRC, "utf8"), ctx);
  ctx.__el = el;
  return ctx;
}

/* vm 컨텍스트는 자기만의 Array 인트린식을 갖는다. 그 안에서 만들어진 배열은
   구조가 같아도 deepStrictEqual을 통과하지 못한다(프로토타입이 다르다).
   vm에서 나온 값은 이걸로 테스트 realm으로 옮겨서 비교한다. */
export const plain = (v) => JSON.parse(JSON.stringify(v));
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/app.test.mjs`:

```js
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
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `node --test tests/*.test.mjs`
Expected: FAIL — `app.regionHue is not a function`

- [ ] **Step 4: `docs/app.js`에 순수 함수 5개 추가**

`const BADGE = ...` 선언 **아래**, `KITCHEN` 상수 **위**에 넣는다 (`KITCHEN` 삭제는 Task 3):

```js
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test tests/*.test.mjs`
Expected: PASS (6 tests)

- [ ] **Step 6: 브라우저에서 회귀 없는지 확인**

```bash
python3 -m http.server 8765 --directory docs &
```
`http://localhost:8765/` 를 열어 홈이 **지금과 똑같이** 뜨는지 본다 (아직 렌더 변경 전).
확인 후 서버를 끈다.

Expected: 카드 5개 + 하단 부엌 1개, 콘솔 오류 없음

- [ ] **Step 7: 커밋**

```bash
git add docs/app.js tests/harness.mjs tests/app.test.mjs
git commit -m "아카이브 홈 순수 로직과 Node 테스트 하네스 추가

regionHue/entryHref/filterEntries/collectFilterValues/groupByYear.
app.js는 무빌드 전역 스크립트라 import가 안 돼서, ESM 전환 대신
node:vm에 DOM 스텁을 깔고 평가하는 하네스로 테스트한다.
렌더러는 아직 이 함수들을 쓰지 않는다."
```

---

### Task 3: 홈 렌더 재작성 · `KITCHEN` 제거 · 필터 라우팅

**Files:**
- Modify: `docs/app.js:12-22` (`KITCHEN` 상수 삭제), `renderArchive` 교체, 라우터 홈 분기, 하단 리스너
- Modify: `tests/app.test.mjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 2의 `regionHue` / `entryHref` / `filterEntries` / `collectFilterValues` / `groupByYear`
- Produces:
  - `renderArchCard(e: object) -> string`
  - `renderFilterChips(entries: object[], filter: object|null) -> string`
  - `renderArchive(index: {courses: object[]}, filter: object|null) -> string` — **인자 2개로 시그니처 변경**

- [ ] **Step 1: 실패하는 렌더 테스트 추가**

`tests/app.test.mjs` 끝에 붙인다:

```js
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test tests/*.test.mjs`
Expected: 기존 6개 PASS, 새 9개 FAIL — `app.renderArchCard is not a function`

- [ ] **Step 3: `KITCHEN` 상수를 삭제한다**

`docs/app.js`의 12~22행 블록(주석 포함)을 통째로 지운다:

```js
/* 부엌 — SPA 라우팅 밖의 독립 정적 페이지. 늘어나면 여기에 한 줄 추가한다.
   ⚠️ sw.js의 navigate 예외(`/kitchen/`)와 짝이다. ... */
const KITCHEN = [ ... ];
```

목록 데이터는 Task 5에서 `docs/courses/index.json`으로 옮긴다. `sw.js`의 `/kitchen/`
예외는 **그대로 둔다** — 그건 SW가 앱 셸을 돌려주는 별개 문제를 막는 장치다.

- [ ] **Step 4: `renderArchive`를 렌더 함수 3개로 교체한다**

기존 `renderArchive` 함수(`function renderArchive(index) { ... }` 전체)를 아래로 바꾼다:

```js
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
```

- [ ] **Step 5: 라우터 홈 분기에서 필터를 읽는다**

`main()`의 홈 분기(`// 홈: 우리 데이트 기록` 아래)를 바꾼다:

```js
    // 홈: 우리 데이트 기록 (?r=지역 / ?t=태그는 이 분기의 하위 상태)
    let index = { courses: [] };
    try { index = await fetchJSON("courses/index.json"); } catch {}
    let filter = null;
    if (params.has("r")) filter = { type: "r", value: params.get("r") };
    else if (params.has("t")) filter = { type: "t", value: params.get("t") };
    app().innerHTML = renderArchive(index, filter);
```

분기 순서(`#해시` → `?c=` → `?f=` → 홈)는 건드리지 않는다.

- [ ] **Step 6: 필터 칩 클릭을 전체 새로고침 없이 처리한다**

`window.addEventListener("popstate", main);` 아래에 넣는다:

```js
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
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `node --test tests/*.test.mjs`
Expected: PASS (15 tests)

- [ ] **Step 8: 커밋**

```bash
git add docs/app.js tests/app.test.mjs
git commit -m "홈 카드를 2단 레이아웃·뱃지·필터·연도 그룹으로 재작성

renderArchive를 renderArchCard/renderFilterChips/renderArchive로 나누고
필터를 ?r= / ?t= 로 URL에 담는다. 칩 클릭은 pushState로 즉시 다시 그리고
뒤로가기는 기존 popstate 리스너가 받는다.
KITCHEN 하드코딩 배열은 삭제 — 목록은 index.json으로 옮긴다.
sw.js의 /kitchen/ 예외는 별개 문제라 그대로 뒀다."
```

---

### Task 4: 카드·커버·뱃지·칩 CSS

**Files:**
- Modify: `docs/index.html:75-81` (`.arch-card` 블록 교체 및 확장)

**Interfaces:**
- Consumes: Task 3이 내보내는 클래스 — `.arch-card[style="--hue:N"]`, `.cover`, `.cover.no-region`,
  `.arch-body`, `.date`, `.t`, `.m`, `.bdgs`, `.bdg`, `.bdg-region`, `.bdg-icon`, `.fchips`, `a.fchip`,
  `a.fchip.on`, `h2.year`
- Produces: 없음 (마지막 소비자)

- [ ] **Step 1: 기존 아카이브 카드 CSS 블록을 교체한다**

`docs/index.html`의 이 블록을

```css
  /* --- 아카이브 카드 --- */
  .arch-card { display:block; background:var(--card); border:1px solid var(--line);
    border-radius:14px; padding:14px 16px; margin-bottom:12px; text-decoration:none; color:inherit;
    box-shadow:0 1px 3px rgba(0,0,0,.05); }
  .arch-card .date { color:var(--accent); font-weight:700; font-size:.82rem; font-variant-numeric:tabular-nums; }
  .arch-card .t { font-weight:600; font-size:1.05rem; margin-top:2px; }
  .arch-card .m { color:var(--muted); font-size:.85rem; margin-top:2px; }
```

아래로 바꾼다:

```css
  /* --- 아카이브 카드(커버 + 본문 2단) --- */
  .arch-card { display:flex; gap:12px; background:var(--card); border:1px solid var(--line);
    border-radius:14px; padding:12px 14px; margin-bottom:12px; text-decoration:none; color:inherit;
    box-shadow:0 1px 3px rgba(0,0,0,.05); }
  .arch-card .date { color:var(--accent); font-weight:700; font-size:.82rem; font-variant-numeric:tabular-nums; }
  .arch-card .t { font-weight:600; font-size:1.05rem; margin-top:2px; }
  .arch-card .m { color:var(--muted); font-size:.85rem; margin-top:2px; }
  .arch-body { min-width:0; }   /* flex 자식의 긴 텍스트가 카드를 밀지 않게 */
  /* 커버 — 사진 대신 지역별 색으로 카드를 구분한다. --hue는 app.js의 regionHue가 넣는다. */
  .cover { flex:0 0 62px; height:62px; border-radius:12px; display:flex;
    align-items:center; justify-content:center; font-size:1.85rem; line-height:1;
    background:linear-gradient(140deg, hsl(var(--hue) 60% 80%), hsl(var(--hue) 55% 64%)); }
  .cover.no-region { background:linear-gradient(140deg, var(--line), var(--muted)); }
  /* --- 카드 뱃지 --- */
  .bdgs { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
  .bdg { font-size:.72rem; padding:2px 8px; border-radius:999px;
    border:1px solid var(--line); color:var(--muted); }
  .bdg-region { border-color:transparent; color:#fff; background:hsl(var(--hue) 42% 46%); }
  .bdg-icon { border-color:transparent; padding:2px 5px; }
  /* --- 필터 칩 --- */
  .fchips { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 16px; }
  a.fchip { font-size:.78rem; padding:4px 11px; border-radius:999px; text-decoration:none;
    border:1px solid var(--line); color:var(--muted); background:transparent; }
  a.fchip.on { border-color:var(--accent); color:#fff; background:var(--accent); }
  /* --- 연도 헤딩(연도가 2개 이상일 때만 렌더된다) --- */
  h2.year { font-size:.95rem; color:var(--muted); margin:24px 0 8px;
    font-variant-numeric:tabular-nums; }
```

- [ ] **Step 2: 다크모드 커버 명암을 추가한다**

`@media (prefers-color-scheme: dark)` 블록의 `:root { ... }` **아래**(같은 미디어 쿼리 안)에
한 줄을 넣는다. 밝은 파스텔 그라디언트가 다크에서 눈을 찌르는 걸 막는다:

```css
    .cover { background:linear-gradient(140deg, hsl(var(--hue) 44% 44%), hsl(var(--hue) 42% 32%)); }
```

그리고 수동 테마 오버라이드 두 줄 뒤에 대응 규칙을 붙인다 (`:root[data-theme=...]` 줄들 아래):

```css
  :root[data-theme="light"] .cover { background:linear-gradient(140deg, hsl(var(--hue) 60% 80%), hsl(var(--hue) 55% 64%)); }
  :root[data-theme="dark"]  .cover { background:linear-gradient(140deg, hsl(var(--hue) 44% 44%), hsl(var(--hue) 42% 32%)); }
```

- [ ] **Step 3: 브라우저에서 확인한다**

```bash
python3 -m http.server 8765 --directory docs
```

`http://localhost:8765/` 를 연다. 이 시점에는 `index.json`이 아직 백필 전(Task 5)이라
**모든 카드가 회색 커버 + 제목 첫 글자 + 뱃지 없음**으로 보여야 한다. 그게 폴백이 살아
있다는 증거다.

Expected:
- 카드가 가로 2단(왼쪽 회색 정사각 + 오른쪽 텍스트)으로 뜬다
- 필터 칩 줄이 없다 (아직 region/tags가 없으므로)
- 부엌 카드가 안 보인다 (Task 5에서 `index.json`에 추가)
- 콘솔 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add docs/index.html
git commit -m "아카이브 카드 2단 레이아웃과 커버·뱃지·필터 칩 CSS

커버는 --hue(app.js regionHue) 하나만 받아 채도·밝기는 CSS가 고정한다.
지역이 늘어도 팔레트를 손볼 필요가 없고 톤은 통일된다.
다크모드는 같은 hue에 명암만 낮춰 쓴다."
```

---

### Task 5: `index.json` 백필 · 부엌 항목 이전 · SW 캐시 버전

**Files:**
- Modify: `docs/courses/index.json`
- Modify: `docs/sw.js:5`

**Interfaces:**
- Consumes: Task 1의 필드 스키마, Task 3의 `entryHref`(`kind`/`href` 규약)
- Produces: 없음 (데이터)

- [ ] **Step 1: `docs/courses/index.json`을 통째로 아래 내용으로 교체한다**

`title`에서 날짜와 이모지를 걷어내 `date` / `emoji` 필드로 옮긴다. `added`는 기존 값을
그대로 유지한다. 동탄의 `meta`에 있는 `⭐ 실제 평가 4.5/5`는 **손대지 않는다** —
사후 기록은 이 작업의 범위 밖이다.

```json
{
 "courses": [
  {
   "slug": "qingdao-2026-08",
   "title": "칭다오 3박 4일",
   "meta": "2026년 8월 14~17일 · 중국 산둥성 칭다오 · 맥주축제는 8/15 폐막일 하루로",
   "date": "2026-08-14",
   "added": "2026-08-02T17:19:29",
   "region": "칭다오",
   "tags": ["여행", "맛집", "야외"],
   "emoji": "🍺",
   "has_outfit": true
  },
  {
   "slug": "hongdae-escape-2026-08-08",
   "title": "홍대 방탈출 데이트",
   "meta": "오후 5시 · 약 5시간 · 방탈출 + 맛집 + LP바",
   "date": "2026-08-08",
   "added": "2026-08-06T21:05:40",
   "region": "홍대",
   "tags": ["액티비티", "실내", "맛집", "술"],
   "emoji": "🔓",
   "has_outfit": true
  },
  {
   "slug": "mosu-steak-2026-08-02",
   "kind": "kitchen",
   "href": "kitchen/mosu-steak-2026-08-02.html",
   "title": "집마카세 · 모수식 스테이크",
   "meta": "인덕션 · 30초 사이클 타이머 내장",
   "date": "2026-08-02",
   "added": "2026-08-02T16:34:00",
   "region": "집",
   "tags": ["맛집", "실내"],
   "emoji": "🍳",
   "has_outfit": true
  },
  {
   "slug": "dongtan-2026-08-01",
   "title": "동탄역 영화 데이트",
   "meta": "오후 4시 20분 스파이더맨 · 저녁~밤까지 · 폭염일 실내 위주 — ⭐ 실제 평가 4.5/5",
   "date": "2026-08-01",
   "added": "2026-08-02T07:56:14",
   "region": "동탄",
   "tags": ["영화", "실내", "맛집"],
   "emoji": "🎬",
   "has_outfit": true
  },
  {
   "slug": "sinsa-2026-07-26",
   "title": "신사 · 가로수길 오후 데이트",
   "meta": "2026-07-26(일) · 14:45 합류 ~ 17:30 귀가 · 감성 카페 / 조용한 대화",
   "date": "2026-07-26",
   "added": "2026-07-26T13:47:42",
   "region": "신사",
   "tags": ["카페", "산책"],
   "emoji": "☕",
   "has_outfit": false
  },
  {
   "slug": "waterbomb-2026-07-25",
   "title": "워터밤 서울 2026",
   "meta": "7/25(토) · 송파 점심 → 킨텍스 워터밤 · 낮 1시~밤 11시",
   "date": "2026-07-25",
   "added": "2026-08-07T07:41:33",
   "region": "킨텍스",
   "tags": ["페스티벌", "야외"],
   "emoji": "🌊",
   "has_outfit": true
  }
 ]
}
```

- [ ] **Step 2: `has_outfit` 값이 실제 코스 JSON과 맞는지 검증한다**

Run:
```bash
python3 - <<'PY'
import json, os
os.chdir("docs/courses")
idx = json.load(open("index.json", encoding="utf-8"))
for e in idx["courses"]:
    if e.get("kind") == "kitchen":
        print(f'{e["slug"]:32} kitchen (수동) has_outfit={e["has_outfit"]}')
        continue
    d = json.load(open(e["slug"] + ".json", encoding="utf-8"))
    actual = any(c.get("outfit") for c in d.get("courses", []))
    ok = "OK " if actual == e["has_outfit"] else "MISMATCH"
    print(f'{e["slug"]:32} {ok} 선언={e["has_outfit"]} 실제={actual}')
PY
```
Expected: 부엌을 뺀 5줄 전부 `OK`. `MISMATCH`가 있으면 `index.json` 쪽 값을 실제에 맞춘다.

부엌은 코스 JSON이 없어 자동 검증이 안 된다. `docs/kitchen/mosu-steak-2026-08-02.html`에
복장 섹션이 있는지 눈으로 확인한다 (`grep -c 'outfit' docs/kitchen/mosu-steak-2026-08-02.html`
가 0보다 크면 있음).

- [ ] **Step 3: JSON 문법과 태그 어휘를 검증한다**

Run:
```bash
python3 - <<'PY'
import json, sys
sys.path.insert(0, ".")
from save_course import TAGS
idx = json.load(open("docs/courses/index.json", encoding="utf-8"))
bad = [(e["slug"], t) for e in idx["courses"] for t in e.get("tags", []) if t not in TAGS]
print("항목", len(idx["courses"]), "· 어휘 위반", bad or "없음")
PY
```
Expected: `항목 6 · 어휘 위반 없음`

- [ ] **Step 4: `docs/sw.js`의 캐시 버전을 올린다**

`index.html`과 `app.js`가 바뀌었으므로 기존 설치본이 낡은 셸을 계속 쓰지 않게 한다.

```js
const CACHE = "date-course-v6";
```

`/kitchen/` navigate 예외는 그대로 둔다.

- [ ] **Step 5: JS 테스트가 여전히 통과하는지 확인**

Run: `node --test tests/*.test.mjs`
Expected: PASS (15 tests) — 테스트는 픽스처를 쓰므로 실제 데이터와 무관하지만 회귀 확인용

- [ ] **Step 6: 커밋**

```bash
git add docs/courses/index.json docs/sw.js
git commit -m "index.json 백필: 지역·태그·이모지·복장 여부, 부엌 항목 이전

title에 섞여 있던 날짜와 이모지를 date/emoji 필드로 분리했다.
부엌 페이지는 app.js 하드코딩에서 kind:kitchen 항목으로 옮겨
코스와 같은 날짜순 목록에 섞인다.
셸이 바뀌었으므로 sw.js 캐시를 v6으로 올린다."
```

---

### Task 6: 브라우저 검증과 문서 갱신

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음 (마지막 태스크)

- [ ] **Step 1: 로컬 서버를 띄운다**

```bash
python3 -m http.server 8765 --directory docs
```

- [ ] **Step 2: 설계 문서의 검증 항목 6개를 브라우저로 확인한다**

각 항목의 결과를 글로 기록한다 (사용자가 화면을 볼 수 없는 상황이다).

1. `http://localhost:8765/` — 카드 6개가 날짜 내림차순으로 뜨고, 각 커버 색이 다르며,
   부엌(🍳 집마카세)이 8/8과 8/1 사이에 섞여 있다. 연도 헤딩은 **없다**(전부 2026).
2. 필터 칩 `홍대` 클릭 → URL이 `?r=%ED%99%8D%EB%8C%80`로 바뀌고 카드가 1개만 남는다.
   페이지 전체 새로고침이 일어나지 않는다. 뒤로가기 → 전체 목록으로 돌아온다.
3. 필터 칩 `집` 클릭 → 부엌 카드만 남는다.
4. 부엌 카드 클릭 → `kitchen/mosu-steak-2026-08-02.html`이 실제로 열린다
   (PWA 홈이 다시 뜨면 SW 회귀다).
5. `?c=qingdao-2026-08`, `?f`, `?f=peak-end` 세 라우트가 그대로 동작한다.
6. 다크모드(`prefers-color-scheme: dark` 에뮬레이션)에서 커버 이모지가 읽히고
   뱃지 대비가 충분하다.

- [ ] **Step 3: 폴백을 실제로 확인한다**

`docs/courses/index.json`에 임시 항목을 하나 넣는다:

```json
  {
   "slug": "__fallback-test",
   "title": "폴백 확인용",
   "meta": "region/tags/emoji 없음",
   "date": "2025-01-01"
  }
```

새로고침 → 회색 커버 + `폴` 글자 + 뱃지 줄 없음으로 뜨고, **연도가 2개(2026/2025)가
되므로 연도 헤딩이 나타나야** 한다. 확인 후 임시 항목을 **반드시 지운다**.

Run: `git diff --stat docs/courses/index.json`
Expected: 변경 없음 (임시 항목을 지웠으므로)

- [ ] **Step 4: 서버를 끄고 전체 테스트를 돌린다**

Run: `python3 -m pytest tests/ -v && node --test tests/*.test.mjs`
Expected: pytest 11 passed, node 15 tests pass

- [ ] **Step 5: `CLAUDE.md`를 갱신한다**

"Share PWA (`docs/`, GitHub Pages)" 섹션의 라우팅 줄을 고친다 — 홈에 필터가 생겼다:

```
- **Routing (`docs/app.js`)**: `#<mode>:<b64url>` = shared one-off course (data lives in the URL, no server storage — the private path); `?c=<slug>` = archived course (`docs/courses/<slug>.json`); `?f=<slug>` / `?f` = one factor / factor guide index; `?r=<region>` / `?t=<tag>` = archive home filtered by region / tag; bare URL = "우리 데이트 기록" archive home.
```

같은 섹션의 `save_course.py` 줄을 고친다:

```
  - `save_course.py course.json --slug … --date … [--region … --tags … --emoji …]` → writes `docs/courses/<slug>.json` + upserts `courses/index.json`. `--tags` is validated against the fixed `TAGS` vocabulary in the script (unknown tags are rejected); `has_outfit` is derived from the course JSON. ⚠️ archived courses are **public** on Pages (committed files); the URL-hash share link is the private option.
```

같은 섹션 끝에 아카이브 항목 스키마를 설명하는 항목을 추가한다:

```
- **Archive index (`docs/courses/index.json`)** — the home list. Each entry: `slug` / `title` / `meta` / `date` / `added`, plus optional `region` (1 string; drives the card's gradient hue via `regionHue` and a filter chip), `tags[]` (fixed vocabulary), `emoji` (card cover), `has_outfit`. Entries with `kind: "kitchen"` link to a standalone `href` instead of `?c=<slug>` — the kitchen list used to be hardcoded in `app.js` and now lives here. Missing optional fields fall back to a plain grey card, so hand-added entries are safe.
```

"Three helper scripts" 문단 아래에 테스트 실행법을 추가한다:

```
- **Tests**: `python3 -m pytest tests/` (save_course.py) and `node --test tests/*.test.mjs` (archive home logic in `docs/app.js`). No npm dependencies — `tests/harness.mjs` evaluates `app.js` in `node:vm` with a minimal DOM stub, because `app.js` is a build-free global script and must stay that way.
```

- [ ] **Step 6: 커밋**

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md에 아카이브 index.json 스키마·필터 라우트·테스트 실행법 반영"
```

- [ ] **Step 7: 최종 확인**

Run: `git status --short && git log --oneline -6`
Expected: 워킹 트리 깨끗, 커밋 6개

---

## Self-Review

**스펙 커버리지**

| 스펙 항목 | 태스크 |
|---|---|
| `index.json` 스키마 4필드 확장 | Task 1 (`build_entry`), Task 5 (백필) |
| 부엌 `kind` / `href` | Task 3 (`entryHref`), Task 5 (데이터) |
| `region` 1개 문자열 근거 | Task 5 (워터밤 = 킨텍스) |
| 태그 고정 어휘 + 거부 | Task 1 (`TAGS`, `parse_tags`) |
| `save_course.py` 플래그 3개, 선택 | Task 1 Step 8 |
| `has_outfit` 자동 파생 | Task 1 (`derive_has_outfit`), Task 5 Step 2 (검증) |
| 카드 2단 + 4줄 본문 | Task 3 (`renderArchCard`), Task 4 (CSS) |
| 폴백(회색 커버, 첫 글자, 뱃지 생략) | Task 3 Step 1 테스트, Task 4 Step 3, Task 6 Step 3 |
| 지역 → 해시 hue, 다크모드 밝기 | Task 2 (`regionHue`), Task 4 Step 2 |
| 연도 헤딩(2개 이상일 때만) | Task 3 (`showYear`), Task 6 Step 3 |
| 필터 칩(존재하는 값만, 단일 선택) | Task 3 (`renderFilterChips`) |
| `?r=` / `?t=` URL + pushState + 뒤로가기 | Task 3 Step 5·6, Task 6 Step 2 |
| 라우터 분기 순서 유지 | Task 3 Step 5 |
| `KITCHEN` 상수 삭제 | Task 3 Step 3 |
| `sw.js` `/kitchen/` 예외 유지 | Task 3 Step 3, Task 5 Step 4 |
| `CACHE` 버전 bump | Task 5 Step 4 |
| 검증 6항목 | Task 6 Step 2 |
| `CLAUDE.md` 갱신 | Task 6 Step 5 |

**타입 일관성 확인**

- `filter` 객체 형태 `{type: "r"|"t", value: string}` — Task 2 정의, Task 3 `renderArchive` /
  `renderFilterChips` / 라우터에서 동일하게 사용.
- `renderArchive(index, filter)` 2인자 — Task 3에서 시그니처를 바꾸고 라우터 호출부도 같은
  Step에서 고친다. 다른 호출부는 없다.
- `groupByYear` 반환 `[string, object[]][]` — Task 2 테스트와 Task 3 `.map(([y, es]) => ...)` 일치.
- `--hue`는 Task 3에서 `.arch-card`에 인라인 스타일로 붙고, Task 4의 `.cover` / `.bdg-region`이
  같은 요소의 자손이므로 상속받는다.

**빠진 것 없음 확인**: 스펙의 "범위 밖" 항목(사진, 평점·후기, 검색, 지도, 다중 필터,
코스 상세 변경, `render_course.py`)은 어느 태스크에도 없다.
