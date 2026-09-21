"""
Chasing K1 Weekly: the numbers block for the weekly promotion-race letter.

Reuses the model in simulate_final_stretch.py (same table, form, adjustments)
and produces, for the coming round and every round after it:

  * each contender's fixture (Suwon Samsung, Suwon FC, Daegu, Hwaseong, Seoul)
    with the model's W/D/L and expected points
  * Seoul's chance of finishing in the top two, now and conditional on each
    result in Seoul's next match
  * a history of the headline number, appended to research_dump/chasing_k1_history.json,
    so each edition can show the week-by-week trajectory

Usage:
    venv/Scripts/python.exe scripts/chasing_k1_weekly.py [--label "Week of 2026-09-21"]

Prints a Markdown block to paste into the edition and writes
research_dump/chasing_k1_weekly.json.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import simulate_final_stretch as m  # noqa: E402

random.seed(20260921)
N = 20000
WATCH = ["suwon-samsung", "suwon-fc", "daegu", "hwaseong", "seoul-e-land"]
SEOUL = "seoul-e-land"

# Kickoff dates for the remaining rounds, club-published (see research_dump/r27, r28).
# Rounds without a date yet fall back to the round weekend.
ROUND_WEEKEND = {28: "Oct 9-11", 29: "Oct 17-18", 30: "Oct 24-25", 31: "Oct 31-Nov 1", 32: "Nov 7-8", 33: "Nov 21-22", 34: "Nov 28-29"}
KICKOFF = {
    (28, "gimpo", "seoul-e-land"): "Fri Oct 9 16:30",
    (28, "suwon-fc", "hwaseong"): "Fri Oct 9 14:00",
    (28, "suwon-samsung", "ansan"): "Sun Oct 11 14:00",
    (28, "paju", "busan-ipark"): "Sat Oct 10 14:00",
    (29, "seoul-e-land", "gimhae"): "Sun Oct 18 14:00",
    (29, "suwon-samsung", "hwaseong"): "Sun Oct 18 14:00",
    (29, "seongnam", "suwon-fc"): "Sat Oct 17 14:00",
    (29, "daegu", "cheongju"): "Sat Oct 17",
    (30, "suwon-fc", "chungnam-asan"): "Sun Oct 25 14:00",
    (30, "paju", "hwaseong"): "Sun Oct 25 16:30",
    (30, "jeonnam", "daegu"): "Sat Oct 24 14:00",
    (31, "yongin", "seoul-e-land"): "Sat Oct 31 14:00",
    (31, "daegu", "suwon-samsung"): "Sat Oct 31 16:30",
    (31, "gyeongnam", "hwaseong"): "Sat Oct 31 14:00",
    (32, "seoul-e-land", "jeonnam"): "Sat Nov 7 16:30",
    (32, "suwon-fc", "gyeongnam"): "Sat Nov 7 14:00",
    (33, "seoul-e-land", "chungnam-asan"): "Sun Nov 22 16:30",
    (33, "gimpo", "suwon-fc"): "Sat Nov 21 16:30",
}

base_pts = {s: m.TABLE[s][1] * 3 + m.TABLE[s][2] for s in m.TABLE}
base_gf = {s: m.TABLE[s][4] for s in m.TABLE}
base_gd = {s: m.TABLE[s][4] - m.TABLE[s][5] for s in m.TABLE}
lam = {f: m.expected_goals(*f) for f in m.FIXTURES}


def wdl(club, f):
    rnd, home, away = f
    lh, la = lam[f]
    t = Counter()
    for _ in range(N):
        h, a = m.sample_score(lh, la)
        t[m.outcome_for(club, home, away, h, a)] += 1
    return {k: t[k] / N for k in "WDL"}


# Per-round fixture cards for the watched clubs
rounds = sorted({f[0] for f in m.FIXTURES})
cards = {r: [] for r in rounds}
for f in m.FIXTURES:
    rnd, home, away = f
    for club in WATCH:
        if club not in (home, away):
            continue
        p = wdl(club, f)
        cards[rnd].append({
            "club": m.NAMES[club], "slug": club,
            "opponent": m.NAMES[away if home == club else home],
            "venue": "H" if home == club else "A",
            "kickoff": KICKOFF.get(f, ROUND_WEEKEND.get(rnd, "")),
            "W": p["W"], "D": p["D"], "L": p["L"],
            "xpts": 3 * p["W"] + p["D"],
        })
for r in rounds:
    for club in WATCH:
        if not any(c["slug"] == club for c in cards[r]):
            cards[r].append({"club": m.NAMES[club], "slug": club, "opponent": "bye", "venue": "", "kickoff": "", "W": None, "D": None, "L": None, "xpts": 0.0})
    cards[r].sort(key=lambda c: WATCH.index(c["slug"]))

# Joint season simulation: headline probabilities and the next-match branch
next_fx = min((f for f in m.FIXTURES if SEOUL in f[1:]), key=lambda f: f[0])
branch = defaultdict(Counter)
finish = {s: Counter() for s in m.RANKED}
pts_hist = {s: [] for s in WATCH}
for _ in range(N):
    pts = dict(base_pts); gf = dict(base_gf); gd = dict(base_gd)
    res = {}
    for (rnd, home, away), (lh, la) in lam.items():
        h, a = m.sample_score(lh, la)
        gf[home] += h; gf[away] += a; gd[home] += h - a; gd[away] += a - h
        if h > a:
            pts[home] += 3
        elif a > h:
            pts[away] += 3
        else:
            pts[home] += 1; pts[away] += 1
        res[(rnd, home, away)] = (h, a)
    order = sorted(m.RANKED, key=lambda s: (pts[s], gf[s], gd[s]), reverse=True)
    for i, s in enumerate(order, 1):
        finish[s][i] += 1
    for s in WATCH:
        pts_hist[s].append(pts[s])
    h, a = res[next_fx]
    sg, og = (h, a) if next_fx[1] == SEOUL else (a, h)
    key = "W" if sg > og else "D" if sg == og else "L"
    b = branch[key]
    b["n"] += 1
    b["seoul_top2"] += SEOUL in order[:2]
    b["sfc_top2"] += "suwon-fc" in order[:2]
    b["daegu_top2"] += "daegu" in order[:2]

top2 = {s: (finish[s][1] + finish[s][2]) / N for s in WATCH}
first = {s: finish[s][1] / N for s in WATCH}
exp = {s: round(sum(pts_hist[s]) / N, 1) for s in WATCH}
branch_out = {k: {kk: (v / b["n"] if kk != "n" else v / N) for kk, v in b.items()} for k, b in branch.items()}

parser = argparse.ArgumentParser()
parser.add_argument("--label", default=f"Week of {date.today().isoformat()}")
args = parser.parse_args()

out = {
    "label": args.label, "generated": date.today().isoformat(), "next_round": rounds[0],
    "next_fixture": {"round": next_fx[0], "home": m.NAMES[next_fx[1]], "away": m.NAMES[next_fx[2]]},
    "top2": top2, "first": first, "expected_final": exp, "branch": branch_out,
    "cards": {str(r): cards[r] for r in rounds},
}
Path("research_dump/chasing_k1_weekly.json").write_text(json.dumps(out, indent=2), encoding="utf-8")

hist_path = Path("research_dump/chasing_k1_history.json")
hist = json.loads(hist_path.read_text(encoding="utf-8")) if hist_path.exists() else []
hist = [h for h in hist if h["label"] != args.label]
hist.append({"label": args.label, "date": date.today().isoformat(), "through_round": rounds[0] - 1,
             "seoul_top2": round(top2[SEOUL], 3), "sfc_top2": round(top2["suwon-fc"], 3), "daegu_top2": round(top2["daegu"], 3),
             "hwaseong_top2": round(top2["hwaseong"], 3), "ssb_first": round(first["suwon-samsung"], 3),
             "seoul_exp": exp[SEOUL], "sfc_exp": exp["suwon-fc"]})
hist.sort(key=lambda h: h["date"])
hist_path.write_text(json.dumps(hist, indent=2), encoding="utf-8")

# ---- Markdown block ----
pct = lambda x: f"{x:.0%}"
print(f"## The number this week\n")
print(f"Seoul top two: **{pct(top2[SEOUL])}** (Suwon FC {pct(top2['suwon-fc'])}, Daegu {pct(top2['daegu'])}, Hwaseong {pct(top2['hwaseong'])}; Suwon Samsung title {pct(first['suwon-samsung'])}). Projected finals: " + ", ".join(f"{m.NAMES[s]} {exp[s]}" for s in WATCH) + ".\n")
print("| Edition | Through | Seoul top two | Suwon FC top two | Daegu top two | Seoul proj. | Suwon FC proj. |")
print("|---|---|---|---|---|---|---|")
for h in hist:
    print(f"| {h['label']} | R{h['through_round']} | {pct(h['seoul_top2'])} | {pct(h['sfc_top2'])} | {pct(h['daegu_top2'])} | {h['seoul_exp']} | {h['sfc_exp']} |")
print()
nf = out["next_fixture"]
print(f"## Seoul's next match: R{nf['round']} {nf['home']} v {nf['away']}\n")
print("| Result | Chance | Seoul top two | Suwon FC top two | Daegu top two |")
print("|---|---|---|---|---|")
for k, lab in (("W", "Seoul win"), ("D", "Draw"), ("L", "Seoul lose")):
    b = branch_out.get(k, {})
    print(f"| {lab} | {pct(b.get('n', 0))} | {pct(b.get('seoul_top2', 0))} | {pct(b.get('sfc_top2', 0))} | {pct(b.get('daegu_top2', 0))} |")
print()
for r in rounds:
    print(f"## Round {r} ({ROUND_WEEKEND.get(r, '')})\n")
    print("| Club | Fixture | Kickoff | Win | Draw | Loss | Exp. pts |")
    print("|---|---|---|---|---|---|---|")
    for c in cards[r]:
        if c["opponent"] == "bye":
            print(f"| {c['club']} | bye | | | | | |")
        else:
            print(f"| {c['club']} | {c['opponent']} ({c['venue']}) | {c['kickoff']} | {pct(c['W'])} | {pct(c['D'])} | {pct(c['L'])} | {c['xpts']:.2f} |")
    print()
