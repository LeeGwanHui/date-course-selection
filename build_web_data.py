#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
report_ko.md + outline.yaml → docs/factors.json (PWA용 15요인 근거 데이터, 한국어).

앱은 한국어이므로 영어 원문(results/*.json) 대신 **한국어 리포트**에서 근거 텍스트를 뽑는다.
각 요인 → {slug, name, category, summary, definition, psychology, how_to, mistakes}.
- summary: outline.yaml 의 한글 description(한 줄)
- 나머지: report_ko.md '## 상세 내용' 이하에서 요인별 blockquote 파싱
slug은 URL(?f=)·코스 태깅(factors)용 안정 ASCII 키. PyYAML 필요.

사용법:  python3 build_web_data.py   # → docs/factors.json
report_ko.md 를 손봤다면 다시 실행해 동기화한다.
"""
import json
import os

import yaml

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPORT_KO = os.path.join(BASE_DIR, "report_ko.md")
OUTLINE = os.path.join(BASE_DIR, "outline.yaml")
OUT_PATH = os.path.join(BASE_DIR, "docs", "factors.json")

# outline.yaml 항목명 → 안정 ASCII slug (코스 JSON의 factors 태그, URL ?f= 에 사용)
SLUGS = {
    "상대방 취향 파악": "preferences",
    "예산 적정성": "budget",
    "관계 단계 맞춤": "stage",
    "동선·장소 근접성": "route",
    "활동의 다양성·완급": "variety",
    "시간대·타이밍": "timing",
    "날씨·계절 대응": "weather",
    "분위기·무드": "mood",
    "대화 기회 설계": "conversation",
    "새로움·설렘(novelty)": "novelty",
    "개인화·서프라이즈": "surprise",
    "온전한 집중·폰 사용 관리(Anti-Phubbing)": "focus",
    "추억·기록 남기기": "memory",
    "안전·안심 설계": "safety",
    "코스 순서·피날레(Peak-End Rule)": "peak-end",
}

# report_ko.md 의 굵은 라벨 → 필드
LABELS = {
    "정의·중요성": "definition",
    "심리 근거": "psychology",
    "적용법": "how_to",
    "흔한 실수": "mistakes",
}


def parse_report_ko():
    """report_ko.md '## 상세 내용' 이하를 요인명→{field:text} 로 파싱."""
    with open(REPORT_KO, encoding="utf-8") as f:
        lines = f.read().splitlines()
    try:
        start = lines.index("## 상세 내용")
    except ValueError:
        start = 0

    factors, cur, field = {}, None, None
    for line in lines[start + 1:]:
        if line.startswith("## "):          # 그룹 헤더(## 〔..〕) — 무시
            field = None
            continue
        if line.startswith("### "):         # 요인 시작
            cur = line[4:].strip()
            factors[cur] = {}
            field = None
            continue
        if cur is None:
            continue
        stripped = line.strip()
        if stripped.startswith("**") and stripped.endswith("**"):
            field = LABELS.get(stripped.strip("*").strip())
            continue
        if field and stripped.startswith(">"):
            text = stripped.lstrip("> ").strip()
            factors[cur][field] = (factors[cur].get(field, "") + " " + text).strip()
    return factors


def build():
    outline = yaml.safe_load(open(OUTLINE, encoding="utf-8"))
    desc = {it["name"]: it.get("description", "") for it in outline.get("items", [])}
    parsed = parse_report_ko()

    factors, missing = [], []
    for it in outline.get("items", []):
        name = it["name"]
        slug = SLUGS.get(name)
        if not slug:
            missing.append(name)
            continue
        p = parsed.get(name, {})
        factors.append({
            "slug": slug,
            "name": name,
            "category": it.get("category", "기타"),
            "summary": desc.get(name, ""),
            "definition": p.get("definition", ""),
            "psychology": p.get("psychology", ""),
            "how_to": p.get("how_to", ""),
            "mistakes": p.get("mistakes", ""),
        })

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"factors": factors}, f, ensure_ascii=False, indent=1)
    print(f"[OK] {OUT_PATH}  ({len(factors)} factors)")
    unmatched = [n for n in parsed if n not in SLUGS]
    if missing:
        print("  ⚠️ slug 미지정(제외됨):", ", ".join(missing))
    if unmatched:
        print("  ⚠️ 리포트엔 있으나 SLUGS에 없는 요인:", ", ".join(unmatched))


if __name__ == "__main__":
    build()
