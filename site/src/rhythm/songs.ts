// The songs Seoul Song Rhythm can be played to, each with its own beat grid and charts. Chart files are
// generated from a beat and melody analysis of the song (see the header of each file).
import { CLUB_SONGS, type ClubSong, type ClubSongId } from "../lib/clubSongs";
import * as seoul2024 from "./charts";
import * as eland2022 from "./charts-2022";
import type { ChartNote } from "./charts";

export type Section = "quiet" | "verse" | "chorus";
export type ChartSet = Record<"easy" | "normal" | "hard", ChartNote[]>;

export interface RhythmSong extends ClubSong {
  bpm: number;
  t0: number; // song time of the first beat (a 16th-grid origin), s
  step: number; // seconds per 16th note
  end: number; // song time the game ends
  charts: ChartSet;
  sections: [number, Section][]; // [16th index where it starts, section]
}

const club = (id: ClubSongId): ClubSong => CLUB_SONGS.find((s) => s.id === id)!;
interface ChartModule {
  SONG_BPM: number;
  SONG_T0: number;
  SONG_STEP: number;
  SONG_END: number;
  CHARTS: ChartSet;
  SECTIONS: [number, Section][];
}
const grid = (m: ChartModule) => ({ bpm: m.SONG_BPM, t0: m.SONG_T0, step: m.SONG_STEP, end: m.SONG_END, charts: m.CHARTS, sections: m.SECTIONS });

export const SONGS: Record<ClubSongId, RhythmSong> = {
  "seoul-song-2024": { ...club("seoul-song-2024"), ...grid(seoul2024) },
  "my-seoul-eland-2022": { ...club("my-seoul-eland-2022"), ...grid(eland2022) },
};

export const SONG_IDS = CLUB_SONGS.map((s) => s.id);
export const DEFAULT_SONG = SONGS["seoul-song-2024"];
export const isSongId = (v: unknown): v is ClubSongId => typeof v === "string" && v in SONGS;
