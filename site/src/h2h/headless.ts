import { SQUAD, OPPONENT_SLUGS } from "./data";
import { applyRound, newSeason, validateTable } from "./league";
import { simulateAiMatch } from "./main";
import { MATCH_SECONDS, WORLD_H, WORLD_W } from "./sim";

const player = SQUAD.find((p) => p.num === 16) ?? SQUAD[0];
let leftGoals = 0;
let rightGoals = 0;
let maxScore = 0;
let minClock = Infinity;

for (let i = 0; i < 240; i++) {
  const opponent = OPPONENT_SLUGS[i % OPPONENT_SLUGS.length];
  const match = simulateAiMatch(player, opponent, 1000 + i * 37);
  if (match.phase !== "ended") throw new Error(`match ${i} did not end`);
  if (Math.abs(match.elapsed - MATCH_SECONDS) > 0.05 && !match.goldenGoal) throw new Error(`match ${i} ended at ${match.elapsed}`);
  if (match.ball.x < -90 || match.ball.x > WORLD_W + 90 || match.ball.y < 0 || match.ball.y > WORLD_H) throw new Error(`match ${i} ball escaped`);
  if (match.stuckT > 4.05) throw new Error(`match ${i} stuck ball`);
  leftGoals += match.score.left;
  rightGoals += match.score.right;
  maxScore = Math.max(maxScore, match.score.left, match.score.right);
  minClock = Math.min(minClock, match.clock);
  if (match.score.left > 12 || match.score.right > 12 || match.score.left + match.score.right > 22) throw new Error(`match ${i} score too high`);
}
if (leftGoals <= 0 || rightGoals <= 0) throw new Error(`goals did not happen on both sides: ${leftGoals}, ${rightGoals}`);
if (maxScore > 12) throw new Error(`sane score cap failed: ${maxScore}`);

let season = newSeason(player, 4242);
for (let i = 0; i < 16; i++) {
  season = applyRound(season, i % 3, (i + 1) % 3);
}
validateTable(season);
if (season.round !== 16) throw new Error(`expected 16 rounds, got ${season.round}`);
const seoul = season.rows.find((r) => r.id === "seoul-eland");
if (!seoul || seoul.p !== 16) throw new Error("Seoul did not play 16 matches");

console.log(JSON.stringify({ matches: 240, leftGoals, rightGoals, maxScore, minClock, teams: season.rows.length, rounds: season.round }));
