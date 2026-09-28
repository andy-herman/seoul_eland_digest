// Dev tool: try variations of a level's defenders/tier and report the reference solution and the lone-dribbler outcomes.
import { recordSolution, scriptToTrack, simulate, starsFor, type LevelDef, type Track } from "../engine";
import { ALL_LEVELS } from "../levels";

function solo(lv: LevelDef): string {
  const carrier = "slot" in lv.ball ? lv.ball.slot : 0;
  const s = lv.slots[carrier];
  const lead = Math.hypot(s.x - 20, s.y - 10) / 6.2;
  const track = scriptToTrack(lv, {
    slot: carrier,
    keys: [{ t: lead + 0.2, x: 20, y: 10 }],
    acts: [{ t: lead + 0.3, kind: "shot", tx: 23, ty: 0, th: 0.3, power: 0.9 }],
  });
  return simulate(lv, lv.slots.map((_, i) => (i === carrier ? track : null)) as (Track | null)[]).outcome ?? "none";
}
const base = ALL_LEVELS.find((l) => l.id === (process.argv[2] ?? "l4"))!;
const variants = JSON.parse(process.argv[3] ?? "[{}]") as Partial<LevelDef>[];
for (const v of variants) {
  const lv = { ...base, ...v } as LevelDef;
  const sim = simulate(lv, recordSolution(lv));
  const st = starsFor(lv, sim).map((x) => (x ? "*" : "-")).join("");
  console.log(`${JSON.stringify(v)} -> solution ${sim.outcome} ${st} | solo ${solo(lv)}`);
}
