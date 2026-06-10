"""
Create Portuguese companion versions of finished English vault content.

Handles BOTH content kinds in a single run:
  - digests   : Round-by-round match recaps (Digests/ -> Digests-PT/)
  - previews  : Pre-match scouting previews (Pre-Match Previews/ -> Pre-Match Previews-PT/)

The weekly scheduled task runs this after the English digest is regenerated and
copy-swept, so the site can expose ready-made /pt article toggles for both
match recaps and upcoming-fixture previews.

Usage:
    python scripts/translate_digest_pt.py                        # latest of each kind
    python scripts/translate_digest_pt.py --round 12             # round 12 (both kinds if present)
    python scripts/translate_digest_pt.py --all                  # every English source for both kinds
    python scripts/translate_digest_pt.py --kind previews        # only previews
    python scripts/translate_digest_pt.py --kind digests --all   # only digests, all rounds
    python scripts/translate_digest_pt.py --force                # overwrite existing PT
"""

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

load_dotenv(SCRIPT_DIR / ".env", override=True)

from modules.llm_client import build_client_from_config
from seoul_eland_digest import load_config, load_prompt, _format_prompt


FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)


def split_frontmatter(markdown: str) -> tuple[str, str]:
    match = FRONTMATTER_RE.match(markdown)
    if not match:
        return "", markdown
    return match.group(0).rstrip() + "\n", markdown[match.end():]


# --- Content kind registry --------------------------------------------------
#
# Each kind defines:
#   * source/target dirs relative to the vault base
#   * filename glob (English)
#   * round-extraction regex
#   * prompt file in prompts/
# Falls back to the digest prompt if a kind-specific prompt does not exist.

@dataclass
class ContentKind:
    name: str                       # human label ("digest" / "preview")
    source_subpath: tuple[str, ...] # path under vault base
    target_subpath: tuple[str, ...]
    file_glob: str                  # English filename glob
    round_regex: re.Pattern         # extracts round number from filename
    prompt_name: str                # prompts/{name}.txt
    fallback_prompt: str = "portuguese_digest"


CONTENT_KINDS: dict[str, ContentKind] = {
    "digests": ContentKind(
        name="digest",
        source_subpath=("Digests",),
        target_subpath=("Digests-PT",),
        file_glob="*_Seoul_E-Land_Digest.md",
        round_regex=re.compile(r"-R(\d+)_Seoul_E-Land_Digest\.md$", re.IGNORECASE),
        prompt_name="portuguese_digest",
    ),
    "previews": ContentKind(
        name="preview",
        source_subpath=("Scouting Report", "K League 2 2026", "Pre-Match Previews"),
        target_subpath=("Scouting Report", "K League 2 2026", "Pre-Match Previews-PT"),
        file_glob="*_Preview.md",
        round_regex=re.compile(r"-R(\d+)_.+_Preview\.md$", re.IGNORECASE),
        prompt_name="portuguese_preview",
    ),
}


def kind_dirs(config: dict, kind: ContentKind) -> tuple[Path, Path]:
    base = Path(config["vault"]["base_path"])
    source = base.joinpath(*kind.source_subpath)
    target = base.joinpath(*kind.target_subpath)
    target.mkdir(parents=True, exist_ok=True)
    return source, target


def round_from_name(path: Path, kind: ContentKind) -> int | None:
    match = kind.round_regex.search(path.name)
    return int(match.group(1)) if match else None


def select_sources(source_dir: Path, kind: ContentKind, args: argparse.Namespace) -> list[Path]:
    sources = sorted(source_dir.glob(kind.file_glob))
    if args.all:
        return sources
    if args.round is not None:
        selected = [path for path in sources if round_from_name(path, kind) == args.round]
        return selected  # may be empty for kinds that don't have this round - tolerated
    if not sources:
        return []
    return [max(sources, key=lambda path: path.stat().st_mtime)]


def load_kind_prompt(kind: ContentKind) -> str:
    """Try the kind-specific prompt, fall back to digest prompt."""
    primary = SCRIPT_DIR / "prompts" / f"{kind.prompt_name}.txt"
    if primary.exists():
        return load_prompt(SCRIPT_DIR / "prompts", kind.prompt_name)
    return load_prompt(SCRIPT_DIR / "prompts", kind.fallback_prompt)


def translate_one(source: Path, target: Path, translator, prompt_template: str, force: bool) -> str:
    if target.exists() and not force and target.stat().st_mtime >= source.stat().st_mtime:
        return "skipped"

    english = source.read_text(encoding="utf-8")
    frontmatter, body = split_frontmatter(english)
    user_prompt = _format_prompt(prompt_template, article_body=body.strip())
    portuguese_body = translator.complete(
        system_prompt=(
            "You are a senior Portuguese-language football editor translating "
            "supporter-facing K League content with high factual precision."
        ),
        user_prompt=user_prompt,
    ).strip()

    target.write_text(f"{frontmatter}{portuguese_body}\n", encoding="utf-8")
    return "translated"


def process_kind(config: dict, kind: ContentKind, args: argparse.Namespace, translator) -> int:
    source_dir, target_dir = kind_dirs(config, kind)
    if not source_dir.exists():
        print(f"[pt] {kind.name}: source dir missing ({source_dir}); skipped")
        return 0

    sources = select_sources(source_dir, kind, args)
    if not sources:
        if args.round is not None:
            print(f"[pt] {kind.name}: no English {kind.name} for round {args.round}")
        else:
            print(f"[pt] {kind.name}: no English {kind.name}s found")
        return 0

    prompt_template = load_kind_prompt(kind)
    processed = 0
    for source in sources:
        target = target_dir / source.name
        status = translate_one(source, target, translator, prompt_template, args.force)
        print(f"[pt] {kind.name} {status}: {source.name} -> {target}")
        processed += 1
    return processed


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Translate Seoul E-Land English vault content to Portuguese.",
    )
    parser.add_argument(
        "--kind",
        choices=["digests", "previews", "all"],
        default="all",
        help="Which content kind to translate (default: all).",
    )
    parser.add_argument("--round", type=int, default=None, help="Translate a specific round number across selected kinds.")
    parser.add_argument("--all", action="store_true", help="Translate every English source for the selected kinds.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing Portuguese files.")
    args = parser.parse_args()

    config = load_config(SCRIPT_DIR / "config.yaml")
    model_config = config["models"].get("portuguese_digest", config["models"]["translation"])
    translator = build_client_from_config(model_config)

    if args.kind == "all":
        kinds = list(CONTENT_KINDS.values())
    else:
        kinds = [CONTENT_KINDS[args.kind]]

    total = 0
    for kind in kinds:
        total += process_kind(config, kind, args, translator)

    if total == 0:
        print("[pt] nothing to do")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
