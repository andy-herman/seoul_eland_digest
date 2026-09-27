import { performance } from "node:perf_hooks";
import { AI_TIER, OPPONENT_SLUGS, SQUAD, type OpponentSlug } from "../data";
import { GOLDEN_GOAL_SECONDS, MATCH_SECONDS, PITCH_L, PITCH_W, type RestartType } from "./types";
import { simulateFcMatch } from "./sim";

const home = pickHome();
const MATCHES = 200;
const start = performance.now();

interface Row {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  passesHome: number;
  passesAway: number;
  shotsHome: number;
  shotsAway: number;
  winPct?: number;
  lossPct?: number;
  ppm?: number;
  goalsPerMatch?: number;
  passesPerSide?: { home: number; away: number };
  shotsPerSide?: { home: number; away: number };
}

const restartCounts: Record<RestartType, number> = { kickoff: 0, throwin: 0, corner: 0, goalkick: 0, freekick: 0, penalty: 0 };
let saves = 0;
let headers = 0;
let equalHomeGoals = 0;
let equalAwayGoals = 0;
let equalTotalGoals = 0;

for (let i = 0; i < MATCHES; i++) {
  const m = simulateFcMatch({ home, captain: home[4].num, opponent: OPPONENT_SLUGS[i % OPPONENT_SLUGS.length], kit: "home", mode: "ai", seed: 11000 + i * 37, tier: 2, homeAiTier: 2 });
  assertMatch(m, `equal-${i}`);
  equalHomeGoals += m.state.score.home;
  equalAwayGoals += m.state.score.away;
  equalTotalGoals += m.state.score.home + m.state.score.away;
  mergeRestarts(m.debug.restartCounts);
}
const equalSplit = equalHomeGoals / Math.max(1, equalHomeGoals + equalAwayGoals);
const equalGoalsPerMatch = equalTotalGoals / MATCHES;
if (equalSplit < 0.4 || equalSplit > 0.6) throw new Error(`equal AI split out of range: ${equalSplit}`);
if (equalGoalsPerMatch < 2 || equalGoalsPerMatch > 7) throw new Error(`equal AI goals per match out of range: ${equalGoalsPerMatch}`);

const tierRows: Record<string, Row> = {};
for (const tier of [1, 2, 3, 4] as const) {
  const row: Row = { matches: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, passesHome: 0, passesAway: 0, shotsHome: 0, shotsAway: 0 };
  const opponents = OPPONENT_SLUGS.filter((slug) => AI_TIER[slug] === tier);
  for (let i = 0; i < MATCHES; i++) {
    const opponent = opponents[i % opponents.length] ?? OPPONENT_SLUGS[0];
    const m = simulateFcMatch({ home, captain: home[4].num, opponent, kit: "home", mode: "ai", seed: 21000 + tier * 100000 + i * 101, tier, homeAiTier: 2 });
    assertMatch(m, `tier-${tier}-${i}`);
    row.matches++;
    row.gf += m.state.score.home;
    row.ga += m.state.score.away;
    row.passesHome += m.state.stats.home.passes;
    row.passesAway += m.state.stats.away.passes;
    row.shotsHome += m.state.stats.home.shots;
    row.shotsAway += m.state.stats.away.shots;
    if (m.state.score.home > m.state.score.away) row.wins++;
    else if (m.state.score.home === m.state.score.away) row.draws++;
    else row.losses++;
    saves += m.state.stats.home.saves + m.state.stats.away.saves;
    headers += m.debug.headers;
    mergeRestarts(m.debug.restartCounts);
  }
  finalize(row);
  tierRows[String(tier)] = row;
}

checkTier("1", tierRows["1"], 0.7, 0.9, 0, 0.15);
checkTier("2", tierRows["2"], 0.45, 0.65, 0.15, 0.35);
checkTier("3", tierRows["3"], 0.28, 0.45, 0.35, 0.55);
checkTier("4", tierRows["4"], 0.12, 0.28, 0.5, 0.72);
if (!(tierRows["1"].ppm! > tierRows["2"].ppm! && tierRows["2"].ppm! > tierRows["3"].ppm! && tierRows["3"].ppm! > tierRows["4"].ppm!)) throw new Error("points per match not strictly falling");
for (const [type, count] of Object.entries(restartCounts)) if (count <= 0) throw new Error(`restart never occurred: ${type}`);
if (saves <= 0) throw new Error("saves never happened");
if (headers <= 0) throw new Error("headers never happened");

const detA = simulateFcMatch({ home, captain: home[4].num, opponent: "busan-ipark", kit: "home", mode: "ai", seed: 9999, tier: 4, homeAiTier: 2 });
const detB = simulateFcMatch({ home, captain: home[4].num, opponent: "busan-ipark", kit: "home", mode: "ai", seed: 9999, tier: 4, homeAiTier: 2 });
if (JSON.stringify({ score: detA.state.score, stats: detA.state.stats }) !== JSON.stringify({ score: detB.state.score, stats: detB.state.stats })) throw new Error("determinism failed");

const runtimeSeconds = Number(((performance.now() - start) / 1000).toFixed(2));
console.log(JSON.stringify({
  matches: MATCHES * 5,
  equalAi: { matches: MATCHES, homeGoals: equalHomeGoals, awayGoals: equalAwayGoals, homeGoalSplit: Number(equalSplit.toFixed(3)), goalsPerMatch: Number(equalGoalsPerMatch.toFixed(2)) },
  tierRows,
  restartCounts,
  saves,
  headers,
  runtimeSeconds,
}, null, 2));

function pickHome() {
  const gk = SQUAD.find((p) => p.pos === "GK") ?? SQUAD[0];
  const def = SQUAD.find((p) => p.pos === "DF") ?? SQUAD[1];
  const mf = SQUAD.find((p) => p.pos === "MF") ?? SQUAD[2];
  const am = SQUAD.find((p) => p.pos === "AM") ?? SQUAD[3];
  const fw = SQUAD.find((p) => p.pos === "FW") ?? SQUAD[4];
  return [gk, def, mf, am, fw];
}

function assertMatch(m: ReturnType<typeof simulateFcMatch>, label: string): void {
  if (m.state.phase !== "ended") throw new Error(`${label}: match did not end`);
  if (m.state.elapsed > (m.opts.seconds ?? MATCH_SECONDS) + GOLDEN_GOAL_SECONDS + 0.1) throw new Error(`${label}: match overran`);
  for (const v of [m.state.ball.x, m.state.ball.z, m.state.ball.h, m.state.score.home, m.state.score.away]) if (!Number.isFinite(v)) throw new Error(`${label}: NaN ball/score`);
  if (m.state.ball.x < -3.001 || m.state.ball.x > PITCH_L + 3.001 || m.state.ball.z < -3.001 || m.state.ball.z > PITCH_W + 3.001) throw new Error(`${label}: ball escaped ${JSON.stringify(m.state.ball)}`);
  for (const p of m.state.players) {
    for (const v of [p.x, p.z, p.vx, p.vz]) if (!Number.isFinite(v)) throw new Error(`${label}: NaN player`);
    if (p.x < -3.001 || p.x > PITCH_L + 3.001 || p.z < -3.001 || p.z > PITCH_W + 3.001) throw new Error(`${label}: player escaped`);
  }
  if (m.debug.stuckT > 6) throw new Error(`${label}: ball stuck`);
  const possession = m.state.stats.home.possession + m.state.stats.away.possession;
  if (possession > m.state.elapsed + 0.1) throw new Error(`${label}: possession too high`);
}

function finalize(row: Row): void {
  row.winPct = Number((row.wins / row.matches).toFixed(3));
  row.lossPct = Number((row.losses / row.matches).toFixed(3));
  row.ppm = Number(((row.wins * 3 + row.draws) / row.matches).toFixed(3));
  row.goalsPerMatch = Number(((row.gf + row.ga) / row.matches).toFixed(2));
  row.passesPerSide = { home: Number((row.passesHome / row.matches).toFixed(1)), away: Number((row.passesAway / row.matches).toFixed(1)) };
  row.shotsPerSide = { home: Number((row.shotsHome / row.matches).toFixed(1)), away: Number((row.shotsAway / row.matches).toFixed(1)) };
}

function checkTier(tier: string, row: Row, minWin: number, maxWin: number, minLoss: number, maxLoss: number): void {
  if (row.winPct! < minWin || row.winPct! > maxWin || row.lossPct! < minLoss || row.lossPct! > maxLoss) throw new Error(`tier ${tier} out of range: ${JSON.stringify(row)}`);
  if (row.goalsPerMatch! < 2 || row.goalsPerMatch! > 7) throw new Error(`tier ${tier} goals per match out of range: ${row.goalsPerMatch}`);
  if (row.passesPerSide!.home < 12 || row.passesPerSide!.away < 12) throw new Error(`tier ${tier} passes too low: ${JSON.stringify(row.passesPerSide)}`);
  if (row.shotsPerSide!.home < 3 || row.shotsPerSide!.away < 3) throw new Error(`tier ${tier} shots too low: ${JSON.stringify(row.shotsPerSide)}`);
}

function mergeRestarts(counts: Record<RestartType, number>): void {
  for (const key of Object.keys(restartCounts) as RestartType[]) restartCounts[key] += counts[key];
}
