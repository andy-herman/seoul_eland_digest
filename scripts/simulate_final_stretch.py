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
# Post-Round 25 table (triple-verified). slug: (P, W, D, L, GF, GA)
# ---------------------------------------------------------------------------
TABLE = {
    "suwon-samsung": (24, 15, 5, 4, 38, 20),
    "seoul-e-land":  (24, 13, 6, 5, 43, 28),
    "suwon-fc":      (23, 12, 8, 3, 46, 28),
    "daegu":         (24, 12, 7, 5, 44, 32),
    "hwaseong":      (24, 11, 7, 6, 37, 25),
    "busan-ipark":   (24, 11, 5, 8, 39, 33),
    "chungnam-asan": (23, 8, 7, 8, 31, 29),
    "gimpo":         (23, 7, 10, 6, 28, 28),
    "gyeongnam":     (23, 7, 9, 7, 30, 30),
    "seongnam":      (23, 7, 9, 7, 26, 27),
    "yongin":        (23, 5, 11, 7, 30, 32),
    "paju":          (24, 7, 5, 12, 22, 28),
    "cheongju":      (24, 3, 14, 7, 27, 39),
    "cheonan":       (24, 4, 10, 10, 28, 33),
    "ansan":         (24, 6, 4, 14, 25, 44),
    "jeonnam":       (23, 4, 8, 11, 26, 38),
    "gimhae":        (23, 2, 7, 14, 19, 45),
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
    # slug: (GF5, GA5)  from research_dump/final_stretch/*.md (post-R25)
    "seoul-e-land": (7, 3),     # 0-0 Hwaseong, 3-1 Ansan, 1-1 Paju, 1-1 Seongnam, 2-0 Cheongju
    "suwon-samsung": (10, 4),   # 1-0 Gimhae, 2-2 Suwon FC, 1-0 Cheonan, 4-1 Gimpo, 2-0 Asan
    "daegu": (4, 2),            # 3 clean sheets in 5, 0.8 scored per game since Edgar's injury
    "gimhae": (3, 9),
    "yongin": (9, 5),           # 2W 2D 1L since Aug 1, Vitinho bedded in
    "gyeongnam": (4, 4),        # 1W 3D 1L, Kim Hyun-o 3 of the 4
    "jeonnam": (6, 6),          # 1-2 Paju, 1-2 Cheongju, 1-0 Hwaseong, 1-0 Cheonan, 2-2 Gimhae
    "gimpo": (7, 8),            # 1-1, 3-0, 1-1, 1-4, 1-2; defense leaking since Luis and Kim Kyul left
    "chungnam-asan": (5, 6),    # 2-0, 1-1, 0-2, 2-1, 0-2
    "hwaseong": (3, 3),         # 0-0 Seoul, 0-0 Busan, 0-1 Jeonnam, 2-1 Cheongju, 1-1 Cheonan
    "suwon-fc": (8, 5),         # 1-0 Paju, 2-2 Suwon Samsung, 2-0 Gimhae, 2-1 Busan, 1-1 Yongin
    "busan-ipark": (2, 6),      # 0-2 Yongin, 0-0 Hwaseong, 1-1 Daegu, 1-2 Suwon FC, 0-1 Ansan
}

# ---------------------------------------------------------------------------
# Remaining fixtures involving a contender (mirrors site/src/data/seasonRivals.ts)
# ---------------------------------------------------------------------------
FIXTURES = [
    (26, "seoul-e-land", "suwon-samsung"), (26, "busan-ipark", "gimhae"), (26, "ansan", "hwaseong"),
    (26, "suwon-fc", "cheonan"), (26, "daegu", "yongin"),
    (27, "seoul-e-land", "daegu"), (27, "gimpo", "busan-ipark"), (27, "seongnam", "hwaseong"),
    (27, "jeonnam", "suwon-fc"),
    (28, "suwon-fc", "hwaseong"), (28, "gimpo", "seoul-e-land"), (28, "suwon-samsung", "ansan"),
    (28, "paju", "busan-ipark"),
    (29, "suwon-samsung", "hwaseong"), (29, "seoul-e-land", "gimhae"), (29, "busan-ipark", "jeonnam"),
    (29, "seongnam", "suwon-fc"), (29, "daegu", "cheongju"),
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
    (26, "chungnam-asan", "cheongju"), (27, "chungnam-asan", "cheonan"), (28, "gimhae", "chungnam-asan"),
    (29, "gyeongnam", "chungnam-asan"), (31, "chungnam-asan", "gimpo"), (32, "paju", "chungnam-asan"),
    (26, "jeonnam", "gimpo"), (29, "gimpo", "paju"), (30, "gimpo", "gimhae"), (32, "gimpo", "ansan"),
]

# ---------------------------------------------------------------------------
# Per-fixture adjustments, multiplicative on expected goals.
# key: (round, home, away) -> {"home_att":1.0, "home_def":1.0, "away_att":1.0, "away_def":1.0, "why": "..."}
# def multiplier > 1 means the side concedes MORE (weaker defense).
# Filled from research; keep each factor within roughly 0.85..1.15.
# ---------------------------------------------------------------------------
ADJUSTMENTS: dict[tuple, dict] = {
    # ---- Seoul E-Land fixtures ----
    (26, "seoul-e-land", "suwon-samsung"): {
        "away_att": 0.94, "away_def": 1.05, "home_att": 1.02,
        "why": "Suwon without Ko Seung-beom and Bruno Silva (Lee Jung-hyo: next match doubtful) and "
               "starting GK Kim Jun-hong at the Asian Games; Seoul 2-1 at Mokdong in this fixture."},
    (27, "seoul-e-land", "daegu"): {
        "away_def": 1.02,
        "why": "Edgar (8 goals) out with a calf injury, no return date (club-level factor); Hwang Jae-won's "
               "R25 red may extend past R26; Seoul won 3-1 at Daegu in March."},
    (28, "gimpo", "seoul-e-land"): {
        "home_att": 0.90, "home_def": 1.06,
        "why": "Gimpo have one home win in nine (0.89 ppg at Solteo vs 1.64 away); Seoul unbeaten in the "
               "last four meetings with a Gimpo red card in each of the last two."},
    (29, "seoul-e-land", "gimhae"): {
        "away_att": 0.95,
        "why": "Woo Je-uk (3 goals in 3 after signing) injured since R22; Gimhae safe from relegation "
               "with nothing to play for by mid-October."},
    (31, "yongin", "seoul-e-land"): {
        "home_att": 0.96, "home_def": 1.04,
        "why": "GK Hwang Sung-min hurt Sep 5, severity unreported; Yongin likely mid-table with only an "
               "8th-place target by Oct 31; home record 2W 6D 4L."},
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
    (26, "suwon-fc", "cheonan"): {"home_att": 0.92, "home_def": 0.94,
                                  "why": "Frizzo (13 goals) doubtful after losing consciousness in a Sep 5 collision; "
                                         "Suwon FC concede 0.9 per game at home (6W 4D 0L)."},
    (28, "suwon-fc", "hwaseong"): {"home_def": 0.94, "why": "Suwon FC home defense (9 conceded in 10)."},
    (30, "suwon-fc", "chungnam-asan"): {"home_def": 0.94, "away_att": 0.90,
                                        "why": "Suwon FC home defense; Asan away attack (0.91 per game)."},
    (31, "suwon-fc", "ansan"): {"home_def": 0.94, "why": "Suwon FC home defense."},
    (32, "suwon-fc", "gyeongnam"): {"home_def": 0.94, "why": "Suwon FC home defense."},
    (34, "suwon-fc", "cheongju"): {"home_def": 0.94, "why": "Suwon FC home defense; possible final-day decider."},
    (26, "daegu", "yongin"): {"home_att": 0.97, "why": "Hwang Jae-won suspended (R25 red)."},
    (27, "gimpo", "busan-ipark"): {"home_att": 0.92, "home_def": 1.05, "why": "Gimpo home weakness."},
    (33, "gimpo", "suwon-fc"): {"home_att": 0.92, "home_def": 1.05, "why": "Gimpo home weakness."},
    (34, "gimpo", "hwaseong"): {"home_att": 0.92, "home_def": 1.05, "why": "Gimpo home weakness."},
    (32, "gimhae", "hwaseong"): {"home_att": 0.92, "home_def": 1.08,
                                 "why": "Gimhae have never won a home league match (0W 3D 8L, 26 conceded in 11)."},
    (29, "busan-ipark", "jeonnam"): {"away_def": 1.06, "why": "Jeonnam away defense (2.0 conceded per game)."},
    (27, "jeonnam", "suwon-fc"): {"home_def": 0.93, "why": "Jeonnam concede 1.1 per game at Gwangyang vs 1.65 overall."},
    (30, "jeonnam", "daegu"): {"home_def": 0.93, "why": "Jeonnam home defense."},
    (34, "jeonnam", "suwon-samsung"): {"home_def": 0.93, "why": "Jeonnam home defense; possible title decider for Suwon."},
    (34, "chungnam-asan", "busan-ipark"): {"home_att": 1.10, "why": "Asan score 1.75 per game at home (6W 4D 2L)."},
    (31, "gyeongnam", "hwaseong"): {"home_att": 1.06, "home_def": 0.96, "why": "Gyeongnam home strength."},
    # chaser fixtures
    (26, "chungnam-asan", "cheongju"): {"home_att": 1.10, "why": "Asan home attack."},
    (27, "chungnam-asan", "cheonan"): {"home_att": 1.10, "why": "Asan home attack."},
    (28, "gimhae", "chungnam-asan"): {"home_att": 0.92, "home_def": 1.08, "away_att": 0.90,
                                     "why": "Gimhae home record; Asan away attack."},
    (29, "gyeongnam", "chungnam-asan"): {"home_att": 1.06, "home_def": 0.96, "away_att": 0.90,
                                        "why": "Gyeongnam home strength; Asan away attack."},
    (31, "chungnam-asan", "gimpo"): {"home_att": 1.10, "why": "Asan home attack."},
    (32, "paju", "chungnam-asan"): {"away_att": 0.90, "why": "Asan away attack."},
    (26, "jeonnam", "gimpo"): {"home_def": 0.93, "why": "Jeonnam home defense."},
    (29, "gimpo", "paju"): {"home_att": 0.92, "home_def": 1.05, "why": "Gimpo home weakness."},
    (30, "gimpo", "gimhae"): {"home_att": 0.92, "home_def": 1.05, "why": "Gimpo home weakness."},
    (32, "gimpo", "ansan"): {"home_att": 0.92, "home_def": 1.05, "why": "Gimpo home weakness."},
}

# Club-level multipliers for the rest of the season (e.g. no home games left).
CLUB_ADJUST = {
    # slug: {"att": 1.0, "def": 1.0, "why": "..."}
    "daegu": {"att": 0.95, "why": "Edgar (top scorer, 8) out with a calf injury and no return date; attack "
                                  "leans on 36-year-old Cesinha, 0.8 goals per game in the last five."},
    "gimpo": {"att": 0.93, "why": "Luis (10 of their 26 goals) sold to Suwon Samsung on Aug 20; no replacement signed."},
    "hwaseong": {"att": 0.94, "why": "Hwaseong Sports Complex closed for renovation from September: all remaining "
                                     "fixtures away (home 1.81 ppg, away 1.38 ppg, 1.13 goals per away game), and no "
                                     "home training base during the works."},
    "busan-ipark": {"att": 0.94, "why": "Eight league games without a win since Jul 18 (2D 6L, 4 scored in 8); "
                                        "summer window did not deliver the reinforcements Cho Sung-hwan asked for; "
                                        "supporters in open protest."},
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


DRAW_TOLERANCE = 0.06   # if win and loss probabilities are within this, the honest call is a draw


def call_for(tally) -> str:
    """Published call: most likely outcome, except a near coin-flip is called a draw."""
    p = {o: tally[o] / N_SIMS for o in "WDL"}
    call = max("WDL", key=lambda o: p[o])
    if call != "D" and abs(p["W"] - p["L"]) < DRAW_TOLERANCE:
        return "D"
    return call


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
        for _ in range(N_SIMS):
            h, a = sample_score(lh, la)
            tally[outcome_for(seoul, home, away, h, a)] += 1
            scores[(h, a)] += 1
        call = call_for(tally)
        # most likely score consistent with the published call (a 1-1 under a "W" call reads wrong)
        best = max(
            (sc for sc in scores if outcome_for(seoul, home, away, *sc) == call),
            key=lambda sc: scores[sc],
        )
        per_match[rnd] = {
            "home": home, "away": away, "xg_home": round(lh, 2), "xg_away": round(la, 2),
            "W": tally["W"] / N_SIMS, "D": tally["D"] / N_SIMS, "L": tally["L"] / N_SIMS,
            "likely_score": f"{best[0]}-{best[1]}",
            "call": call,
            "exp_pts": (3 * tally["W"] + tally["D"]) / N_SIMS,
            "why": ADJUSTMENTS.get((rnd, home, away), {}).get("why", ""),
        }

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
              f"W {m['W']:.0%} D {m['D']:.0%} L {m['L']:.0%}  call {m['call']}  likely {m['likely_score']}  xPts {m['exp_pts']:.2f}")
    print(f"\nSeoul expected final {out['seoul_expected_final']} (median {out['seoul_median_final']}), "
          f"P(1st) {out['seoul_p_first']:.1%}, P(top2) {out['seoul_p_top2']:.1%}, P(top6) {out['seoul_p_top6']:.1%}")
    print("\nContenders and chasers:")
    for s in RANKED:
        c = out["contenders"][s]
        print(f"  {NAMES[s]:16} exp {c['expected_final']:5.1f}  P1 {c['p_first']:.1%}  Ptop2 {c['p_top2']:.1%}  Ptop6 {c['p_top6']:.1%}")


if __name__ == "__main__":
    main()
