// Dev tool: build every track and write samples, racing line and speed profile as JSON for previews.
// Run: npx esbuild src/kart/tools/dump.ts --bundle --platform=node --format=esm --outfile=/tmp/kart-dump.mjs && node /tmp/kart-dump.mjs <outdir>
import { writeFileSync } from "node:fs";
import { buildTrack } from "../track";
import { TRACKS } from "../tracks";

const out = process.argv[2] ?? ".";
for (const def of Object.values(TRACKS)) {
  const t = buildTrack(def);
  const rows = t.samples.map((s, i) => [s.x, s.z, s.y, s.hw, s.verge, s.bridge ? 1 : 0, +t.line[i].toFixed(2), +t.vmax[i].toFixed(1), +s.curv.toFixed(4)]);
  writeFileSync(`${out}/${def.id}.json`, JSON.stringify({ id: def.id, length: t.length, n: t.n, laps: t.laps, start: t.startIndex, items: def.items ?? [], pads: def.pads ?? [], bumps: def.bumps ?? [], rows }));
  const minV = Math.min(...t.vmax);
  console.log(`${def.id}: ${t.length.toFixed(0)} m, ${t.n} samples, y ${t.minY.toFixed(1)}..${t.maxY.toFixed(1)}, min AI speed ${minV.toFixed(1)} m/s`);
}
