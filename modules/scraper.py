"""
Scraper - Pulls articles from Korean sports sources.

Two strategies:
1. Naver Sports search (most efficient, covers most outlets)
2. Direct site scraping (for sources Naver doesn't surface well)

Returns a list of dicts with: url, title, source, date, raw_text.
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
from urllib.parse import quote, urljoin

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}


def _is_within_window(article_date: datetime,
                      date_start: datetime,
                      date_end: datetime) -> bool:
    """Check if an article falls within [date_start, date_end]."""
    return date_start <= article_date <= date_end


def _parse_korean_date(date_str: str) -> Optional[datetime]:
    """Parse a Korean date string into a UTC datetime.

    Handles absolute formats like '2026.05.03', '2026-05-03 14:30' and
    relative formats Naver uses on search results: 'N분 전', 'N시간 전',
    'N일 전', 'N주 전' (minutes/hours/days/weeks ago).
    """
    date_str = date_str.strip()

    relative_units = {
        "분": "minutes",
        "시간": "hours",
        "일": "days",
        "주": "weeks",
    }
    rel_match = re.search(r"(\d+)\s*(분|시간|일|주)\s*전", date_str)
    if rel_match:
        n = int(rel_match.group(1))
        unit = relative_units[rel_match.group(2)]
        return datetime.now(timezone.utc) - timedelta(**{unit: n})

    patterns = [
        r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*(\d{1,2}):(\d{2})",
        r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})",
    ]

    for pat in patterns:
        m = re.search(pat, date_str)
        if m:
            groups = m.groups()
            try:
                if len(groups) == 5:
                    y, mo, d, h, mi = map(int, groups)
                    return datetime(y, mo, d, h, mi, tzinfo=timezone.utc)
                elif len(groups) == 3:
                    y, mo, d = map(int, groups)
                    return datetime(y, mo, d, tzinfo=timezone.utc)
            except ValueError:
                continue

    return None


def search_naver_news(query: str,
                     date_start: Optional[datetime] = None,
                     date_end: Optional[datetime] = None,
                     days_lookback: int = 7,
                     max_results: int = 50) -> List[Dict]:
    """
    Search Naver News for articles matching the query within a date window.

    If date_start/date_end are provided, uses Naver's custom date filter
    (pd=3&ds=YYYY.MM.DD&de=YYYY.MM.DD) for server-side filtering. Otherwise
    falls back to days_lookback ending at now.
    """
    if date_end is None:
        date_end = datetime.now(timezone.utc)
    if date_start is None:
        date_start = date_end - timedelta(days=days_lookback)

    encoded_query = quote(query)
    ds = date_start.strftime("%Y.%m.%d")
    de = date_end.strftime("%Y.%m.%d")
    url = (
        f"https://search.naver.com/search.naver?where=news&query={encoded_query}"
        f"&sort=1&pd=3&ds={ds}&de={de}"
    )

    logger.info(f"Searching Naver News for: {query} ({ds} to {de})")

    try:
        with httpx.Client(headers=DEFAULT_HEADERS, timeout=30, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as e:
        logger.error(f"Failed to fetch Naver search: {e}")
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    results = []

    # Naver refactored to sds-comps-* layout (late 2025/early 2026).
    # Each result is a direct child div of `.fds-news-item-list-tab`.
    container = soup.select_one(".fds-news-item-list-tab")
    items = list(container.find_all("div", recursive=False)) if container else []

    for item in items[:max_results]:
        try:
            title_span = item.select_one("span.sds-comps-text-type-headline1")
            if not title_span:
                continue
            title = title_span.get_text(strip=True)
            title_link = title_span.find_parent("a")
            article_url = title_link.get("href", "") if title_link else ""
            if not article_url:
                continue

            source_el = item.select_one(".sds-comps-profile-info-title-text")
            source = source_el.get_text(strip=True) if source_el else "Unknown"

            article_date = None
            for sub in item.select(".sds-comps-profile-info-subtext"):
                article_date = _parse_korean_date(sub.get_text(strip=True))
                if article_date:
                    break

            if not article_date:
                continue

            # Naver already filtered server-side via pd=3&ds&de. Local filter
            # would drop boundary articles whose relative-time parse drifts a
            # few seconds past date_end. Trust the server filter.

            results.append({
                "url": article_url,
                "title": title,
                "source": source,
                "date": article_date.isoformat(),
                "raw_text": "",  # filled in by fetch_article_body
            })
        except Exception as e:
            logger.warning(f"Skipping malformed search result: {e}")
            continue

    logger.info(f"Naver search returned {len(results)} articles in window")
    return results


def fetch_article_body(article: Dict, max_chars: int = 8000) -> Dict:
    """
    Fetch the full text of an article. Returns the article dict with raw_text filled.

    Uses heuristic extraction since each Korean outlet has its own DOM structure.
    For production reliability, consider swapping in a service like Diffbot
    or trafilatura.
    """
    url = article["url"]

    try:
        with httpx.Client(headers=DEFAULT_HEADERS, timeout=30, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as e:
        logger.warning(f"Failed to fetch article {url}: {e}")
        article["raw_text"] = ""
        return article

    soup = BeautifulSoup(response.text, "html.parser")

    # Try common Korean news article body selectors in order of specificity
    selectors = [
        "#dic_area",                      # Naver News
        "#newsct_article",                # Naver News alt
        "article",                        # Standard semantic HTML
        ".article_body",                  # Common Korean outlet pattern
        "#article_body",
        "#articleBodyContents",           # Older Naver
        ".news_content",
        ".view_text",
        "#content",
    ]

    body_text = ""
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            # Strip script/style tags
            for tag in el.find_all(["script", "style", "iframe", "ins"]):
                tag.decompose()
            body_text = el.get_text(separator="\n", strip=True)
            if len(body_text) > 200:  # sanity threshold
                break

    if not body_text:
        # Fallback: grab all paragraph text
        paragraphs = soup.find_all("p")
        body_text = "\n".join(p.get_text(strip=True) for p in paragraphs)

    article["raw_text"] = body_text[:max_chars]
    return article


def scrape_all_sources(team_korean_names: List[str],
                       date_start: Optional[datetime] = None,
                       date_end: Optional[datetime] = None,
                       days_lookback: int = 7,
                       max_articles: int = 50) -> List[Dict]:
    """
    Top-level scraping orchestrator.

    For now, the most reliable strategy is to search Naver News for each
    team name variant and dedupe by URL. Direct outlet scraping can be
    added per-source as DOM patterns stabilize.
    """
    if date_end is None:
        date_end = datetime.now(timezone.utc)
    if date_start is None:
        date_start = date_end - timedelta(days=days_lookback)

    seen_urls = set()
    all_articles = []

    for name in team_korean_names:
        articles = search_naver_news(name,
                                     date_start=date_start,
                                     date_end=date_end,
                                     max_results=max_articles)
        for art in articles:
            if art["url"] in seen_urls:
                continue
            seen_urls.add(art["url"])
            all_articles.append(art)

    logger.info(f"Total deduplicated articles: {len(all_articles)}")

    # Cap at max_articles to control LLM costs
    all_articles = all_articles[:max_articles]

    # Fetch bodies
    for i, art in enumerate(all_articles):
        logger.info(f"Fetching article {i+1}/{len(all_articles)}: {art['title'][:60]}")
        fetch_article_body(art)

    # Filter out articles where body fetch failed
    all_articles = [a for a in all_articles if a["raw_text"]]

    return all_articles
