"""
Regenerate a single round digest grounded DIRECTLY in the user-supplied
match-commentary transcript(s), bypassing Recent_News_Research_Brief.md.

Why this exists: compile_brief.py builds one ~400K-char season-wide prompt that
(a) rate-limits the Azure deployment (429) and (b) is hardcoded to emit only
R1-R10 sections. For a freshly-played round we already have the richest possible
ground truth, the YouTube highlights transcript (and, when present, the head
coach's post-match press conference). Feed those straight to the analyst.

It reuses regenerate_from_brief.regenerate_round so the output format, player
index, and master index updates are identical to the normal pipeline.

Usage:
    python scripts/regenerate_from_transcript.py --round 14
    python scripts/regenerate_from_transcript.py --round 13 \
        --sources research_dump/r13_transcript_raw.txt
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

import yaml
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

load_dotenv(SCRIPT_DIR / ".env", override=True)

from modules.llm_client import build_client_from_config
from seoul_eland_digest import (
    load_config,
    load_prompt,
    load_fixtures,
)
from scripts.regenerate_from_brief import regenerate_round


DUMP = SCRIPT_DIR / "research_dump"

# Default transcript / press-conference sources per round. Add entries as new
# rounds are played. The first existing file is treated as the primary
# match-commentary transcript; the rest are supplementary (press conferences).
DEFAULT_SOURCES = {
    13: ["r13_transcript_raw.txt"],
    14: ["r14_transcript_raw.txt", "r14_sportsg.txt"],
}


def build_round_text(round_n: int, source_files: list[Path]) -> str:
    blocks = [
        f"=== AUTHORITATIVE MATCH SOURCES FOR ROUND {round_n} ===",
        "These are user-supplied YouTube match-commentary transcripts and the "
        "head coach's official post-match press conference. They are the "
        "fact-checked ground truth for this match: scorers, minute markers, "
        "lineups, formations, substitutions, cards, and manager quotes are all "
        "confirmed here. Narrate from these directly and do not invent anything "
        "beyond them.",
        "",
    ]
    for f in source_files:
        label = f.name
        blocks.append(f"--- SOURCE: {label} ---")
        blocks.append(f.read_text(encoding="utf-8").strip())
        blocks.append("")
    return "\n".join(blocks)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", type=int, required=True)
    parser.add_argument(
        "--sources", nargs="*", default=None,
        help="Explicit source file paths (relative to repo root or absolute). "
             "Defaults to DEFAULT_SOURCES[round].",
    )
    args = parser.parse_args()

    if args.sources:
        source_files = [Path(s) if Path(s).is_absolute() else SCRIPT_DIR / s
                        for s in args.sources]
    else:
        names = DEFAULT_SOURCES.get(args.round)
        if not names:
            print(f"No DEFAULT_SOURCES entry for R{args.round}; pass --sources.")
            return
        source_files = [DUMP / n for n in names]

    source_files = [f for f in source_files if f.exists()]
    if not source_files:
        print("No source files found.")
        return

    config = load_config(SCRIPT_DIR / "config.yaml")
    fixtures_data = load_fixtures(SCRIPT_DIR / "data" / "fixtures.yaml")
    analyst_prompt = load_prompt(SCRIPT_DIR / "prompts", "analyst_voice")
    analyst = build_client_from_config(config["models"]["analyst_voice"])

    brief_round_text = build_round_text(args.round, source_files)

    # Light season context: the running narrative the analyst should be aware of
    # but which is not match-specific. Kept short so the transcript dominates.
    season_context = (
        "SEASON ARC NOTE (context only, do not narrate as this round's match): "
        "Seoul E-Land FC are pushing for promotion in 2026 K League 2 under "
        "manager Kim Do-gyun (김도균), playing a 3-4-3. Park Jae-yong (박재용) "
        "leads the team in scoring; Euller (에울레르) is the primary attacking "
        "creator; Min Sung-jun (민성준) is first-choice keeper; Kim Oh-kyu "
        "(김오규) is the club captain. R13 (W 3-1 vs Seongnam) and R14 (W 1-0 at "
        "Jeonnam) are a two-match winning run that lifted the club to 2nd, "
        "above Suwon. R15 (vs Chungbuk Cheongju) is the last match before the "
        "World Cup break."
    )

    # Round-specific steer for the analyst.
    extra = {
        14: (
            "EDITORIAL STEER FOR THIS ROUND: The user specifically wants the "
            "head coach Kim Do-gyun's post-match press-conference views woven "
            "into the digest. Devote clear space (in Match Report, Tactical and "
            "Strategic Watch, or My Honest Read) to his verdict: satisfaction "
            "with three precious points on a long, hot road trip; the heat (not "
            "just fatigue) sapping a team that presses hard in the first half; "
            "the deliberate plan to hold Euller back but being forced to use him "
            "at 0-0 because the attack stalls without him (Euller played carrying "
            "a slight knock); Alan Carius finally scoring; and the World-Cup-break "
            "plan to prepare for summer heat. Paraphrase aggressively and keep "
            "any direct quote to 14 words or fewer per the writing rules."
        ),
    }.get(args.round)
    if extra:
        season_context = extra + "\n\n" + season_context

    def log(msg):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"{ts} {msg}")

    log(f"[R{args.round}] Sources: {[f.name for f in source_files]}")
    regenerate_round(
        args.round, config, fixtures_data,
        brief_round_text, season_context,
        analyst, analyst_prompt, log,
    )
    log(f"[R{args.round}] Done.")


if __name__ == "__main__":
    main()
