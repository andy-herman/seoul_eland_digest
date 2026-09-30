"""
Create Korean companion versions of finished English vault content.

Handles the same two content kinds as translate_digest_pt.py:
  - digests   : Digests/ -> Digests-KO/
  - previews  : Scouting Report/K League 2 2026/Pre-Match Previews/ -> Pre-Match Previews-KO/

Korean is written in two passes (transcreate, then a desk edit), checked with
scripts/ko_lint.py and scripts/ko_parity.py, and only written when the parity
check has no hard failures. House style lives in prompts/korean_style.txt; the
glossary in prompts/korean_glossary.json.

Quotes: the English digests paraphrase Korean sources. When the round's Korean
articles are in research_dump/, their quoted sentences are passed to the model
so it can use the original wording; otherwise quotes from Korean speakers become
indirect speech. A back-translated sentence must never appear as a direct quote.

An existing Korean file is kept as long as its facts still match the English
(ko_parity finds no hard mismatch), so hand edits survive the weekly rewrite of
the latest English digest. Use --force to re-translate anyway.

Usage:
    python scripts/translate_digest_ko.py                  # latest of each kind
    python scripts/translate_digest_ko.py --round 28       # one round (both kinds if present)
    python scripts/translate_digest_ko.py --kind previews
    python scripts/translate_digest_ko.py --all --force    # rebuild everything
"""

import argparse
import datetime as dt
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR / "scripts"))

load_dotenv(SCRIPT_DIR / ".env", override=True)

from modules.llm_client import build_client_from_config  # noqa: E402
from seoul_eland_digest import load_config, _format_prompt  # noqa: E402
import ko_lint  # noqa: E402
import ko_parity  # noqa: E402

PROMPTS = SCRIPT_DIR / "prompts"
DUMP = SCRIPT_DIR / "research_dump"
FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)
DISPLAY_KEYS = ("title", "description", "forecast_labels", "forecast_note",
                "predicted_lineup_label", "predicted_lineup_note", "predicted_lineup_team")


@dataclass
class ContentKind:
    name: str
    source_subpath: tuple[str, ...]
    target_subpath: tuple[str, ...]
    file_glob: str
    round_regex: re.Pattern
    headings_prompt: str
    quote_window: tuple[int, int]  # days before, days after the article date


CONTENT_KINDS: dict[str, ContentKind] = {
    "digests": ContentKind(
        name="digest",
        source_subpath=("Digests",),
        target_subpath=("Digests-KO",),
        file_glob="*_Seoul_E-Land_Digest.md",
        round_regex=re.compile(r"-R(\d+)_Seoul_E-Land_Digest\.md$", re.IGNORECASE),
        headings_prompt="korean_digest",
        quote_window=(1, 4),
    ),
    "previews": ContentKind(
        name="preview",
        source_subpath=("Scouting Report", "K League 2 2026", "Pre-Match Previews"),
        target_subpath=("Scouting Report", "K League 2 2026", "Pre-Match Previews-KO"),
        file_glob="*_Preview.md",
        round_regex=re.compile(r"-R(\d+)_.+_Preview\.md$", re.IGNORECASE),
        headings_prompt="korean_preview",
        quote_window=(12, 0),
    ),
}


def split_frontmatter(markdown: str) -> tuple[str, str]:
    match = FRONTMATTER_RE.match(markdown)
    if not match:
        return "", markdown
    return match.group(0).rstrip() + "\n", markdown[match.end():]


def frontmatter_date(frontmatter: str) -> dt.date | None:
    m = re.search(r'^date:\s*"?(\d{4}-\d{2}-\d{2})', frontmatter, re.M)
    return dt.date.fromisoformat(m.group(1)) if m else None


def _item_text(item: dict) -> tuple[str, str, str, str]:
    body = next((item[k] for k in ("body", "content", "text", "article", "description") if isinstance(item.get(k), str)), "")
    title = next((item[k] for k in ("title", "headline") if isinstance(item.get(k), str)), "")
    url = next((item[k] for k in ("url", "link", "originallink") if isinstance(item.get(k), str)), "")
    date = next((str(item[k]) for k in ("date", "pubDate", "published", "published_at") if item.get(k)), "")
    return title, body, url, date


def _parse_date(value: str) -> dt.date | None:
    m = re.search(r"(20\d\d)[.\-/](\d{1,2})[.\-/](\d{1,2})", value)
    if m:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(value).date()
    except (TypeError, ValueError, IndexError):
        return None


def korean_source_quotes(center: dt.date | None, window: tuple[int, int], limit: int = 80) -> str:
    """Quoted sentences from the round's Korean articles in research_dump, if present."""
    if center is None or not DUMP.exists():
        return ""
    files = [DUMP / "naver_eland_with_bodies.json", DUMP / "naver_gaps_with_bodies.json", *sorted(DUMP.glob("r*_naver*.json"))]
    lo, hi = center - dt.timedelta(days=window[0]), center + dt.timedelta(days=window[1])
    seen, lines = set(), []
    for path in files:
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        items = data if isinstance(data, list) else next((v for v in data.values() if isinstance(v, list)), []) if isinstance(data, dict) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            title, body, url, date = _item_text(item)
            day = _parse_date(date) if date else None
            if not body or day is None or not (lo <= day <= hi):
                continue
            for m in re.finditer(r"([^.\n\"“”]{0,40})[\"“]([^\"“”\n]{12,320})[\"”]\s*(?:라고|고|며|면서|라며)?\s*([가-힣]{0,12})", body):
                quote = m.group(2).strip()
                if quote in seen or not re.search(r"[가-힣]", quote):
                    continue
                seen.add(quote)
                lines.append(f'- ({day.isoformat()}) {m.group(1).strip()} "{quote}" {m.group(3)} [{title[:60]}] {url}')
                if len(lines) >= limit:
                    return "\n".join(lines)
    return "\n".join(lines)


def translate_display_fields(frontmatter: str, client) -> str:
    """Translate display-only frontmatter values; every other key stays byte-identical."""
    values = {}
    for key in DISPLAY_KEYS:
        m = re.search(rf"^{key}:\s*(.+)$", frontmatter, re.M)
        if m:
            values[key] = m.group(1).strip()
    if not values:
        return frontmatter
    reply = client.complete(
        system_prompt="You localize frontmatter fields for a Korean football supporters' site. Reply with JSON only.",
        user_prompt=_format_prompt((PROMPTS / "korean_fields.txt").read_text(encoding="utf-8"),
                                   style=(PROMPTS / "korean_style.txt").read_text(encoding="utf-8"),
                                   fields_json=json.dumps(values, ensure_ascii=False, indent=1)),
    )
    try:
        localized = json.loads(re.search(r"\{.*\}", reply, re.S).group(0))
    except (AttributeError, json.JSONDecodeError):
        print("[ko] frontmatter fields: model reply was not JSON; keeping English display fields")
        return frontmatter
    out = frontmatter
    for key, raw in values.items():
        new = localized.get(key)
        if not isinstance(new, str) or not new.strip():
            continue
        new = new.strip()
        if raw.startswith("{") and not new.startswith("{"):
            continue
        if raw.startswith("{"):
            try:
                json.loads(new)
            except json.JSONDecodeError:
                continue
        elif len(new) >= 2 and new.startswith('"') and new.endswith('"'):
            try:
                new = json.dumps(json.loads(new), ensure_ascii=False)
            except json.JSONDecodeError:
                new = json.dumps(new[1:-1], ensure_ascii=False)
        else:
            new = json.dumps(new, ensure_ascii=False)
        out = re.sub(rf"^{key}:\s*.+$", lambda _m: f"{key}: {new}", out, count=1, flags=re.M)
    return out


def lint_summary(path_label: str, markdown: str, glossary: dict) -> tuple[list[dict], str]:
    findings = ko_lint.lint_text(Path(path_label), markdown, glossary)
    serious = [f for f in findings if f["severity"] in ("error", "warn")]
    text = "\n".join(f"- L{f['line']} [{f['severity']}] {f['rule']}: {f['message']} :: {f['context']}" for f in serious[:60])
    return serious, text


def translate_one(source: Path, target: Path, kind: ContentKind, client, glossary: dict, force: bool) -> str:
    english = source.read_text(encoding="utf-8")
    if target.exists() and not force:
        # Korean files are desk-edited by hand, and the weekly run rewrites the latest
        # English digest even when nothing but the wording changes. Keep the Korean
        # file while its facts still match the English; re-translate only when they
        # no longer do (or with --force).
        hard = ko_parity.compare(english, target.read_text(encoding="utf-8"))["hard"]
        if not hard:
            return "skipped"
        print(f"[ko] {kind.name}: English facts changed for {source.name} ({'; '.join(hard[:3])}); re-translating")
    frontmatter, body = split_frontmatter(english)
    style = (PROMPTS / "korean_style.txt").read_text(encoding="utf-8")
    headings = (PROMPTS / f"{kind.headings_prompt}.txt").read_text(encoding="utf-8")
    quotes = korean_source_quotes(frontmatter_date(frontmatter), kind.quote_window)
    glossary_text = json.dumps({k: glossary[k] for k in ("players", "staff", "opponents", "clubs_short", "clubs_full", "places", "mascots")},
                               ensure_ascii=False)

    draft = client.complete(
        system_prompt="You are a senior Korean football writer who rewrites English K League 2 coverage into native Korean sports prose.",
        user_prompt=_format_prompt(headings, style=style, glossary=glossary_text,
                                   korean_quotes=quotes or "(none available: use indirect speech for Korean speakers)",
                                   article_body=body.strip()),
    ).strip()

    korean_fm = translate_display_fields(frontmatter, client)
    editor_prompt = (PROMPTS / "korean_editor.txt").read_text(encoding="utf-8")
    final_body = draft
    for attempt in range(2):
        candidate = f"{korean_fm}\n{final_body}\n"
        serious, lint_text = lint_summary(str(target), candidate, glossary)
        parity = ko_parity.compare(english, candidate)
        problems = lint_text + ("\n" if lint_text else "") + "\n".join(f"- HARD {h}" for h in parity["hard"])
        final_body = client.complete(
            system_prompt="You are the Korean sports desk editor (데스크). Return only the corrected Korean markdown body.",
            user_prompt=_format_prompt(editor_prompt, style=style, english_body=body.strip(), korean_body=final_body,
                                       problems=problems or "(the checker found nothing; edit for naturalness and accuracy)"),
        ).strip()
        final = f"{korean_fm}\n{final_body}\n"
        if not ko_parity.compare(english, final)["hard"]:
            break

    final = f"{korean_fm}\n{final_body}\n"
    parity = ko_parity.compare(english, final)
    if parity["hard"]:
        print(f"[ko] {kind.name} NOT written ({source.name}): " + "; ".join(parity["hard"]))
        return "failed"
    serious, _ = lint_summary(str(target), final, glossary)
    target.write_text(final, encoding="utf-8")
    if serious:
        print(f"[ko] {kind.name} written with {len(serious)} lint warning(s) to review: {target.name}")
    return "translated"


def kind_dirs(config: dict, kind: ContentKind) -> tuple[Path, Path]:
    base = Path(config["vault"]["base_path"])
    target = base.joinpath(*kind.target_subpath)
    target.mkdir(parents=True, exist_ok=True)
    return base.joinpath(*kind.source_subpath), target


def select_sources(source_dir: Path, kind: ContentKind, args: argparse.Namespace) -> list[Path]:
    sources = sorted(source_dir.glob(kind.file_glob))
    if args.all:
        return sources
    if args.round is not None:
        return [p for p in sources if (m := kind.round_regex.search(p.name)) and int(m.group(1)) == args.round]
    return [max(sources, key=lambda p: p.stat().st_mtime)] if sources else []


def main() -> int:
    parser = argparse.ArgumentParser(description="Write Korean companions of Seoul E-Land English vault content.")
    parser.add_argument("--kind", choices=["digests", "previews", "all"], default="all")
    parser.add_argument("--round", type=int, default=None)
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    config = load_config(SCRIPT_DIR / "config.yaml")
    model_config = config["models"].get("korean_digest", config["models"].get("portuguese_digest", config["models"]["translation"]))
    client = build_client_from_config(model_config)
    glossary = json.loads((PROMPTS / "korean_glossary.json").read_text(encoding="utf-8"))

    kinds = list(CONTENT_KINDS.values()) if args.kind == "all" else [CONTENT_KINDS[args.kind]]
    failed = 0
    for kind in kinds:
        source_dir, target_dir = kind_dirs(config, kind)
        if not source_dir.exists():
            print(f"[ko] {kind.name}: source dir missing ({source_dir}); skipped")
            continue
        for source in select_sources(source_dir, kind, args):
            status = translate_one(source, target_dir / source.name, kind, client, glossary, args.force)
            failed += status == "failed"
            print(f"[ko] {kind.name} {status}: {source.name}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
