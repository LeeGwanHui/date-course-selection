#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
데이트 코스 JSON → 연인 공유용 GitHub Pages 링크 생성기 (표준 라이브러리만 사용).

코스 데이터를 URL 프래그먼트(#...)에 통째로 실어 보내는 방식이라 서버 저장이 전혀 없다.
링크를 아는 사람만 코스를 볼 수 있다(준-비공개). 입력 스키마는 스킬의 render_course.py와 동일:
  { "title", "meta"?, "courses":[ { "name","concept"?,"cost"?,"route_summary"?,"plan_b"?,
    "tips"?[], "stops":[ {"time","name","reason"?,"stay"?,"move"?,"place_url"?,"badge"?,"x"?,"y"?} ] } ] }

인코딩 규약(docs/app.js 디코더와 반드시 일치):
  fragment = "<mode>:<base64url(payload)>"
    mode "z" → payload = zlib.compress(utf8(json))   (브라우저 DecompressionStream('deflate'))
    mode "j" → payload = utf8(json)                  (압축 없이)
  base64url = 표준 base64에서 '+/'→'-_', '=' 패딩 제거. 더 짧은 쪽을 자동 선택.

사용법:
  python3 share_link.py course.json
  cat course.json | python3 share_link.py --stdin
  python3 share_link.py course.json --base https://myuser.github.io/myrepo/
"""
import argparse
import base64
import json
import sys
import zlib

DEFAULT_BASE = "https://leegwanhui.github.io/date-course-selection/"


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def encode_fragment(data) -> str:
    """코스 데이터를 '<mode>:<b64url>' 프래그먼트로 인코딩. 압축본이 더 짧으면 압축본 사용."""
    js = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    plain = "j:" + b64url(js)
    comp = "z:" + b64url(zlib.compress(js, 9))
    return comp if len(comp) < len(plain) else plain


def build_url(data, base: str) -> str:
    return base.rstrip("/") + "/#" + encode_fragment(data)


def main():
    ap = argparse.ArgumentParser(description="데이트 코스 JSON → 공유 링크")
    ap.add_argument("input", nargs="?", help="코스 JSON 파일 경로 (또는 --stdin)")
    ap.add_argument("--stdin", action="store_true", help="stdin에서 JSON 읽기")
    ap.add_argument("--base", default=DEFAULT_BASE, help=f"베이스 URL (기본: {DEFAULT_BASE})")
    args = ap.parse_args()

    if args.stdin:
        data = json.load(sys.stdin)
    elif args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        sys.exit("ERROR: JSON 입력 파일 경로나 --stdin 중 하나가 필요합니다.")

    url = build_url(data, args.base)
    print(url)
    print(f"[len {len(url)}자]", file=sys.stderr)


if __name__ == "__main__":
    main()
