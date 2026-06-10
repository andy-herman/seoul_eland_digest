r"""Build a pre-match preview draft from private scouting inputs.

The output is written to the Obsidian scouting tree as supporter-facing draft
markdown. Raw scouting/source material stays private.

Usage:
    venv\Scripts\python.exe scripts\build_prematch_preview.py
    venv\Scripts\python.exe scripts\build_prematch_preview.py --round 11
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from modules.team_corpus import build_match_context, load_fixtures

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

SNAPSHOT_PATH = PROJECT_ROOT / "research_dump" / "scouting" / "kleague_official_2026_snapshot.json"
NEWS_ARCHIVE_PATH = PROJECT_ROOT / "research_dump" / "scouting" / "k2_club_news.json"
VAULT_ROOT = Path("C:/Andy Herman/Luna Master/Sports/Seoul_E-Land")
SCOUTING_ROOT = VAULT_ROOT / "Scouting Report" / "K League 2 2026"
PREVIEW_DIR = SCOUTING_ROOT / "Pre-Match Previews"

TEAM_FOLDER_NAMES = {
    "seoul-eland": "Seoul E-Land FC",
    "ansan-greeners": "Ansan Greeners",
    "busan-ipark": "Busan IPark",
    "cheonan": "Cheonan",
    "chungnam-asan": "Chungnam Asan",
    "chungbuk-cheongju": "Chungbuk Cheongju",
    "daegu": "Daegu FC",
    "gimhae-fc": "Gimhae FC",
    "gimpo-citizen": "Gimpo Citizen",
    "gyeongnam": "Gyeongnam FC",
    "hwaseong-fc": "Hwaseong FC",
    "jeonnam-dragons": "Jeonnam Dragons",
    "paju-frontier": "Paju Frontier",
    "seongnam-fc": "Seongnam FC",
    "suwon-bluewings": "Suwon Bluewings",
    "suwon-fc": "Suwon FC",
    "yongin": "Yongin FC",
}

PLAYER_NAME_OVERRIDES = {
    "은고이": "Ngoy",
    "김종민": "Kim Jong-min",
    "나임": "Naim",
    "김혜성": "Kim Hye-sung",
    "김주성": "Kim Ju-sung",
    "데니손": "Denisson",
    "손준호": "Son Jun-ho",
    "한교원": "Han Kyo-won",
    # Yongin FC
    "가브리엘": "Gabriel",
    "석현준": "Seok Hyun-jun",
    "이승준": "Lee Seung-jun",
    "김민우": "Kim Min-woo",
    # Seongnam FC
    "윤민호": "Yoon Min-ho",
    "안젤로티": "Angelotti",
    "이준상": "Lee Jun-sang",
    "황석기": "Hwang Seok-gi",
    "유주안": "You Ju-an",
    "빌레로": "Villero",
    "박수빈": "Park Soo-bin",
    # Chungbuk Cheongju
    "가르시아": "Garcia",
    "이종언": "Lee Jong-eon",
    "허승찬": "Heo Seung-chan",
    "김선민": "Kim Sun-min",
    "이라클리": "Irakli",
    # Gimhae FC
    "이승재": "Lee Seung-jae",
    "베카": "Beka",
    "이래준": "Lee Rae-jun",
    "여재율": "Yeo Jae-yul",
    "김경수": "Kim Kyung-soo",
}


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object at {path}")
    return data


def next_unplayed_round() -> int:
    fixtures = load_fixtures()
    for fixture in fixtures["fixtures"]:
        if fixture.get("result") == "TBD":
            return int(fixture["round"])
    raise ValueError("No unplayed fixtures found in data/fixtures.yaml")


def slug(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")


def record_line(record: dict[str, Any] | None) -> str:
    if not record:
        return "record unavailable"
    rank = record["rank"]
    suffix = "th" if 10 <= rank % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(rank % 10, "th")
    return (
        f"{rank}{suffix}, {record['played']} played, {record['points']} points, "
        f"{record['wins']}-{record['draws']}-{record['losses']}, "
        f"{record['goals_for']}-{record['goals_against']} ({record['goal_difference']:+})"
    )


def official_team(snapshot: dict[str, Any], team_id: str | None) -> dict[str, Any] | None:
    if not team_id:
        return None
    return snapshot.get("teams", {}).get(team_id)


def leaders_text(team_snapshot: dict[str, Any] | None, limit: int = 5) -> list[str]:
    if not team_snapshot:
        return []
    leaders = team_snapshot.get("club_players", {}).get("attacking_leaders", [])[:limit]
    return [
        f"{display_player_name(str(player.get('name')))} - {player.get('goals') or 0}G/{player.get('assists') or 0}A in {player.get('games') or 0} apps"
        for player in leaders
        if player.get("name")
    ]


def news_for_team(news_archive: dict[str, Any], team_id: str, limit: int = 5) -> list[dict[str, Any]]:
    articles = news_archive.get("teams", {}).get(team_id, {}).get("articles", [])
    return articles[:limit] if isinstance(articles, list) else []


def display_date(article: dict[str, Any]) -> str:
    for key in ("date", "first_seen_at_utc", "last_seen_at_utc"):
        value = str(article.get(key, "") or "")
        if value:
            return value[:10]
    return "unknown"


def read_raw_research(team_id: str) -> str:
    folder = TEAM_FOLDER_NAMES.get(team_id)
    if not folder:
        return ""
    path = SCOUTING_ROOT / "Teams" / folder / f"{folder} - Raw Research.md"
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8")
    wanted = []
    keywords = [
        "Manager",
        "coach",
        "감독",
        "tactical",
        "Tactical",
        "Style",
        "Set-piece",
        "set-piece",
        "Seoul E-Land",
        "Matchup",
        "counter",
        "press",
        "수비",
        "역습",
    ]
    for line in text.splitlines():
        if any(keyword in line for keyword in keywords):
            stripped = line.strip()
            if stripped and not stripped.startswith("|---") and not stripped.startswith("###"):
                wanted.append(stripped)
        if len(wanted) >= 18:
            break
    return "\n".join(f"- {line.lstrip('- ')}" for line in wanted[:14])


def fixture_title(fixture: dict[str, Any], opponent: dict[str, Any]) -> str:
    venue = "at" if fixture["venue"] == "away" else "vs"
    return f"Seoul E-Land {venue} {opponent['canonical_name']}"


def meeting_results(meetings: list[dict[str, Any]]) -> str:
    values = [f"R{item['round']} {item.get('result', 'TBD')}" for item in meetings]
    return ", ".join(values) or "None yet"


def future_meetings(meetings: list[dict[str, Any]]) -> str:
    values = [f"R{item['round']} {item.get('date')}" for item in meetings]
    return ", ".join(values) or "None listed"


def clean_markup(text: str) -> str:
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text or "")
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\[[^\]]+\]\(([^)]+)\)", r"\1", text)
    return re.sub(r"\s+", " ", text).strip(" -")


def display_player_name(name: str) -> str:
    return PLAYER_NAME_OVERRIDES.get(name, name)


def prose_fragment(text: str | None, fallback: str) -> str:
    fragment = clean_markup(text or fallback).rstrip(".;: ")
    return fragment or fallback.rstrip(".;: ")


def prose_sentence(text: str | None, fallback: str) -> str:
    fragment = prose_fragment(text, fallback)
    return f"{fragment}."


def lower_initial(text: str) -> str:
    if not text:
        return text
    return text[0].lower() + text[1:]


def public_context_text(text: str) -> str:
    return text.replace("Available club research describes", "The early scouting read is")


def venue_label(value: str) -> str:
    return {"home": "Home", "away": "Away", "neutral": "Neutral"}.get(value, value.title())


def player_leaders_paragraph(leaders: list[str], opponent_name: str) -> str:
    if not leaders:
        return (
            f"The local official player snapshot does not have a reliable production leaderboard for "
            f"{opponent_name} yet, so this preview leans more heavily on team shape and matchup context."
        )

    lead = leaders[0]
    supporting = ", ".join(leaders[1:4])
    if supporting:
        return (
            f"The official attacking leaderboard puts {lead} at the top of the opponent watch list, "
            f"with {supporting} as additional production around the box."
        )
    return f"The official attacking leaderboard puts {lead} at the top of the opponent watch list."


def news_context_paragraphs(articles: list[dict[str, Any]], opponent_name: str) -> list[str]:
    if not articles:
        return [
            (
                f"The latest Naver/Daum sweep did not return a fresh, high-confidence {opponent_name} "
                "story that changes the tactical read. That keeps the focus on the official table, the "
                "current squad profile, and the coaching context already in the scouting file."
            )
        ]

    titles = [clean_markup(str(article.get("title", ""))) for article in articles[:3] if article.get("title")]
    latest_date = display_date(articles[0])
    schedule_terms = ("경기장", "일정", "변경", "킥오프", "라운드")
    schedule_heavy = any(any(term in title for term in schedule_terms) for title in titles)

    if schedule_heavy:
        return [
            (
                f"Recent Korean coverage around {opponent_name} has been more logistical than tactical. "
                f"Local coverage on {latest_date} flagged schedule and venue adjustments around the club rather "
                "than a clear lineup or tactical leak."
            ),
            (
                "That does not rewrite the R11 matchup, but it does frame Asan as a club working through "
                "a busy early-May stretch while also adapting to a coaching change. Seoul should expect "
                "an opponent trying to make the game simpler, more direct, and more emotional at home."
            ),
        ]

    return [
        (
            f"The latest Korean coverage gives {opponent_name} a current-news backdrop rather than a "
            f"clear lineup leak. Local coverage on {latest_date} did not change the tactical read enough "
            "to override the table, squad, and coaching context."
        ),
        (
            "For Seoul, the useful read is to treat the news as context, not the game plan itself: the "
            "match will still be decided by whether Seoul control transition moments, set pieces, and "
            "the first 20 minutes."
        ),
    ]


def scouting_report_paragraphs(opponent: dict[str, Any], profile: dict[str, Any], raw_notes: str) -> list[str]:
    opponent_name = opponent["canonical_name"]
    manager = profile.get("manager") or "the current staff"
    style = public_context_text(
        prose_sentence(profile.get("style_of_play"), "The current profile still needs matchday verification")
    )
    set_pieces = prose_sentence(profile.get("set_pieces"), "Set pieces remain a standard danger area to monitor")
    key_players = ", ".join(display_player_name(str(name)) for name in profile.get("key_players") or [])

    if manager.lower() in style.lower():
        opening = f"The scouting report starts with the bench. {style}"
    else:
        opening = (
            f"The scouting report starts with the bench. {opponent_name} are being shaped by {manager}, "
            f"with a current working profile built around {lower_initial(prose_fragment(profile.get('style_of_play'), 'a setup that still needs matchday verification'))}."
        )

    paragraphs = [
        opening,
        (
            f"The practical danger for Seoul is not sustained possession dominance from {opponent_name}; "
            f"it is the moment after Seoul lose the ball. If {opponent_name} can defend in a compact block, win the "
            "second action, and release runners quickly, the match can become awkward even if Seoul have "
            "more of the ball."
        ),
        f"Set pieces also belong near the top of the preview board. {set_pieces}",
    ]

    if key_players:
        paragraphs.append(f"The names to keep in the match notes are {key_players}.")
    if "visa" in raw_notes.lower() or "dugout" in raw_notes.lower():
        paragraphs.append(
            f"The coaching-transition caveat is that the new ideas may be visible before the matchday "
            f"operation is fully settled. Seoul should prepare for the new defensive/counterattacking "
            f"principles without assuming {opponent_name} will already look like a finished version of that team."
        )
    return paragraphs


def percent(value: Any) -> str:
    return f"{float(value) * 100:.0f}%"


def _opponent_win_value(probabilities: dict[str, Any], opp_id: str = "") -> float:
    """Find the opponent-win probability irrespective of legacy key names.

    Prefers the generic 'opponent_win' key, then '<opp_id>_win', then any '*_win'
    key that is not 'seoul_eland_win'.
    """
    if not probabilities:
        return 0.0
    if "opponent_win" in probabilities:
        return float(probabilities["opponent_win"])
    candidate = f"{opp_id.replace('-', '_')}_win" if opp_id else ""
    if candidate and candidate in probabilities:
        return float(probabilities[candidate])
    for k, v in probabilities.items():
        if k.endswith("_win") and k != "seoul_eland_win":
            return float(v)
    return 0.0


def _opponent_xg_value(expected_goals: dict[str, Any], opp_id: str = "") -> float | None:
    """Find the opponent's expected-goals figure with the same fallback strategy."""
    if not expected_goals:
        return None
    if "opponent" in expected_goals:
        return float(expected_goals["opponent"])
    candidate = opp_id.replace("-", "_") if opp_id else ""
    if candidate and candidate in expected_goals:
        return float(expected_goals[candidate])
    for k, v in expected_goals.items():
        if k != "seoul_eland":
            return float(v)
    return None


def forecast_glance(model: dict[str, Any], opp_id: str = "", opp_short: str = "Opp") -> str:
    probabilities = model.get("probabilities", {}) if isinstance(model, dict) else {}
    if not probabilities:
        return ""
    return (
        f"Seoul {percent(probabilities.get('seoul_eland_win', 0))}, "
        f"draw {percent(probabilities.get('draw', 0))}, "
        f"{opp_short} {percent(_opponent_win_value(probabilities, opp_id))}"
    )


def frontmatter_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def frontmatter_string(value: Any) -> str:
    return json.dumps(str(value), ensure_ascii=False)


def forecast_frontmatter(model: dict[str, Any], opponent: dict[str, Any]) -> list[str]:
    probabilities = model.get("probabilities", {}) if isinstance(model, dict) else {}
    if not isinstance(probabilities, dict):
        return []

    opponent_win_key = next(
        (
            key
            for key in probabilities
            if key.endswith("_win") and key not in {"seoul_eland_win"}
        ),
        None,
    )
    probability_map = {
        "seoul_eland_win": probabilities.get("seoul_eland_win"),
        "draw": probabilities.get("draw"),
        "opponent_win": probabilities.get(opponent_win_key) if opponent_win_key else None,
    }
    probability_map = {key: value for key, value in probability_map.items() if value is not None}
    if len(probability_map) < 2:
        return []

    opponent_label = opponent.get("short_name") or opponent.get("canonical_name") or "Opponent"
    labels = {
        "seoul_eland_win": "Seoul win",
        "draw": "Draw",
        "opponent_win": f"{opponent_label} win",
    }
    return [
        f"forecast_probabilities: {frontmatter_json(probability_map)}",
        f"forecast_labels: {frontmatter_json(labels)}",
        f"forecast_note: {frontmatter_string('Model read before kickoff; rounded to whole percentages.')}",
    ]


def predicted_lineup_for_round(
    subject_profile: dict[str, Any],
    round_number: int,
    opponent_id: str,
) -> dict[str, Any] | None:
    lineups = subject_profile.get("predicted_lineups") or []
    if not isinstance(lineups, list):
        return None

    for lineup in lineups:
        if not isinstance(lineup, dict):
            continue
        try:
            lineup_round = int(lineup.get("round"))
        except (TypeError, ValueError):
            continue
        lineup_opponent = str(lineup.get("opponent_id") or "")
        if lineup_round == round_number and (not lineup_opponent or lineup_opponent == opponent_id):
            return lineup
    return None


def lineup_frontmatter(lineup: dict[str, Any] | None) -> list[str]:
    if not lineup:
        return []

    starters = lineup.get("starters") or []
    if not isinstance(starters, list):
        return []

    clean_starters = []
    for player in starters:
        if not isinstance(player, dict):
            continue
        name = str(player.get("name") or "").strip()
        role = str(player.get("role") or "").strip()
        line = str(player.get("line") or "").strip().lower()
        if name and role and line:
            clean_starters.append({"name": name, "role": role, "line": line})
    if not clean_starters:
        return []

    return [
        f"predicted_lineup_label: {frontmatter_string(lineup.get('label') or 'Predicted Seoul XI')}",
        f"predicted_lineup_team: {frontmatter_string(lineup.get('team_name') or 'Seoul E-Land')}",
        f"predicted_formation: {frontmatter_string(lineup.get('formation') or 'Predicted shape')}",
        f"predicted_lineup_note: {frontmatter_string(lineup.get('note') or 'Predicted, not confirmed. The official team sheet may differ at kickoff.')}",
        f"predicted_lineup: {frontmatter_json(clean_starters)}",
    ]


def lineup_basis_lines(lineup: dict[str, Any] | None, opp_short: str = "the opponent") -> list[str]:
    if not lineup:
        return []

    basis = [str(item).strip() for item in lineup.get("basis") or [] if str(item).strip()]
    selection_watch = [
        item
        for item in lineup.get("selection_watch") or []
        if isinstance(item, dict) and item.get("player") and item.get("note")
    ]
    if not basis and not selection_watch:
        return []

    lines = [
        "",
        "## Predicted XI Basis and Fitness Watch",
        "",
        (
            "The lineup graphic is a best read, not a leaked team sheet. It starts from Seoul's most "
            f"recent match usage, then adjusts for the fitness and role signals available before the {opp_short} match."
        ),
    ]

    if basis:
        lines.extend(["", "### Why this shape", ""])
        lines.extend(f"- {item}" for item in basis)

    if selection_watch:
        lines.extend(["", "### Selection watch", ""])
        for item in selection_watch:
            lines.append(f"- {item['player']}: {item['note']}")

    return lines


def prior_meetings_lines(profile: dict[str, Any], opponent_name: str, opp_short: str = "") -> list[str]:
    meetings = profile.get("recent_seoul_meetings") or []
    first_meeting_note = profile.get("first_meeting_note")  # optional manual override
    short = opp_short or opponent_name

    # First-ever meeting case: render a "Series Context" section instead of skipping
    if not meetings:
        if not first_meeting_note:
            return []
        return [
            "",
            "## Series Context (First-Ever Meeting)",
            "",
            first_meeting_note,
        ]

    # Intro/outro are corpus-overridable. The generic fallbacks below do NOT
    # assume a specific number of meetings or a home/away pattern, so they are
    # safe for any opponent (single playoff meeting, full home-and-away series).
    default_intro = (
        f"The 2025 record against {opponent_name} is useful context. The pattern matters "
        "more than the raw result: Seoul have been most convincing when they create better "
        "chances without needing a possession monopoly, and least convincing when a match "
        "stays narrow and low-event."
    )
    default_outro = (
        f"The lesson for this weekend is simple: if Seoul score first or make {short} chase "
        "the game, it can open up in Seoul's favor. If Seoul let the match live as a 50-50 "
        "duel of clearances, second balls, and stoppages, last year's tighter meetings are "
        "the more relevant warning."
    )
    intro = profile.get("prior_meetings_intro") or default_intro
    outro = profile.get("prior_meetings_outro") or default_outro

    lines = ["", "## What Last Season Told Us", "", intro, ""]

    for meeting in meetings:
        venue = venue_label(str(meeting.get("venue_for_seoul", "")))
        result = meeting.get("result", "Result unavailable")
        takeaway = meeting.get("takeaway", "")
        detail = f"- {meeting.get('date', 'Date unknown')}: {result} ({venue})."
        if meeting.get("stats"):
            detail += f" The notable stat line was {meeting['stats']}."
        if takeaway:
            detail += f" {takeaway}"
        lines.append(detail)

    lines.extend(["", outro])
    return lines


def strategy_lines(profile: dict[str, Any], opp_short: str = "the opponent", opp_name: str = "") -> list[str]:
    notes = profile.get("strategy_notes") or []
    if not notes:
        return []

    intro = profile.get("strategy_intro") or (
        "The tactical plan should be active rather than simply cautious. The opponent's profile typically "
        "points toward collective defending and counters, so Seoul need to make them defend longer "
        "sequences while still protecting the first outlet after turnovers."
    )

    lines = [
        "",
        "## Strategy That Can Work",
        "",
        intro,
        "",
    ]
    lines.extend(f"- {note}" for note in notes)
    return lines


def forecast_lines(profile: dict[str, Any], opp_id: str = "", opp_short: str = "the opponent") -> list[str]:
    model = profile.get("forecast_model") or {}
    probabilities = model.get("probabilities", {}) if isinstance(model, dict) else {}
    expected_goals = model.get("expected_goals", {}) if isinstance(model, dict) else {}
    if not probabilities:
        return []

    opp_xg = _opponent_xg_value(expected_goals, opp_id)
    seoul_xg = expected_goals.get("seoul_eland")
    expected_text = ""
    if opp_xg is not None and seoul_xg is not None:
        expected_text = f" The expected-goals center is roughly {opp_short} {float(opp_xg):.2f}, Seoul {float(seoul_xg):.2f}."

    return [
        "",
        "## Forecast vs the Market",
        "",
        (
            f"The model read is narrow but Seoul-leaning: {percent(probabilities['seoul_eland_win'])} "
            f"Seoul win, {percent(probabilities['draw'])} draw, and "
            f"{percent(_opponent_win_value(probabilities, opp_id))} {opp_short} win.{expected_text}"
        ),
        (
            f"That is close to the public market snapshot: {model.get('market_snapshot', 'Seoul are a narrow favorite.')}"
        ),
        (
            f"The score band fits the tactical read too. {model.get('correct_score_band', 'A one-goal Seoul result and a draw are the central outcomes.')}"
        ),
        (
            f"{model.get('market_read', 'The forecast should be treated as context, not certainty.')} "
            "This is a probability check against the spread, not a wagering recommendation."
        ),
    ]


def build_preview(round_number: int) -> tuple[Path, str]:
    context = build_match_context(round_number)
    snapshot = load_json(SNAPSHOT_PATH)
    news_archive = load_json(NEWS_ARCHIVE_PATH)
    fixture = context["fixture"]
    subject = context["subject_club"]
    opponent = context["opponent"]
    subject_snapshot = official_team(snapshot, subject.get("kleague_team_id"))
    opponent_snapshot = official_team(snapshot, opponent.get("kleague_team_id"))
    subject_record = subject_snapshot.get("record") if subject_snapshot else None
    opponent_record = opponent_snapshot.get("record") if opponent_snapshot else None
    opponent_profile = opponent.get("current_profile", {}) or {}
    subject_profile = subject.get("current_profile", {}) or {}
    forecast_model = opponent_profile.get("forecast_model", {}) or {}
    predicted_lineup = predicted_lineup_for_round(subject_profile, round_number, opponent["id"])
    opponent_news = news_for_team(news_archive, opponent["id"])
    raw_notes = read_raw_research(opponent["id"])
    title = fixture_title(fixture, opponent)
    output = PREVIEW_DIR / f"2026-R{round_number:02d}_{slug(opponent['canonical_name'])}_Preview.md"
    leaders = leaders_text(opponent_snapshot)
    news_paragraphs = news_context_paragraphs(opponent_news, opponent["canonical_name"])
    scouting_paragraphs = scouting_report_paragraphs(opponent, opponent_profile, raw_notes)
    subject_style = lower_initial(
        prose_fragment(
            subject_profile.get("style_of_play"),
            "flexible shapes, width, set pieces, and in-match adjustment",
        )
    )
    subject_set_pieces = lower_initial(
        prose_fragment(
            subject_profile.get("set_pieces"),
            "attacking set pieces and second balls can become a repeatable pressure source",
        )
    )

    lines = [
        "---",
        'type: "pre-match-preview"',
        'scope: "match-preview"',
        'status: "draft"',
        'season: "2026"',
        'league: "K League 2"',
        f'round: "{round_number}"',
        f'date: "{fixture["date"]}"',
        f'opponent: "{opponent["canonical_name"]}"',
        f'venue_for_seoul: "{fixture["venue"]}"',
        *forecast_frontmatter(forecast_model, opponent),
        *lineup_frontmatter(predicted_lineup),
        "tags: [seoul-eland, pre-match-preview, scouting]",
        "---",
        "",
        f"# {title} - Pre-Match Preview",
        "",
        "## At a Glance",
        "",
        "| Item | Detail |",
        "| --- | --- |",
        f"| Fixture | Round {round_number}, {fixture['date']} |",
        f"| Venue for Seoul | {venue_label(fixture['venue'])} |",
        f"| Seoul table context | {record_line(subject_record)} |",
        f"| Opponent table context | {record_line(opponent_record)} |",
        f"| Prior 2026 meetings | {meeting_results(context.get('previous_meetings', []))} |",
        f"| Future 2026 meetings | {future_meetings(context.get('future_meetings', []))} |",
        *([f"| Forecast read | {forecast_glance(forecast_model, opponent['id'], opponent['short_name'])} |"] if forecast_glance(forecast_model, opponent['id'], opponent['short_name']) else []),
        "",
        "## Why This Match Matters",
        "",
        (
            f"Seoul E-Land enter this fixture from a promotion-playoff position, while "
            f"{opponent['canonical_name']} are currently {record_line(opponent_record)}. "
            "That gap makes this a match Seoul should treat as controllable, but it also creates a clear demand: "
            "play like the more organized side, control the tempo, and turn the table "
            f"advantage into a professional {'home' if fixture['venue'] == 'home' else 'away'} performance."
        ),
    ]
    lines.extend(lineup_basis_lines(predicted_lineup, opponent['short_name']))
    lines.extend(["", "## Opponent Scouting Report", ""])
    lines.extend(scouting_paragraphs)
    lines.extend(["", player_leaders_paragraph(leaders, opponent["canonical_name"])])

    lines.extend(
        [
            "",
            "## Recent Opponent News Context",
            "",
            *news_paragraphs,
        ]
    )
    lines.extend(prior_meetings_lines(opponent_profile, opponent["canonical_name"], opponent["short_name"]))
    opp_short = opponent["canonical_name"]
    # Top opponent goal threat for set-piece framing (falls back gracefully)
    top_threat_name = ""
    if leaders:
        first_leader = leaders[0]
        top_threat_name = first_leader.split(" - ")[0].strip()
    set_piece_threat_clause = (
        f"{top_threat_name}'s aerial threat" if top_threat_name
        else f"{opp_short}'s aerial threat in the box"
    )
    lines.extend(
        [
            "",
            "## How Seoul E-Land Match Up",
            "",
            (
                f"Seoul's current identity - {subject_style} - gives them enough tools for this matchup. "
                f"That matters because {opp_short}'s best path is to shrink the middle, invite Seoul into predictable wide service, "
                "and then counter into the space Seoul leave behind."
            ),
            (
                f"The set-piece edge matters because {subject_set_pieces}. "
                f"If Seoul move the ball side to side before delivering, they can make {opp_short} defend facing their own goal rather "
                "than simply heading away hopeful crosses."
            ),
        ]
    )
    lines.extend(strategy_lines(opponent_profile, opponent['short_name'], opponent['canonical_name']))
    lines.extend(
        [
            "",
            "## Keys to a Seoul E-Land Win",
            "",
            "### 1. Protect the first pass after turnovers",
            "",
            (
                f"This is the clearest tactical key. Seoul can live with sterile {opp_short} possession, but they cannot let "
                f"their own attacks become {opp_short} counters. The center backs and holding midfielders need clean rest-defense "
                "spacing whenever the wingbacks or wide forwards push high."
            ),
            "",
            "### 2. Create better wide entries, not just more crosses",
            "",
            (
                f"{opp_short}'s transition block is easier to manage if Seoul force it to move first. Switches of play, overlap timing, "
                f"and cutbacks should be more valuable than early floated balls. The goal is to make {opp_short} defend the second and "
                "third pass, not just the first delivery."
            ),
            "",
            "### 3. Treat set pieces like a swing factor",
            "",
            (
                f"{set_piece_threat_clause} makes defensive restarts important, but Seoul should also see dead balls as a "
                f"route to control. A clean set-piece game would reduce {opp_short}'s emotional lift and give Seoul a direct way to "
                "turn pressure into chances."
            ),
            "",
            "## Things to Watch",
            "",
            (
                "The first 20 minutes should tell us whether Seoul are prepared for a compact, transition-first opponent. "
                f"If {opp_short} are winning second balls and turning clearances into counters, the match becomes much harder than "
                "the table suggests."
            ),
            "",
            (
                "Also watch the substitution window. Seoul have already shown value in game-state adaptation this season, "
                f"and this is the kind of {'home' if fixture['venue'] == 'home' else 'away'} fixture where the first adjustment can decide whether control turns into points."
            ),
        ]
    )
    lines.extend(forecast_lines(opponent_profile, opponent['id'], opponent['short_name']))
    lines.extend(
        [
            "",
            "## Bottom Line",
            "",
            (
                f"The clean Seoul version of this match is patient, balanced, and ruthless on restarts. "
                f"{opponent['canonical_name']} have enough transition and aerial tools to make it uncomfortable, "
                "but Seoul should have the better route to control if they protect against counters and keep their wide "
                "attacks deliberate."
            ),
        ]
    )
    return output, "\n".join(lines) + "\n"


def update_preview_index(output_path: Path) -> None:
    index = SCOUTING_ROOT / "Pre-Match Preview Index.md"
    rel_title = output_path.stem
    if index.exists():
        text = index.read_text(encoding="utf-8")
    else:
        text = (
            "---\n"
            'type: "pre-match-preview-index"\n'
            'scope: "private-pipeline"\n'
            'season: "2026"\n'
            'league: "K League 2"\n'
            "tags: [seoul-eland, pre-match-preview, private]\n"
            "---\n\n"
            "# Pre-Match Preview Index\n\n"
        )
    link = f"- [[{rel_title}]]"
    if link not in text:
        text = text.rstrip() + "\n" + link + "\n"
    index.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a private Seoul E-Land pre-match preview draft.")
    parser.add_argument("--round", type=int, default=None, help="Fixture round. Defaults to next unplayed round.")
    args = parser.parse_args()

    round_number = args.round or next_unplayed_round()
    output_path, content = build_preview(round_number)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(content, encoding="utf-8")
    update_preview_index(output_path)
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
