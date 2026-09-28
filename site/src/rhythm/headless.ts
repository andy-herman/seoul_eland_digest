// Seoul Song Rhythm headless suite: chart checks and judge checks with scripted players. Run:
//   npx esbuild src/rhythm/headless.ts --bundle --platform=node --format=esm --outfile=/tmp/rhythm-headless.mjs && node /tmp/rhythm-headless.mjs
// Charts: sorted, lanes 0 to 3, no two notes stacked in one lane, holds never overlap a note in their
// lane, same-lane gaps a hand can play, at most two notes at once, densities rising Easy < Normal < Hard.
// Judge: perfect play is all PERFECT and S; a steady 60 ms late player gets GREATs; human jitter scores
// in between; no input scores nothing; mashing every lane cannot earn a good grade; letting go of a hold
// early breaks it; the same inputs give the same result. Every check runs for every song.
import { type Difficulty, HOLD_GRACE, RhythmEngine, WINDOW, buildNotes, perfectInputs } from "./engine";
import { SONGS, SONG_IDS, type RhythmSong } from "./songs";

const violations: string[] = [];
const report: Record<string, unknown> = {};
const fail = (m: string) => violations.push(m);
const DIFFS: Difficulty[] = ["easy", "normal", "hard"];
const JACK: Record<Difficulty, number> = { easy: 0.4, normal: 0.24, hard: 0.2 };

let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

type Input = { t: number; lane: number; down: boolean };
let song: RhythmSong = SONGS[SONG_IDS[0]];
function play(diff: Difficulty, inputs: Input[]) {
  const e = new RhythmEngine(diff, undefined, song);
  const sorted = [...inputs].sort((a, b) => a.t - b.t);
  let i = 0;
  for (let t = -1; t <= song.end + 1; t += 1 / 120) {
    while (i < sorted.length && sorted[i].t <= t) {
      const x = sorted[i++];
      e.update(x.t);
      if (x.down) e.press(x.lane, x.t);
      else e.release(x.lane, x.t);
    }
    e.update(t);
  }
  return e;
}

for (const id of SONG_IDS) {
song = SONGS[id];
const songReport: Record<string, unknown> = { bpm: song.bpm, t0: song.t0, end: song.end };
report[id] = songReport;
const SONG_END = song.end;
const SONG_STEP = song.step;
const pre = `${id} `;
for (const diff of DIFFS) {
  const raw = song.charts[diff];
  const notes = buildNotes(diff, song);
  // ---- chart checks
  for (let i = 1; i < raw.length; i++) if (raw[i][0] < raw[i - 1][0]) fail(`${pre}${diff}: chart not sorted at ${i}`);
  const perLane: [number, number][][] = [[], [], [], []];
  const at = new Map<number, number>();
  for (const [k, lane, len] of raw) {
    if (lane < 0 || lane > 3 || !Number.isInteger(lane)) fail(`${pre}${diff}: bad lane ${lane} at k ${k}`);
    if (len < 0 || len % 1) fail(`${pre}${diff}: bad hold length ${len} at k ${k}`);
    perLane[lane].push([k, k + len]);
    at.set(k, (at.get(k) ?? 0) + 1);
  }
  let minGap = Infinity;
  for (let l = 0; l < 4; l++) {
    const L = perLane[l];
    for (let i = 1; i < L.length; i++) {
      if (L[i][0] === L[i - 1][0]) fail(`${pre}${diff}: two notes stacked in lane ${l} at k ${L[i][0]}`);
      if (L[i][0] <= L[i - 1][1]) fail(`${pre}${diff}: lane ${l} note at k ${L[i][0]} lands inside a hold`);
      minGap = Math.min(minGap, (L[i][0] - L[i - 1][1]) * SONG_STEP);
    }
  }
  if (minGap < JACK[diff] - 1e-6) fail(`${pre}${diff}: same-lane gap ${(minGap * 1000).toFixed(0)} ms is too tight`);
  const maxAt = Math.max(...at.values());
  if (maxAt > 2) fail(`${pre}${diff}: ${maxAt} notes at once`);
  const last = notes[notes.length - 1];
  if (last.end > SONG_END) fail(`${pre}${diff}: a note ends after the song`);
  const span = last.t - notes[0].t;
  const nps = notes.length / span;
  const holds = notes.filter((n) => n.hold).length;
  const lanes = [0, 1, 2, 3].map((l) => notes.filter((n) => n.lane === l).length);
  if (Math.min(...lanes) < notes.length * 0.12) fail(`${pre}${diff}: lane use too uneven ${lanes}`);

  // ---- judge checks
  const perfect = play(diff, perfectInputs(notes)).result();
  if (!perfect.allPerfect || perfect.accuracy !== 100 || perfect.grade !== "S" || !perfect.fullCombo) fail(`${pre}${diff}: perfect play is not all perfect (${JSON.stringify(perfect.counts)})`);
  if (perfect.maxCombo !== perfect.total) fail(`${pre}${diff}: perfect play max combo ${perfect.maxCombo} of ${perfect.total}`);

  const late = play(diff, perfectInputs(notes).map((x) => (x.down ? { ...x, t: x.t + 0.06 } : { ...x, t: x.t + 0.06 }))).result();
  const lateTapGreat = late.counts.great;
  if (late.counts.perfect > holds + 2 || late.counts.miss > 0) fail(`${pre}${diff}: a steady 60 ms late player should get GREATs (${JSON.stringify(late.counts)})`);

  seed = 7;
  const human = play(
    diff,
    perfectInputs(notes).map((x) => ({ ...x, t: x.t + (x.down ? 0.012 + gauss() * 0.035 : 0) })),
  ).result();
  if (human.accuracy < 80 || human.accuracy > 99) fail(`${pre}${diff}: a 35 ms jitter player scored ${human.accuracy}%`);

  const none = play(diff, []).result();
  if (none.score !== 0 || none.accuracy !== 0 || none.counts.miss !== none.total) fail(`${pre}${diff}: no input scored ${none.score}`);

  // mash: every lane every 30 ms, held for 15 ms
  const mash: Input[] = [];
  for (let t = 0; t < SONG_END; t += 0.03) for (let l = 0; l < 4; l++) mash.push({ t, lane: l, down: true }, { t: t + 0.015, lane: l, down: false });
  const mashed = play(diff, mash).result();
  if (mashed.accuracy >= 60 || mashed.grade === "S" || mashed.grade === "A" || mashed.grade === "B") fail(`${pre}${diff}: mashing scored ${mashed.accuracy}% (${mashed.grade})`);

  // holds released at half length break the tail
  const early = play(
    diff,
    perfectInputs(notes).map((x) => {
      const n = notes.find((m) => m.hold && m.lane === x.lane && Math.abs(m.end - x.t) < 1e-9);
      return !x.down && n ? { ...x, t: n.t + (n.end - n.t) * 0.5 } : x;
    }),
  ).result();
  if (holds && early.counts.miss !== holds) fail(`${pre}${diff}: early releases gave ${early.counts.miss} misses for ${holds} holds`);
  // released inside the grace window is fine
  const grace = play(
    diff,
    perfectInputs(notes).map((x) => {
      const n = notes.find((m) => m.hold && m.lane === x.lane && Math.abs(m.end - x.t) < 1e-9);
      return !x.down && n ? { ...x, t: n.end - HOLD_GRACE * 0.8 } : x;
    }),
  ).result();
  if (!grace.fullCombo) fail(`${pre}${diff}: a release inside the grace window broke the hold`);

  // determinism
  seed = 99;
  const jitter = perfectInputs(notes).map((x) => ({ ...x, t: x.t + gauss() * 0.05 }));
  const a = play(diff, jitter).result();
  const b = play(diff, jitter).result();
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${pre}${diff}: not deterministic`);

  songReport[diff] = {
    notes: notes.length,
    holds,
    chords: raw.length - at.size,
    judgeable: perfect.total,
    nps: +nps.toFixed(2),
    lanes,
    minSameLaneGapMs: Math.round(minGap * 1000),
    perfectScore: perfect.score,
    late60: { accuracy: late.accuracy, grade: late.grade, great: lateTapGreat },
    human35: { accuracy: human.accuracy, grade: human.grade, maxCombo: human.maxCombo, counts: human.counts },
    mash: { accuracy: mashed.accuracy, grade: mashed.grade },
  };
}
const c = (d: string) => (songReport[d] as { notes: number; nps: number }).nps;
if (!(c("easy") < c("normal") && c("normal") < c("hard"))) fail(`${pre}densities do not rise with difficulty`);
// the sections start inside the song and in order
for (let i = 1; i < song.sections.length; i++) if (song.sections[i][0] <= song.sections[i - 1][0]) fail(`${pre}sections out of order`);
if (song.t0 + song.sections[song.sections.length - 1][0] * song.step > song.end + 10) fail(`${pre}a section starts after the song`);
}
report.windowsMs = { perfect: WINDOW.perfect * 1000, great: WINDOW.great * 1000, good: WINDOW.good * 1000 };
report.violations = violations;
console.log(JSON.stringify(report, null, 1));
process.exit(violations.length ? 1 : 0);
