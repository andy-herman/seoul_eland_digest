"""
Re-compile Recent_News_Research_Brief.md from everything in research_dump/.

Sources picked up automatically:
  * research_dump/naver_eland_with_bodies.json     (general Naver scrape)
  * research_dump/naver_gaps_with_bodies.json      (date-windowed gap-round dig)
  * research_dump/user_supplied.json               (URLs + YouTube transcripts you provided)
  * research_dump/klu_*.txt                        (kleagueunited.com articles)

Drops 2025-season leak articles automatically. Em-dash + UK-spelling sweep is
left to scripts/sweep_us_english.py (run that after compile if you want it).

Usage:
    python scripts/compile_brief.py
"""

import json
import os
import re
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

load_dotenv(SCRIPT_DIR / ".env", override=True)

from modules.llm_client import LLMClient


DUMP = SCRIPT_DIR / "research_dump"

# Fragments in titles that strongly indicate a 2025-season article surfaced
# by an undated player-name query. Hard-rejected.
DROP_TITLE_FRAGS = [
    "PO 레이스 본격 시동",   # 2025 Hwaseong narrative
    "성남 무패 행진",          # 2025 Seongnam result
]


def is_2026(entry):
    url = entry.get("url", "") or ""
    body = entry.get("body", "") or ""
    if re.search(r"(20250|20251)\d{4}", url) or re.search(r"/2025/", url):
        return False
    if any(f in entry.get("title", "") for f in DROP_TITLE_FRAGS):
        return False
    if "2025년" in body and "2026" not in body:
        return False
    return True


def load_sources():
    sources = []

    # Original Naver scrape
    p = DUMP / "naver_eland_with_bodies.json"
    if p.exists():
        for e in json.loads(p.read_text(encoding="utf-8")):
            if is_2026(e) and len(e.get("body", "")) > 200:
                sources.append({
                    "lang": "ko", "source": e["source"], "title": e["title"],
                    "url": e["url"], "body": e["body"],
                    "round": e.get("round", "?"),
                })

    # Date-windowed gap-round Naver + per-round Naver files (e.g. r11_naver.json)
    seen_urls: set[str] = set()
    naver_files = []
    p = DUMP / "naver_gaps_with_bodies.json"
    if p.exists():
        naver_files.append(p)
    naver_files.extend(sorted(DUMP.glob("r*_naver*.json")))
    for p in naver_files:
        for e in json.loads(p.read_text(encoding="utf-8")):
            if len(e.get("body", "")) > 200 and e.get("url") not in seen_urls:
                seen_urls.add(e.get("url", ""))
                sources.append({
                    "lang": "ko", "source": e["source"], "title": e["title"],
                    "url": e["url"], "body": e["body"],
                    "round": e.get("round", "?"),
                })

    # User-supplied URLs and YouTube transcripts
    p = DUMP / "user_supplied.json"
    if p.exists():
        for e in json.loads(p.read_text(encoding="utf-8")):
            if len(e.get("body", "")) > 200:
                sources.append({
                    "lang": "ko", "source": e["source"], "title": e["title"],
                    "url": e["url"], "body": e["body"],
                    "round": e["round"],
                })

    # kleagueunited.com English articles
    for f in DUMP.glob("klu_*.txt"):
        txt = f.read_text(encoding="utf-8")
        sources.append({
            "lang": "en", "source": "kleagueunited.com",
            "title": txt.split("\n", 1)[0].lstrip("# "),
            "url": "", "body": txt, "round": "?",
        })

    return sources


def build_fixture_context():
    fixtures_yaml = SCRIPT_DIR / "data" / "fixtures.yaml"
    fx = yaml.safe_load(fixtures_yaml.read_text(encoding="utf-8"))
    lines = ["2026 K LEAGUE 2 - SEOUL E-LAND FIXTURE LIST (authoritative):"]
    for f in fx["fixtures"]:
        venue = "(H)" if f["venue"] == "home" else "(A)"
        opp = f["opponent"]
        date = str(f["date"])
        result = f.get("result", "TBD")
        lines.append(f"R{f['round']:<2} {date} {venue} {opp:<22} {result}")
    lines.append("")
    lines.append(
        "2025 references = historical context only. When sources conflict, "
        "trust user-supplied YouTube transcripts over Naver wires."
    )
    return "\n".join(lines)


def compile_brief(sources, fixture_context):
    deployment = os.environ["AZURE_OPENAI_DEPLOYMENT"]

    system_prompt = (
        "Senior football researcher compiling a 2026 K League 2 brief for "
        "Seoul E-Land FC. Sources tagged with round; user-supplied YouTube "
        "match-commentary transcripts are authoritative for in-match facts. "
        "Extract concrete facts only: scorers/minutes, lineups/formations, "
        "subs, cards, manager quotes. Cite [Source N]. Do NOT invent. "
        "American English spelling. NO em or en dashes (— –). "
        "Korean names with hangul on first mention. 2026 facts only."
    )

    user_prompt = f"""{fixture_context}

{len(sources)} sources tagged by round.

Sections:
1. Season Context (squad, manager, key transfers)
2. Round-by-Round Match Notes (R1-R10) - lead each with round/date/venue/result; include lineups (when given), all goalscorers with minute markers, key subs, cards, manager quotes. If transcripts give specific minutes/scorers, USE THEM.
3. Player Spotlights (players in 2+ sources)
4. Tactical Themes (formations, system shifts, recurring patterns)
5. Off-Pitch News (foundation, fan engagement, transfers - 2026 only)
6. Looking Ahead (next upcoming round)

Format: Markdown. Source-grounded. Note disagreements between sources when they exist.

=== SOURCES ===
"""
    for i, s in enumerate(sources):
        user_prompt += (
            f"\n--- SOURCE {i+1} [{s['lang']}] [Round {s['round']}] "
            f"[{s['source']}] {s['title']}\nURL: {s.get('url', '')}\n{s['body']}\n"
        )

    print(f"Sources: {len(sources)} | Prompt: {len(user_prompt):,} chars")
    print("Calling Azure OpenAI...")
    client = LLMClient(deployment=deployment, max_tokens=16000, timeout=400)
    return client.complete(system_prompt=system_prompt, user_prompt=user_prompt)


def main():
    sources = load_sources()
    fixture_context = build_fixture_context()
    brief = compile_brief(sources, fixture_context)

    config = yaml.safe_load((SCRIPT_DIR / "config.yaml").read_text(encoding="utf-8"))
    out = Path(config["vault"]["base_path"]) / "Recent_News_Research_Brief.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(brief, encoding="utf-8")
    print(f"Brief written: {out} ({len(brief):,} chars)")


if __name__ == "__main__":
    main()
