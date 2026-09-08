"""
The Race for Two: scenario analysis for Suwon Samsung, Suwon FC and Seoul E-Land.

Reuses the model in simulate_final_stretch.py (same inputs, same adjustments)
and answers questions the headline simulation does not:

  * per-match W/D/L, expected points and a coherent predicted sheet for each
    of the three clubs' remaining fixtures
  * P(Seoul top two) conditional on Seoul's final total, on Suwon FC's final
    total, and on the Round 26 result at Mokdong
  * which single rival fixture swings Seoul's top-two chance the most
  * how often the automatic places are decided on the tiebreak
  * which pair goes up

Usage:
    venv/Scripts/python.exe scripts/race_scenarios.py
"""

from __future__ import annotations

import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import simulate_final_stretch as m  # noqa: E402

random.seed(20260908)
N = 20000
TOP3 = ["suwon-samsung", "seoul-e-land", "suwon-fc"]
SEOUL = "seoul-e-land"

base_pts = {s: m.TABLE[s][1] * 3 + m.TABLE[s][2] for s in m.TABLE}
base_gf = {s: m.TABLE[s][4] for s in m.TABLE}
base_gd = {s: m.TABLE[s][4] - m.TABLE[s][5] for s in m.TABLE}
lam = {f: m.expected_goals(*f) for f in m.FIXTURES}


def per_match_for(club: str) -> dict:
    out = {}
    for rnd, home, away in m.FIXTURES:
        if club not in (home, away):
            continue
        lh, la = lam[(rnd, home, away)]
        tally = Counter()
        for _ in range(N):
            h, a = m.sample_score(lh, la)
            tally[m.outcome_for(club, home, away, h, a)] += 1
        out[rnd] = {
            "home": home, "away": away, "venue": "H" if home == club else "A",
            "opponent": m.NAMES[away if home == club else home],
            "W": tally["W"] / N, "D": tally["D"] / N, "L": tally["L"] / N,
            "xg_for": round(lh if home == club else la, 2),
            "xg_against": round(la if home == club else lh, 2),
            "exp_pts": (3 * tally["W"] + tally["D"]) / N,
        }
    sheet = m.coherent_sheet(out)
    for rnd in out:
        out[rnd]["call"] = sheet[rnd]
    return out


per_match = {c: per_match_for(c) for c in TOP3}

# ---------------------------------------------------------------------------
# Joint season simulation, recording everything needed for the scenarios
# ---------------------------------------------------------------------------
runs = []
for _ in range(N):
    pts = dict(base_pts); gf = dict(base_gf); gd = dict(base_gd)
    results = {}
    for (rnd, home, away), (lh, la) in lam.items():
        h, a = m.sample_score(lh, la)
        gf[home] += h; gf[away] += a; gd[home] += h - a; gd[away] += a - h
        if h > a:
            pts[home] += 3
        elif a > h:
            pts[away] += 3
        else:
            pts[home] += 1; pts[away] += 1
        results[(rnd, home, away)] = (h, a)
    order = sorted(m.RANKED, key=lambda s: (pts[s], gf[s], gd[s]), reverse=True)
    runs.append({
        "pts": {s: pts[s] for s in TOP3}, "gf": {s: gf[s] for s in TOP3},
        "order": order[:3], "results": results,
    })

top2 = lambda r, s: s in r["order"][:2]

# Seoul top-two probability by Seoul's final total
by_seoul_pts = defaultdict(lambda: [0, 0])
for r in runs:
    b = by_seoul_pts[r["pts"][SEOUL]]; b[0] += 1; b[1] += top2(r, SEOUL)

# Seoul top-two probability by Suwon FC's final total (bands)
def band(p):
    if p <= 57: return "<=57"
    if p <= 60: return "58-60"
    if p <= 63: return "61-63"
    return ">=64"
by_sfc_band = defaultdict(lambda: [0, 0])
for r in runs:
    b = by_sfc_band[band(r["pts"]["suwon-fc"])]; b[0] += 1; b[1] += top2(r, SEOUL)

# Suwon FC final points distribution and Seoul's too
sfc_dist = Counter(r["pts"]["suwon-fc"] for r in runs)
seoul_dist = Counter(r["pts"][SEOUL] for r in runs)
ssb_dist = Counter(r["pts"]["suwon-samsung"] for r in runs)

# Round 26 branch
r26 = (26, "seoul-e-land", "suwon-samsung")
branch = defaultdict(lambda: Counter())
for r in runs:
    h, a = r["results"][r26]
    key = "W" if h > a else "D" if h == a else "L"
    c = branch[key]
    c["n"] += 1
    c["seoul_top2"] += top2(r, SEOUL)
    c["seoul_first"] += r["order"][0] == SEOUL
    c["ssb_first"] += r["order"][0] == "suwon-samsung"
    c["sfc_top2"] += top2(r, "suwon-fc")

# Swing analysis: for each rival fixture, P(Seoul top2 | rival wins) vs P(Seoul top2 | rival fails to win)
swing = []
for f in m.FIXTURES:
    rnd, home, away = f
    for rival in ("suwon-samsung", "suwon-fc"):
        if rival not in (home, away):
            continue
        won = [0, 0]; notwon = [0, 0]
        for r in runs:
            h, a = r["results"][f]
            rw = (h > a) if home == rival else (a > h)
            t = won if rw else notwon
            t[0] += 1; t[1] += top2(r, SEOUL)
        if won[0] and notwon[0]:
            swing.append({
                "round": rnd, "fixture": f"{m.NAMES[home]} v {m.NAMES[away]}", "rival": m.NAMES[rival],
                "p_rival_win": won[0] / N,
                "seoul_top2_if_rival_wins": won[1] / won[0],
                "seoul_top2_if_not": notwon[1] / notwon[0],
            })
for s in swing:
    s["swing"] = s["seoul_top2_if_not"] - s["seoul_top2_if_rival_wins"]
swing.sort(key=lambda s: -s["swing"])

# Same for Seoul's own fixtures: P(top2 | win) vs P(top2 | not win)
own = []
for f in m.FIXTURES:
    rnd, home, away = f
    if SEOUL not in (home, away):
        continue
    won = [0, 0]; notwon = [0, 0]
    for r in runs:
        h, a = r["results"][f]
        sw = (h > a) if home == SEOUL else (a > h)
        t = won if sw else notwon
        t[0] += 1; t[1] += top2(r, SEOUL)
    own.append({"round": rnd, "opponent": m.NAMES[away if home == SEOUL else home],
                "p_win": won[0] / N, "top2_if_win": won[1] / won[0], "top2_if_not": notwon[1] / notwon[0]})

# Tiebreak: how often Seoul and Suwon FC finish level, and who is above
level = Counter()
for r in runs:
    if r["pts"][SEOUL] == r["pts"]["suwon-fc"]:
        level["level"] += 1
        # only matters when the pair straddles 2nd/3rd
        if r["order"][1] in (SEOUL, "suwon-fc") and r["order"][2] in (SEOUL, "suwon-fc"):
            level["decides_2nd"] += 1
            level["seoul_above"] += r["order"][1] == SEOUL
level_ssb = sum(1 for r in runs if r["pts"][SEOUL] == r["pts"]["suwon-samsung"])

# Which pair goes up
pairs = Counter(tuple(sorted(r["order"][:2])) for r in runs)

# Seoul win-out scenario and other point targets
winout = [r for r in runs if r["pts"][SEOUL] >= 69]
p_top2_given = {k: round(v[1] / v[0], 3) for k, v in sorted(by_seoul_pts.items()) if v[0] >= 50}
# minimum Seoul total that reached top2 in >=95% of runs
safe = next((k for k, v in sorted(p_top2_given.items()) if v >= 0.95), None)
coinflip = min(p_top2_given, key=lambda k: abs(p_top2_given[k] - 0.5))

# Suwon FC: probability they drop at least X points across nine games (max 27)
sfc_dropped = Counter(71 - r["pts"]["suwon-fc"] for r in runs)  # 44 + 27 = 71

out = {
    "n_sims": N,
    "per_match": {c: {str(k): v for k, v in pm.items()} for c, pm in per_match.items()},
    "sheets": {c: {"record": Counter(v["call"] for v in pm.values()), "points": sum({"W": 3, "D": 1, "L": 0}[v["call"]] for v in pm.values()),
                   "exp_pts": round(sum(v["exp_pts"] for v in pm.values()), 1)} for c, pm in per_match.items()},
    "seoul_top2_by_seoul_pts": p_top2_given,
    "seoul_safe_total_95": safe, "seoul_coinflip_total": coinflip,
    "seoul_top2_by_sfc_band": {k: {"share": v[0] / N, "p": v[1] / v[0]} for k, v in by_sfc_band.items()},
    "sfc_points_dist": {str(k): v / N for k, v in sorted(sfc_dist.items())},
    "seoul_points_dist": {str(k): v / N for k, v in sorted(seoul_dist.items())},
    "ssb_points_dist": {str(k): v / N for k, v in sorted(ssb_dist.items())},
    "sfc_p_at_most": {str(t): sum(v for k, v in sfc_dist.items() if k <= t) / N for t in (57, 58, 59, 60, 61, 62, 63)},
    "r26_branch": {k: {kk: (vv / c["n"] if kk != "n" else vv / N) for kk, vv in c.items()} for k, c in branch.items()},
    "swing_rival_fixtures": swing,
    "seoul_own_fixtures": own,
    "tiebreak": {"p_level_with_sfc": level["level"] / N, "p_level_decides_2nd": level["decides_2nd"] / N,
                 "seoul_above_when_level": (level["seoul_above"] / level["decides_2nd"]) if level["decides_2nd"] else None,
                 "p_level_with_ssb": level_ssb / N},
    "promoted_pairs": {" + ".join(m.NAMES[s] for s in k): v / N for k, v in pairs.most_common()},
    "seoul_winout": {"share": len(winout) / N, "p_top2": (sum(top2(r, SEOUL) for r in winout) / len(winout)) if winout else None,
                     "p_first": (sum(r["order"][0] == SEOUL for r in winout) / len(winout)) if winout else None},
}
Path("research_dump/race_scenarios.json").write_text(json.dumps(out, indent=2, default=dict), encoding="utf-8")

# ---------------------------------------------------------------------------
print(f"Simulations: {N}")
for c in TOP3:
    print(f"\n{m.NAMES[c]}: sheet {dict(out['sheets'][c]['record'])} = {out['sheets'][c]['points']} pts, exp {out['sheets'][c]['exp_pts']}")
    for rnd, v in per_match[c].items():
        print(f"  R{rnd} {v['venue']} {v['opponent']:15} W {v['W']:.0%} D {v['D']:.0%} L {v['L']:.0%}  call {v['call']}  xG {v['xg_for']:.2f}-{v['xg_against']:.2f}  xPts {v['exp_pts']:.2f}")
print("\nP(Seoul top2 | Seoul pts):", out["seoul_top2_by_seoul_pts"])
print("95% safe total:", safe, " coin-flip total:", coinflip)
print("P(Seoul top2 | SFC band):", {k: (round(v['share'], 3), round(v['p'], 3)) for k, v in out["seoul_top2_by_sfc_band"].items()})
print("P(SFC <= t):", {k: round(v, 3) for k, v in out["sfc_p_at_most"].items()})
print("R26 branch:", {k: {kk: round(vv, 3) for kk, vv in v.items()} for k, v in out["r26_branch"].items()})
print("\nTop rival swings:")
for s in swing[:8]:
    print(f"  R{s['round']} {s['fixture']:32} rival {s['rival']:14} P(win) {s['p_rival_win']:.0%}  Seoul top2 if win {s['seoul_top2_if_rival_wins']:.0%} / if not {s['seoul_top2_if_not']:.0%}  swing {s['swing']:.0%}")
print("\nSeoul own fixtures:")
for s in own:
    print(f"  R{s['round']} {s['opponent']:15} P(win) {s['p_win']:.0%}  top2 if win {s['top2_if_win']:.0%} / if not {s['top2_if_not']:.0%}")
print("\nTiebreak:", {k: (round(v, 3) if v is not None else None) for k, v in out["tiebreak"].items()})
print("Promoted pairs:", {k: round(v, 3) for k, v in out["promoted_pairs"].items()})
print("Seoul win-out:", out["seoul_winout"])
