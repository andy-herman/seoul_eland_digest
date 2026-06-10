"""
Fetch the latest kleagueunited.com round preview articles into research_dump/.

The site publishes "2026 K League 2 Round N Preview" before each matchday.
Each preview also recaps the previous round, so it's useful both as forward-
looking context and as a recap source.

This script:
  1. Hits the K League 2 label page
  2. Identifies all 2026 round-preview articles AND any other 2026 articles
     mentioning Seoul E-Land or its opponents
  3. Downloads any articles not already in research_dump/klu_*.txt
  4. Saves with the standard klu_<slug>.txt filename so compile_brief.py
     picks them up automatically

Usage:
    python scripts/fetch_kleagueunited_preview.py
"""

import re
import sys
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

SCRIPT_DIR = Path(__file__).parent.parent.resolve()
DUMP = SCRIPT_DIR / "research_dump"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
}

# Topics we care about (Seoul E-Land specifically + general K League 2 context)
LABELS = ["K League 2", "Seoul E-Land"]

# Filename slug rules: keep ASCII alnum + dashes, replace everything else.
SLUG_RE = re.compile(r"[^a-zA-Z0-9]+")


def list_label_articles(label):
    """Return list of (title, url) for 2026 articles under a label."""
    label_url = (
        f"https://www.kleagueunited.com/search/label/"
        f"{label.replace(' ', '%20')}?max-results=30"
    )
    try:
        r = httpx.get(label_url, headers=HEADERS, follow_redirects=True, timeout=15)
        r.raise_for_status()
    except Exception as e:
        print(f"WARN: label fetch failed ({label}): {e}", file=sys.stderr)
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for a in soup.select("h3.post-title a, h2.post-title a, .post-title a, .entry-title a"):
        href = a.get("href", "")
        text = a.get_text(strip=True)
        if "/2026/" in href and href and text:
            out.append((text, href))
    return out


def fetch_body(url):
    try:
        r = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=15)
        r.raise_for_status()
    except Exception as e:
        return None, f"[fetch error: {e}]"
    soup = BeautifulSoup(r.text, "html.parser")
    title_el = soup.find("h1") or soup.find(class_="post-title") or soup.find("title")
    title = title_el.get_text(strip=True) if title_el else url
    body_el = soup.select_one(".post-body, .entry-content, [itemprop='articleBody']")
    if not body_el:
        return title, ""
    for tag in body_el.select("script, style, .blog-pager, .post-share, iframe"):
        tag.decompose()
    return title, body_el.get_text(separator="\n", strip=True)


def slug_for(label):
    return SLUG_RE.sub("_", label).strip("_")[:60]


def main():
    DUMP.mkdir(parents=True, exist_ok=True)

    # Aggregate unique URLs across labels
    seen_urls = set()
    candidates = []
    for label in LABELS:
        for title, href in list_label_articles(label):
            if href not in seen_urls:
                seen_urls.add(href)
                candidates.append((title, href))
    print(f"Found {len(candidates)} 2026 article URLs across {len(LABELS)} labels")

    # Track existing files so we don't refetch
    existing = {p.name for p in DUMP.glob("klu_*.txt")}

    written = 0
    for title, href in candidates:
        # Build a deterministic filename from the URL slug
        path_slug = href.rstrip("/").split("/")[-1].rstrip(".html")
        filename = f"klu_{slug_for(path_slug)}.txt"
        if filename in existing:
            continue
        actual_title, body = fetch_body(href)
        if not body or len(body) < 200:
            print(f"  SKIP (empty body): {title}")
            continue
        out_path = DUMP / filename
        out_path.write_text(
            f"# {actual_title}\n\nURL: {href}\n\n{body}",
            encoding="utf-8",
        )
        print(f"  + {filename}: {actual_title[:60]} ({len(body)} chars)")
        written += 1

    print(f"\nDone. Added {written} new article(s); "
          f"{len(existing)} already cached.")


if __name__ == "__main__":
    main()
