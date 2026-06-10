"""
Seoul E-Land FC Weekly Digest - Main Orchestrator

Pipeline:
1. Scrape Korean sports sources for past 7 days of E-Land coverage
2. Translate each article (Hermes 4 70B via Nous Portal)
3. Cluster duplicate stories across outlets (Hermes 4 70B)
4. Synthesize the analyst-voice digest (Claude Sonnet 4.5)
5. Write to Obsidian vault with player wikilinks and master index update

Run manually: python seoul_eland_digest.py
Run scheduled: invoked by run_weekly.bat via Windows Task Scheduler
"""

import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml
from dotenv import load_dotenv

# Windows: console default cp1252 chokes on Korean source/title strings in logs.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

# Set up paths so this works regardless of CWD
SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

from modules.llm_client import build_client_from_config
from modules.scraper import scrape_all_sources
from modules.obsidian_writer import (
    write_digest,
    update_player_index,
    update_master_index,
)


# ============================================================
# Setup
# ============================================================

def setup_logging(log_dir: Path, level: str = "INFO"):
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"digest_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )
    return logging.getLogger(__name__)


def load_config(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_prompt(prompts_dir: Path, name: str) -> str:
    return (prompts_dir / f"{name}.txt").read_text(encoding="utf-8")


def _format_prompt(template: str, **kwargs) -> str:
    """Literal {placeholder} substitution that ignores other {/} (e.g. JSON examples).

    Plain str.format() chokes on the JSON schema examples baked into our prompt
    files, so we do explicit replacement instead.
    """
    out = template
    for key, value in kwargs.items():
        out = out.replace("{" + key + "}", str(value))
    return out


# ============================================================
# Pipeline stages
# ============================================================

def stage_translate(articles, translator, prompt_template, logger):
    """Translate each article from Korean to English."""
    translated = []
    for i, art in enumerate(articles):
        logger.info(f"Translating {i+1}/{len(articles)}: {art['title'][:60]}")
        try:
            user_prompt = _format_prompt(
                prompt_template,
                article_text=art["raw_text"],
                source_name=art["source"],
                url=art["url"],
                date=art["date"],
            )
            english = translator.complete(
                system_prompt="You are a precise Korean-to-English translator for sports journalism.",
                user_prompt=user_prompt,
            )
            translated.append({
                **art,
                "english_text": english.strip(),
            })
        except Exception as e:
            logger.warning(f"Translation failed for {art['url']}: {e}")
            continue

    return translated


def stage_deduplicate(translated_articles, deduper, prompt_template, logger):
    """Cluster articles covering the same underlying story."""
    # Compact the input - we only need title + url + first chunk of english text
    compact = [
        {
            "title": a["title"],
            "url": a["url"],
            "source": a["source"],
            "date": a["date"],
            "summary": a["english_text"][:1500],
        }
        for a in translated_articles
    ]

    user_prompt = _format_prompt(
        prompt_template,
        articles_json=json.dumps(compact, ensure_ascii=False, indent=2),
    )

    response = deduper.complete(
        system_prompt="You are a precise news editor producing structured JSON output.",
        user_prompt=user_prompt,
    )

    # Strip any code fences the model might add despite instructions
    response = response.strip()
    if response.startswith("```"):
        # Remove first line (```json or ```) and last line (```)
        lines = response.split("\n")
        response = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        clusters = json.loads(response)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse dedupe JSON: {e}")
        logger.error(f"Response was: {response[:500]}")
        # Fallback: treat each article as its own cluster
        clusters = {
            "clusters": [
                {
                    "category": "MATCH" if "경기" in a["title"] else "OFF_PITCH",
                    "summary": a["english_text"][:200],
                    "key_facts": [],
                    "players_mentioned": [],
                    "sources": [{"outlet": a["source"], "url": a["url"]}],
                    "disagreements": None,
                }
                for a in translated_articles
            ]
        }

    return clusters


def stage_synthesize(clusters, match_info, season_record, upcoming_fixtures,
                     fan_sentiment, analyst, prompt_template, logger,
                     window_start, window_end):
    """Generate the final analyst-voice digest grounded in real match info."""
    iso_date = str(match_info["date"])

    user_prompt = _format_prompt(
        prompt_template,
        iso_date=iso_date,
        round_number=match_info["round"],
        opponent=match_info["opponent"],
        venue=match_info["venue"],
        result=match_info["result"],
        window_start=window_start,
        window_end=window_end,
        match_info=json.dumps(match_info, ensure_ascii=False, indent=2, default=str),
        season_record=json.dumps(season_record, ensure_ascii=False, indent=2, default=str),
        upcoming_fixtures=json.dumps(upcoming_fixtures, ensure_ascii=False, indent=2, default=str),
        news_clusters=json.dumps(clusters, ensure_ascii=False, indent=2, default=str),
        fan_sentiment=fan_sentiment or "Not available this round.",
    )

    digest = analyst.complete(
        system_prompt=(
            "You are an experienced football analyst with playing background, "
            "writing critical, tactically-literate per-round digests grounded "
            "strictly in the provided match info and source articles."
        ),
        user_prompt=user_prompt,
    )

    return digest, iso_date, match_info["round"]


# ============================================================
# Fixture loader (real schedule from data/fixtures.yaml)
# ============================================================

def load_fixtures(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_round_fixture(fixtures_data: dict, round_n: int) -> dict:
    for fx in fixtures_data["fixtures"]:
        if fx["round"] == round_n:
            return fx
    raise ValueError(f"Round {round_n} not in fixtures.yaml")


def compute_season_record(fixtures_data: dict, through_round: int) -> dict:
    """Build a W-D-L record and points table through the given round (inclusive)."""
    w = d = l = gf = ga = 0
    history = []
    for fx in fixtures_data["fixtures"]:
        if fx["round"] > through_round:
            break
        if fx.get("result", "TBD") == "TBD":
            continue
        # Determine E-Land's goals based on venue
        if fx["venue"] == "home":
            eland_g, opp_g = fx["home_score"], fx["away_score"]
        else:
            eland_g, opp_g = fx["away_score"], fx["home_score"]
        gf += eland_g
        ga += opp_g
        if eland_g > opp_g:
            w += 1; outcome = "W"
        elif eland_g < opp_g:
            l += 1; outcome = "L"
        else:
            d += 1; outcome = "D"
        history.append({
            "round": fx["round"],
            "opponent": fx["opponent"],
            "venue": fx["venue"],
            "result": fx["result"],
            "outcome": outcome,
        })
    points = w * 3 + d
    return {
        "played": w + d + l,
        "wins": w, "draws": d, "losses": l,
        "goals_for": gf, "goals_against": ga,
        "goal_difference": gf - ga,
        "points": points,
        "history": history,
        "last_5": [h["outcome"] for h in history[-5:]],
    }


def get_upcoming_fixtures(fixtures_data: dict, after_round: int, n: int = 3) -> list:
    return [
        fx for fx in fixtures_data["fixtures"]
        if fx["round"] > after_round
    ][:n]


# ============================================================
# Main
# ============================================================

def main(round_n: int):
    # Load environment + config
    load_dotenv(SCRIPT_DIR / ".env", override=True)
    config = load_config(SCRIPT_DIR / "config.yaml")
    prompts_dir = SCRIPT_DIR / "prompts"
    log_dir = SCRIPT_DIR / config["logging"]["log_dir"]

    logger = setup_logging(log_dir, config["logging"]["level"])
    logger.info("=" * 60)
    logger.info(f"Seoul E-Land FC Round Digest - Starting run (round={round_n})")
    logger.info("=" * 60)

    # Load fixtures and locate the target round
    fixtures_data = load_fixtures(SCRIPT_DIR / "data" / "fixtures.yaml")
    match_info = get_round_fixture(fixtures_data, round_n)
    season_record = compute_season_record(fixtures_data, through_round=round_n)
    upcoming = get_upcoming_fixtures(fixtures_data, after_round=round_n, n=3)
    logger.info(
        f"Round {round_n}: {match_info['venue']} vs {match_info['opponent']} "
        f"on {match_info['date']} ({match_info['result']})"
    )

    # Build LLM clients
    logger.info("Building LLM clients...")
    translator = build_client_from_config(config["models"]["translation"])
    deduper = build_client_from_config(config["models"]["deduplication"])
    analyst = build_client_from_config(config["models"]["analyst_voice"])

    # Load prompts
    translate_prompt = load_prompt(prompts_dir, "translate")
    dedupe_prompt = load_prompt(prompts_dir, "deduplicate")
    analyst_prompt = load_prompt(prompts_dir, "analyst_voice")

    # Scrape window: anchor around the match date (4 days before to 4 days after)
    match_date = datetime.fromisoformat(str(match_info["date"])).replace(
        tzinfo=timezone.utc
    )
    date_start = match_date - timedelta(days=4)
    date_end = match_date + timedelta(days=4)

    # Stage 1: Scrape
    logger.info(
        f"STAGE 1: Scraping Korean sources "
        f"({date_start.date()} to {date_end.date()}, anchored on match date "
        f"{match_date.date()})..."
    )
    articles = scrape_all_sources(
        team_korean_names=config["team"]["korean_names"],
        date_start=date_start,
        date_end=date_end,
        max_articles=config["features"]["max_articles_per_run"],
    )

    if not articles:
        logger.warning("No articles found in window. Generating with match info only.")
        articles = []

    logger.info(f"Scraped {len(articles)} articles")

    if articles:
        # Stage 2: Translate
        logger.info("STAGE 2: Translating articles...")
        translated = stage_translate(articles, translator, translate_prompt, logger)
        logger.info(f"Successfully translated {len(translated)} articles")

        # Stage 3: Deduplicate
        logger.info("STAGE 3: Clustering duplicate stories...")
        clusters = stage_deduplicate(translated, deduper, dedupe_prompt, logger)
        n_clusters = len(clusters.get("clusters", []))
        logger.info(f"Reduced {len(translated)} articles to {n_clusters} story clusters")
    else:
        clusters = {"clusters": []}

    # Stage 4: Synthesize
    logger.info("STAGE 4: Synthesizing analyst digest...")
    fan_sentiment = None  # TODO: wire up fan forum scraping in v2

    digest, iso_date, _ = stage_synthesize(
        clusters, match_info, season_record, upcoming, fan_sentiment,
        analyst, analyst_prompt, logger,
        window_start=date_start.date().isoformat(),
        window_end=date_end.date().isoformat(),
    )

    # Stage 5: Write to Obsidian
    logger.info("STAGE 5: Writing to Obsidian vault...")
    digest_path = write_digest(digest, config["vault"], iso_date, round_n)

    # Update player notes
    written_players = update_player_index(
        digest, config["vault"], round_n, iso_date,
    )
    logger.info(f"Created {len(written_players)} new player notes")

    # Update master index
    digest_filename = digest_path.stem
    headline_match = digest.split("\n")
    headline = next(
        (line.strip("> *").strip() for line in headline_match
         if line.startswith(">")),
        "Round digest"
    )[:120]

    venue_label = "vs" if match_info["venue"] == "home" else "at"
    match_summary = (
        f"{match_info['result']} {venue_label} {match_info['opponent']}"
    )
    update_master_index(
        config["vault"], iso_date, round_n,
        digest_filename, headline, match_summary=match_summary,
    )

    logger.info("=" * 60)
    logger.info(f"Digest complete: {digest_path}")
    logger.info("=" * 60)


def _resolve_default_round() -> int:
    """When --round isn't given, pick the most recent played round."""
    fixtures_data = load_fixtures(SCRIPT_DIR / "data" / "fixtures.yaml")
    played = [fx for fx in fixtures_data["fixtures"] if fx.get("result", "TBD") != "TBD"]
    if not played:
        raise RuntimeError("No played rounds in fixtures.yaml; pass --round explicitly.")
    return max(fx["round"] for fx in played)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate Seoul E-Land round digest.")
    parser.add_argument(
        "--round",
        dest="round_n",
        type=int,
        default=None,
        help="K League 2 round number. Defaults to the most recent played round.",
    )
    args = parser.parse_args()
    round_n = args.round_n if args.round_n is not None else _resolve_default_round()
    main(round_n=round_n)
