# -*- coding: utf-8 -*-
"""실제 docs/courses/index.json이 앱이 기대하는 모양을 유지하는지 지킨다.
   손으로 편집하거나 코스 JSON만 고쳤을 때 조용히 어긋나는 걸 잡는 게 목적이다."""
import json
import os

import pytest

import save_course

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COURSES = os.path.join(ROOT, "docs", "courses")


def _index():
    with open(os.path.join(COURSES, "index.json"), encoding="utf-8") as f:
        return json.load(f)["courses"]


def _entries():
    return [(e["slug"], e) for e in _index()]


@pytest.mark.parametrize("slug,entry", _entries())
def test_tags_are_in_the_fixed_vocabulary(slug, entry):
    bad = [t for t in entry.get("tags", []) if t not in save_course.TAGS]
    assert not bad, f"{slug}: 허용되지 않은 태그 {bad}"


@pytest.mark.parametrize("slug,entry", _entries())
def test_has_outfit_matches_the_course_json(slug, entry):
    if entry.get("kind") == "kitchen":
        pytest.skip("부엌 항목은 대응하는 코스 JSON이 없다")
    path = os.path.join(COURSES, slug + ".json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    assert entry.get("has_outfit") is save_course.derive_has_outfit(data)


@pytest.mark.parametrize("slug,entry", _entries())
def test_course_entries_have_a_matching_json_file(slug, entry):
    if entry.get("kind") == "kitchen":
        assert entry.get("href"), f"{slug}: 부엌 항목에 href가 없으면 링크가 죽는다"
        assert entry["href"].startswith("kitchen/"), (
            f"{slug}: href가 kitchen/ 밖이면 sw.js의 navigate 예외에 안 걸려 "
            f"서비스워커가 앱 셸을 돌려준다"
        )
        assert os.path.exists(os.path.join(ROOT, "docs", entry["href"]))
    else:
        assert os.path.exists(os.path.join(COURSES, slug + ".json"))


def test_every_course_json_has_an_index_entry():
    on_disk = {
        f[:-5] for f in os.listdir(COURSES)
        if f.endswith(".json") and f != "index.json"
    }
    indexed = {slug for slug, _ in _entries()}
    assert on_disk - indexed == set(), "index.json에 없는 코스 JSON이 있다"


def test_entries_are_date_descending():
    """홈은 정렬하지 않고 이 순서를 그대로 그린다. 손으로 항목을 넣을 때 깨지기 쉽다."""
    dates = [e.get("date", "") for _, e in _entries()]
    assert dates == sorted(dates, reverse=True)
