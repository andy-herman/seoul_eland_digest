// Clap for Seoul chants: the supporters' patterns, laid on the beat grid of 서울의 노래 (2024 ver)
// (140 BPM, first beat and 16th-note step measured for Seoul Song Rhythm), and the match script
// that places one chant every few bars from kick-off to the final whistle.
import { SECTIONS, SONG_END, SONG_STEP, SONG_T0 } from "../rhythm/charts";

export type ChantId = "jjak5" | "jjak3" | "seoul" | "eland" | "roll" | "hush";

export interface ChantDef {
  id: ChantId;
  ko: string;
  claps: number[]; // 16th-note steps from the start of the bar
  shouts: [number, number][]; // [start step, length in steps]
  roll?: boolean; // clap as often as you can for the whole bar
  hush?: boolean; // stay silent for the whole bar
}

export const CHANTS: Record<ChantId, ChantDef> = {
  // 짝짝 짝짝짝: the clap of 대한민국, two long and three quick
  jjak5: { id: "jjak5", ko: "짝짝 짝짝짝", claps: [0, 4, 8, 10, 12], shouts: [] },
  jjak3: { id: "jjak3", ko: "짝짝짝", claps: [0, 2, 4, 8, 10, 12], shouts: [] },
  seoul: { id: "seoul", ko: "서울! 서울!", claps: [], shouts: [[0, 5], [8, 5]] },
  eland: { id: "eland", ko: "짝 짝 짝 이랜드!", claps: [0, 4, 8], shouts: [[12, 4]] },
  roll: { id: "roll", ko: "박수 폭풍", claps: [], shouts: [], roll: true },
  hush: { id: "hush", ko: "쉿!", claps: [], shouts: [], hush: true },
};

export const BAR_STEPS = 16;
export const BAR = SONG_STEP * BAR_STEPS;
export const stepTime = (k: number) => SONG_T0 + k * SONG_STEP;

export interface Cue {
  i: number;
  chant: ChantId;
  bar: number; // bar index from the first beat
  t0: number; // start of the chant bar, song seconds
  t1: number; // end of the chant bar
  claps: number[]; // expected clap times
  shouts: { t0: number; t1: number }[];
}

export const KICKOFF_BAR = 8;
export const FIRST_CUE_BAR = 10;
export const CUE_EVERY = 3;
export const LAST_BAR = Math.floor((SONG_END - SONG_T0) / BAR) - 3;

function sectionAt(k: number): "quiet" | "verse" | "chorus" {
  let s: "quiet" | "verse" | "chorus" = "quiet";
  for (const [start, kind] of SECTIONS) if (k >= start) s = kind;
  return s;
}

/** The chant sequence for a match: choruses get shouts and clap storms, verses get clap patterns. */
export function buildCues(): Cue[] {
  const cues: Cue[] = [];
  const verse: ChantId[] = ["jjak5", "eland", "jjak3", "jjak5"];
  const chorus: ChantId[] = ["seoul", "roll", "seoul", "jjak5"];
  let v = 0;
  let c = 0;
  for (let bar = FIRST_CUE_BAR; bar <= LAST_BAR; bar += CUE_EVERY) {
    const k = bar * BAR_STEPS;
    const sec = sectionAt(k);
    const chant = sec === "chorus" ? chorus[c++ % chorus.length] : verse[v++ % verse.length];
    const def = CHANTS[chant];
    cues.push({
      i: cues.length,
      chant,
      bar,
      t0: stepTime(k),
      t1: stepTime(k + BAR_STEPS),
      claps: def.claps.map((s) => stepTime(k + s)),
      shouts: def.shouts.map(([s, len]) => ({ t0: stepTime(k + s), t1: stepTime(k + s + len) })),
    });
  }
  return cues;
}

/** Match minute shown on the scoreboard for a song time. */
export function minuteAt(t: number): number {
  const k0 = stepTime(KICKOFF_BAR * BAR_STEPS);
  const k1 = stepTime((LAST_BAR + 2) * BAR_STEPS);
  return Math.max(0, Math.min(90, Math.floor(((t - k0) / (k1 - k0)) * 90)));
}

export const KICKOFF_T = stepTime(KICKOFF_BAR * BAR_STEPS);
export const FULLTIME_T = stepTime((LAST_BAR + 2) * BAR_STEPS);
