#!/usr/bin/env python3
"""Fact and structure parity between an English article and its Korean version.

Flags what a translation most often loses or invents:
  - frontmatter facts (date, round, result, opponent, venue, season, player, part, order)
  - wikilink targets ([[Target]] / [[Target|alias]]) and aliases left in English
  - heading, table-row, list-item and blockquote counts
  - numbers: every number in the English text (digits, scores, percentages and
    number words such as "eleven" or "tenth") should appear in the Korean text,
    and numbers that appear only in the Korean text are listed for review

Usage:
    python ko_parity.py EN.md KO.md [--json]
    python ko_parity.py --pairs EN_DIR KO_DIR        # every KO file with an EN twin
Exit code 1 when a hard check fails (frontmatter facts, wikilink targets, headings).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

FM_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?", re.S)
# Every frontmatter key must match the English file exactly, except display text.
TRANSLATABLE_KEYS = {
    "title", "description", "forecast_labels", "forecast_note", "predicted_lineup_label",
    "predicted_lineup_note", "predicted_lineup_team", "predicted_lineup_status",
}
WIKI_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]")

WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
    "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100,
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7,
    "eighth": 8, "ninth": 9, "tenth": 10, "eleventh": 11, "twelfth": 12, "thirteenth": 13,
    "fourteenth": 14, "fifteenth": 15, "sixteenth": 16, "seventeenth": 17, "eighteenth": 18,
    "nineteenth": 19, "twentieth": 20, "thirtieth": 30, "fortieth": 40, "fiftieth": 50,
    "hundredth": 100, "once": 1, "twice": 2, "double": 2, "treble": 3, "hat-trick": 3,
    "dozen": 12,
}
# Words that are numbers only in some senses ("one of", "second half"); never required.
SOFT_WORDS = {"one", "second", "first", "once", "double", "zero"}

KO_NATIVE = {
    "한": 1, "하나": 1, "첫": 1, "두": 2, "둘": 2, "세": 3, "셋": 3, "네": 4, "넷": 4,
    "다섯": 5, "여섯": 6, "일곱": 7, "여덟": 8, "아홉": 9, "열": 10, "열한": 11, "열두": 12,
    "스무": 20, "스물": 20, "서른": 30, "마흔": 40, "쉰": 50, "백": 100,
}
SINO = "일이삼사오육칠팔구"
KO_SINO_TENS = re.compile(rf"(?<![가-힣])([{SINO[1:]}]?)십([{SINO}]?)(?=[가-힣\s]|$)")


def split(md: str) -> tuple[dict[str, str], str]:
    m = FM_RE.match(md)
    if not m:
        return {}, md
    fm: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith((" ", "-")):
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm, md[m.end():]


def structure(body: str) -> dict[str, int]:
    lines = body.splitlines()
    return {
        "h1": sum(1 for l in lines if re.match(r"^#\s", l)),
        "h2": sum(1 for l in lines if re.match(r"^##\s", l)),
        "h3": sum(1 for l in lines if re.match(r"^###\s", l)),
        "table_rows": sum(1 for l in lines if l.strip().startswith("|")),
        "list_items": sum(1 for l in lines if re.match(r"^\s*([-*+]|\d+\.)\s", l)),
        "blockquotes": sum(1 for l in lines if l.startswith(">")),
        "rules": sum(1 for l in lines if re.match(r"^\s*(-{3,}|\*{3,})\s*$", l)),
    }


def _plain(text: str) -> str:
    text = WIKI_RE.sub(lambda m: m.group(2) or m.group(1), text)
    return re.sub(r"https?://\S+", " ", text)


SCORE_RE = re.compile(r"(?<![\d.:])\d{1,2}\s?-\s?\d{1,2}(?![\d:])")
TIME_RE = re.compile(r"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)")


MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
ISO_RE = re.compile(r"(?<!\d)(20\d\d)-(\d\d)-(\d\d)(?!\d)")
EN_DATE_RE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b|\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b")
KO_DATE_RE = re.compile(r"(\d{1,2})월\s?(\d{1,2})일")


def _dates(text: str, korean: bool) -> tuple[str, Counter]:
    out: Counter = Counter()
    def iso(m):
        out[f"date:{int(m.group(2))}-{int(m.group(3))}"] += 1
        return " "
    text = ISO_RE.sub(iso, text)
    if korean:
        def ko(m):
            out[f"date:{int(m.group(1))}-{int(m.group(2))}"] += 1
            return " "
        text = KO_DATE_RE.sub(ko, text)
    else:
        def en(m):
            mon = m.group(1) or m.group(4)
            day = m.group(2) or m.group(3)
            out[f"date:{MONTHS[mon[:3].lower()]}-{int(day)}"] += 1
            return " "
        text = EN_DATE_RE.sub(en, text)
    return text, out


def _digits(text: str, korean: bool = False) -> Counter:
    text, out = _dates(text, korean)
    for m in TIME_RE.finditer(text):
        out[f"time:{int(m.group(1))}:{m.group(2)}"] += 1
    text = TIME_RE.sub(" ", text)
    for s in SCORE_RE.findall(text):
        out["score:" + re.sub(r"\s", "", s)] += 1
    t = SCORE_RE.sub(" ", text)
    for s in re.findall(r"\d[\d,]*(?:\.\d+)?", t):
        out[s.replace(",", "")] += 1
    return out


def en_numbers(text: str) -> Counter:
    text = _plain(text)
    out = _digits(text)
    for w in re.findall(r"[A-Za-z][A-Za-z-]*", text):
        lw = w.lower()
        if lw in WORDS and lw not in SOFT_WORDS:
            out[f"word:{WORDS[lw]}"] += 1
    return out


def ko_numbers(text: str) -> tuple[Counter, set[int]]:
    text = _plain(text)
    # Korean clock times and match minutes, normalised to the English forms.
    for m in re.finditer(r"(오전|오후|낮|밤|저녁)\s?(\d{1,2})시(?:\s?(\d{1,2})분|\s?반)?", text):
        h = int(m.group(2)) + (12 if m.group(1) in ("오후", "밤", "저녁") and int(m.group(2)) < 12 else 0)
        mm = m.group(3) or ("30" if m.group(0).endswith("반") else "00")
        text += f" {h}:{int(mm):02d} "
    for m in re.finditer(r"후반\s?(?:추가시간\s?)?(\d{1,2})분", text):
        if "추가시간" not in m.group(0):
            text += f" {int(m.group(1)) + 45} "
    out = _digits(text, korean=True)
    native: set[int] = set()
    for w, n in KO_NATIVE.items():
        if re.search(rf"(?<![가-힣]){w}(?=\s?[가-힣])", text):
            native.add(n)
    for m in KO_SINO_TENS.finditer(text):
        tens = SINO.find(m.group(1)) + 1 if m.group(1) else 1
        ones = SINO.find(m.group(2)) + 1 if m.group(2) else 0
        native.add(tens * 10 + ones)
    return out, native


def _one_day_apart(a: str | None, b: str | None) -> bool:
    import datetime as _dt
    try:
        da, db = _dt.date.fromisoformat(str(a)[:10]), _dt.date.fromisoformat(str(b)[:10])
    except ValueError:
        return False
    return abs((da - db).days) == 1


def compare(en_md: str, ko_md: str) -> dict:
    en_fm, en_body = split(en_md)
    ko_fm, ko_body = split(ko_md)
    report: dict = {"hard": [], "soft": []}

    for k in sorted(set(en_fm) - TRANSLATABLE_KEYS):
        if en_fm.get(k) != ko_fm.get(k):
            if k == "date" and _one_day_apart(en_fm.get(k), ko_fm.get(k)):
                report["soft"].append(f"frontmatter date: EN {en_fm.get(k)} vs KO {ko_fm.get(k)} (one day apart: Korean match date)")
                continue
            report["hard"].append(f"frontmatter {k}: EN {en_fm.get(k)[:60]!r} vs KO {str(ko_fm.get(k))[:60]!r}")
    for k in sorted(set(ko_fm) - set(en_fm)):
        report["soft"].append(f"frontmatter key only in KO: {k}")
    for k in ("title", "description"):
        if k in en_fm and not ko_fm.get(k):
            report["hard"].append(f"frontmatter {k} missing in KO")
        elif k in en_fm and re.fullmatch(r"[\x00-\x7f]+", ko_fm.get(k, "")):
            report["hard"].append(f"frontmatter {k} still in English: {ko_fm.get(k)!r}")

    en_links = Counter(m.group(1).strip() for m in WIKI_RE.finditer(en_body))
    ko_links = Counter(m.group(1).strip() for m in WIKI_RE.finditer(ko_body))
    missing = sorted(set(en_links) - set(ko_links))
    extra = sorted(set(ko_links) - set(en_links))
    if missing:
        report["hard"].append(f"wikilink targets missing in KO: {missing}")
    if extra:
        report["soft"].append(f"wikilink targets only in KO: {extra}")
    latin = [m.group(0) for m in WIKI_RE.finditer(ko_body)
             if (not m.group(2) and re.search(r"[A-Za-z]", m.group(1)))
             or (m.group(2) and not re.search(r"[가-힣]", m.group(2)) and re.search(r"[A-Za-z]{3,}", m.group(2)))]
    if latin:
        report["soft"].append(f"wikilinks shown in Latin letters on the Korean page: {latin[:12]}{' …' if len(latin) > 12 else ''}")

    es, ks = structure(en_body), structure(ko_body)
    for k in ("h1", "h2", "h3"):
        if es[k] != ks[k]:
            report["hard"].append(f"{k} headings: EN {es[k]} vs KO {ks[k]}")
    for k in ("table_rows", "list_items", "blockquotes", "rules"):
        if es[k] != ks[k]:
            report["soft"].append(f"{k}: EN {es[k]} vs KO {ks[k]}")

    en_n = en_numbers(en_body)
    ko_n, ko_native = ko_numbers(ko_body)
    missing_nums = []
    for tok in en_n:
        if tok.startswith("word:"):
            n = int(tok[5:])
            if ko_n.get(str(n), 0) == 0 and n not in ko_native:
                missing_nums.append(f"{n} (word)")
            continue
        if ko_n.get(tok, 0) == 0:
            if tok.isdigit() and int(tok) in ko_native:
                continue
            if tok.startswith("date:") and ko_n.get(tok.replace("date:", "date:"), 0):
                continue
            missing_nums.append(tok.replace("score:", ""))
    if missing_nums:
        report["soft"].append(f"English numbers not found in KO ({len(missing_nums)}): {sorted(set(missing_nums), key=lambda x: (len(x), x))}")
    en_plain = {t.replace("score:", "") for t in en_n if not t.startswith("word:")} | {t[5:] for t in en_n if t.startswith("word:")}
    ko_only = sorted({t.replace("score:", "") for t in ko_n} - en_plain, key=lambda x: (len(x), x))
    ko_only = [t for t in ko_only if not re.fullmatch(r"20\d\d", t)]
    if ko_only:
        report["soft"].append(f"numbers only in KO, check them ({len(ko_only)}): {ko_only}")
    report["structure"] = {"en": es, "ko": ks}
    return report


def run_pair(en: Path, ko: Path, as_json: bool) -> bool:
    rep = compare(en.read_text(encoding="utf-8"), ko.read_text(encoding="utf-8"))
    ok = not rep["hard"]
    if as_json:
        print(json.dumps({"en": str(en), "ko": str(ko), **rep}, ensure_ascii=False))
    else:
        print(f"== {ko.name}: {'OK' if ok else 'FAIL'}")
        for h in rep["hard"]:
            print("  HARD", h)
        for s in rep["soft"]:
            print("  soft", s)
    return ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("en", nargs="?")
    ap.add_argument("ko", nargs="?")
    ap.add_argument("--pairs", nargs=2, metavar=("EN_DIR", "KO_DIR"))
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    ok = True
    if a.pairs:
        en_dir, ko_dir = map(Path, a.pairs)
        for ko in sorted(ko_dir.glob("*.md")):
            en = en_dir / ko.name
            if not en.exists():
                print(f"== {ko.name}: no English twin")
                continue
            ok &= run_pair(en, ko, a.json)
    elif a.en and a.ko:
        ok = run_pair(Path(a.en), Path(a.ko), a.json)
    else:
        ap.error("give EN KO, or --pairs EN_DIR KO_DIR")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
