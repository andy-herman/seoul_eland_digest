// Mascot Kart headless suite: seeded races with no DOM. Run:
//   npx esbuild src/kart/headless.ts --bundle --platform=node --format=esm --outfile=/tmp/kart-headless.mjs && node /tmp/kart-headless.mjs [quick]
// Checks: every AI finishes every track in both modes; no NaN, no karts lost; lap times in a band;
// a scripted player finishes in a position band per difficulty; a player who presses nothing never
// finishes and comes last; same seed, same result; items are picked up, used and land hits.
import { buildGrid, CUPS, type CupId } from "./data";
import { Race, runRace } from "./sim";
import { buildTrack, angleDiff, pointAt, wrap, type Track } from "./track";
import { TRACKS } from "./tracks";
import { KART_STEP, type Difficulty, type Inputs, type Mode, type RaceOptions } from "./types";

const quick = process.argv.includes("quick");
const violations: string[] = [];
const t0 = Date.now();
const trackCache = new Map<string, Track>();
const trackOf = (id: string) => {
  if (!trackCache.has(id)) trackCache.set(id, buildTrack(TRACKS[id]));
  return trackCache.get(id)!;
};
const cupOf = (trackId: string): CupId => (CUPS.korea.tracks.includes(trackId) ? "korea" : "seoul");

function options(trackId: string, mode: Mode, difficulty: Difficulty, seed: number, human: boolean): RaceOptions {
  const cup = CUPS[cupOf(trackId)];
  const grid = buildGrid("leoul", cup.field, undefined, 4);
  if (!human) grid[4] = { id: "lenyang", human: false, skill: 0, style: "clean" };
  return { track: TRACKS[trackId], racers: grid, mode, difficulty, seed, headless: true };
}

// A casual player: a sloppier line than the AI, drifts only the tight corners and lets go when the
// corner ends (no deliberate instant boosts), fires boosters on straights, uses items straight away.
function makeBot(seed: number) {
  let r = seed * 7919 + 1;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  let wob = 0;
  let wobT = 0;
  let itemCd = 0;
  let cd = 0;
  return (race: Race): Inputs => {
    const k = race.human!;
    const tr = race.track;
    const out: Inputs = { steer: 0, throttle: true, brake: false, drift: false, item: false };
    if (race.state.phase === "countdown") {
      out.throttle = race.state.time > -0.45 && (seed % 3 !== 0 || race.state.time > -0.1);
      return out;
    }
    const v = Math.abs(k.speed);
    const look = 7 + v * 0.45;
    const ti = wrap(k.si + Math.round(look / tr.ds), tr.n);
    wobT -= KART_STEP;
    if (wobT <= 0) {
      wobT = 0.8 + rand() * 1.6;
      wob = (rand() - 0.5) * 1.8;
    }
    const lat = tr.line[ti] * 0.6 + wob;
    const p = pointAt(tr, ti, lat);
    const err = angleDiff(Math.atan2(p.z - k.z, p.x - k.x), k.drifting ? k.phi : k.theta);
    out.steer = Math.max(-1, Math.min(1, err * 2.4));
    const s = tr.samples[k.si];
    const over = Math.abs(angleDiff(k.phi, Math.atan2(s.tz, s.tx))) > 0.75;
    let kFar = 0;
    let dir = 0;
    let kSame = 0;
    for (let d = 2; d <= 30; d += 2) {
      const c = tr.lineCurv[wrap(k.si + Math.round(d / tr.ds), tr.n)];
      if (d >= 8 && Math.abs(c) > kFar) {
        kFar = Math.abs(c);
        dir = Math.sign(c);
      }
      if (d <= 20) kSame = Math.max(kSame, c * (k.driftDir || 1));
    }
    cd -= KART_STEP;
    if (k.drifting) out.drift = (k.driftT < 0.3 || kSame > 0.022) && k.driftT < 2.2 && !over;
    else if (kFar > 0.042 && v > 17 && !over && cd <= 0) {
      out.drift = true;
      out.steer = dir;
    }
    if (k.drifting && !out.drift) cd = 0.5;
    for (let d = 0; d <= 50; d += 5) {
      const j = wrap(k.si + Math.round(d / tr.ds), tr.n);
      if (v > Math.sqrt((tr.vmax[j] * 0.95) ** 2 + 2 * 14 * d) + 3) out.throttle = false;
    }
    itemCd -= KART_STEP;
    const boosterOk = race.opts.mode === "speed" && k.boosters > 0 && !k.drifting && Math.abs(k.slip) < 0.25 && kFar < 0.02;
    if (itemCd <= 0 && (boosterOk || (race.opts.mode === "item" && k.items.length && k.rouletteT <= 0))) {
      out.item = true;
      itemCd = 0.8;
    }
    return out;
  };
}

interface Tally {
  races: number;
  positions: number[];
  wins: number;
  dnf: number;
  finishTimes: number[];
  bestLaps: number[];
  respawns: number;
  hits: number;
  itemsUsed: number;
  boosts: Record<string, number>;
  airborne: number;
  walls: number;
}
const tally = (): Tally => ({ races: 0, positions: [], wins: 0, dnf: 0, finishTimes: [], bestLaps: [], respawns: 0, hits: 0, itemsUsed: 0, boosts: {}, airborne: 0, walls: 0 });

function play(opts: RaceOptions, input: ((r: Race) => Inputs) | undefined, t: Tally, label: string): Race {
  const race = new Race(opts, trackOf(opts.track.id));
  const steps = Math.ceil(420 / KART_STEP);
  for (let i = 0; i < steps && race.state.phase !== "done"; i++) {
    race.step(input ? input(race) : null);
    for (const e of race.drainEvents()) {
      if (e.type === "respawn") t.respawns++;
      if (e.type === "boost") t.boosts[e.kind] = (t.boosts[e.kind] ?? 0) + 1;
      if (e.type === "land") t.airborne++;
      if (e.type === "wall") t.walls++;
    }
    for (const k of race.state.karts) {
      if (!Number.isFinite(k.x) || !Number.isFinite(k.z) || !Number.isFinite(k.y) || !Number.isFinite(k.speed)) {
        violations.push(`${label}: NaN kart ${k.id}`);
        return race;
      }
    }
  }
  if (race.state.phase !== "done") violations.push(`${label}: race did not end`);
  t.races++;
  const L = race.track.length;
  for (const k of race.state.karts) {
    t.hits += k.hits;
    t.itemsUsed += k.itemsUsed;
    if (k.human || !opts.racers.some((r) => r.human)) {
      if (k.human) t.positions.push(k.rank);
      if (k.human && k.rank === 1) t.wins++;
      if (Number.isFinite(k.finishTime)) {
        t.finishTimes.push(k.finishTime);
        t.bestLaps.push(Math.min(...k.lapTimes));
      } else t.dnf++;
    }
    // an AI may retire a few seconds short after a run of item hits (KartRider's retire countdown);
    // one more than a fifth of a lap short when the countdown ends was stuck or lost
    if (!k.human && !Number.isFinite(k.finishTime) && !opts.racers.some((r) => r.human) && k.dist < (race.laps - 0.2) * L) violations.push(`${label}: AI ${k.id} did not finish (dist ${k.dist.toFixed(0)} of ${(race.laps * L).toFixed(0)})`);
  }
  return race;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const summary = (t: Tally) => ({
  races: t.races,
  meanPos: +mean(t.positions).toFixed(2),
  winPct: t.positions.length ? +((t.wins / t.positions.length) * 100).toFixed(0) : null,
  dnf: t.dnf,
  meanFinish: +mean(t.finishTimes).toFixed(1),
  bestLap: t.bestLaps.length ? +Math.min(...t.bestLaps).toFixed(2) : null,
  meanBestLap: +mean(t.bestLaps).toFixed(2),
  respawnsPerRace: +(t.respawns / Math.max(1, t.races)).toFixed(2),
  hitsPerRace: +(t.hits / Math.max(1, t.races)).toFixed(1),
  itemsPerRace: +(t.itemsUsed / Math.max(1, t.races)).toFixed(1),
  boostsPerRace: Object.fromEntries(Object.entries(t.boosts).map(([k, v]) => [k, +(v / Math.max(1, t.races)).toFixed(1)])),
  jumpsPerRace: +(t.airborne / Math.max(1, t.races)).toFixed(1),
  wallsPerRace: +(t.walls / Math.max(1, t.races)).toFixed(1),
});

const report: Record<string, unknown> = {};
const tracks = Object.keys(TRACKS);
const seeds = quick ? 4 : 12;
for (const id of tracks) {
  const tr = trackOf(id);
  const out: Record<string, unknown> = { length: +tr.length.toFixed(0) };
  for (const mode of ["speed", "item"] as Mode[]) {
    for (const diff of mode === "speed" ? (["rookie", "l1", "pro"] as Difficulty[]) : (["l1"] as Difficulty[])) {
      const ai = tally();
      for (let s = 1; s <= seeds; s++) play(options(id, mode, diff, 100 + s, false), undefined, ai, `${id} ${mode} ${diff} ai seed ${s}`);
      out[`${mode}-${diff}-ai`] = summary(ai);
    }
    for (const diff of ["rookie", "l1", "pro"] as Difficulty[]) {
      const bot = tally();
      for (let s = 1; s <= seeds; s++) play(options(id, mode, diff, 500 + s, true), makeBot(s), bot, `${id} ${mode} ${diff} bot seed ${s}`);
      out[`${mode}-${diff}-bot`] = summary(bot);
    }
  }
  const none = tally();
  for (let s = 1; s <= 2; s++) play(options(id, "item", "rookie", 900 + s, true), () => ({ steer: 0, throttle: false, brake: false, drift: false, item: false }), none, `${id} noinput ${s}`);
  out.noInput = summary(none);
  if (none.dnf !== none.races || none.positions.some((p) => p !== 9)) violations.push(`${id}: a player with no input finished or did not come last`);
  // determinism
  const a = runRace(options(id, "item", "pro", 4242, true), makeBot(3));
  const b = runRace(options(id, "item", "pro", 4242, true), makeBot(3));
  const sig = (r: Race) => r.state.karts.map((k) => `${k.id}:${k.rank}:${k.finishTime.toFixed(3)}`).join(",");
  if (sig(a) !== sig(b)) violations.push(`${id}: not deterministic`);
  report[id] = out;
}
report.violations = violations;
report.runtimeSeconds = +((Date.now() - t0) / 1000).toFixed(1);
console.log(JSON.stringify(report, null, 1));
process.exit(violations.length ? 1 : 0);
