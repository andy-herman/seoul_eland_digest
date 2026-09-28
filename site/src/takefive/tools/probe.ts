// Dev tool: record a level's reference solution take by take, simulate it, and dump a trace.
// npx esbuild src/takefive/tools/probe.ts --bundle --platform=node --format=esm --outfile=/tmp/t5probe.mjs && node /tmp/t5probe.mjs <levelId> [out.json] [order]
import { writeFileSync } from "node:fs";
import { STEP, TakeSim, recordSolution, scriptToTrack, starsFor, type LevelDef, type Track } from "../engine";
import { ALL_LEVELS } from "../levels";

const id = process.argv[2] ?? "l1";
const out = process.argv[3];
const mode = process.argv[4];
const order = mode && mode !== "solo" ? mode.split(",").map(Number) : undefined;
const level = ALL_LEVELS.find((l) => l.id === id) as LevelDef | undefined;
if (!level) throw new Error(`no level ${id}; have ${ALL_LEVELS.map((l) => l.id).join(" ")}`);
// "solo": the ball carrier alone dribbles at goal and shoots (what the suite's lone-dribbler check does)
function soloTracks(lv: LevelDef): (Track | null)[] {
  const carrier = "slot" in lv.ball ? lv.ball.slot : 0;
  const s = lv.slots[carrier];
  const lead = Math.hypot(s.x - 20, s.y - 10) / 6.2;
  const track = scriptToTrack(lv, {
    slot: carrier,
    keys: [{ t: lead + 0.2, x: 20, y: 10 }],
    acts: [{ t: lead + 0.3, kind: "shot", tx: 23, ty: 0, th: 0.3, power: 0.9 }],
  });
  return lv.slots.map((_, i) => (i === carrier ? track : null));
}
const tracks = mode === "solo" ? soloTracks(level) : recordSolution(level, order);
const sim = new TakeSim(level, tracks, null);
const frames: number[][] = [];
const log: string[] = [];
while (!sim.done) {
  sim.advance();
  const f: number[] = [sim.ball.x, sim.ball.y, sim.ball.h];
  for (const a of sim.att) f.push(a.present ? a.x : -1, a.present ? a.y : -1);
  for (const d of sim.def) f.push(d.x, d.y);
  frames.push(f);
  for (const e of sim.events) {
    const t = (sim.step * STEP).toFixed(2);
    if (e.type === "kick") log.push(`${t} kick   slot ${e.slot} ${e.kind}${e.header ? " (header)" : ""}  ball ${sim.ball.x.toFixed(1)},${sim.ball.y.toFixed(1)} v ${Math.hypot(sim.ball.vx, sim.ball.vy).toFixed(1)}`);
    else if (e.type === "touch") log.push(`${t} touch  slot ${e.slot} at ${sim.att[e.slot].x.toFixed(1)},${sim.att[e.slot].y.toFixed(1)}`);
    else if (e.type === "defball") log.push(`${t} DEF    #${e.index} ${e.how}`);
    else if (e.type === "save") log.push(`${t} SAVE   keeper`);
    else if (e.type === "post") log.push(`${t} POST`);
    else if (e.type === "goal") log.push(`${t} GOAL   slot ${e.slot}`);
    else if (e.type === "paradox") log.push(`${t} PARADOX slot ${e.slot} ${e.what}`);
    else if (e.type === "end") log.push(`${t} END    ${e.outcome}`);
  }
}
const stars = starsFor(level, sim);
console.log(log.join("\n"));
console.log(`outcome ${sim.outcome} at ${(sim.endStep * STEP).toFixed(2)} s, passes ${sim.stats.passes}, touched ${[...sim.stats.touched].join(",")}, header ${sim.stats.header}, oneTouch ${sim.stats.oneTouch}, paradoxes ${sim.paradoxes.length}, stars ${stars.map((s) => (s ? "*" : "-")).join("")}`);
if (out) writeFileSync(out, JSON.stringify({ id: level.id, slots: level.slots.length, defs: level.defenders.map((d) => d.role), frames }));
