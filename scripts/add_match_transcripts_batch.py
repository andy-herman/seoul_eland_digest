"""
Batch-ingest match-commentary transcripts into research_dump/user_supplied.json.

Expected filenames include a round marker, for example:
  * 2026-R01_suwon-bluewings.txt
  * R1 Seoul E-Land vs Suwon.txt
  * round_10_gimpo.md

Usage:
    venv\\Scripts\\python.exe scripts\\add_match_transcripts_batch.py --dir "C:\\path\\to\\transcripts"
    venv\\Scripts\\python.exe scripts\\add_match_transcripts_batch.py --dir "C:\\path\\to\\transcripts" --recursive
    venv\\Scripts\\python.exe scripts\\add_match_transcripts_batch.py --dir "C:\\path\\to\\transcripts" --dry-run
"""

import argparse
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

from scripts.add_match_transcript import add_transcript  # noqa: E402

ROUND_RE = re.compile(r"(?:^|[^a-z0-9])(?:r|round)[\s_-]?0?(\d{1,2})(?:[^a-z0-9]|$)", re.IGNORECASE)


def infer_round(path: Path) -> int | None:
    match = ROUND_RE.search(path.stem)
    return int(match.group(1)) if match else None


def iter_transcripts(folder: Path, pattern: str, recursive: bool):
    iterator = folder.rglob(pattern) if recursive else folder.glob(pattern)
    return sorted(path for path in iterator if path.is_file())


def main():
    parser = argparse.ArgumentParser(description="Batch-ingest match transcripts by round-marked filename.")
    parser.add_argument("--dir", dest="folder", required=True, help="Folder containing transcript files.")
    parser.add_argument("--glob", dest="pattern", default="*.txt", help="File glob to import. Default: *.txt")
    parser.add_argument("--recursive", action="store_true", help="Search transcript folder recursively.")
    parser.add_argument("--dry-run", action="store_true", help="Show inferred rounds without writing files.")
    args = parser.parse_args()

    folder = Path(args.folder)
    if not folder.exists() or not folder.is_dir():
        print(f"ERROR: transcript directory not found: {folder}", file=sys.stderr)
        sys.exit(1)

    files = iter_transcripts(folder, args.pattern, args.recursive)
    if not files:
        print(f"ERROR: no transcript files matched {args.pattern!r} in {folder}", file=sys.stderr)
        sys.exit(1)

    failures = []
    imported = 0
    for path in files:
        round_n = infer_round(path)
        if round_n is None:
            failures.append(f"{path}: could not infer round from filename")
            continue
        body_len = len(path.read_text(encoding="utf-8"))
        if body_len < 500:
            failures.append(f"{path}: transcript looks short ({body_len} chars)")
            continue
        if args.dry_run:
            print(f"R{round_n}: {path} ({body_len:,} chars)")
            continue
        canonical, char_count, entry_count = add_transcript(round_n, path)
        print(f"R{round_n}: {char_count:,} chars -> {canonical.relative_to(SCRIPT_DIR)}")
        imported += 1

    if args.dry_run:
        print(f"Dry run complete: {len(files) - len(failures)} ready, {len(failures)} issue(s).")
    else:
        print(f"Imported {imported} transcript(s).")
        if imported:
            print(f"user_supplied.json now has {entry_count} entries")

    if failures:
        print("\nIssues:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
