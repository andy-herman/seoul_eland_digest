// Clap for Seoul chants: the supporters' patterns, laid on the beat grid of the club song being played
// (서울의 노래 at 140 BPM or 사랑하는 나의 서울 이랜드 at 160 BPM, grids measured for Seoul Song Rhythm),
// and the match script that places one chant every few bars from kick-off to the final whistle.
import type { ClubSongId } from "../lib/clubSongs";
import { DEFAULT_SONG, SONGS, type RhythmSong, type Section } from "../rhythm/songs";

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

export interface Cue {
  i: number;
  chant: ChantId;
  bar: number; // bar index from the song's first downbeat
  t0: number; // start of the chant bar, song seconds
  t1: number; // end of the chant bar
  claps: number[]; // expected clap times
  shouts: { t0: number; t1: number }[];
}

// Where each song's bars start (in 16ths from its first grid beat: the chords change there), the bar
// the band has come in by (kick-off), and how many bars apart the chants are, so a match has about
// the same number of chants whatever the tempo.
const SETUP: Record<ClubSongId, { barPhase: number; kickoffBar: number; cueEvery: number }> = {
  "seoul-song-2024": { barPhase: 4, kickoffBar: 8, cueEvery: 3 },
  "my-seoul-eland-2022": { barPhase: 0, kickoffBar: 8, cueEvery: 4 },
};

/** One song's chant timeline: bars, kick-off, the chants and the match clock. */
export class ChantGrid {
  readonly barPhase: number;
  readonly bar: number; // seconds per bar
  readonly kickoffBar: number;
  readonly firstCueBar: number;
  readonly cueEvery: number;
  readonly lastBar: number;
  readonly kickoffT: number;
  readonly fulltimeT: number;

  constructor(readonly song: RhythmSong) {
    const s = SETUP[song.id];
    this.barPhase = s.barPhase;
    this.kickoffBar = s.kickoffBar;
    this.firstCueBar = s.kickoffBar + 2;
    this.cueEvery = s.cueEvery;
    this.bar = song.step * BAR_STEPS;
    this.lastBar = Math.floor((song.end - this.stepTime(this.barPhase)) / this.bar) - 3;
    this.kickoffT = this.barTime(this.kickoffBar);
    this.fulltimeT = this.barTime(this.lastBar + 2);
  }

  stepTime(k: number): number {
    return this.song.t0 + k * this.song.step;
  }

  /** Song time a bar starts. */
  barTime(bar: number): number {
    return this.stepTime(bar * BAR_STEPS + this.barPhase);
  }

  sectionAt(k: number): Section {
    let s: Section = "quiet";
    for (const [start, kind] of this.song.sections) if (k >= start) s = kind;
    return s;
  }

  /** The chant sequence for a match: choruses get shouts and clap storms, verses get clap patterns. */
  buildCues(): Cue[] {
    const cues: Cue[] = [];
    const verse: ChantId[] = ["jjak5", "eland", "jjak3", "jjak5"];
    const chorus: ChantId[] = ["seoul", "roll", "seoul", "jjak5"];
    let v = 0;
    let c = 0;
    for (let bar = this.firstCueBar; bar <= this.lastBar; bar += this.cueEvery) {
      const k = bar * BAR_STEPS + this.barPhase;
      const chant = this.sectionAt(k) === "chorus" ? chorus[c++ % chorus.length] : verse[v++ % verse.length];
      const def = CHANTS[chant];
      cues.push({
        i: cues.length,
        chant,
        bar,
        t0: this.stepTime(k),
        t1: this.stepTime(k + BAR_STEPS),
        claps: def.claps.map((s) => this.stepTime(k + s)),
        shouts: def.shouts.map(([s, len]) => ({ t0: this.stepTime(k + s), t1: this.stepTime(k + s + len) })),
      });
    }
    return cues;
  }

  /** Match minute shown on the scoreboard for a song time. */
  minuteAt(t: number): number {
    return Math.max(0, Math.min(90, Math.floor(((t - this.kickoffT) / (this.fulltimeT - this.kickoffT)) * 90)));
  }
}

const grids = new Map<ClubSongId, ChantGrid>();
export function gridFor(id: ClubSongId): ChantGrid {
  let g = grids.get(id);
  if (!g) grids.set(id, (g = new ChantGrid(SONGS[id])));
  return g;
}
export const DEFAULT_GRID = gridFor(DEFAULT_SONG.id);
