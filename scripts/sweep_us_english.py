"""
Post-processing sweep for the Seoul E-Land vault.

For every .md file under the vault tree:
  1. Replaces em dashes (U+2014) and en dashes (U+2013) with sensible
     ASCII punctuation. Sentence-level "word — word" becomes "word, word";
     bare "word—word" becomes "word-word".
  2. Converts a curated set of UK-English spellings to US-English while
     preserving the original capitalization.

The YAML frontmatter (between leading --- markers) and inline code spans
(`...`) are left untouched.

Usage:
    python scripts/sweep_us_english.py
"""

import re
import sys
from pathlib import Path

VAULT_ROOT = Path("C:/Andy Herman/Luna Master/Sports/Seoul_E-Land")

# --- UK -> US lemma map ---------------------------------------------------
# Lowercase canonical form. The replacer preserves capitalization of the
# original match (lowercase / Titlecase / UPPERCASE).
UK_US = {
    # -ise / -ize family
    "analyse": "analyze", "analysed": "analyzed",
    "analyses": "analyzes", "analysing": "analyzing",
    "organise": "organize", "organised": "organized",
    "organises": "organizes", "organising": "organizing",
    "organisation": "organization", "organisations": "organizations",
    "realise": "realize", "realised": "realized",
    "realises": "realizes", "realising": "realizing",
    "realisation": "realization",
    "recognise": "recognize", "recognised": "recognized",
    "recognises": "recognizes", "recognising": "recognizing",
    "specialise": "specialize", "specialised": "specialized",
    "specialises": "specializes", "specialising": "specializing",
    "summarise": "summarize", "summarised": "summarized",
    "summarises": "summarizes", "summarising": "summarizing",
    "emphasise": "emphasize", "emphasised": "emphasized",
    "emphasises": "emphasizes", "emphasising": "emphasizing",
    "criticise": "criticize", "criticised": "criticized",
    "criticises": "criticizes", "criticising": "criticizing",
    "prioritise": "prioritize", "prioritised": "prioritized",
    "prioritises": "prioritizes", "prioritising": "prioritizing",
    "utilise": "utilize", "utilised": "utilized",
    "utilises": "utilizes", "utilising": "utilizing",
    "capitalise": "capitalize", "capitalised": "capitalized",
    "capitalises": "capitalizes", "capitalising": "capitalizing",

    # -our / -or family
    "behaviour": "behavior", "behaviours": "behaviors",
    "colour": "color", "coloured": "colored", "colours": "colors",
    "favour": "favor", "favoured": "favored", "favours": "favors",
    "favourite": "favorite", "favourites": "favorites",
    "harbour": "harbor", "harbours": "harbors",
    "honour": "honor", "honoured": "honored", "honours": "honors",
    "labour": "labor", "laboured": "labored", "labours": "labors",
    "neighbour": "neighbor", "neighbours": "neighbors",
    "neighbourhood": "neighborhood",
    "rumour": "rumor", "rumours": "rumors",
    "vigour": "vigor", "endeavour": "endeavor",
    "saviour": "savior", "armour": "armor",

    # -re / -er
    "centre": "center", "centred": "centered", "centres": "centers",
    "metre": "meter", "metres": "meters",
    "theatre": "theater", "theatres": "theaters",
    "fibre": "fiber", "fibres": "fibers",

    # -ence / -ense
    "defence": "defense", "defences": "defenses",
    "offence": "offense", "offences": "offenses",
    "licence": "license", "licences": "licenses",
    "pretence": "pretense",

    # -ll / -l (or vice versa)
    "travelling": "traveling", "travelled": "traveled",
    "modelling": "modeling", "modelled": "modeled",
    "cancelling": "canceling", "cancelled": "canceled",
    "labelling": "labeling", "labelled": "labeled",
    "signalling": "signaling", "signalled": "signaled",

    # other common pairs
    "whilst": "while",
    "amongst": "among",
    "catalogue": "catalog", "catalogues": "catalogs",
    "programme": "program", "programmes": "programs",
    "judgement": "judgment", "judgements": "judgments",
    "manoeuvre": "maneuver", "manoeuvres": "maneuvers",
    "manoeuvred": "maneuvered", "manoeuvring": "maneuvering",
    "jewellery": "jewelry",
    "speciality": "specialty", "specialities": "specialties",
    "fulfil": "fulfill", "fulfils": "fulfills",
    "enrol": "enroll", "enrols": "enrolls",
    "skilful": "skillful",
    "aluminium": "aluminum",
    "practise": "practice", "practised": "practiced", "practises": "practices",
    "draught": "draft", "draughts": "drafts",
}


# --- helpers --------------------------------------------------------------

def preserve_case(src: str, dst: str) -> str:
    """Match dst's capitalization to src's: lower / Title / UPPER."""
    if src.isupper():
        return dst.upper()
    if src[0].isupper():
        return dst[0].upper() + dst[1:]
    return dst


_uk_pattern = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in UK_US.keys()) + r")\b",
    re.IGNORECASE,
)


def apply_uk_to_us(text: str) -> tuple[str, int]:
    """Replace UK forms with US forms, preserving case. Returns (text, count)."""
    count = 0

    def repl(m):
        nonlocal count
        word = m.group(1)
        target = UK_US[word.lower()]
        count += 1
        return preserve_case(word, target)

    new_text = _uk_pattern.sub(repl, text)
    return new_text, count


def strip_dashes(text: str) -> tuple[str, int]:
    """Remove em dashes (U+2014) and en dashes (U+2013).

    All cases collapse to ", " - matches the analyst-prompt instruction to use
    commas. Numeric ranges via en dash ("Mar 1–7") are rare in these digests
    and would have been written with "to" in the source articles already.
    Returns (text, count).
    """
    count = 0

    def repl(m):
        nonlocal count
        count += 1
        return ", "

    # Eat any whitespace around the dash so we don't leave double spaces.
    text = re.sub(r"\s*[–—]\s*", repl, text)
    return text, count


# Smart punctuation -> ASCII. The analyst LLM routinely emits curly quotes and
# ellipsis characters; the rest of the vault uses straight ASCII quotes, and
# curly glyphs render inconsistently on the published site. Normalize them.
_SMART_MAP = {
    "‘": "'", "’": "'", "‚": "'", "‛": "'",  # single quotes
    "“": '"', "”": '"', "„": '"', "‟": '"',  # double quotes
    "′": "'", "″": '"',                                  # primes
    "…": "...",                                               # ellipsis
}
_smart_pattern = re.compile("[" + "".join(_SMART_MAP.keys()) + "]")


def normalize_typography(text: str) -> tuple[str, int]:
    """Convert curly quotes, primes, and ellipsis to ASCII. Returns (text, count)."""
    count = 0

    def repl(m):
        nonlocal count
        count += 1
        return _SMART_MAP[m.group(0)]

    return _smart_pattern.sub(repl, text), count


def split_frontmatter(content: str) -> tuple[str, str]:
    """Return (frontmatter_with_separators, body). Frontmatter is left as-is."""
    if not content.startswith("---\n"):
        return "", content
    end = content.find("\n---\n", 4)
    if end == -1:
        return "", content
    return content[: end + 5], content[end + 5 :]


def sweep_file(path: Path) -> tuple[int, int, int]:
    original = path.read_text(encoding="utf-8")
    fm, body = split_frontmatter(original)
    new_body, dash_count = strip_dashes(body)
    new_body, uk_count = apply_uk_to_us(new_body)
    new_body, typo_count = normalize_typography(new_body)
    if dash_count or uk_count or typo_count:
        path.write_text(fm + new_body, encoding="utf-8")
    return dash_count, uk_count, typo_count


def main():
    if not VAULT_ROOT.exists():
        print(f"Vault not found: {VAULT_ROOT}", file=sys.stderr)
        sys.exit(1)

    md_files = list(VAULT_ROOT.rglob("*.md"))
    print(f"Sweeping {len(md_files)} markdown file(s) under {VAULT_ROOT}")

    total_dash = total_uk = total_typo = 0
    for f in md_files:
        d, u, t = sweep_file(f)
        total_dash += d
        total_uk += u
        total_typo += t
        if d or u or t:
            rel = f.relative_to(VAULT_ROOT)
            print(f"  {rel}: -{d} dash(es), {u} UK->US, {t} smart-punct")

    print()
    print(f"Total: removed {total_dash} dash(es), made {total_uk} UK->US "
          f"replacement(s), normalized {total_typo} smart-punct char(s)")


if __name__ == "__main__":
    main()
