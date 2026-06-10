"""
Deduplicate player notes in the Obsidian vault.

The obsidian_writer's player-extraction heuristic creates a fresh file every
time it sees a new wikilink string. That produces drift across the season:
  * `Ahn Joo-wan.md` and `Ahn Joo-wan (안주완).md` both exist because the
    analyst sometimes writes the bare name and sometimes appends hangul
  * `Mokdong Stadium.md`, `Leoul Park (Mokdong Stadium).md`, and
    `Leoul Park (Mokdong Stadium)_Mokdong Stadium.md` (the writer's filename
    sanitization turns `/` into `_`) all coexist.

This script:
  1. Identifies duplicate-pair candidates (same canonical name with/without
     hangul or stadium-suffix variants)
  2. Merges the duplicate's `## Mentions` backlinks into the canonical file
  3. Deletes the duplicate

The canonical filename is the one without parentheses. For the stadium
trio, `Mokdong Stadium.md` is canonical.

Usage:
    python scripts/dedupe_player_notes.py [--dry-run]
"""

import argparse
import re
import sys
from pathlib import Path

import yaml

# Windows: console default cp1252 chokes on Korean filenames in print().
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

SCRIPT_DIR = Path(__file__).parent.parent.resolve()


def canonical_name(filename: str) -> str:
    """Return the canonical name for a player file.

    Rules:
      "X (Y).md"          -> "X"
      "X (Y)_Z.md"        -> "X"  (writer sanitization artifact)
      "Leoul Park*"       -> "Mokdong Stadium"
      "X.md"              -> "X"
    """
    name = filename[:-3] if filename.endswith(".md") else filename

    # Stadium aliasing
    if name.startswith("Leoul Park"):
        return "Mokdong Stadium"

    # Strip trailing "_Z" sanitized-slash artifact
    name = re.sub(r"_[^_]+$", "", name) if "_" in name and "(" in name else name

    # Strip trailing " (hangul)"
    name = re.sub(r"\s*\([^)]+\)\s*$", "", name).strip()
    return name


def parse_mentions(content: str) -> list[str]:
    """Pull the bullet lines under '## Mentions' (or trailing - lines)."""
    out = []
    in_mentions = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("## Mentions"):
            in_mentions = True
            continue
        if in_mentions:
            if stripped.startswith("##"):
                in_mentions = False
                continue
            if stripped.startswith("- "):
                out.append(stripped)
    return out


def merge_mentions(canonical_path: Path, duplicate_path: Path):
    """Merge mentions from duplicate into canonical, dedup'd."""
    canon = canonical_path.read_text(encoding="utf-8") if canonical_path.exists() else ""
    dup = duplicate_path.read_text(encoding="utf-8")

    canon_mentions = parse_mentions(canon)
    dup_mentions = parse_mentions(dup)
    seen = set(canon_mentions)
    additions = [m for m in dup_mentions if m not in seen]
    if not additions and canonical_path.exists():
        return False  # nothing new to add

    # If canonical doesn't exist, copy duplicate's full content as base
    if not canonical_path.exists():
        canonical_path.write_text(dup, encoding="utf-8")
        return True

    # Otherwise, append the new mentions under the existing ## Mentions section
    if "## Mentions" in canon:
        new_content = canon.rstrip() + "\n" + "\n".join(additions) + "\n"
    else:
        new_content = canon.rstrip() + "\n\n## Mentions\n" + "\n".join(additions) + "\n"
    canonical_path.write_text(new_content, encoding="utf-8")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Report what would change without modifying files.")
    args = parser.parse_args()

    config = yaml.safe_load((SCRIPT_DIR / "config.yaml").read_text(encoding="utf-8"))
    players_dir = (
        Path(config["vault"]["base_path"]) / config["vault"]["players_subfolder"]
    )
    if not players_dir.exists():
        print(f"Players directory not found: {players_dir}")
        sys.exit(0)

    # Group files by canonical name
    groups: dict[str, list[Path]] = {}
    for p in sorted(players_dir.glob("*.md")):
        canon = canonical_name(p.name)
        groups.setdefault(canon, []).append(p)

    actions = []
    for canon, paths in groups.items():
        if len(paths) <= 1:
            continue
        # Pick the canonical-named file as the keeper; fall back to shortest
        canonical_path = next(
            (p for p in paths if p.stem == canon),
            sorted(paths, key=lambda x: len(x.name))[0],
        )
        for p in paths:
            if p == canonical_path:
                continue
            actions.append((canonical_path, p))

    if not actions:
        print("No duplicates found. Vault is clean.")
        return

    for canonical, duplicate in actions:
        if args.dry_run:
            print(f"[DRY] merge mentions from {duplicate.name} -> "
                  f"{canonical.name}, then delete {duplicate.name}")
            continue
        changed = merge_mentions(canonical, duplicate)
        duplicate.unlink()
        flag = "merged+deleted" if changed else "deleted (no new mentions)"
        print(f"  {duplicate.name} -> {canonical.name} ({flag})")

    print(f"\n{'Would process' if args.dry_run else 'Processed'} "
          f"{len(actions)} duplicate(s).")


if __name__ == "__main__":
    main()
