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
