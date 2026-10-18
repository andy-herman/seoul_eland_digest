"""
Refresh the inputs for scripts/run_in_predictor.py (stdlib only).

Writes to research_dump/predictor/:
  schedules.json      K League 2 schedules and results, 2024-2026
  club_records.json   2026 player records per club (appearances, goals, assists, cautions)
  match_info.json     match-centre events for every finished 2026 game (cards, goals)
  recent_apps.json    who played in each club's last six league matches
  weather.json        Open-Meteo kickoff-hour weather per venue: reanalysis archive for the
                      season, past 10 days + 16-day forecast, and 2016-2025 climatology
                      (climatology is fetched once and reused; pass --climate to refetch)

Run after each round, before the predictor:
    python3 scripts/predictor_fetch.py
    uv run --with numpy --with scipy python scripts/run_in_predictor.py --sims 250000

context.json (coach changes, confirmed absences) is edited by hand from research.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "research_dump" / "predictor"
BASE = "https://www.kleague.com"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
H = {"User-Agent": UA, "Accept": "application/json", "Content-Type": "application/json;charset=UTF-8", "Origin": BASE,
     "Referer": BASE + "/schedule.do?leagueId=2&year=2026", "X-Requested-With": "XMLHttpRequest"}

VENUES = {  # approximate stadium coordinates (city-level accuracy is enough for weather)
    "수원 월드컵": (37.2866, 127.0369), "부산 구덕": (35.1176, 129.0170), "광양 전용": (34.9406, 127.7056),
    "순천 팔마": (34.9559, 127.5185), "탄천 종합": (37.4087, 127.1215), "대구iM뱅크PARK": (35.8813, 128.5886),
    "창원 축구센터": (35.2311, 128.6286), "수원 종합": (37.2973, 127.0110), "목동 종합": (37.5306, 126.8818),
    "안산 와스타디움": (37.3223, 126.8291), "아산 이순신": (36.7854, 127.0049), "김포솔터축구장": (37.6366, 126.6447),
    "청주 종합": (36.6378, 127.4675), "천안 종합": (36.8195, 127.1171), "화성 종합": (37.2059, 126.8277),
    "파주 스타디움": (37.7600, 126.7800), "김해 종합": (35.2342, 128.8597), "용인 미르": (37.2340, 127.2080),
}
HOURLY = "precipitation,temperature_2m,wind_speed_10m"


def post(path, body=None, params=None):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, data=json.dumps(body or {}).encode(), headers=H, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def save(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def load(name, default=None):
    p = OUT / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def step(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--climate", action="store_true", help="refetch the 2016-2025 climatology")
    ap.add_argument("--today", default=time.strftime("%Y-%m-%d"))
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    games = {}
    for year in (2024, 2025, 2026):
        rows = []
        for m in range(2, 13):
            try:
                rows += post("/getScheduleList.do", {"year": str(year), "leagueId": "2", "month": f"{m:02d}"})["data"]["scheduleList"]
            except Exception as e:  # noqa: BLE001
                step(f"schedule {year}-{m:02d} failed: {e}")
            time.sleep(0.25)
        games[str(year)] = rows
    save("schedules.json", games)
    step(f"schedules: {', '.join(f'{y} {len(r)}' for y, r in games.items())}")

    clubs = sorted({g["homeTeam"] for g in games["2026"]})
    recs = {}
    for t in clubs:
        recs[t] = post("/record/selectPersonalRecordByClub.do", {"year": "2026", "leagueId": "2", "teamId": t})["data"]["list"]
        time.sleep(0.25)
    save("club_records.json", recs)
    step(f"club records: {len(recs)} clubs")

    info = load("match_info.json", {})
    done = [g for g in games["2026"] if g.get("endYn") == "Y"]
    for g in done:
        gid = str(g["gameId"])
        if gid in info:
            continue
        info[gid] = post("/api/ddf/match/matchInfo.do", params={"year": "2026", "meetSeq": "2", "gameId": gid})["data"]
        time.sleep(0.3)
    save("match_info.json", info)
    step(f"match info: {len(info)} games")

    # recent appearances: each club's last six league matches
    played = sorted(done, key=lambda g: (g["gameDate"], g["gameTime"] or ""))
    last = defaultdict(list)
    for g in played:
        last[g["homeTeam"]].append(g)
        last[g["awayTeam"]].append(g)
    lineups = OUT / "lineups"
    lineups.mkdir(exist_ok=True)
    recent = {}
    for t, gs in last.items():
        apps, n = Counter(), 0
        for g in gs[-6:]:
            f = lineups / f"{g['gameId']}.json"
            if not f.exists() or f.stat().st_size < 1000:
                ref = f"{BASE}/match.do?year=2026&leagueId=2&gameId={g['gameId']}&meetSeq=2"
                subprocess.run(["curl", "-s", "-A", UA, "-e", ref, "-H", "X-Requested-With: XMLHttpRequest", "--data",
                                f"year=2026&yearTst=2026&meetSeq=2&gameId={g['gameId']}&gameIdTst={g['gameId']}"
                                f"&homeTeam={g['homeTeam']}&awayTeam={g['awayTeam']}&roundId={g['roundId']}",
                                f"{BASE}/api/ddf/match/getMatchRecordAllDetail.do", "-o", str(f)], check=False)
                time.sleep(0.3)
            try:
                d = json.loads(f.read_text(encoding="utf-8"))["data"]
            except Exception:  # noqa: BLE001
                continue
            n += 1
            for p in d["listH"] if g["homeTeam"] == t else d["listA"]:
                if (p.get("minutePlay") or 0) > 0:
                    apps[p["playerName"]] += 1
        recent[t] = {"matches": n, "apps": dict(apps)}
    save("recent_apps.json", recent)
    step("recent appearances done")

    old = load("weather.json", {})
    wx = {"archive": {}, "forecast": {}, "climate": old.get("climate", {}) if not args.climate else {}}
    for venue, (lat, lon) in VENUES.items():
        q = dict(latitude=lat, longitude=lon, hourly=HOURLY, timezone="Asia/Seoul")
        wx["archive"][venue] = get_json("https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(
            dict(q, start_date="2026-02-20", end_date=args.today)))["hourly"]
        wx["forecast"][venue] = get_json("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(
            dict(q, past_days=10, forecast_days=16)))["hourly"]
        if venue not in wx["climate"]:
            wx["climate"][venue] = get_json("https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(
                dict(q, start_date="2016-10-15", end_date="2025-12-05")))["hourly"]
        time.sleep(0.5)
    save("weather.json", wx)
    step("weather done")


if __name__ == "__main__":
    main()
