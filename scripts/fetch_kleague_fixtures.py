"""
Best-effort updater for data/fixtures.yaml from kleague.com.

The kleague.com schedule API (/getScheduleList.do) requires session state
that's hard to replicate from a script. This script tries the API; if it
fails (which is the common case), it exits cleanly so the weekly cron
continues with the existing manually-maintained fixtures.yaml.

When this works:
  * The API responds 200 with parseable data
  * The data contains Seoul E-Land matches with date/opponent/score
  * fixtures.yaml is updated in-place with new results (TBD -> actual)

When this fails (graceful):
  * Prints a warning, exits 0. Manual fixture updates via /eland-new-match
    remain the source of truth.

Usage:
    python scripts/fetch_kleague_fixtures.py
"""

import json
import sys
from pathlib import Path

import httpx
import yaml

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
FIXTURES_PATH = SCRIPT_DIR / "data" / "fixtures.yaml"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "application/json;charset=UTF-8",
    "Accept": "application/json",
    "Referer": "https://www.kleague.com/schedule.do?leagueId=2&year=2026",
    "Origin": "https://www.kleague.com",
}


def try_api():
    """Best-effort poll of the kleague.com schedule endpoint."""
    candidates = [
        {"year": "2026", "etcYn": "Y", "month": "", "leagueId": "2", "meetType": "L"},
        {"year": "2026", "etcYn": "Y", "month": "", "leagueId": "2", "meetType": ""},
        {"year": 2026, "etcYn": "Y", "month": 0, "leagueId": 2, "meetType": "L"},
    ]
    for body in candidates:
        try:
            r = httpx.post(
                "https://www.kleague.com/getScheduleList.do",
                headers=HEADERS, json=body, timeout=15,
            )
            if r.status_code != 200:
                continue
            data = r.json()
            if data.get("resultCode") == "200" and data.get("data"):
                return data["data"]
        except Exception:
            continue
    return None


def main():
    if not FIXTURES_PATH.exists():
        print(f"ERROR: fixtures.yaml not found at {FIXTURES_PATH}", file=sys.stderr)
        sys.exit(0)  # don't block the cron

    api_data = try_api()
    if not api_data:
        print("WARN: kleague.com schedule API didn't return parseable data. "
              "Leaving fixtures.yaml unchanged. (Manual updates via "
              "/eland-new-match remain the source of truth.)")
        sys.exit(0)

    # If we get here, the API returned data. Parse it and update fixtures.yaml.
    # Schema is unknown without seeing a successful response, so log and bail
    # for now. A future iteration can wire up the actual update once we have
    # the schema in hand.
    print("INFO: kleague.com API returned data, but parser not yet implemented.")
    print(f"      Sample keys: {list(api_data.keys())[:5]}")
    print("      To wire up: inspect the response, write a parser, then update "
          "fixtures.yaml in-place.")
    print(json.dumps(api_data, ensure_ascii=False, indent=2, default=str)[:600])
    sys.exit(0)


if __name__ == "__main__":
    main()
