#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
데이트 코스 JSON → 아카이브('우리 데이트 기록')에 저장. 표준 라이브러리만.

코스를 docs/courses/<slug>.json 으로 저장하고 docs/courses/index.json(목록)을 업서트한다.
PWA 홈(파라미터 없는 base URL)이 이 목록을 '지난 코스 모아보기'로 보여준다.

⚠️ 아카이브에 저장된 코스는 GitHub Pages에 **공개**된다(링크가 아니라 파일로 커밋되므로).
   코스에 outfit이 있으면 복장 아이템도 함께 공개된다.
   민감한 코스는 저장하지 말고, 1회성 비공개 공유는 share_link.py(URL 해시)를 쓴다.

사용법:
  python3 save_course.py course.json --date 2026-07-20
  python3 save_course.py course.json --slug seongsu-first --date 2026-07-20
  cat course.json | python3 save_course.py --stdin --date 2026-07-20
  python3 save_course.py course.json --slug hongdae-escape-2026-08-08 --date 2026-08-08 \
      --region 홍대 --tags 액티비티,실내,맛집,술 --emoji 🔓
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
COURSES_DIR = os.path.join(BASE_DIR, "docs", "courses")
INDEX_PATH = os.path.join(COURSES_DIR, "index.json")

# 아카이브 필터 칩의 고정 어휘. 축 3개(활동 / 환경 / 규모)로 나뉜다.
# 자유 입력을 허용하면 '실내'/'인도어'/'실내데이트'처럼 흩어져 칩이 지저분해진다.
TAGS = (
    "맛집", "카페", "술", "영화", "액티비티", "페스티벌", "전시", "산책",  # 활동
    "실내", "야외",                                                      # 환경
    "여행",                                                              # 규모(1박 이상)
)

# 재저장 때 물려받을 아카이브 전용 키들. 코스 JSON에는 없고 index.json에만 사는 값이라,
# 플래그를 빠뜨린 재저장이 이걸 지워버리면 백필한 메타가 통째로 날아간다.
CARRIED = ("region", "tags", "emoji", "kind", "href")


def sanitize_slug(s):
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9\-]+", "-", s).strip("-")
    return s or "course"


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


def build_entry(data, slug, date, region=None, tags=None, emoji=None, prev=None):
    """index.json 한 항목. 선택 필드는 값이 있을 때만 넣는다 —
       없는 항목도 홈에서 기존 카드 모양으로 폴백되게 하기 위해서다.
       prev(같은 slug의 기존 항목)가 있으면 이번에 안 준 아카이브 메타는 물려받는다.
       title/meta는 물려받지 않는다 — 코스 JSON이 바뀌면 아카이브에도 반영돼야 한다."""
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
    for key in CARRIED:
        if key not in entry and prev and prev.get(key):
            entry[key] = prev[key]
    entry["has_outfit"] = derive_has_outfit(data)
    return entry


def load_index():
    if os.path.exists(INDEX_PATH):
        with open(INDEX_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"courses": []}


def main():
    ap = argparse.ArgumentParser(description="데이트 코스 → 아카이브 저장")
    ap.add_argument("input", nargs="?", help="코스 JSON 파일 (또는 --stdin)")
    ap.add_argument("--stdin", action="store_true", help="stdin에서 JSON 읽기")
    ap.add_argument("--slug", help="URL 슬러그(미지정 시 날짜 기반 자동)")
    ap.add_argument("--date", help="데이트 날짜 YYYY-MM-DD (기본: 오늘)")
    ap.add_argument("--region", help="대표 지역 1개 (홈 카드 커버 색·필터 칩)")
    ap.add_argument("--tags", help="쉼표 구분 태그. 허용: " + ", ".join(TAGS))
    ap.add_argument("--emoji", help="홈 카드 커버에 쓸 이모지 1개")
    args = ap.parse_args()

    try:
        tags = parse_tags(args.tags)
    except ValueError as e:
        sys.exit("ERROR: " + str(e))

    if args.stdin:
        data = json.load(sys.stdin)
    elif args.input:
        with open(args.input, encoding="utf-8") as f:
            data = json.load(f)
    else:
        sys.exit("ERROR: JSON 입력 파일 경로나 --stdin 중 하나가 필요합니다.")

    date = args.date or dt.date.today().isoformat()
    os.makedirs(COURSES_DIR, exist_ok=True)
    index = load_index()
    slugs = {c["slug"] for c in index["courses"]}

    base = sanitize_slug(args.slug) if args.slug else sanitize_slug(date)
    # 슬러그를 명시했고 이미 있으면 그 항목을 갱신(업서트), 아니면 충돌 회피로 새 슬러그
    if args.slug and base in slugs:
        slug = base
    else:
        slug = base
        n = 2
        while slug in slugs:
            slug = f"{base}-{n}"
            n += 1

    with open(os.path.join(COURSES_DIR, slug + ".json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    prev = next((c for c in index["courses"] if c["slug"] == slug), None)
    entry = build_entry(data, slug, date,
                        region=args.region, tags=tags, emoji=args.emoji, prev=prev)
    index["courses"] = [c for c in index["courses"] if c["slug"] != slug] + [entry]
    # 날짜 내림차순(같으면 추가시각 내림차순)
    index["courses"].sort(key=lambda c: (c.get("date", ""), c.get("added", "")), reverse=True)
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)

    print(f"[OK] 저장: docs/courses/{slug}.json")
    print(f"     아카이브 {len(index['courses'])}개 · 이 코스 보기: ?c={slug}")


if __name__ == "__main__":
    main()
