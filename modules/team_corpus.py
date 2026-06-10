"""Internal opponent corpus helpers for pre/post-match report generation."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORPUS_PATH = PROJECT_ROOT / "data" / "team_corpus.yaml"
DEFAULT_FIXTURES_PATH = PROJECT_ROOT / "data" / "fixtures.yaml"


def normalize_team_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def load_yaml(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected YAML mapping in {path}")
    return data


def load_team_corpus(path: Path = DEFAULT_CORPUS_PATH) -> dict[str, Any]:
    corpus = load_yaml(path)
    if not isinstance(corpus.get("teams"), list):
        raise ValueError(f"Expected 'teams' list in {path}")
    return corpus


def load_fixtures(path: Path = DEFAULT_FIXTURES_PATH) -> dict[str, Any]:
    fixtures = load_yaml(path)
    if not isinstance(fixtures.get("fixtures"), list):
        raise ValueError(f"Expected 'fixtures' list in {path}")
    return fixtures


def team_names(team: dict[str, Any]) -> list[str]:
    names = [team["canonical_name"], team["short_name"]]
    aliases = team.get("aliases", {})
    names.extend(aliases.get("en", []))
    names.extend(aliases.get("ko", []))
    return names


def team_lookup(corpus: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for team in corpus["teams"]:
        for name in team_names(team):
            lookup[normalize_team_name(name)] = team
    return lookup


def get_team(corpus: dict[str, Any], team_name: str) -> dict[str, Any]:
    team = team_lookup(corpus).get(normalize_team_name(team_name))
    if team is None:
        raise KeyError(f"No team corpus entry for {team_name!r}")
    return team


def fixtures_for_team(fixtures_data: dict[str, Any], team_name: str) -> list[dict[str, Any]]:
    normalized = normalize_team_name(team_name)
    return [
        fixture
        for fixture in fixtures_data["fixtures"]
        if normalize_team_name(str(fixture.get("opponent", ""))) == normalized
    ]


def validate_fixture_coverage(
    corpus: dict[str, Any],
    fixtures_data: dict[str, Any],
) -> tuple[list[str], list[str]]:
    lookup = team_lookup(corpus)
    opponents = {
        str(fixture["opponent"])
        for fixture in fixtures_data["fixtures"]
        if fixture.get("opponent")
    }
    missing = sorted(
        opponent
        for opponent in opponents
        if normalize_team_name(opponent) not in lookup
    )
    fixture_names = {normalize_team_name(opponent) for opponent in opponents}
    stale = sorted(
        team["canonical_name"]
        for team in corpus["teams"]
        if not team.get("is_subject_club")
        and not any(normalize_team_name(name) in fixture_names for name in team_names(team))
    )
    return missing, stale


def build_match_context(round_number: int) -> dict[str, Any]:
    corpus = load_team_corpus()
    fixtures_data = load_fixtures()
    fixture = next(
        (item for item in fixtures_data["fixtures"] if item["round"] == round_number),
        None,
    )
    if fixture is None:
        raise ValueError(f"Round {round_number} not found in fixtures.yaml")

    opponent_name = fixture["opponent"]
    opponent = get_team(corpus, opponent_name)
    subject = get_team(corpus, fixtures_data.get("team", corpus["subject_club"]))
    previous_meetings = [
        item
        for item in fixtures_for_team(fixtures_data, opponent_name)
        if item["round"] < round_number and item.get("result") != "TBD"
    ]
    future_meetings = [
        item
        for item in fixtures_for_team(fixtures_data, opponent_name)
        if item["round"] > round_number
    ]

    return {
        "report_mode": "preview" if fixture.get("result") == "TBD" else "postmatch",
        "fixture": fixture,
        "subject_club": subject,
        "opponent": opponent,
        "previous_meetings": previous_meetings,
        "future_meetings": future_meetings,
        "source_policy": corpus.get("source_policy", {}),
    }


def dump_context_json(context: dict[str, Any]) -> str:
    return json.dumps(context, ensure_ascii=False, indent=2, default=str)
