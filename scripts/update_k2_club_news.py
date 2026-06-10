r"""Refresh private K League 2 club-news notes for scouting.

Searches Korean news aggregators for every 2026 K League 2 team in
data/team_corpus.yaml, archives deduplicated articles in research_dump, and
updates Obsidian notes under:

    Scouting Report/K League 2 2026/Teams/<club>/Club News.md

This is private scouting input only. It does not publish anything to site/.

Usage:
    venv\Scripts\python.exe scripts\update_k2_club_news.py
    venv\Scripts\python.exe scripts\update_k2_club_news.py --days-lookback 3 --sources naver
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
import yaml
from bs4 import BeautifulSoup

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from modules.scraper import DEFAULT_HEADERS, _parse_korean_date, fetch_article_body, search_naver_news

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

CORPUS_PATH = PROJECT_ROOT / "data" / "team_corpus.yaml"
NEWS_ARCHIVE_PATH = PROJECT_ROOT / "research_dump" / "scouting" / "k2_club_news.json"
VAULT_ROOT = Path("C:/Andy Herman/Luna Master/Sports/Seoul_E-Land")
SCOUTING_ROOT = VAULT_ROOT / "Scouting Report" / "K League 2 2026"
TEAMS_ROOT = SCOUTING_ROOT / "Teams"
SOURCE_TIMEOUT = 30

FOOTBALL_TOKENS = [
    "K리그",
    "K리그2",
    "K리그 2",
    "프로축구",
    "축구",
    "FC",
    "아이파크",
    "그리너스",
    "블루윙즈",
    "드래곤즈",
    "프론티어",
    "구단",
    "선수",
    "감독",
    "경기",
    "홈경기",
    "원정",
    "득점",
    "승리",
    "무승부",
    "패배",
    "입단",
    "이적",
]

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

STRONG_TEAM_ALIASES = {
    "seoul-eland": ["서울이랜드", "서울e", "이랜드fc"],
    "ansan-greeners": ["안산그리너스"],
    "busan-ipark": ["부산아이파크"],
    "cheonan": ["천안시티", "천안시티fc"],
    "chungnam-asan": ["충남아산", "충남아산fc"],
    "chungbuk-cheongju": ["충북청주", "충북청주fc"],
    "daegu": ["대구fc"],
    "gimhae-fc": ["김해fc"],
    "gimpo-citizen": ["김포fc", "김포시민"],
    "gyeongnam": ["경남fc"],
    "hwaseong-fc": ["화성fc"],
    "jeonnam-dragons": ["전남드래곤즈"],
    "paju-frontier": ["파주프론티어", "파주fc"],
    "seongnam-fc": ["성남fc"],
    "suwon-bluewings": ["수원삼성", "수원블루윙즈", "수원삼성블루윙즈"],
    "suwon-fc": ["수원fc"],
    "yongin": ["용인fc"],
}


def load_corpus() -> dict[str, Any]:
    data = yaml.safe_load(CORPUS_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("teams"), list):
        raise ValueError(f"Expected team corpus with teams list at {CORPUS_PATH}")
    return data


def load_archive() -> dict[str, Any]:
    if not NEWS_ARCHIVE_PATH.exists():
        return {"version": 1, "teams": {}}
    data = json.loads(NEWS_ARCHIVE_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("teams"), dict):
        raise ValueError(f"Expected club-news archive mapping at {NEWS_ARCHIVE_PATH}")
    return data


def normalize_url(url: str) -> str:
    return re.sub(r"[#?].*$", "", url.strip())


def compact_korean(text: str) -> str:
    return re.sub(r"\s+", "", text or "").lower()


def markdown_escape(text: str) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ").strip()


def compact_body(text: str, max_chars: int = 480) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "..."


def article_date(article: dict[str, Any]) -> str:
    value = article.get("date") or article.get("first_seen_at_utc") or ""
    return str(value)[:10] if value else "unknown"


def is_2026_or_current(article: dict[str, Any], date_start: datetime) -> bool:
    date = str(article.get("date", ""))
    if date.startswith("2026"):
        return True
    body = article.get("raw_text") or article.get("body") or ""
    title = article.get("title") or ""
    if "2025년" in body and "2026" not in body and "2026" not in title:
        return False
    parsed = _parse_korean_date(date)
    return parsed is None or parsed >= date_start


def team_queries(team: dict[str, Any], max_queries: int) -> list[str]:
    aliases = team.get("aliases", {}) or {}
    candidates: list[str] = []
    candidates.extend(STRONG_TEAM_ALIASES.get(team["id"], []))
    for name in aliases.get("ko", []) or []:
        if not name:
            continue
        if any(token in name for token in ["FC", "아이파크", "그리너스", "블루윙즈", "드래곤즈", "프론티어", "서울E"]):
            candidates.append(name)
        else:
            candidates.extend([f"{name} FC", f"{name} K리그2"])
    if not candidates:
        candidates.append(team["canonical_name"])
    deduped = []
    for query in candidates:
        if query not in deduped:
            deduped.append(query)
    return deduped[:max_queries]


def relevant_aliases(team: dict[str, Any]) -> list[str]:
    strong = STRONG_TEAM_ALIASES.get(team["id"], [])
    if strong:
        return [compact_korean(alias) for alias in strong]

    aliases = team.get("aliases", {}) or {}
    values = [team["canonical_name"], team["short_name"]]
    values.extend(aliases.get("en", []) or [])
    values.extend(aliases.get("ko", []) or [])
    cleaned = []
    for value in values:
        normalized = compact_korean(str(value))
        if len(normalized) < 3:
            continue
        if normalized not in cleaned:
            cleaned.append(normalized)
    return cleaned


def is_relevant_football_article(article: dict[str, Any], team: dict[str, Any]) -> bool:
    body = str(article.get("body", article.get("raw_text", "")))
    title = str(article.get("title", ""))
    focused_haystack = compact_korean(
        " ".join(
            [
                title,
                str(article.get("source", "")),
                body[:1600],
            ]
        )
    )
    title_haystack = compact_korean(title)
    aliases = relevant_aliases(team)
    has_strong_team = any(alias in focused_haystack for alias in aliases)
    has_title_team = any(alias in title_haystack for alias in aliases)
    has_football = any(compact_korean(token) in focused_haystack for token in FOOTBALL_TOKENS)
    return has_football and (has_title_team or has_strong_team)


def search_daum_news(
    query: str,
    date_start: datetime,
    date_end: datetime,
    max_results: int,
) -> list[dict[str, Any]]:
    start = date_start.strftime("%Y%m%d000000")
    end = date_end.strftime("%Y%m%d235959")
    url = (
        f"https://search.daum.net/search?w=news&q={quote(query)}"
        f"&sort=recency&period=u&sd={start}&ed={end}"
    )
    try:
        with httpx.Client(headers=DEFAULT_HEADERS, timeout=SOURCE_TIMEOUT, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        print(f"  WARN: Daum search failed for {query!r}: {exc}", file=sys.stderr)
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    selectors = [
        ".c-list-basic .item-title a",
        ".c-list-basic .tit-g a",
        ".coll_cont .tit_main a",
        "a.f_link_b",
        "a.tit_main",
    ]
    links = []
    for selector in selectors:
        links.extend(soup.select(selector))
        if links:
            break

    results: list[dict[str, Any]] = []
    seen = set()
    for link in links:
        href = link.get("href", "").strip()
        title = link.get_text(" ", strip=True)
        if not href or not title:
            continue
        normalized = normalize_url(href)
        if normalized in seen:
            continue
        seen.add(normalized)

        item = link.find_parent(["li", "div"]) or link
        item_text = item.get_text(" ", strip=True)
        parsed_date = _parse_korean_date(item_text)
        date_text = parsed_date.isoformat() if parsed_date else ""
        source = "Daum News"
        source_match = re.search(r"([가-힣A-Za-z0-9 .]+)\s*(?:\d+분 전|\d+시간 전|\d+일 전|\d{4}[.\-/]\d{1,2})", item_text)
        if source_match:
            source = source_match.group(1).strip()[:40] or source

        results.append(
            {
                "url": href,
                "title": title,
                "source": source,
                "date": date_text,
                "raw_text": "",
                "search_source": "daum",
            }
        )
        if len(results) >= max_results:
            break
    return results


def fetch_articles_for_team(
    team: dict[str, Any],
    sources: list[str],
    date_start: datetime,
    date_end: datetime,
    max_results_per_query: int,
    max_queries_per_team: int,
    max_articles_per_team: int,
    delay_seconds: float,
    fetch_bodies: bool,
) -> list[dict[str, Any]]:
    articles: list[dict[str, Any]] = []
    seen_urls = set()
    for query in team_queries(team, max_queries_per_team):
        if "naver" in sources:
            for article in search_naver_news(
                query,
                date_start=date_start,
                date_end=date_end,
                max_results=max_results_per_query,
            ):
                article["search_source"] = "naver"
                article["query"] = query
                key = normalize_url(article["url"])
                if key not in seen_urls:
                    seen_urls.add(key)
                    articles.append(article)
            time.sleep(delay_seconds)

        if "daum" in sources:
            for article in search_daum_news(query, date_start, date_end, max_results_per_query):
                article["query"] = query
                key = normalize_url(article["url"])
                if key not in seen_urls:
                    seen_urls.add(key)
                    articles.append(article)
            time.sleep(delay_seconds)

    articles = articles[:max_articles_per_team]
    if fetch_bodies:
        for article in articles:
            fetch_article_body(article, max_chars=6000)
            time.sleep(delay_seconds)

    return [
        article
        for article in articles
        if is_2026_or_current(article, date_start)
        and is_relevant_football_article(article, team)
    ]


def merge_team_articles(
    existing: list[dict[str, Any]],
    fresh: list[dict[str, Any]],
    team: dict[str, Any],
    max_keep: int,
) -> tuple[list[dict[str, Any]], int]:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    merged = {normalize_url(item["url"]): item for item in existing if item.get("url")}
    new_count = 0
    for article in fresh:
        key = normalize_url(article["url"])
        body = article.pop("raw_text", "") or article.get("body", "")
        incoming = {
            **article,
            "body": body,
            "team_id": team["id"],
            "team": team["canonical_name"],
            "kleague_team_id": team.get("kleague_team_id"),
            "first_seen_at_utc": now,
            "last_seen_at_utc": now,
        }
        if key in merged:
            merged[key].update({k: v for k, v in incoming.items() if v not in (None, "")})
            merged[key]["last_seen_at_utc"] = now
        else:
            merged[key] = incoming
            new_count += 1
    articles = list(merged.values())
    articles.sort(key=lambda item: item.get("date") or item.get("first_seen_at_utc") or "", reverse=True)
    return articles[:max_keep], new_count


def write_team_news_page(team: dict[str, Any], articles: list[dict[str, Any]], updated_at: str) -> None:
    folder = TEAM_FOLDER_NAMES[team["id"]]
    team_dir = TEAMS_ROOT / folder
    team_dir.mkdir(parents=True, exist_ok=True)
    report_link = f"[[{folder} - Scouting Report]]"
    lines = [
        "---",
        'type: "club-news-watch"',
        'scope: "private-pipeline"',
        f'season: "{datetime.now(timezone.utc).year}"',
        'league: "K League 2"',
        f'club: "{team["canonical_name"]}"',
        f'kleague_team_id: "{team.get("kleague_team_id") or "TBD"}"',
        "tags: [seoul-eland, scouting, club-news, private]",
        "---",
        "",
        f"# {team['canonical_name']} - Club News Watch",
        "",
        "> Private scouting-news watch. Use as source material for previews, not as public copy.",
        "",
        f"Parent report: {report_link}",
        "",
        f"Last refreshed: `{updated_at}`",
        "",
        "## Latest Articles",
        "",
    ]
    if articles:
        lines.extend(["| Date | Source | Title | Search |", "| --- | --- | --- | --- |"])
        for article in articles[:20]:
            title = markdown_escape(article.get("title", "Untitled"))
            url = article.get("url", "")
            source = markdown_escape(article.get("source", "Unknown"))
            search = markdown_escape(f"{article.get('search_source', '?')} / {article.get('query', '?')}")
            lines.append(f"| {article_date(article)} | {source} | [{title}]({url}) | {search} |")
    else:
        lines.append("No matching recent club-news articles were found on the last run.")

    lines.extend(["", "## Article Notes", ""])
    for article in articles[:10]:
        lines.extend(
            [
                f"### {article.get('title', 'Untitled')}",
                "",
                f"- **Date/source:** {article_date(article)} / {article.get('source', 'Unknown')}",
                f"- **URL:** {article.get('url', '')}",
                f"- **Search:** {article.get('search_source', '?')} / `{article.get('query', '?')}`",
                f"- **Excerpt:** {compact_body(article.get('body', '')) or 'Body unavailable; use URL directly.'}",
                "",
            ]
        )
    (team_dir / "Club News.md").write_text("\n".join(lines), encoding="utf-8")


def write_news_index(corpus: dict[str, Any], archive: dict[str, Any], updated_at: str) -> None:
    lines = [
        "---",
        'type: "club-news-index"',
        'scope: "private-pipeline"',
        'season: "2026"',
        'league: "K League 2"',
        "tags: [seoul-eland, scouting, club-news, private]",
        "---",
        "",
        "# K League 2 Club News Watch",
        "",
        "> Private rolling news index for scouting and pre-match preview generation.",
        "",
        f"Last refreshed: `{updated_at}`",
        "",
        "| Team | Articles tracked | Latest headline | Page |",
        "| --- | ---: | --- | --- |",
    ]
    teams = archive.get("teams", {})
    for team in corpus["teams"]:
        team_data = teams.get(team["id"], {})
        articles = team_data.get("articles", [])
        latest = articles[0] if articles else {}
        folder = TEAM_FOLDER_NAMES[team["id"]]
        latest_title = markdown_escape(latest.get("title", "TBD"))
        lines.append(
            f"| {team['canonical_name']} | {len(articles)} | {latest_title} | "
            f"[[Teams/{folder}/Club News|Club News]] |"
        )
    (SCOUTING_ROOT / "Club News Watch.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh private K League 2 club news from Korean news search.")
    parser.add_argument("--days-lookback", type=int, default=7)
    parser.add_argument("--max-results-per-query", type=int, default=4)
    parser.add_argument("--max-queries-per-team", type=int, default=2)
    parser.add_argument("--max-articles-per-team", type=int, default=10)
    parser.add_argument("--max-archive-per-team", type=int, default=80)
    parser.add_argument("--delay", type=float, default=1.25, help="Delay between requests, in seconds.")
    parser.add_argument("--sources", nargs="+", choices=["naver", "daum"], default=["naver", "daum"])
    parser.add_argument("--no-bodies", action="store_true", help="Skip article body fetching.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reset", action="store_true", help="Replace the existing archive instead of merging into it.")
    args = parser.parse_args()

    corpus = load_corpus()
    archive = {"version": 1, "teams": {}} if args.reset else load_archive()
    date_end = datetime.now(timezone.utc)
    date_start = date_end - timedelta(days=args.days_lookback)
    updated_at = date_end.isoformat(timespec="seconds")
    total_new = 0

    archive.update(
        {
            "version": 1,
            "updated_at_utc": updated_at,
            "days_lookback": args.days_lookback,
            "sources": args.sources,
        }
    )
    archive.setdefault("teams", {})

    for team in corpus["teams"]:
        print(f"Searching {team['canonical_name']}...")
        fresh = fetch_articles_for_team(
            team=team,
            sources=args.sources,
            date_start=date_start,
            date_end=date_end,
            max_results_per_query=args.max_results_per_query,
            max_queries_per_team=args.max_queries_per_team,
            max_articles_per_team=args.max_articles_per_team,
            delay_seconds=args.delay,
            fetch_bodies=not args.no_bodies,
        )
        existing_team = archive["teams"].get(team["id"], {})
        merged, new_count = merge_team_articles(
            existing_team.get("articles", []),
            fresh,
            team,
            max_keep=args.max_archive_per_team,
        )
        total_new += new_count
        archive["teams"][team["id"]] = {
            "canonical_name": team["canonical_name"],
            "kleague_team_id": team.get("kleague_team_id"),
            "last_refreshed_at_utc": updated_at,
            "articles": merged,
        }
        print(f"  articles={len(merged)} new={new_count}")

    if args.dry_run:
        print(f"Dry run complete. New articles that would be added: {total_new}")
        return

    NEWS_ARCHIVE_PATH.parent.mkdir(parents=True, exist_ok=True)
    NEWS_ARCHIVE_PATH.write_text(json.dumps(archive, ensure_ascii=False, indent=2), encoding="utf-8")
    SCOUTING_ROOT.mkdir(parents=True, exist_ok=True)
    for team in corpus["teams"]:
        write_team_news_page(team, archive["teams"][team["id"]]["articles"], updated_at)
    write_news_index(corpus, archive, updated_at)

    print(f"Wrote {NEWS_ARCHIVE_PATH}")
    print(f"Wrote Obsidian news pages under {SCOUTING_ROOT}")
    print(f"New articles added: {total_new}")


if __name__ == "__main__":
    main()
