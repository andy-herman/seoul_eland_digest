"""
Obsidian Writer - Formats and writes digest output to your vault.

Handles:
- Dated digest files
- Player index notes (created on first mention, updated thereafter)
- The master index file with backlinks to every digest
"""

import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict

logger = logging.getLogger(__name__)


def write_digest(content: str, vault_config: Dict, iso_date: str,
                 round_number: int) -> Path:
    """
    Write the round digest markdown to the vault.

    Filename format: 2026-R08_Seoul_E-Land_Digest.md
    """
    base = Path(vault_config["base_path"])
    digest_dir = base / vault_config["digests_subfolder"]
    digest_dir.mkdir(parents=True, exist_ok=True)

    year = iso_date[:4]
    filename = f"{year}-R{round_number:02d}_Seoul_E-Land_Digest.md"
    filepath = digest_dir / filename

    filepath.write_text(content, encoding="utf-8")
    logger.info(f"Wrote digest to: {filepath}")

    return filepath


def extract_wikilinks(content: str) -> List[str]:
    """Pull all [[wikilink]] targets from the digest content."""
    return re.findall(r"\[\[([^\]]+)\]\]", content)


def _load_exclusions(project_root: Path) -> Dict:
    """Load filtering rules from data/exclusions.yaml + opponent names from
    data/fixtures.yaml. Both are optional; missing files are tolerated.
    """
    import yaml as _yaml  # local import so module is importable without yaml at top
    exact = set()
    team_suffixes = set()
    venue_suffixes = set()

    excl_path = project_root / "data" / "exclusions.yaml"
    if excl_path.exists():
        cfg = _yaml.safe_load(excl_path.read_text(encoding="utf-8")) or {}
        exact.update(cfg.get("exact_names", []) or [])
        team_suffixes.update(cfg.get("team_suffixes", []) or [])
        venue_suffixes.update(cfg.get("venue_suffixes", []) or [])

    fx_path = project_root / "data" / "fixtures.yaml"
    if fx_path.exists():
        fx = _yaml.safe_load(fx_path.read_text(encoding="utf-8")) or {}
        for f in fx.get("fixtures", []):
            opp = f.get("opponent")
            if opp:
                exact.add(opp)

    return {
        "exact": exact,
        "team_suffixes": team_suffixes,
        "venue_suffixes": venue_suffixes,
    }


def _is_excluded(name: str, excl: Dict) -> bool:
    """Decide if a wikilink should be skipped (not turned into a player note)."""
    if name in excl["exact"]:
        return True
    # Suffix matches: split by spaces, last token must equal the suffix.
    last_token = name.split()[-1] if name else ""
    if last_token in excl["team_suffixes"]:
        return True
    if last_token in excl["venue_suffixes"]:
        return True
    return False


def update_player_index(digest_content: str, vault_config: Dict,
                        round_number: int, iso_date: str) -> List[Path]:
    """
    Create or update player notes for every [[Player Name]] referenced
    in the digest. This is what makes the Obsidian graph view useful.

    Filters:
      * Heuristic: must look like a person name (Title Case w/ space or hyphen,
        optionally followed by hangul in parens)
      * Exclusion list (data/exclusions.yaml + opponent names from
        data/fixtures.yaml): drops opposing personnel, team names, venue names
    """
    base = Path(vault_config["base_path"])
    players_dir = base / vault_config["players_subfolder"]
    players_dir.mkdir(parents=True, exist_ok=True)

    project_root = Path(__file__).parent.parent
    excl = _load_exclusions(project_root)

    wikilinks = extract_wikilinks(digest_content)

    player_patterns = [
        r"^[A-Z][a-z]+(\s|-)[A-Z][a-z]+",  # English player names
        r"^[A-Z][a-z]+\s\([\u3131-\uD79D]+\)",  # Name with Korean in parens
    ]

    likely_players = set()
    for link in wikilinks:
        # Strip any " (hangul)" suffix for exclusion matching
        bare = re.sub(r"\s*\([^)]+\)\s*$", "", link).strip()
        if _is_excluded(bare, excl):
            continue
        for pat in player_patterns:
            if re.match(pat, link):
                likely_players.add(link)
                break

    digest_filename = f"{iso_date[:4]}-R{round_number:02d}_Seoul_E-Land_Digest"
    written = []

    for player in likely_players:
        # Sanitize filename
        safe_name = re.sub(r"[<>:\"/\\|?*]", "_", player)
        player_file = players_dir / f"{safe_name}.md"

        if player_file.exists():
            # Append a backlink line
            existing = player_file.read_text(encoding="utf-8")
            backlink_line = f"- [[{digest_filename}]] - Round {round_number}, {iso_date}\n"
            if backlink_line.strip() not in existing:
                # Insert before any closing fence or just append
                if "## Mentions" in existing:
                    new = existing.rstrip() + "\n" + backlink_line
                else:
                    new = existing.rstrip() + "\n\n## Mentions\n" + backlink_line
                player_file.write_text(new, encoding="utf-8")
                logger.info(f"Updated player note: {player}")
        else:
            # Create new player note
            content = f"""---
type: player
team: Seoul E-Land FC
created: {iso_date}
tags: [player, k-league-2, seoul-e-land]
---

# {player}

*Player note for [[Seoul E-Land FC]]. Auto-generated and grown over the season.*

## Mentions

- [[{digest_filename}]] - Round {round_number}, {iso_date}
"""
            player_file.write_text(content, encoding="utf-8")
            logger.info(f"Created new player note: {player}")
            written.append(player_file)

    return written


def update_master_index(vault_config: Dict, iso_date: str, round_number: int,
                        digest_filename: str, headline: str,
                        match_summary: str = "") -> Path:
    """
    Maintain a master index file that links to every round digest in order.
    """
    base = Path(vault_config["base_path"])
    base.mkdir(parents=True, exist_ok=True)
    index_path = base / vault_config["index_filename"]

    summary_part = f" - {match_summary}" if match_summary else ""
    new_entry = (
        f"- **Round {round_number}** ({iso_date}){summary_part}: "
        f"[[{digest_filename}]] - {headline}\n"
    )

    if index_path.exists():
        existing = index_path.read_text(encoding="utf-8")
        if digest_filename in existing:
            return index_path  # already indexed
        if "## Round Digests" in existing:
            updated = existing.replace(
                "## Round Digests\n",
                f"## Round Digests\n{new_entry}",
                1
            )
        else:
            updated = existing.rstrip() + f"\n\n## Round Digests\n{new_entry}"
        index_path.write_text(updated, encoding="utf-8")
    else:
        content = f"""---
type: index
team: Seoul E-Land FC
season: 2026
tags: [index, seoul-e-land]
---

# Seoul E-Land FC | Master Index

The hub for all round digests, match reports, and player notes.

## Round Digests

{new_entry}
## Player Notes

See the [[Players]] folder.

## Match Reports

See the [[Matches]] folder.
"""
        index_path.write_text(content, encoding="utf-8")
        logger.info(f"Created master index: {index_path}")

    return index_path
