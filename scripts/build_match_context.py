"""
Build internal match context JSON for future pre/post-match report generation.

The output combines:
  * data/fixtures.yaml
  * data/team_corpus.yaml
  * prior and future meetings with the same opponent

Usage:
    venv\\Scripts\\python.exe scripts\\build_match_context.py --round 11
    venv\\Scripts\\python.exe scripts\\build_match_context.py --round 11 --stdout
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

from modules.team_corpus import (  # noqa: E402
    build_match_context,
    dump_context_json,
    load_fixtures,
    load_team_corpus,
    validate_fixture_coverage,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build match context JSON from the internal team corpus.")
    parser.add_argument("--round", type=int, required=True, help="K League 2 round number.")
    parser.add_argument("--stdout", action="store_true", help="Print JSON instead of writing research_dump.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    corpus = load_team_corpus()
    fixtures = load_fixtures()
    missing, stale = validate_fixture_coverage(corpus, fixtures)
    if missing:
        raise RuntimeError(f"Missing team_corpus.yaml entries for fixture opponents: {', '.join(missing)}")
    if stale:
        print(f"WARN: corpus teams not in fixture list: {', '.join(stale)}", file=sys.stderr)

    context = build_match_context(args.round)
    output = dump_context_json(context)
    if args.stdout:
        print(output)
        return

    out_dir = SCRIPT_DIR / "research_dump"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"match_context_R{args.round:02d}.json"
    out_path.write_text(output + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
