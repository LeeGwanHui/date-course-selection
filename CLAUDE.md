# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **research artifact repo** with a small **share layer** on top. Its core documents "how to choose a date course that makes you loved and shows a good time" grounded in psychology/relationship science — structured data (YAML/JSON) plus generated Markdown reports. Content is bilingual: research data is written in English, and a Korean report is produced from it. On top sits `docs/`, a static **GitHub Pages PWA** that renders/shares actual generated courses on mobile (see "Share PWA" below).

The **course-generation engine is a separate Claude skill** (`~/.claude/skills/date-course`), not in this repo. This repo holds the research DB + the reports + the share PWA + three helper scripts.

## Regenerate the report

```bash
python generate_report.py   # results/*.json -> report.md  (requires PyYAML: pip install pyyaml)
```

`report_ko.md` is a **manual Korean translation** of `report.md`; the script does not produce it. After editing research data, regenerate `report.md`, then update `report_ko.md` by hand to match.

## Share PWA (`docs/`, GitHub Pages)

A backend-free static PWA that renders a generated **course** (not the research) on mobile and shares it read-only. Deploy: repo Settings → Pages → Deploy from branch → `master` `/docs`. URL: `https://leegwanhui.github.io/date-course-selection/`.

- **Course schema** = the skill's `render_course.py` docstring (title/meta/courses[]/stops[]). `docs/app.js` is a 1:1 JS port of that renderer, driven by data instead of writing HTML server-side. **Don't invent a new course format** — edit both if the schema changes.
- **Optional `courses[].outfit`** (`{formula?, items[], swaps?, why?, checks?}`) — a per-course 복장 추천, filled by the separate `fashion` repo (see its `date_outfit.md`). Rendered by all three: `render_course.py`, `docs/app.js`, and `docs/index.html` CSS (`.outfit*`). Keep 체형 실측·인상 목표 out of it — the card is public once archived.
- **Routing (`docs/app.js`)**: `#<mode>:<b64url>` = shared one-off course (data lives in the URL, no server storage — the private path); `?c=<slug>` = archived course (`docs/courses/<slug>.json`); `?f=<slug>` / `?f` = one factor / factor guide index; bare URL = "우리 데이트 기록" archive home.
- **Three helper scripts (stdlib only, `python3` — this machine has no `python`)**:
  - `share_link.py course.json` → prints the `#…` share link. Encoding (`z:`=deflate/`j:`=plain, base64url) **must stay in sync with `app.js`'s `decodeFragment`**.
  - `build_web_data.py` → `docs/factors.json` from **`report_ko.md` + `outline.yaml`** (Korean, not the English `results/`). Re-run after editing `report_ko.md`. Factor slugs live in its `SLUGS` map; these slugs are what a course JSON's optional `courses[].factors: [...]` and the badge auto-map (peak/finale→`peak-end`) reference.
  - `save_course.py course.json --slug … --date …` → writes `docs/courses/<slug>.json` + upserts `courses/index.json`. ⚠️ archived courses are **public** on Pages (committed files); the URL-hash share link is the private option.
- **Offline/install**: `docs/sw.js` (cache-first shell + precached `factors.json`; network-first for JSON data). Bump `CACHE` version when shell assets change.

## Data pipeline & architecture

The report is built from three inputs, understood together:

1. **`outline.yaml`** — the authoritative list of the 15 factors (`items`), each with a Korean `name` and a `category` (그룹: 준비 / 동선·구성 / 심리·감성 / 마무리 / 안전·토대 / 구조·마무리). This file drives both the **order** of factors in the report and their **grouping**. `execution:` keys (`batch_size`, `items_per_agent`) are config for the research-generation workflow, not used by `generate_report.py`.
2. **`fields.yaml`** — the schema for how each factor is investigated: `field_categories` (overview / rationale / application / sources) each containing `fields` (`basic_info`, `psychology`, `how_to_apply`, `common_mistakes`, `examples`, `evidence`). This declares the field set and their order within a factor.
3. **`results/*.json`** — one file per factor holding the actual researched content, nested by the fields.yaml categories. Each file also has a top-level `uncertain` array listing field names to suppress.

`generate_report.py` joins them:
- **Filename → outline matching** (`match_outline` / `norm_key`): result filenames (e.g. `분위기_무드.json`) are matched to outline `name`s (e.g. `분위기·무드`) by normalizing away punctuation/underscores. A factor's report name and group come from `outline.yaml`, not from the JSON's English `item`/`category`.
- **Value extraction** (`find_leaf`): fields are pulled by recursively searching the JSON for a leaf whose key equals the field name, so the exact nesting inside each JSON doesn't matter — only that the key exists.
- **Uncertainty filtering** (`is_uncertain`): a value is skipped if the field is in that JSON's `uncertain` array, is empty, or contains the literal `[uncertain]` tag. Low-confidence research is intentionally dropped from the report rather than shown.
- **Labels**: `CATEGORY_LABELS` / `FIELD_LABELS` map the English schema keys to the Korean headings shown in the report.

## Adding or changing a factor

1. Add/edit the entry in `outline.yaml` `items` (Korean `name` + `category` decides order and grouping).
2. Create/edit `results/<name>.json` — filename should normalize to the outline `name`; include the researched fields (nesting is flexible) and an `uncertain` array for anything low-confidence.
3. Run `generate_report.py`, then hand-update `report_ko.md`.

If a new factor doesn't appear in the report, the usual cause is a filename that doesn't normalize-match its `outline.yaml` name.
