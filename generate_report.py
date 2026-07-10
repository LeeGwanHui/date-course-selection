#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
데이트 코스 선정 요인 리서치 결과(JSON) -> 마크다운 리포트 변환 스크립트.
- results/*.json 을 모두 읽어 fields.yaml 의 카테고리/필드 구조대로 정리
- [uncertain] 표시 값, uncertain 배열에 든 필드, 빈 값은 스킵
- 목차: 그룹(outline category)별 묶음 + basic_info 첫 문장 요약
"""
import json
import os
import re
import sys

try:
    import yaml
except ImportError:
    print("PyYAML required: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BASE_DIR, "results")
FIELDS_PATH = os.path.join(BASE_DIR, "fields.yaml")
OUTLINE_PATH = os.path.join(BASE_DIR, "outline.yaml")
REPORT_PATH = os.path.join(BASE_DIR, "report.md")

# Legacy aliases only; authoritative keys come from fields.yaml.
BUILTIN_CATEGORY_ALIASES = {
    "basic_info": ["basic_info", "Basic Info"],
    "technical_features": ["technical_features", "technical_characteristics", "Technical Features"],
    "performance_metrics": ["performance_metrics", "performance", "Performance Metrics"],
    "milestone_significance": ["milestone_significance", "milestones", "Milestone Significance"],
    "business_info": ["business_info", "commercial_info", "Business Info"],
    "competition_ecosystem": ["competition_ecosystem", "competition", "Competition & Ecosystem"],
    "history": ["history", "History"],
    "market_positioning": ["market_positioning", "market", "Market Positioning"],
}

# 카테고리 표시 이름(한글)
CATEGORY_LABELS = {
    "overview": "개요 (정의·중요성)",
    "rationale": "심리·관계학적 근거",
    "application": "실전 적용",
    "sources": "근거·출처",
    "basic_info": "개요",
    "evidence": "근거·출처",
}
# 필드 표시 이름(한글)
FIELD_LABELS = {
    "basic_info": "정의·중요성",
    "psychology": "심리 근거",
    "how_to_apply": "적용법",
    "common_mistakes": "흔한 실수",
    "examples": "예시",
    "evidence": "근거 출처",
}


def load_yaml(path):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_category_keys(fields_yaml):
    mapping = {}
    for cat in fields_yaml.get("field_categories", []):
        name = cat["category"]
        mapping[name] = sorted(set([name] + BUILTIN_CATEGORY_ALIASES.get(name, [])))
    return mapping


def slug_anchor(text):
    """GitHub 스타일 앵커: 소문자화, 공백->-, 특수문자 제거(유니코드 보존)."""
    s = text.strip().lower()
    s = s.replace(" ", "-")
    s = re.sub(r"[^\w\-가-힣]", "", s, flags=re.UNICODE)
    return s


def find_leaf(data, field_name):
    """JSON 어디에 있든 key==field_name 인 '문자열 잎값'을 재귀 탐색해 반환.
    카테고리 래퍼(dict)를 반환하지 않도록 문자열/스칼라만 채택."""
    found = []

    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k == field_name and isinstance(v, (str, int, float)):
                    found.append(v)
                walk(v)
        elif isinstance(node, list):
            for it in node:
                walk(it)

    walk(data)
    for v in found:
        if v is not None and str(v).strip() != "":
            return v
    return None


def is_uncertain(value, field_name, uncertain_list):
    if field_name in (uncertain_list or []):
        return True
    if value is None:
        return True
    sval = str(value).strip()
    if sval == "":
        return True
    if "[uncertain]" in sval:
        return True
    return False


def strip_uncertain_tag(text):
    return str(text).replace("[uncertain]", "").strip()


def first_sentence(text, limit=160):
    t = strip_uncertain_tag(text)
    # 첫 문장(마침표 기준) 또는 limit 자
    m = re.search(r"(.+?[.!?])(\s|$)", t)
    s = m.group(1) if m else t
    if len(s) > limit:
        s = s[:limit].rstrip() + "…"
    return s


def norm_key(s):
    """비교용 정규화: 소문자, 한글/영숫자 외 모두 제거."""
    return re.sub(r"[^0-9a-z가-힣]", "", str(s).lower())


def match_outline(stem, outline_items):
    """파일명 stem 을 outline 의 한글 항목명과 매칭 (정규화 후 동일/접두 비교)."""
    ns = norm_key(stem)
    for oi in outline_items:
        no = norm_key(oi["name"])
        if ns == no or ns.startswith(no) or no.startswith(ns):
            return oi
    return None


def load_items():
    """results/*.json 로드. outline.yaml 의 한글 이름/그룹을 우선 사용."""
    outline_items, _ = outline_order()
    items = []
    for fn in sorted(os.listdir(RESULTS_DIR)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(RESULTS_DIR, fn)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        stem = os.path.splitext(fn)[0]
        oi = match_outline(stem, outline_items)
        if oi:
            name = oi["name"]
            category = oi.get("category", "기타")
        else:
            name = data.get("item") or stem
            category = data.get("category", "기타")
        items.append({
            "name": name,
            "category": category,
            "uncertain": data.get("uncertain", []),
            "data": data,
            "file": fn,
        })
    return items


def outline_order():
    """outline.yaml 의 항목 리스트와 topic 반환."""
    try:
        ol = load_yaml(OUTLINE_PATH)
        return ol.get("items", []), ol.get("topic", "")
    except Exception:
        return [], ""


def group_order_from_outline(items):
    """그룹 순서를 outline 항목 등장 순서대로."""
    outline_items, _ = outline_order()
    order = []
    for oi in outline_items:
        g = oi.get("category", "기타")
        if g not in order:
            order.append(g)
    # outline 에 없던 그룹은 뒤에 추가
    for it in items:
        if it["category"] not in order:
            order.append(it["category"])
    return order


def format_value(text):
    """긴 서술형 값을 읽기 좋게: 100자 초과면 blockquote 처리."""
    t = strip_uncertain_tag(text)
    if len(t) > 100:
        # 문장 단위로 살짝 개행
        return "> " + t.replace("\n", "\n> ")
    return t


def main():
    fields_yaml = load_yaml(FIELDS_PATH)
    _ = build_category_keys(fields_yaml)  # 카테고리 해석 규칙(검증기와 동일 원리)

    # 카테고리 -> [필드명...] (fields.yaml 선언 순서)
    cat_fields = []
    for cat in fields_yaml.get("field_categories", []):
        cname = cat["category"]
        fnames = [fd["name"] for fd in cat.get("fields", [])]
        cat_fields.append((cname, fnames))

    items = load_items()
    outline_items, topic = outline_order()
    topic = topic or "데이트 코스 선정 요인"

    # outline 항목 순서대로 정렬
    order_index = {norm_key(oi["name"]): i for i, oi in enumerate(outline_items)}
    items.sort(key=lambda it: order_index.get(norm_key(it["name"]), 999))

    # 그룹 순서 = outline 등장 순서
    group_order = group_order_from_outline(items)

    lines = []
    lines.append(f"# {topic} — 리서치 리포트\n")
    lines.append(f"> 총 **{len(items)}개 요인** · 각 요인을 정의·심리근거·적용법·실수·예시·출처로 조사")
    lines.append("> `[uncertain]`으로 표시됐던 값은 리포트에서 제외했습니다.\n")

    # ---------- 목차 ----------
    lines.append("## 목차\n")
    idx = 0
    for g in group_order:
        lines.append(f"### {g}")
        for it in items:
            if it["category"] != g:
                continue
            idx += 1
            anchor = slug_anchor(it["name"])
            summary = find_leaf(it["data"], "basic_info")
            one_line = first_sentence(summary) if summary and not is_uncertain(summary, "basic_info", it["uncertain"]) else ""
            if one_line:
                lines.append(f"{idx}. [{it['name']}](#{anchor}) — {one_line}")
            else:
                lines.append(f"{idx}. [{it['name']}](#{anchor})")
        lines.append("")

    # ---------- 상세 ----------
    lines.append("---\n")
    lines.append("## 상세 내용\n")
    idx = 0
    for g in group_order:
        lines.append(f"## 〔{g}〕\n")
        for it in items:
            if it["category"] != g:
                continue
            idx += 1
            lines.append(f"### {it['name']}\n")
            wrote_any = False
            for cname, fnames in cat_fields:
                # 이 카테고리에 실제로 표시할 필드가 있는지 먼저 수집
                block = []
                for fname in fnames:
                    val = find_leaf(it["data"], fname)
                    if is_uncertain(val, fname, it["uncertain"]):
                        continue
                    label = FIELD_LABELS.get(fname, fname)
                    block.append(f"**{label}**\n\n{format_value(val)}\n")
                if block:
                    clabel = CATEGORY_LABELS.get(cname, cname)
                    lines.append(f"#### {clabel}\n")
                    lines.extend(block)
                    wrote_any = True
            # uncertain 필드 안내 (있으면)
            if it["uncertain"]:
                skipped = ", ".join(FIELD_LABELS.get(u, u) for u in it["uncertain"])
                lines.append(f"> ⚠️ 불확실로 제외된 필드: {skipped}\n")
            if not wrote_any:
                lines.append("_표시할 확정 값이 없습니다._\n")
            lines.append("")

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[OK] report written: {REPORT_PATH}")
    print(f"     items: {len(items)}, groups: {len(group_order)}")


if __name__ == "__main__":
    main()
