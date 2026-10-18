"""
Run-in predictor (October 2026): a fuller model of every remaining K League 2
fixture, built to test which match factors actually carry information.

Factors and how each enters:
  * Team strength and recent form: attack and defense ratings fitted by
    weighted Poisson maximum likelihood on every K League 2 match since 2024,
    with exponential time decay (the half-life is chosen by backtest), so
    recent matches count most.
  * Home and away: a league-wide home advantage plus a small club-specific
    home effect (heavily shrunk).
  * Head-to-head: the venue-adjusted goal difference of previous meetings
    since 2024, shrunk toward zero; its weight is chosen by backtest.
  * Weather: rain, cold and wind at kickoff (Open-Meteo reanalysis for played
    matches) as effects on total goals. Future matches use the forecast where
    one exists, blended with ten years of climatology for that venue and date.
  * Coaches: clubs that changed head coach this season get separate attack
    and defense offsets for matches under the new coach (shrunk).
  * Referees: each referee's booking rate (shrunk to the league mean) feeds
    the card model; future assignments are unknown, so each simulated match
    draws a referee from the active pool. A referee effect on goals is tested
    in the backtest.
  * Player condition and cards: known absences from research; every yellow
    card is simulated for players who can reach a ban (5th caution, 8th, then
    every 2nd), and red cards for every side, so suspensions arise inside the
    simulation and weaken the team for the next match.
  * Draws: a Dixon-Coles low-score correction plus a draw calibration. K League 2
    has drawn about 30 percent of matches three seasons running (2024-2026),
    which a plain goals model underrates; both settings were chosen by backtest.

Usage:
    uv run --with numpy --with scipy python scripts/run_in_predictor.py --backtest
    uv run --with numpy --with scipy python scripts/run_in_predictor.py --sims 250000
Inputs:  research_dump/predictor/{schedules,club_records,match_info,recent_apps,weather,context}.json
         (refresh with scripts/predictor_fetch.py; context.json is edited by hand)
Chasing K1 (from 2026-10-18) reads the "chasing_k1" block; --cutoff reruns the model as of an
earlier moment, for a like-for-like comparison with the previous week.
Output:  research_dump/predictor/run_in_predictor.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.stats import poisson

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "research_dump" / "predictor"
SEOUL = "K31"

SLUG = {
    "K02": "suwon-samsung", "K06": "busan-ipark", "K07": "jeonnam", "K08": "seongnam", "K17": "daegu",
    "K20": "gyeongnam", "K29": "suwon-fc", "K31": "seoul-e-land", "K32": "ansan", "K34": "chungnam-asan",
    "K36": "gimpo", "K37": "cheongju", "K38": "cheonan", "K39": "hwaseong", "K40": "paju", "K41": "gimhae",
    "K42": "yongin",
}
NAME = {
    "K02": "Suwon Samsung", "K06": "Busan IPark", "K07": "Jeonnam", "K08": "Seongnam", "K17": "Daegu",
    "K20": "Gyeongnam", "K29": "Suwon FC", "K31": "Seoul E-Land", "K32": "Ansan", "K34": "Chungnam Asan",
    "K36": "Gimpo", "K37": "Chungbuk Cheongju", "K38": "Cheonan", "K39": "Hwaseong", "K40": "Paju",
    "K41": "Gimhae", "K42": "Yongin",
}

# Weather thresholds at kickoff (two-hour window from kickoff)
WET_MM = 1.0        # rain over the two hours from kickoff
COLD_C = 5.0        # temperature at kickoff
WINDY_KMH = 30.0    # 10 m wind at kickoff
WEATHER_KEYS = ("wet", "cold", "windy")

# Card rules (2026): ban at the 5th caution, the 8th, then every 2nd
BAN_AT = (5, 8, 10, 12, 14, 16, 18)

# Draw calibration (backtest, Rounds 10-29 of 2026; matches the 2024-2026 draw rate)
RHO = -0.10
DRAW_BOOST = 0.20

# Ridge priors (standard deviations) for the shrunk terms
SD = {"team": 0.30, "home_team": 0.08, "coach": 0.15, "ref": 0.05, "weather": 0.20}


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def parse_dt(date: str, time: str | None) -> dt.datetime:
    """Kickoff time; unset times (the schedule shows 00:00 until the league fixes them) default to 14:00."""
    y, m, d = (int(x) for x in date.split("."))
    if not time or time == "00:00":
        time = "14:00"
    hh, mm = (int(x) for x in time.split(":"))
    return dt.datetime(y, m, d, hh, mm)


def load_json(name):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


def load_matches():
    sched = load_json("schedules.json")
    played, remaining = [], []
    for year in ("2024", "2025", "2026"):
        for r in sched[year]:
            if r.get("isSemiPlayOff") == "Y" or r.get("gameType") not in (0, None):
                continue
            m = {
                "year": int(year), "round": r["roundId"], "gid": str(r["gameId"]),
                "when": parse_dt(r["gameDate"], r.get("gameTime")),
                "home": r["homeTeam"], "away": r["awayTeam"], "venue": r["fieldName"],
                "ref": r.get("refreeName1"),
                "kickoff_set": bool(r.get("gameTime")) and r.get("gameTime") != "00:00",
            }
            if r.get("endYn") == "Y":
                m["hg"], m["ag"] = int(r["homeGoal"]), int(r["awayGoal"])
                played.append(m)
            elif year == "2026":
                remaining.append(m)
    played.sort(key=lambda m: m["when"])
    remaining.sort(key=lambda m: (m["when"], m["home"]))
    return played, remaining


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------
class Weather:
    def __init__(self, wx):
        self.series = {}
        for src in ("archive", "forecast"):
            for venue, h in wx.get(src, {}).items():
                d = self.series.setdefault(venue, {})
                for t, p, temp, wind in zip(h["time"], h["precipitation"], h["temperature_2m"], h["wind_speed_10m"]):
                    if p is None or temp is None or wind is None:
                        continue
                    if src == "archive" or t not in d:   # archive wins for the past
                        d[t] = (p, temp, wind)
        self.climate = {}
        for venue, h in wx.get("climate", {}).items():
            self.climate[venue] = list(zip(h["time"], h["precipitation"], h["temperature_2m"], h["wind_speed_10m"]))
        self.forecast_times = {v: set(h["time"]) for v, h in wx.get("forecast", {}).items()}

    @staticmethod
    def _flags(p2, temp, wind):
        return {"wet": float(p2 >= WET_MM), "cold": float(temp <= COLD_C), "windy": float(wind >= WINDY_KMH)}

    def observed(self, venue, when):
        d = self.series.get(venue)
        if not d:
            return None
        t0 = when.strftime("%Y-%m-%dT%H:00")
        t1 = (when + dt.timedelta(hours=1)).strftime("%Y-%m-%dT%H:00")
        if t0 not in d or t1 not in d:
            return None
        return self._flags(d[t0][0] + d[t1][0], d[t0][1], d[t0][2])

    def climatology(self, venue, when, window_days=5):
        rows = self.climate.get(venue)
        if not rows:
            return {k: 0.0 for k in WEATHER_KEYS}
        hour = when.hour
        by_time = {t: (p, temp, wind) for t, p, temp, wind in rows if p is not None and temp is not None}
        flags = []
        for year in range(2016, 2026):
            for off in range(-window_days, window_days + 1):
                try:
                    day = dt.datetime(year, when.month, when.day, hour) + dt.timedelta(days=off)
                except ValueError:
                    continue
                t0 = day.strftime("%Y-%m-%dT%H:00")
                t1 = (day + dt.timedelta(hours=1)).strftime("%Y-%m-%dT%H:00")
                if t0 in by_time and t1 in by_time:
                    flags.append(self._flags(by_time[t0][0] + by_time[t1][0], by_time[t0][1], by_time[t0][2]))
        if not flags:
            return {k: 0.0 for k in WEATHER_KEYS}
        return {k: sum(f[k] for f in flags) / len(flags) for k in WEATHER_KEYS}

    def outlook(self, venue, when, today):
        """Probability of each condition: forecast blended with climatology by lead time."""
        clim = self.climatology(venue, when)
        fc = self.observed(venue, when) if when.strftime("%Y-%m-%dT%H:00") in self.forecast_times.get(venue, ()) else None
        lead = (when - today).days
        if fc is None:
            return clim, "climatology", lead
        w = 0.8 if lead <= 3 else 0.5 if lead <= 7 else 0.2
        return {k: w * fc[k] + (1 - w) * clim[k] for k in WEATHER_KEYS}, f"forecast (weight {w}) + climatology", lead


# ---------------------------------------------------------------------------
# Head-to-head
# ---------------------------------------------------------------------------
def h2h_value(played, home, away, before, home_adv_goals=0.27, k=3.0):
    """Venue-adjusted mean goal difference of earlier meetings, from `home`'s side, shrunk by k."""
    tot, n = 0.0, 0
    for m in played:
        if m["when"] >= before:
            break
        if {m["home"], m["away"]} != {home, away}:
            continue
        if m["home"] == home:
            tot += (m["hg"] - m["ag"]) - home_adv_goals
        else:
            tot += (m["ag"] - m["hg"]) + home_adv_goals
        n += 1
    return tot / (n + k), n


# ---------------------------------------------------------------------------
# Model fit
# ---------------------------------------------------------------------------
class Model:
    def __init__(self, teams, refs, coach_changes):
        self.teams = list(teams)
        self.ti = {t: i for i, t in enumerate(self.teams)}
        self.refs = list(refs)
        self.ri = {r: i for i, r in enumerate(self.refs)}
        self.coach = [c for c in coach_changes if c["team"] in self.ti]
        self.ci = {c["team"]: i for i, c in enumerate(self.coach)}
        T, C, R = len(self.teams), len(self.coach), len(self.refs)
        self.sl = {}
        o = 0
        for name, n in (("mu", 1), ("H", 1), ("att", T), ("dfn", T), ("home", T), ("catt", C), ("cdef", C),
                        ("ref", R), ("wx", len(WEATHER_KEYS))):
            self.sl[name] = slice(o, o + n)
            o += n
        self.n = o

    def post_coach(self, team, when):
        i = self.ci.get(team)
        if i is None:
            return -1
        return i if when >= self.coach[i]["since"] else -1

    def design(self, matches, cfg, h2h, wx):
        n = len(matches)
        D = {
            "h": np.array([self.ti[m["home"]] for m in matches]),
            "a": np.array([self.ti[m["away"]] for m in matches]),
            "ch": np.array([self.post_coach(m["home"], m["when"]) for m in matches]),
            "ca": np.array([self.post_coach(m["away"], m["when"]) for m in matches]),
            "r": np.array([self.ri.get(m.get("ref"), -1) for m in matches]),
            "h2h": np.array(h2h, dtype=float) * cfg["h2h_weight"],
            "wx": np.array([[w[k] if w else 0.0 for k in WEATHER_KEYS] for w in wx], dtype=float).reshape(n, len(WEATHER_KEYS)),
        }
        return D

    def linpred(self, th, D, cfg):
        sl = self.sl
        att, dfn = th[sl["att"]], th[sl["dfn"]]
        home = th[sl["home"]] if cfg["team_home"] else np.zeros(len(self.teams))
        catt = np.append(th[sl["catt"]], 0.0) if cfg["coach"] else np.zeros(len(self.coach) + 1)
        cdef = np.append(th[sl["cdef"]], 0.0) if cfg["coach"] else np.zeros(len(self.coach) + 1)
        ref = np.append(th[sl["ref"]], 0.0) if cfg["ref_goals"] else np.zeros(len(self.refs) + 1)
        wxb = th[sl["wx"]] if cfg["weather"] else np.zeros(len(WEATHER_KEYS))
        common = th[sl["mu"]][0] + ref[D["r"]] + D["wx"] @ wxb
        lh = common + th[sl["H"]][0] + home[D["h"]] + att[D["h"]] + catt[D["ch"]] - dfn[D["a"]] - cdef[D["ca"]] + D["h2h"]
        la = common + att[D["a"]] + catt[D["ca"]] - dfn[D["h"]] - cdef[D["ch"]] - D["h2h"]
        return lh, la

    def fit(self, matches, weights, cfg, h2h, wx):
        D = self.design(matches, cfg, h2h, wx)
        yh = np.array([m["hg"] for m in matches], dtype=float)
        ya = np.array([m["ag"] for m in matches], dtype=float)
        w = np.asarray(weights, dtype=float)
        sl, T = self.sl, len(self.teams)
        prior = np.zeros(self.n)
        prior[sl["att"]] = prior[sl["dfn"]] = 1 / SD["team"] ** 2
        prior[sl["home"]] = 1 / SD["home_team"] ** 2
        prior[sl["catt"]] = prior[sl["cdef"]] = 1 / SD["coach"] ** 2
        prior[sl["ref"]] = 1 / SD["ref"] ** 2
        prior[sl["wx"]] = 1 / SD["weather"] ** 2

        def f(th):
            lh, la = self.linpred(th, D, cfg)
            eh, ea = np.exp(lh), np.exp(la)
            nll = -np.sum(w * (yh * lh - eh + ya * la - ea)) + 0.5 * np.sum(prior * th * th)
            gh, ga = -w * (yh - eh), -w * (ya - ea)          # d nll / d linear predictor
            g = prior * th
            g[sl["mu"]] += gh.sum() + ga.sum()
            g[sl["H"]] += gh.sum()
            g[sl["att"]] += np.bincount(D["h"], gh, T) + np.bincount(D["a"], ga, T)
            g[sl["dfn"]] -= np.bincount(D["a"], gh, T) + np.bincount(D["h"], ga, T)
            if cfg["team_home"]:
                g[sl["home"]] += np.bincount(D["h"], gh, T)
            if cfg["coach"] and self.coach:
                C = len(self.coach)
                mh, ma = D["ch"] >= 0, D["ca"] >= 0
                g[sl["catt"]] += np.bincount(D["ch"][mh], gh[mh], C) + np.bincount(D["ca"][ma], ga[ma], C)
                g[sl["cdef"]] -= np.bincount(D["ca"][ma], gh[ma], C) + np.bincount(D["ch"][mh], ga[mh], C)
            if cfg["ref_goals"] and self.refs:
                mr = D["r"] >= 0
                g[sl["ref"]] += np.bincount(D["r"][mr], gh[mr] + ga[mr], len(self.refs))
            if cfg["weather"]:
                g[sl["wx"]] += D["wx"].T @ (gh + ga)
            return nll, g

        th0 = np.zeros(self.n)
        th0[sl["mu"]] = math.log(1.3)
        th0[sl["H"]] = 0.1
        res = minimize(f, th0, jac=True, method="L-BFGS-B", options={"maxiter": 2000})
        self.theta, self.cfg = res.x, cfg
        return res

    def rates(self, home, away, when, h2h=0.0, wx=None, ref=None):
        m = {"home": home, "away": away, "when": when, "ref": ref}
        D = self.design([m], self.cfg, [h2h], [wx])
        lh, la = self.linpred(self.theta, D, self.cfg)
        return float(np.exp(lh[0])), float(np.exp(la[0]))


def dc_matrix(lh, la, rho, kmax=10, draw_boost=0.0):
    p = np.outer(poisson.pmf(np.arange(kmax + 1), lh), poisson.pmf(np.arange(kmax + 1), la))
    p[0, 0] *= 1 - lh * la * rho
    p[0, 1] *= 1 + lh * rho
    p[1, 0] *= 1 + la * rho
    p[1, 1] *= 1 - rho
    p[np.diag_indices_from(p)] *= 1 + draw_boost
    return p / p.sum()


def outcome_probs(lh, la, rho, draw_boost=0.0):
    p = dc_matrix(lh, la, rho, draw_boost=draw_boost)
    return float(np.tril(p, -1).sum()), float(np.trace(p)), float(np.triu(p, 1).sum())


def time_weights(matches, now, half_life):
    if half_life is None:
        return np.ones(len(matches))
    days = np.array([(now - m["when"]).total_seconds() / 86400 for m in matches])
    return np.exp(-math.log(2) * days / half_life)


# ---------------------------------------------------------------------------
# Context: coaches, absences (from research), cards
# ---------------------------------------------------------------------------
def load_context():
    path = DATA / "context.json"
    ctx = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for c in ctx.get("coach_changes", []):
        c["since"] = dt.datetime.fromisoformat(c["since"])
    return ctx


def card_tables(played, info):
    """Per-referee yellow rates and per-team red rates from 2026 match events."""
    yel_by_ref, n_by_ref = Counter(), Counter()
    reds_by_team, games_by_team = Counter(), Counter()
    tot_y, tot_g = 0, 0
    for m in played:
        if m["year"] != 2026:
            continue
        ev = info.get(m["gid"])
        if not ev:
            continue
        y = r = 0
        for half in ("firstHalf", "secondHalf", "EfirstHalf", "EsecondHalf"):
            for e in ev.get(half) or []:
                if e.get("eventName") == "경고":
                    y += 1
                elif e.get("eventName") == "퇴장":
                    reds_by_team[e.get("teamId")] += 1
        games_by_team[m["home"]] += 1
        games_by_team[m["away"]] += 1
        if m.get("ref"):
            yel_by_ref[m["ref"]] += y
            n_by_ref[m["ref"]] += 1
        tot_y += y
        tot_g += 1
    league_y = tot_y / max(tot_g, 1)
    k = 6.0   # prior strength in matches
    ref_mult = {r: ((yel_by_ref[r] + k * league_y) / (n_by_ref[r] + k)) / league_y for r in n_by_ref}
    tot_red = sum(reds_by_team.values())
    league_red = tot_red / max(sum(games_by_team.values()), 1)
    red_rate = {t: (reds_by_team[t] + 10 * league_red) / (games_by_team[t] + 10) for t in games_by_team}
    return ref_mult, n_by_ref, league_y, red_rate, league_red


def pending_bans(played, info, records):
    """Players suspended for their club's next match: a 5th/8th/... caution or a red card in the latest match."""
    totals = {(t, p["name"]): p.get("warnQty") or 0 for t, lst in records.items() for p in lst}
    last = {}
    for m in played:
        if m["year"] == 2026:
            last[m["home"]] = m
            last[m["away"]] = m
    out = []
    for team, m in last.items():
        ev = info.get(m["gid"]) or {}
        for half in ("firstHalf", "secondHalf", "EfirstHalf", "EsecondHalf"):
            for e in ev.get(half) or []:
                if e.get("teamId") != team:
                    continue
                name = e.get("playerName")
                if e.get("eventName") == "경고" and totals.get((team, name)) in BAN_AT:
                    out.append({"team": team, "name": name, "why": f"{totals[(team, name)]}th caution in the last match"})
                elif e.get("eventName") == "퇴장":
                    out.append({"team": team, "name": name, "why": "sent off in the last match"})
    return out


def player_table(records, played_by_team, team_goals, position_hint, recent):
    """Tracked players: booking risk per appearance, appearance rate (weighted to the last six
    matches, so players who have left or lost their place stop counting), and absence impact."""
    rows = []
    all_y = sum(p.get("warnQty") or 0 for lst in records.values() for p in lst)
    all_apps = sum(p.get("gameQty") or 0 for lst in records.values() for p in lst)
    base = all_y / max(all_apps, 1)
    for team, lst in records.items():
        tg = team_goals.get(team, 1)
        ta = sum(p.get("assistQty") or 0 for p in lst)
        n_played = played_by_team.get(team, 1)
        for p in lst:
            apps, y = p.get("gameQty") or 0, p.get("warnQty") or 0
            if apps < 3:
                continue
            ga_share = ((p.get("goalQty") or 0) + (p.get("assistQty") or 0)) / max(tg + ta, 1)
            rec = recent.get(team, {})
            rec_rate = rec.get("apps", {}).get(p["name"], 0) / max(rec.get("matches", 0), 1) if rec else apps / n_played
            appear = min(0.95, 0.7 * rec_rate + 0.3 * apps / n_played) if rec_rate > 0 else 0.05  # no minutes in six matches: left, injured or out of the side
            pos = position_hint.get((team, p["name"]))
            att_imp = min(0.10, 0.45 * ga_share) * appear
            if pos == "GK":
                def_imp = 0.05 * appear
            elif pos == "DF" or (pos is None and ga_share < 0.05):
                def_imp = 0.03 * appear
            elif pos == "MF":
                def_imp = 0.015 * appear
            else:
                def_imp = 0.0
            rows.append({
                "team": team, "name": p["name"], "yellows": y, "apps": apps, "appear": appear,
                "p_book": (y + 8 * base) / (apps + 8),
                "att_imp": att_imp, "def_imp": def_imp, "ga_share": ga_share,
            })
    return rows, base


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------
def simulate(model, rho, draw_boost, played, remaining, table0, players, ref_pool, ref_mult, red_rate, league_red,
             outlooks, absences, cfg, n_sims, seed):
    rng = np.random.default_rng(seed)
    teams = sorted(table0)
    ti = {t: i for i, t in enumerate(teams)}
    T = len(teams)
    pts = np.tile(np.array([table0[t]["pts"] for t in teams], dtype=np.int32), (n_sims, 1))
    gf = np.tile(np.array([table0[t]["gf"] for t in teams], dtype=np.int32), (n_sims, 1))
    ga = np.tile(np.array([table0[t]["ga"] for t in teams], dtype=np.int32), (n_sims, 1))

    track = [p for p in players if cfg["cards"]]
    P = len(track)
    counts = np.tile(np.array([p["yellows"] for p in track], dtype=np.int16), (n_sims, 1)) if P else np.zeros((n_sims, 0), np.int16)
    banned = np.zeros((n_sims, P), dtype=bool)
    red_ban = np.zeros((n_sims, T), dtype=bool)
    by_team = defaultdict(list)
    for j, p in enumerate(track):
        by_team[p["team"]].append(j)
    log_att = np.array([math.log(1 - p["att_imp"]) for p in track]) if P else np.zeros(0)
    log_def = np.array([math.log(1 + p["def_imp"]) for p in track]) if P else np.zeros(0)
    ban_at = np.zeros(40, dtype=bool)
    ban_at[list(BAN_AT)] = True

    refs = list(ref_pool)
    ref_p = np.array([ref_pool[r] for r in refs], dtype=float)
    ref_p /= ref_p.sum()
    ref_k = np.array([ref_mult.get(r, 1.0) for r in refs])
    generic_att, generic_def = math.log(1 - 0.02), math.log(1 + 0.02)

    out = {"fixtures": [], "ban_events": Counter(), "ban_rounds": defaultdict(Counter)}
    wxb = model.theta[model.sl["wx"]] if model.cfg["weather"] and cfg["weather"] else np.zeros(len(WEATHER_KEYS))

    for f in remaining:
        h, a = f["home"], f["away"]
        h2h = f["h2h"] if cfg["h2h"] else 0.0
        lh0, la0 = model.rates(h, a, f["when"], h2h=h2h, wx=None)
        log_h = np.full(n_sims, math.log(lh0))
        log_a = np.full(n_sims, math.log(la0))
        # weather draws
        if cfg["weather"]:
            ol = outlooks[f["gid"]]
            for k, key in enumerate(WEATHER_KEYS):
                hit = rng.random(n_sims) < ol[key]
                log_h += hit * wxb[k]
                log_a += hit * wxb[k]
        # known absences (research): constant multipliers
        if cfg["absences"]:
            for side, team in (("home", h), ("away", a)):
                for ab in absences.get((f["round"], team), []):
                    if side == "home":
                        log_h += math.log(1 - ab["att_imp"])
                        log_a += math.log(1 + ab["def_imp"])
                    else:
                        log_a += math.log(1 - ab["att_imp"])
                        log_h += math.log(1 + ab["def_imp"])
        # suspensions arising inside the simulation
        jh, ja = by_team.get(h, []), by_team.get(a, [])
        if P:
            if jh:
                log_h += banned[:, jh] @ log_att[jh]
                log_a += banned[:, jh] @ log_def[jh]
            if ja:
                log_a += banned[:, ja] @ log_att[ja]
                log_h += banned[:, ja] @ log_def[ja]
            for j in jh + ja:
                out["ban_events"][j] += int(banned[:, j].sum())
                out["ban_rounds"][j][f["round"]] += int(banned[:, j].sum())
        if cfg["cards"]:
            log_h += red_ban[:, ti[h]] * generic_att
            log_a += red_ban[:, ti[h]] * generic_def
            log_a += red_ban[:, ti[a]] * generic_att
            log_h += red_ban[:, ti[a]] * generic_def
        lh, la = np.exp(log_h), np.exp(log_a)

        # Dixon-Coles via rejection sampling
        hg = rng.poisson(lh)
        ag = rng.poisson(la)
        todo = np.ones(n_sims, dtype=bool)
        while todo.any():
            idx = np.flatnonzero(todo)
            x, y, l1, l2 = hg[idx], ag[idx], lh[idx], la[idx]
            w = np.ones(len(idx))
            w[(x == 0) & (y == 0)] = (1 - l1 * l2 * rho)[(x == 0) & (y == 0)]
            w[(x == 1) & (y == 0)] = (1 + l2 * rho)[(x == 1) & (y == 0)]
            w[(x == 0) & (y == 1)] = (1 + l1 * rho)[(x == 0) & (y == 1)]
            w[(x == 1) & (y == 1)] = 1 - rho
            w[x == y] *= 1 + draw_boost
            env = np.maximum.reduce([1 - l1 * l2 * rho, 1 + l1 * rho, 1 + l2 * rho, np.full(len(idx), 1 - rho)]) * (1 + draw_boost)
            ok = rng.random(len(idx)) < w / env
            todo[idx[ok]] = False
            if (~ok).any():
                bad = idx[~ok]
                hg[bad] = rng.poisson(lh[bad])
                ag[bad] = rng.poisson(la[bad])

        ih, ia = ti[h], ti[a]
        gf[:, ih] += hg
        ga[:, ih] += ag
        gf[:, ia] += ag
        ga[:, ia] += hg
        pts[:, ih] += np.where(hg > ag, 3, np.where(hg == ag, 1, 0))
        pts[:, ia] += np.where(ag > hg, 3, np.where(hg == ag, 1, 0))
        out["fixtures"].append({"f": f, "hg": hg, "ag": ag, "lh": lh, "la": la})

        # cards for this match
        if cfg["cards"]:
            k_ref = ref_k[rng.choice(len(refs), size=n_sims, p=ref_p)]
            red_ban[:, ih] = False
            red_ban[:, ia] = False
            for j in jh + ja:
                served = banned[:, j].copy()
                banned[:, j] = False
                p = track[j]
                out_injured = any(ab["name"] == p["name"] for ab in absences.get((f["round"], p["team"]), []))
                if out_injured:
                    continue
                plays = (rng.random(n_sims) < p["appear"]) & ~served
                booked = plays & (rng.random(n_sims) < np.minimum(0.9, p["p_book"] * k_ref))
                counts[:, j] += booked
                banned[:, j] = booked & ban_at[np.minimum(counts[:, j], 39)]
            for t in (ih, ia):
                red_ban[:, t] = rng.random(n_sims) < red_rate.get(teams[t], league_red) * k_ref

    # final ranks: points, goals scored, goal difference, then random
    gd = gf - ga
    key = pts.astype(np.int64) * 10**7 + gf.astype(np.int64) * 10**4 + (gd + 500).astype(np.int64) * 10 + rng.integers(0, 10, size=pts.shape)
    order = np.argsort(-key, axis=1)
    rank = np.empty_like(order)
    np.put_along_axis(rank, order, np.arange(1, T + 1)[None, :].repeat(n_sims, 0), axis=1)
    out.update({"teams": teams, "pts": pts, "gf": gf, "ga": ga, "rank": rank, "track": track})
    return out


# ---------------------------------------------------------------------------
# Backtest
# ---------------------------------------------------------------------------
def baseline_probs(train26, m, rho=-0.10, form_w=0.35):
    """The site's earlier model: season goals per game blended with last five, league home split."""
    stats = defaultdict(list)
    hg = ag = 0
    for x in train26:
        stats[x["home"]].append((x["hg"], x["ag"]))
        stats[x["away"]].append((x["ag"], x["hg"]))
        hg += x["hg"]
        ag += x["ag"]
    n = len(train26)
    if n == 0 or not stats[m["home"]] or not stats[m["away"]]:
        return None
    home_avg, away_avg = hg / n, ag / n
    lg = (hg + ag) / (2 * n)

    def rate(t):
        s = stats[t]
        f = sum(x[0] for x in s) / len(s)
        c = sum(x[1] for x in s) / len(s)
        l5 = s[-5:]
        f5 = sum(x[0] for x in l5) / len(l5)
        c5 = sum(x[1] for x in l5) / len(l5)
        return ((1 - form_w) * f + form_w * f5) / lg, ((1 - form_w) * c + form_w * c5) / lg

    ah, dh = rate(m["home"])
    aa, da = rate(m["away"])
    return outcome_probs(home_avg * ah * da, away_avg * aa * dh, rho)


def score(probs, m):
    hw, d, aw = probs
    o = 0 if m["hg"] > m["ag"] else 1 if m["hg"] == m["ag"] else 2
    p = (hw, d, aw)
    ll = -math.log(max(p[o], 1e-12))
    cum_p = np.cumsum(p)
    cum_o = np.cumsum([1.0 if i == o else 0.0 for i in range(3)])
    rps = float(np.sum((cum_p[:2] - cum_o[:2]) ** 2) / 2)
    return ll, rps


def run_backtest(played, weather, ctx, rounds=range(10, 30)):
    teams = sorted({m["home"] for m in played} | {m["away"] for m in played})
    refs = sorted({m["ref"] for m in played if m.get("ref")})
    wx_obs = {m["gid"]: (weather.observed(m["venue"], m["when"]) if m["year"] == 2026 else None) for m in played}
    base_cfg = dict(team_home=False, coach=False, ref_goals=False, weather=False, h2h_weight=0.0)
    configs = {
        "decay only": {},
        "+ club home effect": dict(team_home=True),
        "+ head-to-head": dict(team_home=True, h2h_weight=1.0),
        "+ weather": dict(team_home=True, h2h_weight=1.0, weather=True),
        "+ coaches": dict(team_home=True, h2h_weight=1.0, weather=True, coach=True),
        "+ referees (goals)": dict(team_home=True, h2h_weight=1.0, weather=True, coach=True, ref_goals=True),
    }
    half_lives = [60, 120, 240, None]
    h2h_weights = [0.0, 0.05, 0.10, 0.20]
    res = defaultdict(lambda: [0.0, 0.0, 0])
    targets = [m for m in played if m["year"] == 2026 and m["round"] in rounds]
    by_round = defaultdict(list)
    for m in targets:
        by_round[m["round"]].append(m)
    for rnd, ms in sorted(by_round.items()):
        cutoff = min(m["when"] for m in ms)
        train = [m for m in played if m["when"] < cutoff]
        train26 = [m for m in train if m["year"] == 2026]
        h2h_train = [h2h_value(played, m["home"], m["away"], m["when"])[0] for m in train]
        h2h_test = [h2h_value(played, m["home"], m["away"], m["when"])[0] for m in ms]
        for m in ms:
            p = baseline_probs(train26, m)
            if p:
                ll, rps = score(p, m)
                r = res["site model (season + last five)"]
                r[0] += ll; r[1] += rps; r[2] += 1
        for hl in half_lives:
            wts = time_weights(train, cutoff, hl)
            for name, extra in configs.items():
                hws = h2h_weights if "head-to-head" in name or name in ("+ weather", "+ coaches", "+ referees (goals)") else [0.0]
                for hw in hws:
                    cfg = dict(base_cfg, **extra)
                    cfg["h2h_weight"] = hw if cfg.get("h2h_weight") else 0.0
                    coach_changes = [c for c in ctx.get("coach_changes", []) if c["since"] < cutoff]
                    mdl = Model(teams, refs, coach_changes)
                    mdl.fit(train, wts, cfg, h2h_train, [wx_obs[m["gid"]] for m in train])
                    for m, hv in zip(ms, h2h_test):
                        lh, la = mdl.rates(m["home"], m["away"], m["when"], h2h=hv,
                                           wx=wx_obs[m["gid"]], ref=m.get("ref"))
                        ll, rps = score(outcome_probs(lh, la, RHO, DRAW_BOOST), m)
                        r = res[(name, hl, hw)]
                        r[0] += ll; r[1] += rps; r[2] += 1
    rows = []
    for k, (ll, rps, n) in res.items():
        rows.append({"model": k if isinstance(k, str) else k[0], "half_life": None if isinstance(k, str) else k[1],
                     "h2h_weight": None if isinstance(k, str) else k[2], "log_loss": ll / n, "rps": rps / n, "n": n})
    rows.sort(key=lambda r: r["log_loss"])
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def current_table(played):
    tab = {t: {"p": 0, "pts": 0, "gf": 0, "ga": 0} for t in SLUG}
    for m in played:
        if m["year"] != 2026:
            continue
        for t, f, a in ((m["home"], m["hg"], m["ag"]), (m["away"], m["ag"], m["hg"])):
            r = tab[t]
            r["p"] += 1
            r["gf"] += f
            r["ga"] += a
            r["pts"] += 3 if f > a else 1 if f == a else 0
    return tab


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sims", type=int, default=250000)
    ap.add_argument("--backtest", action="store_true")
    ap.add_argument("--half-life", type=float, default=120)
    ap.add_argument("--h2h-weight", type=float, default=0.10)
    ap.add_argument("--no-team-home", action="store_true")
    ap.add_argument("--no-coach", action="store_true")
    ap.add_argument("--no-weather", action="store_true")
    ap.add_argument("--ref-goals", action="store_true")
    ap.add_argument("--ablation-sims", type=int, default=100000)
    ap.add_argument("--today", default="2026-10-18T20:00")
    ap.add_argument("--cutoff", help="rerun as of this moment (e.g. 2026-10-16T00:00): later results are treated as unplayed")
    args = ap.parse_args()

    played, remaining = load_matches()
    weather = Weather(load_json("weather.json"))
    ctx = load_context()
    today = dt.datetime.fromisoformat(args.today)
    cutoff = dt.datetime.fromisoformat(args.cutoff) if args.cutoff else None
    later = []
    if cutoff:
        later = [m for m in played if m["when"] >= cutoff]
        played = [m for m in played if m["when"] < cutoff]
        remaining = sorted([{k: v for k, v in m.items() if k not in ("hg", "ag")} for m in later if m["year"] == 2026] + remaining,
                           key=lambda m: (m["when"], m["home"]))
        today = cutoff

    if args.backtest:
        rows = run_backtest(played, weather, ctx)
        (DATA / "backtest.json").write_text(json.dumps(rows, indent=1, default=str), encoding="utf-8")
        for r in rows[:25]:
            print(f"{r['model']:<34} hl={str(r['half_life']):>5} h2h={str(r['h2h_weight']):>5}  "
                  f"logloss={r['log_loss']:.4f}  rps={r['rps']:.4f}  n={r['n']}")
        base = [r for r in rows if r["model"].startswith("site model")]
        if base:
            print("site model:", round(base[0]["log_loss"], 4), round(base[0]["rps"], 4))
        return

    info = load_json("match_info.json")
    records = load_json("club_records.json")
    if cutoff:   # take back the cautions shown after the cutoff
        minus = Counter()
        for m in later:
            for half in ("firstHalf", "secondHalf", "EfirstHalf", "EsecondHalf"):
                for e in (info.get(m["gid"]) or {}).get(half) or []:
                    if e.get("eventName") == "경고":
                        minus[(e.get("teamId"), e.get("playerName"))] += 1
        for t, lst in records.items():
            for pl in lst:
                pl["warnQty"] = (pl.get("warnQty") or 0) - minus.get((t, pl["name"]), 0)
    roster = json.loads((DATA / "seoul_roster.json").read_text(encoding="utf-8")) if (DATA / "seoul_roster.json").exists() else []

    cfg = dict(team_home=not args.no_team_home, coach=not args.no_coach, ref_goals=args.ref_goals,
               weather=not args.no_weather, h2h_weight=args.h2h_weight)
    teams = sorted({m["home"] for m in played} | {m["away"] for m in played})
    refs = sorted({m["ref"] for m in played if m.get("ref")})
    wx_obs = [weather.observed(m["venue"], m["when"]) if m["year"] == 2026 else None for m in played]
    h2h_train = [h2h_value(played, m["home"], m["away"], m["when"])[0] for m in played]
    hl = None if args.half_life <= 0 else args.half_life
    mdl = Model(teams, refs, ctx.get("coach_changes", []))
    mdl.fit(played, time_weights(played, today, hl), cfg, h2h_train, wx_obs)

    rho = RHO

    # context for remaining fixtures
    for f in remaining:
        f["h2h"], f["h2h_n"] = h2h_value(played, f["home"], f["away"], f["when"])
    outlooks, outlook_notes = {}, {}
    for f in remaining:
        ol, src, lead = weather.outlook(f["venue"], f["when"], today)
        outlooks[f["gid"]] = ol
        outlook_notes[f["gid"]] = {"source": src, "lead_days": lead, **{k: round(v, 3) for k, v in ol.items()}}

    ref_mult, n_by_ref, league_y, red_rate, league_red = card_tables(played, info)
    # active pool: referees with at least 3 main-referee assignments in 2026, weighted by assignments
    ref_pool = {r: n for r, n in n_by_ref.items() if n >= 3}

    table0 = current_table(played)
    played_by_team = {t: table0[t]["p"] for t in table0}
    team_goals = {t: table0[t]["gf"] for t in table0}
    pos_hint = {(SEOUL, r["korName"]): r["position"][:2] if r.get("position") else None for r in roster}
    pos_hint = {k: ("GK" if v == "GK" else "DF" if v in ("DF", "CB", "LB", "RB") else "FW" if v in ("FW", "CF", "ST", "LW", "RW") else "MF" if v else None) for k, v in pos_hint.items()}
    recent = load_json("recent_apps.json") if (DATA / "recent_apps.json").exists() else {}
    players, base_book = player_table(records, played_by_team, team_goals, pos_hint, recent)
    # track only players who can realistically reach a ban threshold in five matches
    tracked = [p for p in players if p["yellows"] >= 2 or (p["yellows"] >= 1 and p["p_book"] > 0.25)]

    # absences from research: {"team","name","rounds":[...],"att_imp"?, "def_imp"?, "why"}
    absences = defaultdict(list)
    pl_index = {(p["team"], p["name"]): p for p in players}
    next_round = {}
    for f in remaining:
        for t in (f["home"], f["away"]):
            next_round.setdefault(t, f["round"])
    bans = pending_bans(played, info, records)
    print("pending bans:", [(NAME[b["team"]], b["name"], b["why"]) for b in bans])
    listed = {(a["team"], a["name"]) for a in ctx.get("absences", [])}
    for b in bans:
        if (b["team"], b["name"]) not in listed:
            ctx.setdefault("absences", []).append(dict(b, rounds=[next_round[b["team"]]]))
    for ab in ctx.get("absences", []):
        p = pl_index.get((ab["team"], ab["name"]), {})
        imp = {"name": ab["name"], "att_imp": ab.get("att_imp", p.get("att_imp", 0.0)),
               "def_imp": ab.get("def_imp", p.get("def_imp", 0.0)), "why": ab.get("why", "")}
        for r in ab["rounds"]:
            absences[(r, ab["team"])].append(imp)

    full = dict(h2h=True, weather=True, cards=True, absences=True)
    sim = simulate(mdl, rho, DRAW_BOOST, played, remaining, table0, tracked, ref_pool, ref_mult, red_rate, league_red,
                   outlooks, absences, full, args.sims, seed=20261018)
    N = args.sims
    teams_s = sim["teams"]
    ti = {t: i for i, t in enumerate(teams_s)}
    s = ti[SEOUL]
    rank = sim["rank"]

    def club_summary(t):
        i = ti[t]
        r = rank[:, i]
        return {"name": NAME[t], "now_pts": table0[t]["pts"], "exp_pts": float(sim["pts"][:, i].mean()),
                "p_title": float((r == 1).mean()), "p_top2": float((r <= 2).mean()),
                "p_top6": float((r <= 6).mean()),
                "rank_dist": {int(k): float((r == k).mean()) for k in range(1, 8)}}

    result = {
        "generated": dt.datetime.now().isoformat(timespec="seconds"), "sims": N, "config": cfg, "rho": rho, "draw_boost": DRAW_BOOST,
        "half_life_days": hl,
        "home_advantage": float(math.exp(mdl.theta[mdl.sl["H"]][0])),
        "weather_effects": {k: float(math.exp(v)) for k, v in zip(WEATHER_KEYS, mdl.theta[mdl.sl["wx"]])} if cfg["weather"] else {},
        "coach_effects": [{"team": NAME.get(c["team"], c["team"]), "coach": c.get("coach"),
                           "att": float(math.exp(mdl.theta[mdl.sl["catt"]][i])),
                           "def_conceded": float(math.exp(-mdl.theta[mdl.sl["cdef"]][i]))}
                          for i, c in enumerate(mdl.coach)] if cfg["coach"] else [],
        "ratings": sorted([{"team": NAME[t], "att": float(math.exp(mdl.theta[mdl.sl["att"]][mdl.ti[t]])),
                            "def_conceded": float(math.exp(-mdl.theta[mdl.sl["dfn"]][mdl.ti[t]])),
                            "home": float(math.exp(mdl.theta[mdl.sl["home"]][mdl.ti[t]]))} for t in SLUG],
                          key=lambda r: -r["att"] / r["def_conceded"]),
        "table_now": {NAME[t]: v for t, v in table0.items()},
        "clubs": {SLUG[t]: club_summary(t) for t in SLUG},
        "referees": {"league_yellows_per_match": league_y, "pool": len(ref_pool),
                     "strictest": sorted(((r, round(ref_mult[r], 2), n_by_ref[r]) for r in ref_pool), key=lambda x: -x[1])[:3],
                     "most_lenient": sorted(((r, round(ref_mult[r], 2), n_by_ref[r]) for r in ref_pool), key=lambda x: x[1])[:3]},
        "red_rate_league": league_red,
    }

    # Seoul fixtures
    seoul_fx = []
    for fx in sim["fixtures"]:
        f = fx["f"]
        if SEOUL not in (f["home"], f["away"]):
            continue
        home = f["home"] == SEOUL
        own = fx["hg"] if home else fx["ag"]
        opp = fx["ag"] if home else fx["hg"]
        sc = Counter(zip(own.tolist(), opp.tolist()))
        seoul_fx.append({
            "round": f["round"], "date": f["when"].isoformat(), "kickoff_set": f["kickoff_set"], "venue": f["venue"],
            "opponent": NAME[f["away"] if home else f["home"]], "home": home,
            "W": float((own > opp).mean()), "D": float((own == opp).mean()), "L": float((own < opp).mean()),
            "xg_seoul": float((fx["lh"] if home else fx["la"]).mean()), "xg_opp": float((fx["la"] if home else fx["lh"]).mean()),
            "clean_sheet": float((opp == 0).mean()),
            "top_scores": [(f"{a}-{b}", c / N) for (a, b), c in sc.most_common(5)],
            "h2h": round(f["h2h"], 3), "h2h_meetings": f["h2h_n"],
            "weather": outlook_notes[f["gid"]],
            "absences": [a["name"] + ": " + a["why"] for a in absences.get((f["round"], SEOUL), [])],
        })
    result["seoul_fixtures"] = seoul_fx

    # Seoul points and branches
    sp = sim["pts"][:, s]
    result["seoul_points_dist"] = {int(k): float((sp == k).mean()) for k in np.unique(sp)}
    result["seoul_top2_given_points"] = {int(k): float((rank[sp == k, s] <= 2).mean()) for k in np.unique(sp) if (sp == k).sum() > 500}
    r31 = next(fx for fx in sim["fixtures"] if SEOUL in (fx["f"]["home"], fx["f"]["away"]))
    home = r31["f"]["home"] == SEOUL
    own = r31["hg"] if home else r31["ag"]
    opp = r31["ag"] if home else r31["hg"]
    result["next_match_branches"] = {k: {"p": float(mask.mean()), "top2": float((rank[mask, s] <= 2).mean())}
                                     for k, mask in (("W", own > opp), ("D", own == opp), ("L", own < opp))}
    sfc = ti["K29"]
    result["seoul_top2_given_suwonfc_points"] = {}
    sfc_pts = sim["pts"][:, sfc]
    for lo, hi in ((0, 60), (61, 63), (64, 66), (67, 99)):
        mask = (sfc_pts >= lo) & (sfc_pts <= hi)
        if mask.sum():
            result["seoul_top2_given_suwonfc_points"][f"{lo}-{hi}"] = {"p": float(mask.mean()), "seoul_top2": float((rank[mask, s] <= 2).mean())}
    level = sim["pts"][:, s] == sfc_pts
    result["tiebreak"] = {"level_with_suwon_fc": float(level.mean()),
                          "seoul_above_when_level": float((rank[level, s] < rank[level, sfc]).mean()) if level.any() else None}

    # Chasing K1 block: rival fixtures, Suwon FC swing matches, Seoul branches, pairs, thresholds
    watch = ["K02", "K29", "K17", "K39", SEOUL]
    ck = {"fixtures": [], "swings": [], "seoul_branches": []}
    for fx in sim["fixtures"]:
        f, hg, ag = fx["f"], fx["hg"], fx["ag"]
        if not any(t in (f["home"], f["away"]) for t in watch):
            continue
        row = {"round": f["round"], "date": f["when"].isoformat(), "kickoff_set": f["kickoff_set"],
               "home": NAME[f["home"]], "away": NAME[f["away"]], "home_win": float((hg > ag).mean()),
               "draw": float((hg == ag).mean()), "away_win": float((hg < ag).mean())}
        ck["fixtures"].append(row)
        if "K29" in (f["home"], f["away"]):
            win = (hg > ag) if f["home"] == "K29" else (ag > hg)
            ck["swings"].append(dict(row, sfc_win=float(win.mean()),
                                     seoul_top2_if_sfc_win=float((rank[win, s] <= 2).mean()),
                                     seoul_top2_if_not=float((rank[~win, s] <= 2).mean())))
        if SEOUL in (f["home"], f["away"]):
            own, opp = (hg, ag) if f["home"] == SEOUL else (ag, hg)
            ck["seoul_branches"].append({"round": f["round"], **{k: {"p": float(mk.mean()), "top2": float((rank[mk, s] <= 2).mean())}
                                                                  for k, mk in (("W", own > opp), ("D", own == opp), ("L", own < opp))}})
    first_two = np.sort(np.argsort(rank, axis=1)[:, :2], axis=1)
    pc = Counter(map(tuple, first_two.tolist()))
    ck["promoted_pairs"] = [{"pair": [NAME[teams_s[a]], NAME[teams_s[b]]], "p": c / N} for (a, b), c in pc.most_common(5)]
    ck["suwon_fc_final"] = {"le60": float((sfc_pts <= 60).mean()), "le63": float((sfc_pts <= 63).mean()), "ge64": float((sfc_pts >= 64).mean())}
    ck["expected_remaining_points"] = {NAME[t]: float(sim["pts"][:, ti[t]].mean() - table0[t]["pts"]) for t in ("K29", SEOUL, "K02", "K17")}
    ck["seoul_coin_flip_total"] = min([k for k, v in result["seoul_top2_given_points"].items() if v >= 0.5], default=None)
    ck["seoul_win_all"] = float((sp == table0[SEOUL]["pts"] + 3 * len(result["seoul_fixtures"])).mean())
    result["chasing_k1"] = ck

    # card risk for Seoul players
    risk = []
    for j, p in enumerate(sim["track"]):
        if p["team"] != SEOUL:
            continue
        risk.append({"name": p["name"], "yellows": p["yellows"], "p_book": round(p["p_book"], 3),
                     "p_banned_once": sim["ban_events"][j] / N,
                     "by_round": {int(r): c / N for r, c in sorted(sim["ban_rounds"][j].items())}})
    result["seoul_card_risk"] = sorted(risk, key=lambda r: -r["p_banned_once"])

    # ablations
    abl = {}
    if args.ablation_sims <= 0:
        variants_off = True
    else:
        variants_off = False
    variants = {
        "no head-to-head": dict(full, h2h=False),
        "no weather": dict(full, weather=False),
        "no cards or suspensions": dict(full, cards=False),
        "no known absences": dict(full, absences=False),
    }
    for name, c in ({} if variants_off else variants).items():
        o = simulate(mdl, rho, DRAW_BOOST, played, remaining, table0, tracked, ref_pool, ref_mult, red_rate, league_red,
                     outlooks, absences, c, args.ablation_sims, seed=7)
        abl[name] = float((o["rank"][:, ti[SEOUL]] <= 2).mean())
    if not variants_off:
        o = simulate(mdl, rho, 0.0, played, remaining, table0, tracked, ref_pool, ref_mult, red_rate, league_red,
                     outlooks, absences, full, args.ablation_sims, seed=7)
        abl["no draw calibration"] = float((o["rank"][:, ti[SEOUL]] <= 2).mean())
    for name, kw in ({} if variants_off else {"no coach terms": dict(coach=False), "no club home effect": dict(team_home=False),
                     "no time decay": "decay"}).items():
        c2 = dict(cfg)
        if kw == "decay":
            wts = np.ones(len(played))
        else:
            c2.update(kw)
            wts = time_weights(played, today, hl)
        m2 = Model(teams, refs, ctx.get("coach_changes", []))
        m2.fit(played, wts, c2, h2h_train, wx_obs)
        o = simulate(m2, rho, DRAW_BOOST, played, remaining, table0, tracked, ref_pool, ref_mult, red_rate, league_red,
                     outlooks, absences, full, args.ablation_sims, seed=7)
        abl[name] = float((o["rank"][:, ti[SEOUL]] <= 2).mean())
    result["ablation_seoul_top2"] = abl

    result["cutoff"] = args.cutoff
    out = DATA / ("run_in_predictor_cutoff.json" if cutoff else "run_in_predictor.json")
    out.write_text(json.dumps(result, indent=1, ensure_ascii=False, default=str), encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("rho", "home_advantage", "weather_effects", "coach_effects")}, indent=1, ensure_ascii=False))
    for k in ("seoul-e-land", "suwon-fc", "suwon-samsung", "daegu"):
        c = result["clubs"][k]
        print(f"{c['name']:<14} title {c['p_title']:.3f}  top2 {c['p_top2']:.3f}  top6 {c['p_top6']:.3f}  exp {c['exp_pts']:.1f}")
    for f in seoul_fx:
        print(f"R{f['round']} {'v' if f['home'] else 'at'} {f['opponent']:<14} W {f['W']:.3f} D {f['D']:.3f} L {f['L']:.3f} "
              f"xG {f['xg_seoul']:.2f}-{f['xg_opp']:.2f} top {f['top_scores'][0]}")
    print("branches", result["next_match_branches"])
    print("ablation", abl)
    print("card risk", result["seoul_card_risk"][:4])


if __name__ == "__main__":
    main()
