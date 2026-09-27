import { AI_TIER, SQUAD, OPPONENT_SLUGS, type OpponentSlug } from "./data";
import { applyRound, newSeason, validateTable } from "./league";
import { simulateAiMatch } from "./main";
import { H2HMatch, MATCH_SECONDS, STEP, WORLD_H, WORLD_W, blankInput, type InputState } from "./sim";

const player = SQUAD.find((p) => p.num === 16) ?? SQUAD[0];
let leftGoals = 0;
let rightGoals = 0;
let maxScore = 0;
let minClock = Infinity;
let freezes = 0;
let counters = 0;
let maxBallStep = 0;

for (let i = 0; i < 240; i++) {
  const opponent = OPPONENT_SLUGS[i % OPPONENT_SLUGS.length];
  const match = simulateAiMatch(player, opponent, 1000 + i * 37);
  if (match.phase !== "ended") throw new Error(`match ${i} did not end`);
  if (Math.abs(match.elapsed - MATCH_SECONDS) > 0.05 && !match.goldenGoal) throw new Error(`match ${i} ended at ${match.elapsed}`);
  if (match.ball.x < -90 || match.ball.x > WORLD_W + 90 || match.ball.y < -151 || match.ball.y > WORLD_H) throw new Error(`match ${i} ball escaped`);
  if (match.stuckT > 4.05) throw new Error(`match ${i} stuck ball`);
  if (match.stats.aboveBarGoals > 0) throw new Error(`match ${i} counted an above-bar goal`);
  if (match.stats.maxBallStep > 60.5) throw new Error(`match ${i} ball teleported ${match.stats.maxBallStep}`);
  if (match.stats.kickContacts > match.stats.kickSwings) throw new Error(`match ${i} had multiple contacts per swing`);
  freezes += match.stats.freezes;
  counters += match.stats.counters;
  maxBallStep = Math.max(maxBallStep, match.stats.maxBallStep);
  leftGoals += match.score.left;
  rightGoals += match.score.right;
  maxScore = Math.max(maxScore, match.score.left, match.score.right);
  minClock = Math.min(minClock, match.clock);
  if (match.score.left > 12 || match.score.right > 12 || match.score.left + match.score.right > 22) throw new Error(`match ${i} score too high`);
}
if (leftGoals <= 0 || rightGoals <= 0) throw new Error(`goals did not happen on both sides: ${leftGoals}, ${rightGoals}`);
if (maxScore > 12) throw new Error(`sane score cap failed: ${maxScore}`);
const avgGoals = (leftGoals + rightGoals) / 240;
if (avgGoals < 2 || avgGoals > 8) throw new Error(`average goals out of range: ${avgGoals}`);
if (freezes <= 0) throw new Error("freeze never happened");
if (counters <= 0) throw new Error("counter never happened");
const split = leftGoals / (leftGoals + rightGoals);
if (split < 0.4 || split > 0.6) throw new Error(`equal AI split out of range: ${split}`);

let season = newSeason(player, 4242);
for (let i = 0; i < 16; i++) {
  season = applyRound(season, i % 3, (i + 1) % 3);
}
validateTable(season);
if (season.round !== 16) throw new Error(`expected 16 rounds, got ${season.round}`);
const seoul = season.rows.find((r) => r.id === "seoul-eland");
if (!seoul || seoul.p !== 16) throw new Error("Seoul did not play 16 matches");

const tierReport: Record<
  string,
  { matches: number; wins: number; draws: number; losses: number; gf: number; ga: number; nilNil: number; winPct?: number; lossPct?: number; drawPct?: number; ppm?: number; casualGpm?: number; mascotGpm?: number; nilNilPct?: number }
> = {};
const perClub: Record<string, number> = { "1": 50, "2": 40, "3": 40, "4": 100 };
for (const slug of OPPONENT_SLUGS) {
  const tier = String(AI_TIER[slug]);
  tierReport[tier] ??= { matches: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, nilNil: 0 };
  for (let i = 0; i < perClub[tier]; i++) {
    const m = casualMatch(slug, 7000 + Number(tier) * 10000 + OPPONENT_SLUGS.indexOf(slug) * 1009 + i * 97);
    const row = tierReport[tier];
    row.matches += 1;
    row.gf += m.score.left;
    row.ga += m.score.right;
    if (m.score.left === 0 && m.score.right === 0) row.nilNil += 1;
    if (m.score.left > m.score.right) row.wins += 1;
    else if (m.score.left === m.score.right) row.draws += 1;
    else row.losses += 1;
  }
}
for (const row of Object.values(tierReport)) {
  row.winPct = Number((row.wins / row.matches).toFixed(3));
  row.lossPct = Number((row.losses / row.matches).toFixed(3));
  row.drawPct = Number((row.draws / row.matches).toFixed(3));
  row.ppm = Number(((row.wins * 3 + row.draws) / row.matches).toFixed(3));
  row.casualGpm = Number((row.gf / row.matches).toFixed(2));
  row.mascotGpm = Number((row.ga / row.matches).toFixed(2));
  row.nilNilPct = Number((row.nilNil / row.matches).toFixed(3));
}
if (tierReport["1"].winPct! < 0.8 || tierReport["1"].winPct! > 0.92 || tierReport["1"].lossPct! > 0.1 || tierReport["1"].drawPct! > 0.2 || tierReport["1"].ppm! < 2.3 || tierReport["1"].mascotGpm! < 1 || tierReport["1"].mascotGpm! > 6) throw new Error(`tier 1 out of range: ${JSON.stringify(tierReport["1"])}`);
if (tierReport["2"].winPct! < 0.5 || tierReport["2"].winPct! > 0.65 || tierReport["2"].lossPct! < 0.2 || tierReport["2"].lossPct! > 0.4 || tierReport["2"].drawPct! > 0.25 || tierReport["2"].ppm! < 1.6 || tierReport["2"].ppm! > 2.1 || tierReport["2"].mascotGpm! < 2 || tierReport["2"].mascotGpm! > 6) throw new Error(`tier 2 out of range: ${JSON.stringify(tierReport["2"])}`);
if (tierReport["3"].winPct! < 0.25 || tierReport["3"].winPct! > 0.4 || tierReport["3"].lossPct! < 0.45 || tierReport["3"].lossPct! > 0.65 || tierReport["3"].drawPct! > 0.25 || tierReport["3"].ppm! < 0.9 || tierReport["3"].ppm! > 1.4 || tierReport["3"].mascotGpm! < 3 || tierReport["3"].mascotGpm! > 6) throw new Error(`tier 3 out of range: ${JSON.stringify(tierReport["3"])}`);
if (tierReport["4"].winPct! < 0.1 || tierReport["4"].winPct! > 0.2 || tierReport["4"].lossPct! < 0.6 || tierReport["4"].lossPct! > 0.78 || tierReport["4"].drawPct! > 0.25 || tierReport["4"].ppm! < 0.4 || tierReport["4"].ppm! > 0.9 || tierReport["4"].casualGpm! > 3 || tierReport["4"].mascotGpm! < 3.5 || tierReport["4"].mascotGpm! > 6) throw new Error(`tier 4 out of range: ${JSON.stringify(tierReport["4"])}`);
for (const [tier, row] of Object.entries(tierReport)) {
  const totalGpm = (row.gf + row.ga) / row.matches;
  if (totalGpm < 3 || totalGpm > 9) throw new Error(`tier ${tier} total goals out of range: ${totalGpm}`);
  if (row.nilNilPct! > 0.1) throw new Error(`tier ${tier} 0-0 share too high: ${row.nilNilPct}`);
}
if (!(tierReport["1"].ppm! > tierReport["2"].ppm! && tierReport["2"].ppm! > tierReport["3"].ppm! && tierReport["3"].ppm! > tierReport["4"].ppm!)) throw new Error("tier PPM is not monotonic");
if (!(tierReport["1"].mascotGpm! < tierReport["2"].mascotGpm! && tierReport["2"].mascotGpm! < tierReport["3"].mascotGpm! && tierReport["3"].mascotGpm! < tierReport["4"].mascotGpm!)) throw new Error("mascot goals are not monotonic");

console.log(JSON.stringify({ matches: 240, leftGoals, rightGoals, equalSplitLeft: Number(split.toFixed(3)), avgGoals: Number(avgGoals.toFixed(2)), maxScore, minClock, freezes, counters, countersPerMatch: Number((counters / 240).toFixed(2)), maxBallStep: Number(maxBallStep.toFixed(2)), teams: season.rows.length, rounds: season.round, tierReport }));

function casualMatch(opponent: OpponentSlug, seed: number): H2HMatch {
  const m = new H2HMatch({ player, opponent, kit: "home", mode: "league", seed });
  m.start();
  let guard = 0;
  while (m.phase !== "ended" && guard++ < 60 * 240) {
    m.step(STEP, casualInput(m), m.aiInput("right", STEP));
  }
  return m;
}

function casualInput(m: H2HMatch): InputState {
  const input = blankInput();
  const target = m.ball.x < 820 ? m.ball.x - 60 : 520;
  if (target < m.left.x - 28) input.left = true;
  if (target > m.left.x + 28) input.right = true;
  if (m.ball.y < m.left.y - 120 && Math.abs(m.ball.x - m.left.x) < 145 && m.left.onGround) input.jump = true;
  if (Math.abs(m.ball.x - (m.left.x + 72)) < 70 && Math.abs(m.ball.y - (m.left.y - 70)) < 90) input.kick = true;
  input.power = m.left.powerBanked && Math.abs(m.ball.x - m.left.x) < 170;
  return input;
}
