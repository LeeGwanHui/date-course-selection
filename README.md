# 데이트 코스 선정 방법 — 리서치

"사랑받고 좋은 시간을 보내는 데이트 코스를 선정하는 방법"을 심리학·관계학 근거로 조사한 리서치 자료.

## 구성
- `outline.yaml` — 리서치 항목 15개 + 실행 설정
- `fields.yaml` — 조사 필드 정의 (정의·심리근거·적용법·실수·예시·출처)
- `results/*.json` — 항목별 상세 리서치 결과 (영어, 15개)
- `generate_report.py` — JSON → 마크다운 리포트 변환 스크립트
- `report.md` — 최종 리포트 (영어 본문)
- `report_ko.md` — 한국어 번역판 리포트

## 리서치 항목 (15개 요인)
| 그룹 | 요인 |
|---|---|
| 준비 | 상대방 취향 파악 · 예산 적정성 · 관계 단계 맞춤 |
| 동선·구성 | 동선·장소 근접성 · 활동 다양성·완급 · 시간대·타이밍 · 날씨·계절 대응 |
| 심리·감성 | 분위기·무드 · 대화 기회 설계 · 새로움·설렘 · 개인화·서프라이즈 · 폰 사용 관리(Anti-Phubbing) |
| 마무리 | 추억·기록 남기기 |
| 안전·토대 | 안전·안심 설계 |
| 구조·마무리 | 코스 순서·피날레(Peak-End Rule) |

## 리포트 재생성
```bash
python3 generate_report.py   # results/*.json → report.md
```

*모든 항목은 웹 검색 기반 심리학·관계학 연구 근거로 조사됨. 근거 강도가 낮은 값은 `[uncertain]`으로 표시해 리포트에서 제외.*

## 공유 PWA (`docs/`, GitHub Pages)

생성된 **데이트 코스**를 폰에서 열람하고 연인에게 **읽기전용 링크**로 공유하는 백엔드 없는 정적 PWA. 코스 생성 엔진은 별도 `~/.claude/skills/date-course` 스킬이 담당한다.

- `docs/` — PWA(오프라인·홈화면 설치). 라우팅: `#…`(공유받은 1회성 코스, 데이터가 URL에 있어 서버 저장 없음) · `?c=slug`(아카이브 코스) · `?f=slug`/`?f`(심리 근거 요인/가이드) · 파라미터 없음(우리 데이트 기록 홈).
- `share_link.py course.json` — 코스 JSON → 공유 `#…` 링크(카톡용).
- `save_course.py course.json --slug … --date …` — 코스를 아카이브(`docs/courses/`)에 저장(⚠️ Pages에 공개됨).
- `build_web_data.py` — `report_ko.md`+`outline.yaml` → `docs/factors.json`(요인 근거, 한국어).
- 배포: repo Settings → Pages → Deploy from branch → `master` `/docs` (1회). URL: `https://leegwanhui.github.io/date-course-selection/`.
