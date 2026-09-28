// Take Five headless suite. Run:
//   npx esbuild src/takefive/headless.ts --bundle --platform=node --format=esm --outfile=/tmp/t5-headless.mjs && node /tmp/t5-headless.mjs
// Checks: every campaign level's reference solution, recorded take by take, scores with all three
// stars and no paradoxes; an echo replays exactly what was played live; no input never scores; a
// lone dribbler cannot solve the team levels; breaking an earlier take is reported as a paradox;
// same inputs give the same attack; share links and punch-ins reproduce an attack exactly; every
// played league match gets a verified "Rewrite the Result" level.
import { STEP, TakeSim, emptyTrack, recordSolution, scriptToTrack, simulate, starsFor, steps, type LevelDef, type Track } from "./engine";
import { decodeShare, encodeShare, packTracks, unpackTracks } from "./codec";
import { LEVELS } from "./levels";
import { rewriteLevels } from "./rewrite";
import { fixtures } from "../data/matches";

const violations: string[] = [];
const fail = (m: string) => violations.push(m);
const report: Record<string, unknown> = {};
const t0 = Date.now();

function signature(sim: TakeSim): string {
  const parts: (string | number | null)[] = [sim.outcome, sim.endStep, sim.stats.passes, sim.stats.scorer, sim.paradoxes.length];
  for (const a of sim.att) parts.push(a.present ? `${a.x.toFixed(4)},${a.y.toFixed(4)}` : "-");
  for (const d of sim.def) parts.push(`${d.x.toFixed(4)},${d.y.toFixed(4)}`);
  parts.push(`${sim.ball.x.toFixed(4)},${sim.ball.y.toFixed(4)},${sim.ball.h.toFixed(4)}`);
  return parts.join("|");
}

// the last take of a solution, recorded live, must end the same way as the full echo replay
function liveOutcome(level: LevelDef): { outcome: string | null; end: number } {
  const tracks: (Track | null)[] = level.slots.map(() => null);
  let last: TakeSim | null = null;
  for (const st of level.solution) {
    const scripted = scriptToTrack(level, st);
    const sim = new TakeSim(level, tracks, st.slot);
    let ai = 0;
    while (!sim.done) {
      const s = sim.step;
      while (ai < scripted.actions.length && scripted.actions[ai].step === s) sim.queue({ ...scripted.actions[ai++], done: false });
      sim.advance(scripted.moves[s * 2] / 127, scripted.moves[s * 2 + 1] / 127);
    }
    tracks[st.slot] = sim.recorded;
    last = sim;
  }
  return { outcome: last!.outcome, end: last!.endStep };
}

function solo(level: LevelDef): string | null {
  const carrier = "slot" in level.ball ? level.ball.slot : 0;
  const s = level.slots[carrier];
  const track = scriptToTrack(level, {
    slot: carrier,
    keys: [{ t: Math.hypot(s.x - 20, s.y - 10) / 6.2 + 0.2, x: 20, y: 10 }],
    acts: [{ t: Math.hypot(s.x - 20, s.y - 10) / 6.2 + 0.3, kind: "shot", tx: 23, ty: 0, th: 0.3, power: 0.9 }],
  });
  const tracks: (Track | null)[] = level.slots.map((_, i) => (i === carrier ? track : null));
  return simulate(level, tracks).outcome;
}

const levels: Record<string, unknown> = {};
for (const level of LEVELS) {
  const tracks = recordSolution(level);
  const sim = simulate(level, tracks);
  const stars = starsFor(level, sim);
  if (!stars.every(Boolean)) fail(`${level.id}: reference solution earns ${stars.map((x) => (x ? "*" : "-")).join("")} (${sim.outcome})`);
  if (sim.paradoxes.length) fail(`${level.id}: reference solution has ${sim.paradoxes.length} paradoxes`);
  const live = liveOutcome(level);
  if (live.outcome !== sim.outcome || live.end !== sim.endStep) fail(`${level.id}: live take ended ${live.outcome}@${live.end}, echo replay ${sim.outcome}@${sim.endStep}`);
  const again = simulate(level, tracks);
  if (signature(again) !== signature(sim)) fail(`${level.id}: not deterministic`);
  // no input at all
  const none = simulate(level, level.slots.map(() => null));
  if (none.outcome === "goal") fail(`${level.id}: scores with no input`);
  // every slot present but nobody moves or kicks
  const idle = simulate(level, level.slots.map((_, i) => emptyTrack(i, steps(level))));
  if (idle.outcome === "goal") fail(`${level.id}: scores with idle players`);
  const lone = solo(level);
  if (level.n >= 3 && lone === "goal") fail(`${level.id}: a lone dribbler scores`);
  // share link round trip (binary) and punch-in fidelity
  const n = steps(level);
  const round = unpackTracks(packTracks(level.id, tracks, n));
  if (signature(simulate(level, round.tracks)) !== signature(sim)) fail(`${level.id}: share round trip changes the attack`);
  const lastSlot = level.solution[level.solution.length - 1].slot;
  const from = Math.round(n * 0.3);
  const src = tracks[lastSlot]!;
  const punch = new TakeSim(level, tracks, lastSlot, { track: src, fromStep: from });
  let ai = src.actions.findIndex((a) => a.step >= from);
  if (ai < 0) ai = src.actions.length;
  while (!punch.done) {
    const s = punch.step;
    if (s >= from) while (ai < src.actions.length && src.actions[ai].step === s) punch.queue({ ...src.actions[ai++], done: false });
    punch.advance(src.moves[s * 2] / 127, src.moves[s * 2 + 1] / 127);
  }
  if (punch.outcome !== sim.outcome || punch.endStep !== sim.endStep) fail(`${level.id}: punch-in replay ended ${punch.outcome}@${punch.endStep}, expected ${sim.outcome}@${sim.endStep}`);
  levels[level.id] = { goal: +(sim.stats.goalStep * STEP).toFixed(2), passes: sim.stats.passes, takes: level.solution.length, solo: lone, none: none.outcome, idle: idle.outcome };
}
report.levels = levels;

// breaking an earlier take: L3 with the winger re-recorded standing still
{
  const level = LEVELS.find((l) => l.id === "l3")!;
  const tracks = recordSolution(level);
  tracks[1] = emptyTrack(1, steps(level));
  const sim = simulate(level, tracks);
  const whats = sim.paradoxes.map((p) => `${p.slot}:${p.what}`);
  if (!sim.paradoxes.some((p) => p.slot === 0)) fail(`paradox: breaking the winger's take did not flag the passer's echo (${whats.join(" ")}; ${sim.outcome})`);
  report.paradoxTest = { outcome: sim.outcome, paradoxes: whats };
}

// pass snapping: L2 with the striker recorded first, then a quick tap pass toward him
{
  const level = LEVELS.find((l) => l.id === "l2")!;
  const tracks: (Track | null)[] = [null, scriptToTrack(level, level.solution[1])];
  const sim = new TakeSim(level, tracks, 0);
  let passed = -1;
  while (!sim.done) {
    if (sim.step === 30 && passed < 0) {
      const p = sim.preview("pass", 0, 0.9, -0.3);
      passed = p.snap;
      sim.act("pass", 0, 0.9, -0.3);
    }
    sim.advance(0, 0);
  }
  if (passed !== 1) fail(`snap: a tap pass toward the striker did not snap to him (snap ${passed})`);
  if (!sim.stats.touched.has(1)) fail("snap: the snapped pass did not reach the striker");
  report.snapTest = { snap: passed, touched: [...sim.stats.touched], outcome: sim.outcome };
}

// compressed share links (async, CompressionStream)
{
  const level = LEVELS.find((l) => l.id === "l12")!;
  const tracks = recordSolution(level);
  const code = await encodeShare(level.id, tracks, steps(level));
  const back = await decodeShare(code);
  const a = simulate(level, tracks);
  const b = simulate(level, back.tracks);
  if (back.levelId !== level.id || signature(a) !== signature(b)) fail("share: compressed link does not replay the same attack");
  report.shareLink = { chars: code.length, level: back.levelId };
}

// Rewrite the Result
{
  const played = fixtures.filter((f) => /^[WDL] \d+-\d+$/.test(f.result.trim())).length;
  const list = rewriteLevels();
  if (list.length !== played) fail(`rewrite: ${list.length} levels for ${played} played matches`);
  for (const l of list) {
    const sim = simulate(l, recordSolution(l));
    if (!starsFor(l, sim).every(Boolean)) fail(`rewrite R${l.round}: solution does not verify`);
  }
  report.rewrite = { levels: list.length, played, tiers: list.map((l) => `R${l.round}:${l.template}${l.mirrored ? "m" : ""}@${l.tier}`).join(" ") };
}

report.violations = violations;
report.runtimeSeconds = +((Date.now() - t0) / 1000).toFixed(2);
console.log(JSON.stringify(report, null, 1));
process.exit(violations.length ? 1 : 0);
