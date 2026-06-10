r"""Fetch an official 2026 K League 2 records snapshot for private scouting.

This writes machine-readable JSON plus a short Markdown summary under
research_dump/scouting/. The data is private pipeline input and is not used by
the public Astro site.

Usage:
    venv\Scripts\python.exe scripts\fetch_kleague_official_snapshot.py
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "research_dump" / "scouting"
DEFAULT_JSON_PATH = OUTPUT_DIR / "kleague_official_2026_snapshot.json"
DEFAULT_MD_PATH = OUTPUT_DIR / "kleague_official_2026_snapshot.md"

BASE_URL = "https://www.kleague.com"
LEAGUE_ID = 2
SEASON = 2026
REQUEST_TIMEOUT = 30

TEAM_IDS = {
    "K02": {"corpus_id": "suwon-bluewings", "official_name": "수원", "english_name": "Suwon Samsung Bluewings"},
    "K06": {"corpus_id": "busan-ipark", "official_name": "부산", "english_name": "Busan IPark"},
    "K07": {"corpus_id": "jeonnam-dragons", "official_name": "전남", "english_name": "Jeonnam Dragons"},
    "K08": {"corpus_id": "seongnam-fc", "official_name": "성남", "english_name": "Seongnam FC"},
    "K17": {"corpus_id": "daegu", "official_name": "대구", "english_name": "Daegu FC"},
    "K20": {"corpus_id": "gyeongnam", "official_name": "경남", "english_name": "Gyeongnam FC"},
    "K29": {"corpus_id": "suwon-fc", "official_name": "수원FC", "english_name": "Suwon FC"},
    "K31": {"corpus_id": "seoul-eland", "official_name": "서울E", "english_name": "Seoul E-Land FC"},
    "K32": {"corpus_id": "ansan-greeners", "official_name": "안산", "english_name": "Ansan Greeners"},
    "K34": {"corpus_id": "chungnam-asan", "official_name": "충남아산", "english_name": "Chungnam Asan"},
    "K36": {"corpus_id": "gimpo-citizen", "official_name": "김포", "english_name": "Gimpo FC"},
    "K37": {"corpus_id": "chungbuk-cheongju", "official_name": "충북청주", "english_name": "Chungbuk Cheongju"},
    "K38": {"corpus_id": "cheonan", "official_name": "천안", "english_name": "Cheonan City FC"},
    "K39": {"corpus_id": "hwaseong-fc", "official_name": "화성", "english_name": "Hwaseong FC"},
    "K40": {"corpus_id": "paju-frontier", "official_name": "파주", "english_name": "Paju Frontier"},
    "K41": {"corpus_id": "gimhae-fc", "official_name": "김해", "english_name": "Gimhae FC"},
    "K42": {"corpus_id": "yongin", "official_name": "용인", "english_name": "Yongin FC"},
}

PLAYER_RANK_TYPES = {
    "GOAL": "goals",
    "ASSIST": "assists",
    "AP": "attacking_points",
    "ST": "shots",
    "GAMECNT": "appearances",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Content-Type": "application/json; charset=utf-8",
    "Origin": BASE_URL,
    "Referer": f"{BASE_URL}/record/player.do?leagueId={LEAGUE_ID}",
    "X-Requested-With": "XMLHttpRequest",
}


def post_json(client: httpx.Client, path: str, body: dict[str, Any]) -> dict[str, Any]:
    response = client.post(f"{BASE_URL}{path}", json=body)
    response.raise_for_status()
    payload = response.json()
    if payload.get("resultCode") != "200":
        raise RuntimeError(f"{path} returned resultCode={payload.get('resultCode')}: {payload.get('resultMsg')}")
    return payload


def fetch_team_rank(client: httpx.Client) -> list[dict[str, Any]]:
    response = client.post(
        f"{BASE_URL}/record/teamRank.do",
        params={
            "year": str(SEASON),
            "leagueId": str(LEAGUE_ID),
            "stadium": "all",
            "recordType": "rank",
        },
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("resultCode") != "200":
        raise RuntimeError(
            f"/record/teamRank.do returned resultCode={payload.get('resultCode')}: {payload.get('resultMsg')}"
        )
    rows = payload.get("data", {}).get("teamRank", [])
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("Official teamRank response did not include rows")
    return rows


def fetch_player_rank(client: httpx.Client, record_type: str) -> list[dict[str, Any]]:
    payload = post_json(
        client,
        "/record/rankSort.do",
        {
            "year": str(SEASON),
            "leagueId": str(LEAGUE_ID),
            "recordType": record_type,
        },
    )
    rows = payload.get("data", {}).get("list", [])
    if not isinstance(rows, list):
        raise RuntimeError(f"Official rankSort response for {record_type} did not include a list")
    return rows


def fetch_club_player_records(client: httpx.Client, team_id: str) -> list[dict[str, Any]]:
    payload = post_json(
        client,
        "/record/selectPersonalRecordByClub.do",
        {
            "year": str(SEASON),
            "leagueId": str(LEAGUE_ID),
            "teamId": team_id,
        },
    )
    rows = payload.get("data", {}).get("list", [])
    if not isinstance(rows, list):
        raise RuntimeError(f"Official club player response for {team_id} did not include a list")
    return rows


def compact_team_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "team_id": row["teamId"],
        "official_name": row["teamName"],
        "rank": row["rank"],
        "points": row["gainPoint"],
        "played": row["gameCount"],
        "wins": row["winCnt"],
        "draws": row["tieCnt"],
        "losses": row["lossCnt"],
        "goals_for": row["gainGoal"],
        "goals_against": row["lossGoal"],
        "goal_difference": row["gapCnt"],
        "recent_form_ko": [row.get(f"game0{i}") for i in range(1, 6) if row.get(f"game0{i}")],
        "homepage": row.get("homepage"),
    }


def compact_player(row: dict[str, Any], rank_type: str | None = None) -> dict[str, Any]:
    player = {
        "name": str(row.get("name", "")).strip(),
        "team_id": row.get("teamId"),
        "team_name": str(row.get("teamName", "")).strip() or None,
        "player_id": row.get("playerId"),
        "rank": row.get("rank"),
        "games": row.get("gameQty"),
        "starts_or_sub_apps": row.get("changeQty"),
        "goals": row.get("goalQty"),
        "assists": row.get("assistQty"),
        "attacking_points": row.get("apQty"),
        "shots": row.get("stQty"),
        "corners": row.get("ckQty"),
        "fouls": row.get("foQty"),
        "yellow_cards": row.get("warnQty"),
        "red_cards": row.get("exitQty"),
        "clean_sheets": row.get("clQty"),
        "back_number": row.get("backNo"),
        "per_game": row.get("qtyPerGame"),
    }
    if rank_type:
        player["ranking_type"] = PLAYER_RANK_TYPES[rank_type]
    return player


def summarize_club_players(players: list[dict[str, Any]]) -> dict[str, Any]:
    compacted = [compact_player(player) for player in players if str(player.get("name", "")).strip()]
    leaders = sorted(
        compacted,
        key=lambda player: (
            player.get("attacking_points") or 0,
            player.get("goals") or 0,
            player.get("assists") or 0,
            player.get("shots") or 0,
            player.get("games") or 0,
        ),
        reverse=True,
    )
    appearances = sorted(
        compacted,
        key=lambda player: (
            player.get("games") or 0,
            player.get("attacking_points") or 0,
            player.get("goals") or 0,
        ),
        reverse=True,
    )
    return {
        "player_count": len(compacted),
        "attacking_leaders": leaders[:8],
        "appearance_leaders": appearances[:8],
    }


def build_snapshot() -> dict[str, Any]:
    with httpx.Client(headers=HEADERS, timeout=REQUEST_TIMEOUT, follow_redirects=True) as client:
        team_rows = fetch_team_rank(client)
        player_rankings = {
            PLAYER_RANK_TYPES[rank_type]: [compact_player(row, rank_type) for row in fetch_player_rank(client, rank_type)[:50]]
            for rank_type in PLAYER_RANK_TYPES
        }
        players_by_team = {
            team_id: summarize_club_players(fetch_club_player_records(client, team_id))
            for team_id in sorted(TEAM_IDS)
        }

    official_team_rows = {row["team_id"]: row for row in [compact_team_row(row) for row in team_rows]}
    missing_team_ids = sorted(set(TEAM_IDS) - set(official_team_rows))
    if missing_team_ids:
        raise RuntimeError(f"Official teamRank is missing expected teams: {', '.join(missing_team_ids)}")

    league_rank_by_team = defaultdict(dict)
    for ranking_name, rows in player_rankings.items():
        for row in rows:
            team_id = row.get("team_id")
            if team_id in TEAM_IDS:
                league_rank_by_team[team_id].setdefault(ranking_name, []).append(row)

    teams = {}
    for team_id, identity in TEAM_IDS.items():
        teams[team_id] = {
            **identity,
            "record": official_team_rows[team_id],
            "club_players": players_by_team[team_id],
            "league_ranked_players": dict(league_rank_by_team.get(team_id, {})),
            "official_urls": {
                "team_rank": f"{BASE_URL}/record/team.do?leagueId={LEAGUE_ID}",
                "player_rank": f"{BASE_URL}/record/player.do?leagueId={LEAGUE_ID}",
                "club_page": f"{BASE_URL}/club/club.do?teamId={team_id}",
            },
        }

    return {
        "season": SEASON,
        "league": "K League 2",
        "fetched_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": {
            "site": BASE_URL,
            "team_rank_endpoint": "/record/teamRank.do",
            "player_rank_endpoint": "/record/rankSort.do",
            "club_player_endpoint": "/record/selectPersonalRecordByClub.do",
        },
        "teams": teams,
        "league_player_rankings": player_rankings,
    }


def format_record(record: dict[str, Any]) -> str:
    return (
        f"{record['rank']}. {record['played']} GP, {record['points']} pts, "
        f"{record['wins']}-{record['draws']}-{record['losses']}, "
        f"{record['goals_for']}-{record['goals_against']} ({record['goal_difference']:+})"
    )


def build_markdown_summary(snapshot: dict[str, Any]) -> str:
    lines = [
        "---",
        "type: scouting-source-snapshot",
        "scope: private-pipeline",
        f"season: {snapshot['season']}",
        "league: K League 2",
        "---",
        "",
        "# K League 2 Official Snapshot",
        "",
        f"Fetched: `{snapshot['fetched_at_utc']}`",
        "",
        "Source: `https://www.kleague.com/record/team.do?leagueId=2` and `https://www.kleague.com/record/player.do?leagueId=2`.",
        "",
        "| Team | K League ID | Record | Attacking leaders |",
        "| --- | --- | --- | --- |",
    ]
    teams = sorted(snapshot["teams"].values(), key=lambda team: team["record"]["rank"])
    for team in teams:
        leaders = team["club_players"]["attacking_leaders"][:3]
        leader_text = ", ".join(
            f"{player['name']} ({player.get('goals') or 0}G/{player.get('assists') or 0}A)"
            for player in leaders
        )
        lines.append(
            f"| {team['english_name']} | {team['record']['team_id']} | {format_record(team['record'])} | {leader_text} |"
        )

    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- This file is private scouting input only; do not publish it under `site/`.",
            "- Korean form markers are retained in the JSON as official values from K League.",
            "- Tactical conclusions still need match video, transcripts, and trusted reporting before use in supporter-facing previews.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch official K League 2 records for private scouting.")
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_PATH)
    parser.add_argument("--md-out", type=Path, default=DEFAULT_MD_PATH)
    args = parser.parse_args()

    snapshot = build_snapshot()
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    args.md_out.write_text(build_markdown_summary(snapshot), encoding="utf-8")

    print(f"Wrote {args.json_out}")
    print(f"Wrote {args.md_out}")
    print(f"Teams: {len(snapshot['teams'])}")


if __name__ == "__main__":
    main()
