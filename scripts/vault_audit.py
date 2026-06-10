"""
Audit the Seoul E-Land Obsidian vault for quality issues.

Reports (does not modify) the following:
  1. Player notes that match exclusion rules (noise that slipped through)
  2. Player notes with no current digest references (stale or orphaned)
  3. Wikilinks in digests that don't resolve to a vault file (dead links)
  4. Duplicate-pair candidates (same canonical name in multiple files)
  5. Missing round digests vs played fixtures
  6. Em dash / en dash count (sweep should keep this at 0)

Exits 0 when clean, 1 when issues found (so the cron can flag a Monday email).

Usage:
    python scripts/vault_audit.py
"""

import re
import sys
from collections import defaultdict
from pathlib import Path

import yaml

SCRIPT_DIR = Path(__file__).parent.parent.resolve()


def main():
    config = yaml.safe_load((SCRIPT_DIR / "config.yaml").read_text(encoding="utf-8"))
    vault = Path(config["vault"]["base_path"])
    players_dir = vault / config["vault"]["players_subfolder"]
    digests_dir = vault / config["vault"]["digests_subfolder"]

    if not vault.exists():
        print(f"FAIL: vault not found at {vault}")
        sys.exit(1)

    issues = []

    # Load exclusion rules + opponents
    excl_path = SCRIPT_DIR / "data" / "exclusions.yaml"
    excl_cfg = (
        yaml.safe_load(excl_path.read_text(encoding="utf-8")) if excl_path.exists() else {}
    )
    exact_excl = set(excl_cfg.get("exact_names", []) or [])
    team_suf = set(excl_cfg.get("team_suffixes", []) or [])
    venue_suf = set(excl_cfg.get("venue_suffixes", []) or [])
    fx_path = SCRIPT_DIR / "data" / "fixtures.yaml"
    fx = yaml.safe_load(fx_path.read_text(encoding="utf-8")) if fx_path.exists() else {}
    for f in fx.get("fixtures", []):
        if f.get("opponent"):
            exact_excl.add(f["opponent"])

    # === 1. Player notes that match exclusion rules ===
    # Skip files whose frontmatter declares a non-player type (e.g. type: venue)
    # since those are intentional and not noise.
    if players_dir.exists():
        for p in players_dir.glob("*.md"):
            name = p.stem
            last_token = name.split()[-1] if name else ""
            text = p.read_text(encoding="utf-8")
            fm_match = re.search(r"^---\n(.+?)\n---", text, re.DOTALL)
            declared_type = ""
            if fm_match:
                tm = re.search(r"^type:\s*(\S+)", fm_match.group(1), re.MULTILINE)
                if tm:
                    declared_type = tm.group(1)
            if declared_type and declared_type != "player":
                continue
            if (
                name in exact_excl
                or last_token in team_suf
                or last_token in venue_suf
            ):
                issues.append(f"NOISE: Players/{p.name} matches exclusion rules — should be deleted or moved.")

    # === 2. Player notes with no current digest references ===
    digest_texts = {
        d.stem: d.read_text(encoding="utf-8")
        for d in digests_dir.glob("2026-R*.md")
    } if digests_dir.exists() else {}

    for p in players_dir.glob("*.md") if players_dir.exists() else []:
        person = p.stem
        wl_pat = rf"\[\[{re.escape(person)}(?:\s*\([^)]+\))?\]\]"
        plain_pat = rf"\b{re.escape(person)}\b"
        found = any(
            re.search(wl_pat, t) or re.search(plain_pat, t)
            for t in digest_texts.values()
        )
        if not found:
            note_text = p.read_text(encoding="utf-8")
            if "## About" not in note_text:
                issues.append(f"STALE: Players/{p.name} has no current digest references AND no manual About section.")

    # === 3. Dead wikilinks in digests ===
    all_vault_stems = {f.stem for f in vault.rglob("*.md")}
    # Soft-valid targets: things Obsidian renders as "unresolved" but that we
    # don't want notes for (folder placeholders, opposing teams that the
    # analyst still references, generic concepts).
    SOFT_VALID = {"Players", "Matches", "Opponents", "Venues", "Seoul E-Land FC"}
    SOFT_VALID.update(exact_excl)  # opposing teams + departed players + concepts
    # Add team-suffix combos so e.g. "Busan IPark" passes (last token IPark)
    # without us having to enumerate every team name.
    def _is_soft_valid(target: str) -> bool:
        if target in SOFT_VALID:
            return True
        last = target.split()[-1] if target else ""
        return last in team_suf or last in venue_suf

    for d in digests_dir.glob("2026-R*.md") if digests_dir.exists() else []:
        text = d.read_text(encoding="utf-8")
        for link in re.findall(r"\[\[([^\]]+)\]\]", text):
            bare = re.sub(r"\s*\([^)]+\)\s*$", "", link).strip()
            if bare in all_vault_stems or link in all_vault_stems:
                continue
            if _is_soft_valid(bare):
                continue
            issues.append(f"DEAD-LINK: {d.name} -> [[{link}]] (no matching note in vault)")

    # === 4. Duplicate-pair candidates ===
    canonical_groups = defaultdict(list)
    for p in players_dir.glob("*.md") if players_dir.exists() else []:
        canonical = re.sub(r"\s*\([^)]+\)\s*$", "", p.stem).strip()
        canonical_groups[canonical].append(p.name)
    for canon, names in canonical_groups.items():
        if len(names) > 1:
            issues.append(f"DUPLICATE: {names} all canonicalize to '{canon}' — run dedupe_player_notes.py")

    # === 5. Missing digests vs played fixtures ===
    if digests_dir.exists() and fx:
        existing_rounds = set()
        for d in digests_dir.glob("2026-R*.md"):
            m = re.match(r"2026-R(\d+)_", d.name)
            if m:
                existing_rounds.add(int(m.group(1)))
        for f in fx.get("fixtures", []):
            if f.get("result", "TBD") != "TBD" and f["round"] not in existing_rounds:
                issues.append(
                    f"MISSING-DIGEST: Round {f['round']} ({f['opponent']}, {f['date']}) "
                    f"is played but no digest file exists."
                )

    # === 6. Em dash / en dash sweep check ===
    bad_chars = 0
    for f in vault.rglob("*.md"):
        bad_chars += len(re.findall(r"[—–]", f.read_text(encoding="utf-8")))
    if bad_chars > 0:
        issues.append(f"DASH: {bad_chars} em/en dash(es) across vault — run sweep_us_english.py")

    # === Report ===
    if not issues:
        print("✓ Vault audit clean.")
        sys.exit(0)
    print(f"✗ {len(issues)} issue(s) found:\n")
    for i in issues:
        print(f"  - {i}")
    sys.exit(1)


if __name__ == "__main__":
    # Windows console encoding
    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass
    main()
