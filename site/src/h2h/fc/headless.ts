// Headless balance and robustness suite for the FC match engine. Every number comes from real play.
// Run: cd site && npx esbuild src/h2h/fc/headless.ts --bundle --platform=node --format=esm --outfile=/tmp/fc-headless.mjs && node /tmp/fc-headless.mjs
import { bestFive } from "../ratings";
import { FcMatch, blankFcInput, simulateFcMatch } from "./sim";
import { MATCH_SECONDS, PITCH_L, PITCH_W, type FcInput, type FcMatchOptions, type RestartType } from "./types";

type Tier = 1 | 2 | 3 | 4;
const HOME = bestFive(16);
const base = (seed: number, tier: Tier, extra: Partial<FcMatchOptions> = {}): FcMatchOptions => ({ home: HOME, captain: 16, opponent: "suwon-fc", kit: "home", mode: "ai", seed, tier, ...extra });

interface Agg {
  n: number;
  w: number;
  d: number;
  l: number;
  gh: number;
  ga: number;
  shots: [number, number];
  onTarget: [number, number];
  passes: [number, number];
  done: [number, number];
  tackles: number;
  fouls: number;
  saves: number;
  headers: number;
  restarts: Record<RestartType, number>;
}

function agg(): Agg {
  return { n: 0, w: 0, d: 0, l: 0, gh: 0, ga: 0, shots: [0, 0], onTarget: [0, 0], passes: [0, 0], done: [0, 0], tackles: 0, fouls: 0, saves: 0, headers: 0, restarts: { kickoff: 0, throwin: 0, corner: 0, goalkick: 0, freekick: 0, penalty: 0 } };
}

const violations: string[] = [];

function check(m: FcMatch, label: string): void {
  const s = m.state;
  const d = m.debug;
  if (s.phase !== "ended") violations.push(`${label}: did not end`);
  if (s.elapsed > (m.opts.seconds ?? MATCH_SECONDS) + 61) violations.push(`${label}: ran long ${s.elapsed.toFixed(1)}`);
  if (d.maxStuckT > 6) violations.push(`${label}: ball stuck ${d.maxStuckT.toFixed(1)} s`);
  if (d.maxRestartWait > 7) violations.push(`${label}: restart waited ${d.maxRestartWait.toFixed(1)} s`);
  if (s.stats.home.possession + s.stats.away.possession > s.elapsed + 0.05) violations.push(`${label}: possession exceeds play time`);
}

function add(a: Agg, m: FcMatch): void {
  const s = m.state;
  a.n++;
  a.gh += s.score.home;
  a.ga += s.score.away;
  if (s.score.home > s.score.away) a.w++;
  else if (s.score.home === s.score.away) a.d++;
  else a.l++;
  const h = s.stats.home;
  const w = s.stats.away;
  a.shots[0] += h.shots;
  a.shots[1] += w.shots;
  a.onTarget[0] += h.onTarget;
  a.onTarget[1] += w.onTarget;
  a.passes[0] += h.passes;
  a.passes[1] += w.passes;
  a.done[0] += h.passesDone;
  a.done[1] += w.passesDone;
  a.tackles += h.tackles + w.tackles;
  a.fouls += h.fouls + w.fouls;
  a.saves += h.saves + w.saves;
  a.headers += m.debug.headers;
  for (const k of Object.keys(a.restarts) as RestartType[]) a.restarts[k] += m.debug.restartCounts[k];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function summary(a: Agg) {
  const n = Math.max(1, a.n);
  return {
    wdl: `${a.w}-${a.d}-${a.l}`,
    win: r2(a.w / n),
    loss: r2(a.l / n),
    ppm: r2((a.w * 3 + a.d) / n),
    gpm: r2((a.gh + a.ga) / n),
    shots: [r2(a.shots[0] / n), r2(a.shots[1] / n)],
    onTarget: [r2(a.onTarget[0] / n), r2(a.onTarget[1] / n)],
    passes: [r2(a.passes[0] / n), r2(a.passes[1] / n)],
    completion: [r2(a.done[0] / Math.max(1, a.passes[0])), r2(a.done[1] / Math.max(1, a.passes[1]))],
    tackles: r2(a.tackles / n),
    fouls: r2(a.fouls / n),
    saves: r2(a.saves / n),
    savePct: r2(a.saves / Math.max(1, a.onTarget[0] + a.onTarget[1])),
    headers: r2(a.headers / n),
    perMatch: Object.fromEntries(Object.entries(a.restarts).map(([k, v]) => [k, r2(v / n)])),
  };
}

function ensure(cond: boolean, msg: string): void {
  if (!cond) violations.push(msg);
}

// A simple human stand-in that only uses FcInput: runs at the ball, dribbles at goal, passes on a timer,
// shoots inside ~20 m with a held charge, tackles and switches when defending, takes most set pieces.
function makeBot(seed: number) {
  let t = 0;
  let hold: "shoot" | "lob" | null = null;
  let holdT = 0;
  let passCd = 0.8;
  let tapped = "";
  let restartSeen = 0;
  let skipRestart = false;
  return (m: FcMatch): FcInput => {
    const s = m.state;
    const inp = blankFcInput();
    t += 1 / 60;
    passCd -= 1 / 60;
    const me = s.players[s.controlled];
    const b = s.ball;
    const sp = s.setPiece;
    const tap = (k: "pass" | "shoot" | "lob" | "through") => {
      const key = `${k}-${Math.floor(t * 4)}`;
      if (tapped !== key) {
        tapped = key;
        inp[k] = true;
      }
    };
    if (hold) {
      holdT -= 1 / 60;
      if (holdT > 0) {
        inp[hold] = true;
        return inp;
      }
      hold = null;
      return inp;
    }
    if (s.phase === "restart" && sp?.side === "home") {
      if (sp.waitT < 0.05) {
        restartSeen++;
        skipRestart = (restartSeen + seed) % 4 === 0;
      }
      if (skipRestart || sp.waitT < 0.6) return inp;
      if (sp.type === "penalty" || (sp.type === "freekick" && sp.direct && (restartSeen + seed) % 2 === 0)) {
        inp.mz = seed % 2 ? 0.8 : -0.8;
        hold = "shoot";
        holdT = 0.5;
      } else if (sp.type === "corner") {
        hold = "lob";
        holdT = 0.45;
      } else inp.pass = true;
      return inp;
    }
    if (s.phase !== "play") return inp;
    const mine = b.owner?.side === "home" && b.owner.index === s.controlled;
    if (mine) {
      const dx = PITCH_L - me.x;
      inp.mx = 1;
      inp.mz = me.z < PITCH_W / 2 - 3 ? 0.5 : me.z > PITCH_W / 2 + 3 ? -0.5 : 0;
      inp.sprint = dx > 25;
      if (dx < 20 && Math.abs(me.z - PITCH_W / 2) < 12) {
        hold = "shoot";
        holdT = 0.3 + ((seed + Math.floor(t)) % 4) * 0.1;
        inp.mz = seed % 2 ? 0.6 : -0.6;
        inp.shoot = true;
      } else if (passCd <= 0) {
        passCd = 1.1 + ((seed + Math.floor(t * 3)) % 5) * 0.2;
        if ((seed + Math.floor(t)) % 5 === 0) tap("through");
        else tap("pass");
      }
      return inp;
    }
    // defend goal side: aim for a point between the ball and our goal, then tackle when in front
    const gs = b.owner?.side === "away" ? Math.min(1.4, Math.hypot(b.x, b.z - PITCH_W / 2) * 0.1) : 0;
    const tgx = b.x - (b.x / Math.max(1, Math.hypot(b.x, b.z - PITCH_W / 2))) * gs;
    const tgz = b.z - ((b.z - PITCH_W / 2) / Math.max(1, Math.hypot(b.x, b.z - PITCH_W / 2))) * gs;
    const n = Math.hypot(tgx - me.x, tgz - me.z) || 1;
    inp.mx = (tgx - me.x) / n;
    inp.mz = (tgz - me.z) / n;
    inp.sprint = n > 3;
    const toBall = Math.hypot(b.x - me.x, b.z - me.z);
    if (b.owner?.side === "away") {
      const inFront = me.x < b.x + 0.3;
      if (toBall < 1.25 && inFront) tap((seed + Math.floor(t * 2)) % 9 === 0 ? "lob" : "shoot");
      else if (toBall > 9 && (Math.floor(t * 2) + seed) % 3 === 0) tap("pass");
    }
    return inp;
  };
}

function runHuman(seed: number, tier: Tier, input: "bot" | "none"): FcMatch {
  const m = new FcMatch({ ...base(seed, tier), mode: "quick" });
  const bot = makeBot(seed);
  const limit = Math.ceil((MATCH_SECONDS + 61 + 40) * 60);
  for (let i = 0; i < limit && m.state.phase !== "ended"; i++) {
    m.step(input === "bot" ? bot(m) : blankFcInput());
    const s = m.state;
    for (const p of s.players) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) violations.push(`seed ${seed}: NaN player`);
      if (p.x < -3 || p.x > PITCH_L + 3 || p.z < -3 || p.z > PITCH_W + 3) violations.push(`seed ${seed}: player out of bounds`);
    }
    const b = s.ball;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.z) || !Number.isFinite(b.h)) violations.push(`seed ${seed}: NaN ball`);
    if (s.phase === "play" && (b.x < -3 || b.x > PITCH_L + 3 || b.z < -3 || b.z > PITCH_W + 3)) violations.push(`seed ${seed}: ball out of bounds in play`);
    if (violations.length > 20) break;
  }
  if (m.state.phase !== "ended") m.endNow();
  return m;
}

const t0 = Date.now();
const report: Record<string, unknown> = {};

// 1. Mirror: identical ratings and AI on both sides, so any split is structural bias.
const mirror = agg();
for (let i = 0; i < 160; i++) {
  const m = simulateFcMatch(base(500 + i, 2, { homeAiTier: 2, mirror: true }));
  check(m, `mirror ${i}`);
  add(mirror, m);
}
const split = mirror.gh / Math.max(1, mirror.gh + mirror.ga);
report.mirror = { ...summary(mirror), homeGoalSplit: r2(split) };
ensure(split >= 0.45 && split <= 0.55, `mirror split ${split.toFixed(3)} outside 0.45..0.55`);

// 2. A casual user (home AI tier 2 with the real squad) against every rival tier.
const bands: Record<Tier, { win: [number, number]; loss: [number, number] }> = {
  1: { win: [0.7, 0.9], loss: [0, 0.15] },
  2: { win: [0.45, 0.65], loss: [0.15, 0.35] },
  3: { win: [0.28, 0.45], loss: [0.35, 0.55] },
  4: { win: [0.12, 0.28], loss: [0.5, 0.72] },
};
const tiers: Record<string, ReturnType<typeof summary>> = {};
const all = agg();
let lastPpm = Infinity;
for (const tier of [1, 2, 3, 4] as Tier[]) {
  const a = agg();
  for (let i = 0; i < 200; i++) {
    const m = simulateFcMatch(base(10000 + tier * 1000 + i, tier, { homeAiTier: 2 }));
    check(m, `T${tier} ${i}`);
    add(a, m);
    add(all, m);
  }
  const sum = summary(a);
  tiers[`T${tier}`] = sum;
  const bnd = bands[tier];
  ensure(sum.win >= bnd.win[0] && sum.win <= bnd.win[1], `T${tier} win ${sum.win} outside ${bnd.win}`);
  ensure(sum.loss >= bnd.loss[0] && sum.loss <= bnd.loss[1], `T${tier} loss ${sum.loss} outside ${bnd.loss}`);
  ensure(sum.gpm >= 2 && sum.gpm <= 7, `T${tier} goals per match ${sum.gpm} outside 2..7`);
  ensure(sum.ppm < lastPpm, `T${tier} PPM ${sum.ppm} not below the previous tier`);
  ensure(sum.passes[0] >= 12 && sum.passes[1] >= 12, `T${tier} too few passes ${sum.passes}`);
  ensure(sum.shots[0] >= 3 && sum.shots[1] >= 3, `T${tier} too few shots ${sum.shots}`);
  lastPpm = sum.ppm;
}
report.tiers = tiers;
report.aiSample = summary(all);

// 3. Scripted human through FcInput only, 40 matches against each tier.
const human: Record<string, ReturnType<typeof summary>> = {};
const humanAll = agg();
for (const tier of [1, 2, 3, 4] as Tier[]) {
  const a = agg();
  for (let i = 0; i < 40; i++) {
    const m = runHuman(20000 + tier * 100 + i, tier, "bot");
    check(m, `human T${tier} ${i}`);
    add(a, m);
    add(humanAll, m);
  }
  human[`T${tier}`] = summary(a);
}
report.scriptedHuman = human;
const hs = summary(humanAll);
ensure(hs.passes[0] >= 8, `scripted human passes ${hs.passes[0]} per match`);
ensure(hs.shots[0] >= 2, `scripted human shots ${hs.shots[0]} per match`);
ensure(humanAll.gh > 0, "scripted human never scored");
ensure(humanAll.tackles > 0, "no tackles in scripted human play");
for (const k of ["kickoff", "throwin", "corner", "goalkick", "freekick", "penalty"] as RestartType[]) {
  ensure(all.restarts[k] + humanAll.restarts[k] > 0, `restart type ${k} never happened`);
}
ensure(all.saves + humanAll.saves > 0, "no saves");
ensure(all.headers + humanAll.headers > 0, "no headers");

// 4. No input at all: the user's team must clearly lose, so the input matters.
const none = agg();
for (let i = 0; i < 20; i++) {
  const m = runHuman(30000 + i, 1, "none");
  add(none, m);
}
report.noInput = summary(none);
ensure(none.w === 0 && none.gh / none.n <= 0.3 && none.l > none.w, `no-input side should never win and barely score (${summary(none).wdl}, ${none.gh} goals)`);

// 5. Determinism.
const a1 = simulateFcMatch(base(424242, 3, { homeAiTier: 2 }));
const a2 = simulateFcMatch(base(424242, 3, { homeAiTier: 2 }));
ensure(JSON.stringify(a1.state.score) === JSON.stringify(a2.state.score) && JSON.stringify(a1.state.stats) === JSON.stringify(a2.state.stats), "same seed gave different results");

report.violations = violations.slice(0, 30);
report.runtimeSeconds = r2((Date.now() - t0) / 1000);
console.log(JSON.stringify(report, null, 1));
if (violations.length) {
  console.error(`FAILED: ${violations.length} violation(s)`);
  process.exit(1);
}
