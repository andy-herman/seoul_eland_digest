"""
Save a YouTube match-commentary transcript for a round and update user_supplied.json.

The /eland-new-match skill calls this. Given a round number and the path to
a text file containing the transcript, it:
  1. Saves the transcript at research_dump/r{N}_youtube_transcript.txt
  2. Updates research_dump/user_supplied.json so the brief picks it up
  3. Prints a one-line summary

It does NOT re-compile the brief or regenerate the digest. Those are separate
steps (compile_brief.py and regenerate_from_brief.py) so the skill can sequence
them with progress messages.

Usage:
    python scripts/add_match_transcript.py --round 11 --file <path-to-transcript.txt>
"""

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
DUMP = SCRIPT_DIR / "research_dump"


def add_transcript(round_n: int, transcript_path: Path):
    if not transcript_path.exists():
        raise FileNotFoundError(f"transcript file not found: {transcript_path}")
    body = transcript_path.read_text(encoding="utf-8")

    # Save canonical copy
    DUMP.mkdir(parents=True, exist_ok=True)
    canonical = DUMP / f"r{round_n}_youtube_transcript.txt"
    canonical.write_text(body, encoding="utf-8")

    # Update user_supplied.json (replace any existing entry for this round's transcript)
    us_path = DUMP / "user_supplied.json"
    us = json.loads(us_path.read_text(encoding="utf-8")) if us_path.exists() else []
    sentinel = f"youtube_r{round_n}_transcript"
    us = [e for e in us if e.get("url") != sentinel]
    us.append({
        "round": round_n,
        "url": sentinel,
        "source": "user-supplied",
        "title": f"YouTube transcript: R{round_n} match commentary",
        "body": body,
    })
    us_path.write_text(json.dumps(us, ensure_ascii=False, indent=2), encoding="utf-8")
    return canonical, len(body), len(us)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", dest="round_n", type=int, required=True,
                        help="Round number this transcript covers")
    parser.add_argument("--file", dest="path", type=str, required=True,
                        help="Path to a text file containing the transcript")
    args = parser.parse_args()

    src = Path(args.path)
    if not src.exists():
        print(f"ERROR: transcript file not found: {src}", file=sys.stderr)
        sys.exit(1)
    body = src.read_text(encoding="utf-8")
    if len(body) < 500:
        print(f"WARNING: transcript looks short ({len(body)} chars). "
              "Continuing anyway.", file=sys.stderr)

    canonical, char_count, entry_count = add_transcript(args.round_n, src)
    print(f"Saved R{args.round_n} transcript: "
          f"{char_count:,} chars -> {canonical.relative_to(SCRIPT_DIR)}")
    print(f"user_supplied.json now has {entry_count} entries")


if __name__ == "__main__":
    main()
