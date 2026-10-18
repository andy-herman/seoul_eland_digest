"""
Final Stretch Revisited: Monte Carlo simulation of Seoul E-Land's remaining
2026 K League 2 fixtures and of the promotion race.

Inputs (all hand-verified, see research_dump/r26_deepresearch.md and the
final-stretch dossiers): the post-Round 25 table, every remaining fixture
involving a promotion contender, per-club recent form, availability
adjustments and head-to-head nudges.

Model:
  * Baseline attack/defense strengths from season goals for/against per game,
    relative to the league average.
  * Recent form: last-five goals for/against blended into the season rates
    (FORM_WEIGHT).
  * Home advantage: league-wide home/away goal split.
  * Adjustments per fixture: availability (suspensions, injuries), motivation
    (relegation danger, dead rubbers), head-to-head nudges. All multiplicative
    on expected goals, all small, all listed in ADJUSTMENTS so they can be
    argued with.
  * Goals are Poisson draws with a Dixon-Coles low-score correction (RHO)
    that lifts 0-0 and 1-1 and trims 1-0 and 0-1, which is what real
    football does.
  * N_SIMS simulations of every remaining contender fixture give per-match
    W/D/L probabilities for Seoul and final-table probabilities for the
    six contenders.

Usage:
    venv/Scripts/python.exe scripts/simulate_final_stretch.py
"""

from __future__ import annotations

import json
import math
import random
from collections import Counter, defaultdict
from pathlib import Path

random.seed(20260907)

N_SIMS = 20000
FORM_WEIGHT = 0.35          # weight on last-five rates vs season rates
HOME_GOALS = 1.48           # league average home goals per match (2026 K2 split of 2.70)
AWAY_GOALS = 1.21
RHO = -0.10                 # Dixon-Coles low-score correlation

# ---------------------------------------------------------------------------
# Table after Round 29 (kleague.com teamRank, 2026-10-18).
# slug: (P, W, D, L, GF, GA)
# ---------------------------------------------------------------------------
TABLE = {
    "suwon-samsung": (27, 18, 5, 4, 46, 23),
    "suwon-fc": (27, 15, 9, 3, 53, 30),
    "seoul-e-land": (28, 16, 6, 6, 52, 32),
    "daegu": (27, 14, 7, 6, 51, 36),
    "busan-ipark": (28, 13, 6, 9, 44, 36),
    "hwaseong": (28, 12, 8, 8, 43, 31),
    "gimpo": (27, 9, 11, 7, 35, 32),
    "chungnam-asan": (27, 9, 9, 9, 35, 32),
    "gyeongnam": (27, 8, 11, 8, 31, 31),
    "cheongju": (28, 6, 14, 8, 35, 45),
    "seongnam": (27, 7, 10, 10, 30, 35),
    "paju": (27, 8, 6, 13, 26, 33),
    "yongin": (27, 5, 12, 10, 32, 41),
    "cheonan": (27, 5, 11, 11, 31, 37),
    "ansan": (28, 7, 4, 17, 32, 53),
    "jeonnam": (27, 5, 9, 13, 31, 46),
    "gimhae": (27, 2, 8, 17, 22, 56),
}
NAMES = {
    "suwon-samsung": "Suwon Samsung", "seoul-e-land": "Seoul E-Land", "suwon-fc": "Suwon FC",
    "daegu": "Daegu", "hwaseong": "Hwaseong", "busan-ipark": "Busan IPark",
    "chungnam-asan": "Chungnam Asan", "gimpo": "Gimpo", "gyeongnam": "Gyeongnam",
    "seongnam": "Seongnam", "yongin": "Yongin", "paju": "Paju", "cheongju": "Cheongju",
    "cheonan": "Cheonan", "ansan": "Ansan", "jeonnam": "Jeonnam", "gimhae": "Gimhae",
}
CONTENDERS = ["suwon-samsung", "seoul-e-land", "suwon-fc", "daegu", "hwaseong", "busan-ipark"]
# Chasers: 7th and 8th, both seven points behind 6th with a game in hand. Simulated so the
# playoff line (6th) is contested rather than assumed.
CHASERS = ["chungnam-asan", "gimpo"]
RANKED = CONTENDERS + CHASERS

# ---------------------------------------------------------------------------
# Last five league matches per club: (goals for, goals against) totals.
# Filled from the final-stretch research dossiers. Defaults to season rate.
# ---------------------------------------------------------------------------
LAST5 = {
    # slug: (GF5, GA5)  last five league matches through Round 29, from the official results
    "suwon-samsung": (14, 4),   # 4-1 at Gimpo, 2-0 Asan, 1-0 at Seoul, 4-1 Ansan, 3-2 Hwaseong
    "suwon-fc": (8, 3),         # 1-1 at Yongin, 1-1 Cheonan, 3-0 at Jeonnam, 1-0 Hwaseong, 2-1 at Seongnam
    "seoul-e-land": (11, 4),    # 2-0 at Cheongju, 0-1 Suwon Samsung, 2-1 Daegu, 1-0 at Gimpo, 6-2 Gimhae
    "daegu": (9, 5),            # 2-1 at Ansan, 0-0 at Paju, 3-1 Yongin, 1-2 at Seoul, 3-1 Cheongju
    "busan-ipark": (5, 4),      # 0-1 Ansan, 2-0 Gimhae, 0-1 at Gimpo, 1-1 at Paju, 2-1 Jeonnam
    "hwaseong": (7, 7),         # 1-1 at Cheonan, 2-0 at Ansan, 2-2 at Seongnam, 0-1 at Suwon FC, 2-3 at Suwon Samsung
    "gimpo": (8, 6),            # 1-2 Seongnam, 2-2 at Jeonnam, 1-0 Busan, 0-1 Seoul, 4-1 Paju
    "chungnam-asan": (4, 5),    # 0-2 at Suwon Samsung, 0-1 Cheongju, 3-1 Cheonan, 1-1 at Gimhae, 0-0 at Gyeongnam
    "gyeongnam": (2, 1),        # 1-0 Paju, 1-0 Seongnam, 0-0 at Yongin, 0-1 at Cheonan, 0-0 Asan
    "cheongju": (8, 8),         # 0-2 Seoul, 1-0 at Asan, 3-2 at Ansan, 3-1 Seongnam, 1-3 at Daegu
    "seongnam": (6, 9),         # 2-1 at Gimpo, 0-1 at Gyeongnam, 2-2 Hwaseong, 1-3 at Cheongju, 1-2 Suwon FC
    "paju": (4, 6),             # 0-1 at Gyeongnam, 0-0 Daegu, 2-0 at Gimhae, 1-1 Busan, 1-4 at Gimpo
    "yongin": (3, 10),          # 1-1 Suwon FC, 1-3 at Daegu, 0-0 Gyeongnam, 1-2 at Jeonnam, 0-4 Ansan
    "cheonan": (4, 6),          # 0-1 at Jeonnam, 1-1 Hwaseong, 1-1 at Suwon FC, 1-3 at Asan, 1-0 Gyeongnam
    "ansan": (8, 9),            # 1-0 at Busan, 0-2 Hwaseong, 2-3 Cheongju, 1-4 at Suwon Samsung, 4-0 at Yongin
    "jeonnam": (7, 10),         # 2-2 at Gimhae, 2-2 Gimpo, 0-3 Suwon FC, 2-1 Yongin, 1-2 at Busan
    "gimhae": (5, 13),          # 2-2 Jeonnam, 0-2 at Busan, 0-2 Paju, 1-1 Asan, 2-6 at Seoul
}

# ---------------------------------------------------------------------------
# Remaining fixtures involving a contender (mirrors site/src/data/seasonRivals.ts)
# ---------------------------------------------------------------------------
FIXTURES = [
    
    (30, "seongnam", "suwon-samsung"), (30, "busan-ipark", "gyeongnam"), (30, "paju", "hwaseong"),
    (30, "suwon-fc", "chungnam-asan"), (30, "jeonnam", "daegu"),
    (31, "daegu", "suwon-samsung"), (31, "yongin", "seoul-e-land"), (31, "gyeongnam", "hwaseong"),
    (31, "suwon-fc", "ansan"),
    (32, "seoul-e-land", "jeonnam"), (32, "suwon-samsung", "yongin"), (32, "cheonan", "busan-ipark"),
    (32, "gimhae", "hwaseong"), (32, "suwon-fc", "gyeongnam"), (32, "seongnam", "daegu"),
    (33, "seoul-e-land", "chungnam-asan"), (33, "suwon-samsung", "gyeongnam"), (33, "busan-ipark", "cheongju"),
    (33, "gimpo", "suwon-fc"), (33, "daegu", "gimhae"),
    (34, "gyeongnam", "seoul-e-land"), (34, "jeonnam", "suwon-samsung"), (34, "chungnam-asan", "busan-ipark"),
    (34, "gimpo", "hwaseong"), (34, "suwon-fc", "cheongju"), (34, "cheonan", "daegu"),
    # chaser-only fixtures (Chungnam Asan and Gimpo), from their dossiers
    (31, "chungnam-asan", "gimpo"), (32, "paju", "chungnam-asan"),
    (30, "gimpo", "gimhae"), (32, "gimpo", "ansan"),
]

# ---------------------------------------------------------------------------
# Per-fixture adjustments, multiplicative on expected goals.
# key: (round, home, away) -> {"home_att":1.0, "home_def":1.0, "away_att":1.0, "away_def":1.0, "why": "..."}
# def multiplier > 1 means the side concedes MORE (weaker defense).
# Filled from research; keep each factor within roughly 0.85..1.15.
# ---------------------------------------------------------------------------
ADJUSTMENTS: dict[tuple, dict] = {
    # ---- Seoul E-Land fixtures ----
    (31, "yongin", "seoul-e-land"): {
        "home_att": 0.96, "home_def": 1.04,
        "why": "Yongin cannot reach the top six (max 42, 6th already on 44) and are winless in five; "
               "home record 2W 7D 5L; lost 0-4 to Ansan Oct 17 and the manager signalled changes. "
               "GK Hwang Sung-min is back (started Oct 17)."},
    (32, "seoul-e-land", "jeonnam"): {
        "away_def": 1.06, "home_att": 0.98,
        "why": "Jeonnam concede 2.0 per game away (28 in 14, one away win all season) but are unbeaten "
               "in their last four visits to Mokdong; likely dead rubber for them."},
    (33, "seoul-e-land", "chungnam-asan"): {
        "away_att": 0.90,
        "why": "Asan score 0.91 per game away (10 in 11) and have lost their last four on the road; "
               "probably out of the playoff race by Nov 22."},
    (34, "gyeongnam", "seoul-e-land"): {
        "home_att": 1.00, "home_def": 0.96, "away_att": 1.03,
        "why": "Gyeongnam take 20 of 30 points at Changwon (4W 1D 1L last six at home) but should be safe "
               "and out of the race; Seoul unbeaten in five meetings, Gyeongnam 2 goals in those five."},
    # ---- rival fixtures ----
    (30, "suwon-fc", "chungnam-asan"): {"home_def": 0.94, "away_att": 0.90,
                                        "why": "Suwon FC home defense; Asan away attack (0.91 per game)."},
    (31, "suwon-fc", "ansan"): {"home_def": 0.94, "why": "Suwon FC home defense."},
    (32, "suwon-fc", "gyeongnam"): {"home_def": 0.94, "why": "Suwon FC home defense."},
    (34, "suwon-fc", "cheongju"): {"home_def": 0.94, "why": "Suwon FC home defense; possible final-day decider."},
    (33, "gimpo", "suwon-fc"): {"home_att": 0.92, "home_def": 1.05, "why": "Gimpo home weakness."},
    (34, "gimpo", "hwaseong"): {"home_att": 0.92, "home_def": 1.05, "why": "Gimpo home weakness."},
    (32, "gimhae", "hwaseong"): {"home_att": 0.92, "home_def": 1.08,
                                 "why": "Gimhae have never won a home league match (0W 3D 8L, 26 conceded in 11)."},
    (30, "jeonnam", "daegu"): {"home_def": 0.93, "why": "Jeonnam home defense."},
    (34, "jeonnam", "suwon-samsung"): {"home_def": 0.93, "why": "Jeonnam home defense; possible title decider for Suwon."},
    (34, "chungnam-asan", "busan-ipark"): {"home_att": 1.10, "why": "Asan score 1.75 per game at home (6W 4D 2L)."},
    (31, "gyeongnam", "hwaseong"): {"home_att": 1.06, "home_def": 0.96, "why": "Gyeongnam home strength."},
    # chaser fixtures
    (31, "chungnam-asan", "gimpo"): {"home_att": 1.10, "why": "Asan home attack."},
    (32, "paju", "chungnam-asan"): {"away_att": 0.90, "why": "Asan away attack."},
    (30, "gimpo", "gimhae"): {"home_att": 0.92, "home_def": 1.05, "why": "Gimpo home weakness."},
    (32, "gimpo", "ansan"): {"home_att": 0.92, "home_def": 1.05, "why": "Gimpo home weakness."},
}

# Club-level multipliers for the rest of the season (e.g. no home games left).
CLUB_ADJUST = {
    # slug: {"att": 1.0, "def": 1.0, "why": "..."}
    "daegu": {"att": 0.97, "why": "Edgar (8 goals) still out with a calf injury and no return date, but Deckers and "
                                  "Seraphim carried the attack in Round 26 (3-1), so the discount is smaller than before."},
    "gimpo": {"att": 0.93, "why": "Luis (10 of their goals) sold to Suwon Samsung on Aug 20; no replacement signed."},
    "hwaseong": {"att": 0.94, "why": "Hwaseong Sports Complex closed for renovation from September: all remaining "
                                     "fixtures away (home 1.81 ppg, away 1.38 ppg), no home training base."},
    "busan-ipark": {"att": 0.92, "why": "Top scorer Christian (8) banned 15 matches for drunk driving (Sep 10 committee), "
                                        "Kim Chan hamstring, Lee Ho-jin at U-20 qualifiers; the eight-match winless run "
                                        "ended against bottom club Gimhae."},
    "suwon-samsung": {"att": 0.97, "why": "Ko Seung-beom (fascia) and Bruno Silva (adductor) out with no return date; "
                                          "GK Kim Jun-hong at the Asian Games to Oct 4."},
}


def rates(slug: str):
    p, w, d, l, gf, ga = TABLE[slug]
    gf_pg, ga_pg = gf / p, ga / p
    if slug in LAST5:
        gf5, ga5 = LAST5[slug]
        gf_pg = (1 - FORM_WEIGHT) * gf_pg + FORM_WEIGHT * (gf5 / 5)
        ga_pg = (1 - FORM_WEIGHT) * ga_pg + FORM_WEIGHT * (ga5 / 5)
    return gf_pg, ga_pg


LEAGUE_GPG = sum(t[4] for t in TABLE.values()) / sum(t[0] for t in TABLE.values())  # goals per team-match


def strengths(slug: str):
    gf_pg, ga_pg = rates(slug)
    att = gf_pg / LEAGUE_GPG
    dfn = ga_pg / LEAGUE_GPG
    ca = CLUB_ADJUST.get(slug, {})
    return att * ca.get("att", 1.0), dfn * ca.get("def", 1.0)


def expected_goals(rnd, home, away):
    ah, dh = strengths(home)
    aa, da = strengths(away)
    adj = ADJUSTMENTS.get((rnd, home, away), {})
    lam_h = HOME_GOALS * ah * da * adj.get("home_att", 1.0) * adj.get("away_def", 1.0)
    lam_a = AWAY_GOALS * aa * dh * adj.get("away_att", 1.0) * adj.get("home_def", 1.0)
    return lam_h, lam_a


def poisson(lam: float) -> int:
    # Knuth
    L = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        p *= random.random()
        if p <= L:
            return k
        k += 1


def dc_weight(h: int, a: int, lh: float, la: float) -> float:
    if h == 0 and a == 0:
        return 1 - lh * la * RHO
    if h == 1 and a == 0:
        return 1 + la * RHO
    if h == 0 and a == 1:
        return 1 + lh * RHO
    if h == 1 and a == 1:
        return 1 - RHO
    return 1.0


def sample_score(lh: float, la: float):
    # rejection sampling with Dixon-Coles weights (weights are within ~0.85..1.15)
    while True:
        h, a = poisson(lh), poisson(la)
        w = dc_weight(h, a, lh, la)
        if random.random() < w / 1.2:
            return h, a


def coherent_sheet(per_match: dict) -> dict:
    """
    Published call sheet. Eight independent "most likely" results do not add up
    to a season projection (eight favorites' wins would read 69 points against an
    expected 60), so the sheet is built the way the July preview was: a predicted
    RECORD first, then each result placed where it is most likely.

    Composition: of every (W, D, L) record whose points equal the floor or
    ceiling of the model's expected points, the one closest to the expected
    record. Within that
    composition, the assignment with the highest joint probability wins.
    """
    import itertools
    rounds = list(per_match)
    n = len(rounds)
    exp_pts = sum(per_match[r]["exp_pts"] for r in rounds)
    exp_w = sum(per_match[r]["W"] for r in rounds)
    exp_d = sum(per_match[r]["D"] for r in rounds)
    exp_l = sum(per_match[r]["L"] for r in rounds)
    # composition: among all (W, D, L) whose points equal the floor or ceiling of expected
    # points, the record closest to the expected record (so a 3.5-1.4-1.1 expectation
    # becomes 3-2-1 rather than a draw-less 4-0-2 that happens to hit the rounded total)
    targets = {math.floor(exp_pts), math.ceil(exp_pts)}
    comps = [(w, d, n - w - d) for w in range(n + 1) for d in range(n + 1 - w) if 3 * w + d in targets]
    wins, draws, losses = min(comps, key=lambda c: (c[0] - exp_w) ** 2 + (c[1] - exp_d) ** 2 + (c[2] - exp_l) ** 2)
    target = 3 * wins + draws
    best = None
    for combo in itertools.product("WDL", repeat=n):
        if sum({"W": 3, "D": 1, "L": 0}[c] for c in combo) != target:
            continue
        if wins is not None and (combo.count("W"), combo.count("D"), combo.count("L")) != (wins, draws, losses):
            continue
        ll = sum(math.log(max(per_match[r][c], 1e-9)) for r, c in zip(rounds, combo))
        if best is None or ll > best[0]:
            best = (ll, combo)
    return dict(zip(rounds, best[1]))


def outcome_for(slug, home, away, h, a):
    if h == a:
        return "D"
    winner = home if h > a else away
    return "W" if winner == slug else "L"


def main():
    seoul = "seoul-e-land"
    seoul_fx = [f for f in FIXTURES if seoul in f[1:]]

    # Per-match probabilities for Seoul
    per_match = {}
    for rnd, home, away in seoul_fx:
        lh, la = expected_goals(rnd, home, away)
        tally = Counter()
        scores = Counter()
        clean = 0
        btts = 0
        for _ in range(N_SIMS):
            h, a = sample_score(lh, la)
            tally[outcome_for(seoul, home, away, h, a)] += 1
            scores[(h, a)] += 1
            opp_goals = a if home == seoul else h
            own_goals = h if home == seoul else a
            clean += opp_goals == 0
            btts += opp_goals > 0 and own_goals > 0
        per_match[rnd] = {
            "home": home, "away": away, "xg_home": round(lh, 2), "xg_away": round(la, 2),
            "W": tally["W"] / N_SIMS, "D": tally["D"] / N_SIMS, "L": tally["L"] / N_SIMS,
            "most_likely": max("WDL", key=lambda o: tally[o]),
            "xg_seoul": round(lh if home == seoul else la, 2),
            "xg_opp": round(la if home == seoul else lh, 2),
            "p_clean_sheet": clean / N_SIMS,
            "p_btts": btts / N_SIMS,
            "exp_pts": (3 * tally["W"] + tally["D"]) / N_SIMS,
            "why": ADJUSTMENTS.get((rnd, home, away), {}).get("why", ""),
            "_scores": scores,
        }

    sheet = coherent_sheet(per_match)
    for rnd, m in per_match.items():
        call = sheet[rnd]
        scores = m.pop("_scores")
        best = max((sc for sc in scores if outcome_for(seoul, m["home"], m["away"], *sc) == call),
                   key=lambda sc: scores[sc])
        m["call"] = call
        m["likely_score"] = f"{best[0]}-{best[1]}"

    # Season simulation for the contenders
    base_pts = {s: TABLE[s][1] * 3 + TABLE[s][2] for s in TABLE}
    base_gf = {s: TABLE[s][4] for s in TABLE}
    base_gd = {s: TABLE[s][4] - TABLE[s][5] for s in TABLE}
    lam_cache = {f: expected_goals(*f) for f in FIXTURES}
    finish = {s: Counter() for s in RANKED}
    final_pts = {s: [] for s in RANKED}
    top2 = Counter()
    seoul_pts_dist = Counter()
    for _ in range(N_SIMS):
        pts = dict(base_pts); gf = dict(base_gf); gd = dict(base_gd)
        for (rnd, home, away), (lh, la) in lam_cache.items():
            h, a = sample_score(lh, la)
            gf[home] += h; gf[away] += a; gd[home] += h - a; gd[away] += a - h
            if h > a:
                pts[home] += 3
            elif a > h:
                pts[away] += 3
            else:
                pts[home] += 1; pts[away] += 1
        # K League order: points, goals scored, goal difference
        order = sorted(RANKED, key=lambda s: (pts[s], gf[s], gd[s]), reverse=True)
        for pos, s in enumerate(order, 1):
            finish[s][pos] += 1
            final_pts[s].append(pts[s])
        top2[tuple(order[:2])] += 1
        seoul_pts_dist[pts[seoul]] += 1

    out = {
        "n_sims": N_SIMS,
        "per_match": per_match,
        "seoul_expected_final": round(sum(final_pts[seoul]) / N_SIMS, 1),
        "seoul_median_final": sorted(final_pts[seoul])[N_SIMS // 2],
        "seoul_p_first": finish[seoul][1] / N_SIMS,
        "seoul_p_top2": (finish[seoul][1] + finish[seoul][2]) / N_SIMS,
        "seoul_p_top6": sum(finish[seoul][i] for i in range(1, 7)) / N_SIMS,
        "contenders": {
            s: {
                "expected_final": round(sum(final_pts[s]) / N_SIMS, 1),
                "p_first": finish[s][1] / N_SIMS,
                "p_top2": (finish[s][1] + finish[s][2]) / N_SIMS,
                "p_top6": sum(finish[s][i] for i in range(1, 7)) / N_SIMS,
                "positions": {str(k): v / N_SIMS for k, v in sorted(finish[s].items())},
            }
            for s in RANKED
        },
        "seoul_points_distribution": {str(k): v / N_SIMS for k, v in sorted(seoul_pts_dist.items())},
    }
    Path("research_dump").mkdir(exist_ok=True)
    Path("research_dump/final_stretch_simulation.json").write_text(json.dumps(out, indent=2), encoding="utf-8")

    print(f"Simulations: {N_SIMS}  | league goals per team-match {LEAGUE_GPG:.3f}")
    print("\nSeoul per match:")
    for rnd, m in per_match.items():
        venue = "H" if m["home"] == seoul else "A"
        opp = NAMES[m["away"] if venue == "H" else m["home"]]
        print(f"  R{rnd} {venue} {opp:16} xG {m['xg_home']:.2f}-{m['xg_away']:.2f}  "
              f"W {m['W']:.0%} D {m['D']:.0%} L {m['L']:.0%}  likeliest {m['most_likely']}  call {m['call']}  "
              f"xG {m['xg_seoul']:.2f}-{m['xg_opp']:.2f}  CS {m['p_clean_sheet']:.0%}  xPts {m['exp_pts']:.2f}")
    print(f"\nSeoul expected final {out['seoul_expected_final']} (median {out['seoul_median_final']}), "
          f"P(1st) {out['seoul_p_first']:.1%}, P(top2) {out['seoul_p_top2']:.1%}, P(top6) {out['seoul_p_top6']:.1%}")
    print("\nContenders and chasers:")
    for s in RANKED:
        c = out["contenders"][s]
        print(f"  {NAMES[s]:16} exp {c['expected_final']:5.1f}  P1 {c['p_first']:.1%}  Ptop2 {c['p_top2']:.1%}  Ptop6 {c['p_top6']:.1%}")


if __name__ == "__main__":
    main()
