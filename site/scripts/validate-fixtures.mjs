#!/usr/bin/env node
// Validate our fixture data against the K League's own schedule feed.
//
//   node site/scripts/validate-fixtures.mjs
//
// Checks two things:
//   1. Every remaining fixture in site/src/data/seasonRivals.ts has the right
//      club at home. A reversed venue silently corrupts the promotion model,
//      because home advantage gets applied to the wrong side.
//   2. Every Seoul E-Land fixture in data/fixtures.yaml matches the official
//      round, venue and opponent.
//
// The feed is the one the kleague.com schedule page calls itself, so it is as
// authoritative as it gets. It is queried a month at a time because that is
// how the page does it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

const CODE_TO_SLUG = {
  K02: "suwon-samsung", K06: "busan-ipark", K07: "jeonnam", K08: "seongnam",
  K17: "daegu", K20: "gyeongnam", K29: "suwon-fc", K31: "seoul-e-land",
  K32: "ansan", K34: "chungnam-asan", K36: "gimpo", K37: "cheongju",
  K38: "cheonan", K39: "hwaseong", K40: "paju", K41: "gimhae", K42: "yongin",
};

// How data/fixtures.yaml names each opponent.
const SLUG_TO_FIXTURE_NAME = {
  "suwon-samsung": "Suwon Bluewings", "busan-ipark": "Busan IPark",
  jeonnam: "Jeonnam Dragons", seongnam: "Seongnam FC", daegu: "Daegu",
  gyeongnam: "Gyeongnam", "suwon-fc": "Suwon FC", ansan: "Ansan Greeners",
  "chungnam-asan": "Chungnam Asan", gimpo: "Gimpo Citizen",
  cheongju: "Chungbuk Cheongju", cheonan: "Cheonan", hwaseong: "Hwaseong FC",
  paju: "Paju Frontier", gimhae: "Gimhae FC", yongin: "Yongin",
};

async function fetchSchedule(year = "2026", leagueId = "2") {
  const all = [];
  for (let m = 2; m <= 12; m += 1) {
    const month = String(m).padStart(2, "0");
    const res = await fetch("https://www.kleague.com/getScheduleList.do", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({ leagueId, teamId: null, ticketStatus: null, year, month, ticketYn: null }),
    });
    if (!res.ok) throw new Error(`schedule fetch failed for ${year}-${month}: ${res.status}`);
    const json = await res.json();
    all.push(...(json?.data?.scheduleList ?? []));
  }
  return all;
}

const fixtures = await fetchSchedule();
if (fixtures.length === 0) {
  console.error("No fixtures returned. The endpoint or its payload shape may have changed.");
  process.exit(2);
}

const official = new Map(); // `${round}|${slugA}|${slugB}` sorted -> home slug
for (const f of fixtures) {
  const home = CODE_TO_SLUG[f.homeTeam];
  const away = CODE_TO_SLUG[f.awayTeam];
  if (!home || !away) {
    console.error(`Unknown club code in feed: ${f.homeTeam} / ${f.awayTeam}`);
    process.exit(2);
  }
  official.set(`${f.roundId}|${[home, away].sort().join("|")}`, { home, away, date: f.gameDate });
}

let problems = 0;

// --- 1. rival fixtures -----------------------------------------------------
const rivalsSrc = readFileSync(path.join(repo, "site/src/data/seasonRivals.ts"), "utf8");
const rivalRows = [...rivalsSrc.matchAll(/\{ round: (\d+), home: "([a-z-]+)", away: "([a-z-]+)" \}/g)];
let rivalOk = 0;
for (const [, roundRaw, home, away] of rivalRows) {
  const round = Number(roundRaw);
  const rec = official.get(`${round}|${[home, away].sort().join("|")}`);
  if (!rec) {
    console.error(`R${round} ${home} v ${away}: not in the official schedule`);
    problems += 1;
  } else if (rec.home !== home) {
    console.error(`R${round} ${home} (H) v ${away} (A): official has ${rec.home} at home. VENUE REVERSED`);
    problems += 1;
  } else rivalOk += 1;
}
console.log(`seasonRivals.ts: ${rivalOk}/${rivalRows.length} fixtures correct`);

// --- 2. Seoul's own fixtures ----------------------------------------------
const yaml = readFileSync(path.join(repo, "data/fixtures.yaml"), "utf8");
let seoulOk = 0;
let seoulRows = 0;
for (const block of yaml.split(/\n {2}- round: /).slice(1)) {
  const round = Number(block.match(/^(\d+)/)?.[1]);
  const venue = block.match(/venue: (\w+)/)?.[1];
  const opponent = block.match(/opponent: "([^"]+)"/)?.[1];
  if (!round || !venue || !opponent) continue;
  seoulRows += 1;
  const entry = fixtures.find((f) => Number(f.roundId) === round && (f.homeTeam === "K31" || f.awayTeam === "K31"));
  if (!entry) {
    console.error(`R${round}: Seoul fixture not in the official schedule`);
    problems += 1;
    continue;
  }
  const atHome = entry.homeTeam === "K31";
  const oppSlug = CODE_TO_SLUG[atHome ? entry.awayTeam : entry.homeTeam];
  const expectedVenue = atHome ? "home" : "away";
  const expectedOpp = SLUG_TO_FIXTURE_NAME[oppSlug] ?? oppSlug;
  if (venue !== expectedVenue || opponent !== expectedOpp) {
    console.error(`R${round}: ours "${venue} v ${opponent}", official "${expectedVenue} v ${expectedOpp}"`);
    problems += 1;
  } else seoulOk += 1;
}
console.log(`fixtures.yaml:   ${seoulOk}/${seoulRows} fixtures correct`);

if (problems > 0) {
  console.error(`\n${problems} problem(s) found.`);
  process.exit(1);
}
console.log("\nAll fixture venues match the K League schedule.");
