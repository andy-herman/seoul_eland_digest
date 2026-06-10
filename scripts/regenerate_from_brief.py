"""
Regenerate all 10 round digests grounded in Recent_News_Research_Brief.md.

Bypasses the Naver scrape entirely. For each played round it:
  1. Pulls authoritative match facts from data/fixtures.yaml
  2. Pulls the round's section from the research brief as the analyst's
     primary input (replacing news_clusters)
  3. Adds the season-context sections (player spotlights, tactical themes,
     off-pitch news) as supplementary context
  4. Calls the analyst LLM with the existing analyst_voice prompt
  5. Writes via the existing obsidian_writer

Usage:
    python scripts/regenerate_from_brief.py            # all played rounds
    python scripts/regenerate_from_brief.py --round 5  # single round
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

load_dotenv(SCRIPT_DIR / ".env", override=True)

from modules.llm_client import build_client_from_config
from modules.obsidian_writer import (
    write_digest,
    update_player_index,
    update_master_index,
)
from seoul_eland_digest import (
    load_config,
    load_prompt,
    load_fixtures,
    get_round_fixture,
    compute_season_record,
    get_upcoming_fixtures,
    _format_prompt,
)


def split_brief_by_round(brief_text: str) -> tuple[dict, str]:
    """Return (per_round_sections, season_context).

    per_round_sections: {round_number -> markdown text for that round}
    season_context: everything outside round-by-round (Season Context,
    Player Spotlights, Tactical Themes, Off-Pitch News, Looking Ahead).
    """
    # Split on round headings: ### R1 ... or ### **R1** ... up to next ### or ##
    round_pattern = re.compile(
        r"^### \*?\*?R(?:ound )?(\d+).*?$",
        re.MULTILINE,
    )
    matches = list(round_pattern.finditer(brief_text))
    per_round = {}
    section_starts = []
    for m in matches:
        section_starts.append((int(m.group(1)), m.start()))

    # Find end of each round section (start of next round OR start of "## 3.")
    next_section_marker = re.search(r"^## 3\. ", brief_text, re.MULTILINE)
    next_section_start = (
        next_section_marker.start() if next_section_marker else len(brief_text)
    )

    for i, (rnum, start) in enumerate(section_starts):
        if i + 1 < len(section_starts):
            end = section_starts[i + 1][1]
        else:
            end = next_section_start
        per_round[rnum] = brief_text[start:end].strip()

    # Season context = everything from "## 3." to end (player spotlights, tactical, off-pitch, looking ahead)
    if next_section_marker:
        season_context = brief_text[next_section_marker.start():].strip()
    else:
        season_context = ""
    # Also include section 1 (Season Context)
    section_1_match = re.search(r"^## 1\. .*?(?=^## 2\.)", brief_text, re.MULTILINE | re.DOTALL)
    if section_1_match:
        season_context = section_1_match.group(0).strip() + "\n\n" + season_context

    return per_round, season_context


def regenerate_round(round_n: int, config, fixtures_data, brief_round_text,
                     season_context, analyst, analyst_prompt, logger):
    """Regenerate a single round digest using brief content as ground truth."""
    match_info = get_round_fixture(fixtures_data, round_n)
    season_record = compute_season_record(fixtures_data, through_round=round_n)
    upcoming = get_upcoming_fixtures(fixtures_data, after_round=round_n, n=3)

    iso_date = str(match_info["date"])
    match_date = datetime.fromisoformat(iso_date).replace(tzinfo=timezone.utc)
    window_start = (match_date - __import__("datetime").timedelta(days=4)).date().isoformat()
    window_end = (match_date + __import__("datetime").timedelta(days=4)).date().isoformat()

    # Build "news_clusters" from the brief's round section + season context.
    # The analyst prompt expects JSON-like clusters but it accepts free-form
    # markdown perfectly well; we'll inject the brief sections directly as a
    # single "cluster" with the match facts inline.
    clusters_payload = {
        "research_brief_round_section": brief_round_text,
        "season_wide_context": season_context,
        "note_to_analyst": (
            "The 'research_brief_round_section' contains the authoritative, "
            "fact-checked source content for this round. Goalscorers, minute "
            "markers, lineups, formations, sub minutes, manager quotes, red/yellow "
            "cards in the brief are confirmed from match-commentary transcripts and "
            "verified outlet reports. Narrate the round-digest's Match Report and "
            "Player Performances using these facts directly. Do NOT invent "
            "additional scorers, minutes, or events. The 'season_wide_context' "
            "supplies player-spotlight angles you can weave in."
        ),
    }

    user_prompt = _format_prompt(
        analyst_prompt,
        iso_date=iso_date,
        round_number=match_info["round"],
        opponent=match_info["opponent"],
        venue=match_info["venue"],
        result=match_info["result"],
        window_start=window_start,
        window_end=window_end,
        match_info=json.dumps(match_info, ensure_ascii=False, indent=2, default=str),
        season_record=json.dumps(season_record, ensure_ascii=False, indent=2, default=str),
        upcoming_fixtures=json.dumps(upcoming, ensure_ascii=False, indent=2, default=str),
        news_clusters=json.dumps(clusters_payload, ensure_ascii=False, indent=2, default=str),
        fan_sentiment="Not available this round.",
    )

    logger(f"[R{round_n}] Generating digest "
           f"({match_info['venue']} vs {match_info['opponent']}, "
           f"{match_info['result']})...")
    digest = analyst.complete(
        system_prompt=(
            "You are an experienced football analyst with playing background, "
            "writing critical, tactically-literate per-round digests. The "
            "research_brief_round_section in your input is fact-checked authority "
            "for this match. Use it. Do not invent."
        ),
        user_prompt=user_prompt,
    )

    # Write to vault
    digest_path = write_digest(digest, config["vault"], iso_date, round_n)
    written_players = update_player_index(
        digest, config["vault"], round_n, iso_date,
    )
    logger(f"[R{round_n}] Wrote digest, +{len(written_players)} new player notes")

    # Update master index
    digest_filename = digest_path.stem
    headline_match = digest.split("\n")
    headline = next(
        (line.strip("> *").strip() for line in headline_match
         if line.startswith(">")),
        "Round digest"
    )[:120]
    venue_label = "vs" if match_info["venue"] == "home" else "at"
    match_summary = f"{match_info['result']} {venue_label} {match_info['opponent']}"
    update_master_index(
        config["vault"], iso_date, round_n,
        digest_filename, headline, match_summary=match_summary,
    )

    return digest_path


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", type=int, default=None,
                        help="Single round to regenerate. Defaults to the most "
                             "recent played round.")
    parser.add_argument("--all", action="store_true",
                        help="Regenerate every round that has a brief section.")
    args = parser.parse_args()

    config = load_config(SCRIPT_DIR / "config.yaml")
    fixtures_data = load_fixtures(SCRIPT_DIR / "data" / "fixtures.yaml")
    prompts_dir = SCRIPT_DIR / "prompts"
    analyst_prompt = load_prompt(prompts_dir, "analyst_voice")

    brief_path = Path(config["vault"]["base_path"]) / "Recent_News_Research_Brief.md"
    brief_text = brief_path.read_text(encoding="utf-8")
    per_round, season_context = split_brief_by_round(brief_text)
    print(f"Brief sections found for rounds: {sorted(per_round.keys())}")

    analyst = build_client_from_config(config["models"]["analyst_voice"])

    if args.round:
        rounds_to_run = [args.round]
    elif args.all:
        rounds_to_run = sorted(per_round.keys())
    else:
        # Default: most recent played round
        played = [
            fx["round"] for fx in fixtures_data["fixtures"]
            if fx.get("result", "TBD") != "TBD"
        ]
        if not played:
            print("No played rounds in fixtures.yaml")
            return
        rounds_to_run = [max(played)]
        print(f"Defaulting to most recent played round: R{rounds_to_run[0]}")

    def log(msg):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"{ts} {msg}")

    for r in rounds_to_run:
        if r not in per_round:
            log(f"[R{r}] No brief section found, skipping")
            continue
        try:
            regenerate_round(
                r, config, fixtures_data,
                per_round[r], season_context,
                analyst, analyst_prompt, log,
            )
        except Exception as e:
            log(f"[R{r}] ERROR: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    main()
