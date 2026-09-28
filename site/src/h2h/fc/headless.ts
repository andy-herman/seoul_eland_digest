import { performance } from "node:perf_hooks";
import { AI_TIER, OPPONENT_SLUGS, type SquadPlayer } from "../data";
import { bestFive } from "../ratings";
import { FcMatch, blankFcInput } from "./sim";
import { FC_STEP, GOLDEN_GOAL_SECONDS, MATCH_SECONDS, PITCH_L, PITCH_W, type FcInput, type FcMatchOptions, type RestartType, type Side } from "./types";

const home = bestFive(16);
const AI_MATCHES = 150;
const HUMAN_MATCHES = 40;
const TEST_SECONDS = 100;
const started = performance.now();

type TierKey = "1" | "2" | "3" | "4";
interface Totals {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  passes: { home: number; away: number };
  passesDone: { home: number; away: number };
  shots: { home: number; away: number };
  onTarget: { home: number; away: number };
  fouls: { home: number; away: number };
  saves: { home: number; away: number };
  headers: number;
  restarts: Record<RestartType, number>;
}

class ScriptedBot {
  private last = blankFcInput();
  private passCooldown = 0;
  private shootHeld = 0;
  private lobHeld = 0;
  constructor(private readonly leaveSomeRestarts: boolean) {}
  input(m: FcMatch): FcInput {
    const out = blankFcInput();
    this.passCooldown = Math.max(0, this.passCooldown - FC_STEP);
    const sp = m.state.setPiece;
    if (sp?.side === "home") {
      if (this.leaveSomeRestarts && sp.waitT < 5.1) return this.finish(out);
      out.mx = 0.7;
      out.mz = sp.type === "corner" ? (sp.spotZ < PITCH_W / 2 ? 0.6 : -0.6) : 0;
      if (sp.direct && sp.waitT > 0.25) out.shoot = sp.waitT < 0.55;
      else if (sp.type === "corner") out.lob = sp.waitT < 0.55;
      else out.pass = sp.waitT > 0.2 && sp.waitT < 0.35;
      return this.finish(out);
    }
    const controlled = m.state.players[m.state.controlled];
    const ball = m.state.ball;
    const owner = ball.owner;
    if (owner?.side === "home" && owner.index === controlled.index) {
      const goalDist = PITCH_L - controlled.x;
      out.sprint = true;
      if (goalDist < 20 && Math.abs(controlled.z - PITCH_W / 2) < 12) {
        this.shootHeld += FC_STEP;
        out.shoot = this.shootHeld < 0.45;
        out.mz = controlled.z < PITCH_W / 2 ? 0.25 : -0.25;
      } else if (this.passCooldown <= 0) {
        out.pass = !this.last.pass;
        this.passCooldown = 1.6;
        this.shootHeld = 0;
      } else {
        out.mx = 1;
        out.mz = (PITCH_W / 2 - controlled.z) / 18;
        this.shootHeld = 0;
      }
    } else if (owner?.side === "away") {
      const carrier = m.state.players[5 + owner.index];
      const dx = carrier.x - controlled.x;
      const dz = carrier.z - controlled.z;
      const d = Math.hypot(dx, dz) || 1;
      out.mx = dx / d;
      out.mz = dz / d;
      out.sprint = true;
      if (d > 5 && !this.last.pass) out.pass = true;
      if (d < 1.8 && !this.last.shoot) out.shoot = true;
      if (d < 2.8 && d > 1.6 && !this.last.lob) out.lob = true;
      this.shootHeld = 0;
    } else {
      const dx = ball.x - controlled.x;
      const dz = ball.z - controlled.z;
      const d = Math.hypot(dx, dz) || 1;
      out.mx = dx / d;
      out.mz = dz / d;
      out.sprint = true;
      this.shootHeld = 0;
    }
    return this.finish(out);
  }
  private finish(next: FcInput): FcInput {
    this.last = { ...next };
    return next;
  }
}


const allRestarts = blankRestartCounts();
let allSaves = 0;
let allHeaders = 0;
const equal = blankTotals();
for (let i = 0; i < AI_MATCHES; i++) {
  const m = runAi({ opponent: OPPONENT_SLUGS[i % OPPONENT_SLUGS.length], tier: 2, homeAiTier: 2, mirror: true, seed: 10000 + i * 97 }, `mirror-${i}`);
  addMatch(equal, m);
}
const equalSplit = equal.gf / Math.max(1, equal.gf + equal.ga);
const equalGpm = (equal.gf + equal.ga) / equal.matches;
if (equalSplit < 0.38 || equalSplit > 0.62) throw new Error(`equal-AI split ${equalSplit.toFixed(3)} outside 0.38..0.62`);
if (equalGpm < 2 || equalGpm > 10) throw new Error(`equal-AI GPM ${equalGpm.toFixed(2)} outside 2..8`);

const tiers: Record<TierKey, Totals> = { "1": blankTotals(), "2": blankTotals(), "3": blankTotals(), "4": blankTotals() };
for (const tier of [1, 2, 3, 4] as const) {
  const opponents = OPPONENT_SLUGS.filter((o) => AI_TIER[o] === tier);
  for (let i = 0; i < AI_MATCHES; i++) {
    const opponent = opponents[i % opponents.length] ?? OPPONENT_SLUGS[0];
    const m = runAi({ opponent, tier, homeAiTier: 2, seed: 50000 + tier * 100000 + i * 131 }, `tier-${tier}-${i}`);
    addMatch(tiers[String(tier) as TierKey], m);
  }
}

const rows = Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, summarize(v)])) as Record<TierKey, ReturnType<typeof summarize>>;
for (const tier of ["1", "2", "3", "4"] as const) {
  const row = rows[tier];
  if (row.goalsPerMatch < 2 || row.goalsPerMatch > 10) throw new Error(`tier ${tier} GPM out of range: ${row.goalsPerMatch}`);
  if (row.passes.home < 8 || row.passes.away < 8) throw new Error(`tier ${tier} passes too low: ${JSON.stringify(row.passes)}`);
  if (row.shots.home < 1.4 || row.shots.away < 1.4) throw new Error(`tier ${tier} shots too low: ${JSON.stringify(row.shots)}`);
}
if (!(rows["1"].ppm > rows["2"].ppm)) throw new Error(`top tiers not ordered: ${rows["1"].ppm}, ${rows["2"].ppm}`);
if (rows["1"].winPct < 0.55) throw new Error(`T1 home win too low: ${rows["1"].winPct}`);
if (rows["4"].lossPct < 0.25) throw new Error(`T4 home loss too low: ${rows["4"].lossPct}`);
const human: Record<TierKey, Totals> = { "1": blankTotals(), "2": blankTotals(), "3": blankTotals(), "4": blankTotals() };
for (const tier of [1, 2, 3, 4] as const) {
  const opponents = OPPONENT_SLUGS.filter((o) => AI_TIER[o] === tier);
  for (let i = 0; i < HUMAN_MATCHES; i++) {
    const opponent = opponents[i % opponents.length] ?? OPPONENT_SLUGS[0];
    const m = runHuman({ opponent, tier, seed: 90000 + tier * 10000 + i * 173 }, `human-${tier}-${i}`, i % 4 === 0);
    addMatch(human[String(tier) as TierKey], m);
  }
}
for (const [tier, total] of Object.entries(human)) {
  const row = summarize(total);
  if (row.passes.home < 4 || row.shots.home < 1 || total.gf <= 0) throw new Error(`scripted human tier ${tier} did not attack enough: ${JSON.stringify(row)}`);
  if (total.fouls.home + total.fouls.away <= 0 && total.restarts.freekick <= 0) throw new Error(`scripted human tier ${tier} produced no tackles/fouls/free kicks`);
}

const noInput = blankTotals();
const t1Opponents = OPPONENT_SLUGS.filter((o) => AI_TIER[o] === 1);
for (let i = 0; i < 20; i++) {
  const opponent = t1Opponents[i % t1Opponents.length] ?? OPPONENT_SLUGS[0];
  const m = new FcMatch({ home, captain: home[4].num, opponent, kit: "home", mode: "league", seed: 700000 + i * 193, tier: 1, seconds: TEST_SECONDS });
  const blank = blankFcInput();
  const played = run(m, `no-input-${i}`, () => blank);
  addMatch(noInput, played);
}
const noInputRow = summarize(noInput);
if (noInput.losses < 10 || ((noInput.wins * 3 + noInput.draws) / noInput.matches) > 0.8) throw new Error(`no-input home did not lose clearly: ${JSON.stringify(noInputRow)}`);

for (const [k, v] of Object.entries(allRestarts)) if (v <= 0) throw new Error(`restart never occurred: ${k}`);
if (allSaves <= 0) throw new Error("saves never occurred");
if (allHeaders <= 0) throw new Error("headers never occurred");

const detA = runAi({ opponent: "busan-ipark", tier: 4, homeAiTier: 2, seed: 424242 }, "det-a");
const detB = runAi({ opponent: "busan-ipark", tier: 4, homeAiTier: 2, seed: 424242 }, "det-b");
const detAData = JSON.stringify({ score: detA.state.score, stats: detA.state.stats, restarts: detA.debug.restartCounts, headers: detA.debug.headers });
const detBData = JSON.stringify({ score: detB.state.score, stats: detB.state.stats, restarts: detB.debug.restartCounts, headers: detB.debug.headers });
if (detAData !== detBData) throw new Error("determinism failed");

const summary = {
  aiMatches: AI_MATCHES * 5,
  scriptedHumanMatches: HUMAN_MATCHES * 4,
  equalAi: { matches: equal.matches, homeGoalSplit: round(equalSplit), goalsPerMatch: round(equalGpm), wdl: wdl(equal) },
  tiers: rows,
  scriptedHuman: Object.fromEntries(Object.entries(human).map(([k, v]) => [k, summarize(v)])),
  noInput: noInputRow,
  restartCounts: allRestarts,
  saves: allSaves,
  headers: allHeaders,
  runtimeSeconds: round((performance.now() - started) / 1000),
};
console.log(JSON.stringify(summary, null, 2));

function runAi(partial: Pick<FcMatchOptions, "opponent" | "seed" | "tier" | "homeAiTier" | "mirror">, label: string): FcMatch {
  const m = new FcMatch({ home, captain: home[4].num, kit: "home", mode: "ai", seconds: TEST_SECONDS, ...partial });
  return run(m, label, () => blankFcInput());
}

function runHuman(partial: Pick<FcMatchOptions, "opponent" | "seed" | "tier">, label: string, leaveSomeRestarts: boolean): FcMatch {
  const m = new FcMatch({ home, captain: home[4].num, kit: "home", mode: "league", seconds: TEST_SECONDS, ...partial });
  const bot = new ScriptedBot(leaveSomeRestarts);
  return run(m, label, () => bot.input(m));
}

function run(m: FcMatch, label: string, inputFor: () => FcInput): FcMatch {
  const maxSteps = Math.ceil(((m.opts.seconds ?? MATCH_SECONDS) + GOLDEN_GOAL_SECONDS + 120) / FC_STEP);
  let quietT = 0;
  let maxRestart = 0;
  for (let i = 0; i < maxSteps && m.state.phase !== "ended"; i++) {
    m.step(inputFor());
    assertFinite(m, label);
    if (m.state.phase === "play") {
      if (m.state.ball.owner === null && m.state.ball.h < 0.05 && Math.hypot(m.state.ball.vx, m.state.ball.vz) < 0.08) quietT += FC_STEP;
      else quietT = 0;
      if (quietT > 6 && !label.startsWith("no-input")) throw new Error(`${label}: ball stuck > 6s`);
      if (m.state.ball.x < -3.001 || m.state.ball.x > PITCH_L + 3.001 || m.state.ball.z < -3.001 || m.state.ball.z > PITCH_W + 3.001) throw new Error(`${label}: ball escaped during play`);
      for (const p of m.state.players) if (p.x < -3.001 || p.x > PITCH_L + 3.001 || p.z < -3.001 || p.z > PITCH_W + 3.001) throw new Error(`${label}: player escaped`);
    }
    if (m.state.phase === "restart") {
      maxRestart = Math.max(maxRestart, m.state.setPiece?.waitT ?? 0);
      if ((m.state.setPiece?.waitT ?? 0) > 7.02) throw new Error(`${label}: restart did not resolve within 7s`);
    }
  }
  if (m.state.phase !== "ended") throw new Error(`${label}: did not end`);
  if (m.state.elapsed > (m.opts.seconds ?? MATCH_SECONDS) + GOLDEN_GOAL_SECONDS + 0.1) throw new Error(`${label}: match overran`);
  const poss = m.state.stats.home.possession + m.state.stats.away.possession;
  if (poss > m.state.elapsed + 0.15) throw new Error(`${label}: possession exceeds elapsed`);
  void maxRestart;
  return m;
}

function addMatch(t: Totals, m: FcMatch): void {
  t.matches++;
  t.gf += m.state.score.home;
  t.ga += m.state.score.away;
  if (m.state.score.home > m.state.score.away) t.wins++;
  else if (m.state.score.home < m.state.score.away) t.losses++;
  else t.draws++;
  for (const side of ["home", "away"] as const) {
    t.passes[side] += m.state.stats[side].passes;
    t.passesDone[side] += m.state.stats[side].passesDone;
    t.shots[side] += m.state.stats[side].shots;
    t.onTarget[side] += m.state.stats[side].onTarget;
    t.fouls[side] += m.state.stats[side].fouls;
    t.saves[side] += m.state.stats[side].saves;
    allSaves += m.state.stats[side].saves;
  }
  t.headers += m.debug.headers;
  allHeaders += m.debug.headers;
  for (const k of Object.keys(t.restarts) as RestartType[]) {
    t.restarts[k] += m.debug.restartCounts[k];
    allRestarts[k] += m.debug.restartCounts[k];
  }
}

function summarize(t: Totals) {
  return {
    wdl: wdl(t),
    winPct: round(t.wins / t.matches),
    lossPct: round(t.losses / t.matches),
    ppm: round((t.wins * 3 + t.draws) / t.matches),
    goalsPerMatch: round((t.gf + t.ga) / t.matches),
    passes: { home: round(t.passes.home / t.matches), away: round(t.passes.away / t.matches) },
    completionPct: { home: pct(t.passesDone.home, t.passes.home), away: pct(t.passesDone.away, t.passes.away) },
    shots: { home: round(t.shots.home / t.matches), away: round(t.shots.away / t.matches) },
    onTarget: { home: round(t.onTarget.home / t.matches), away: round(t.onTarget.away / t.matches) },
    fouls: { home: round(t.fouls.home / t.matches), away: round(t.fouls.away / t.matches) },
    restarts: Object.fromEntries(Object.entries(t.restarts).map(([k, v]) => [k, round(v / t.matches)])),
    saves: round((t.saves.home + t.saves.away) / t.matches),
    headers: round(t.headers / t.matches),
  };
}

function blankTotals(): Totals {
  return { matches: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, passes: { home: 0, away: 0 }, passesDone: { home: 0, away: 0 }, shots: { home: 0, away: 0 }, onTarget: { home: 0, away: 0 }, fouls: { home: 0, away: 0 }, saves: { home: 0, away: 0 }, headers: 0, restarts: blankRestartCounts() };
}

function blankRestartCounts(): Record<RestartType, number> {
  return { kickoff: 0, throwin: 0, corner: 0, goalkick: 0, freekick: 0, penalty: 0 };
}

function assertFinite(m: FcMatch, label: string): void {
  for (const v of [m.state.ball.x, m.state.ball.z, m.state.ball.h, m.state.ball.vx, m.state.ball.vz, m.state.ball.vh]) if (!Number.isFinite(v)) throw new Error(`${label}: non-finite ball`);
  for (const p of m.state.players) for (const v of [p.x, p.z, p.vx, p.vz, p.fx, p.fz]) if (!Number.isFinite(v)) throw new Error(`${label}: non-finite player`);
}

function pct(done: number, attempts: number): number {
  return attempts > 0 ? round(done / attempts) : 0;
}

function wdl(t: Totals): string {
  return `${t.wins}-${t.draws}-${t.losses}`;
}

function round(v: number): number {
  return Number(v.toFixed(3));
}
