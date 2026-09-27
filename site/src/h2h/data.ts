import squadRaw from "./squad.json";
import mascotMetricsRaw from "./mascots.json";
import playerMetricsRaw from "./players.json";
import { OPPONENTS, OPPONENT_SLUGS, type OpponentSlug } from "../dash/data";

export type Locale = "en" | "pt";
export type Kit = "home" | "away";
export type PlayerPos = "GK" | "DF" | "MF" | "AM" | "FW";

export interface SquadPlayer {
  num: number;
  slug: string;
  ko: string;
  en: string;
  pos: PlayerPos;
  nationality: string;
  height: number;
  weight: number;
  age: number;
  goals: number;
  assists: number;
  apps: number;
  gk: boolean;
  captain: boolean;
  vice: boolean;
  boots: [string, string];
  skin: string;
  pose: string;
  expr: string;
}

export interface PlayerStats {
  speed: number;
  jump: number;
  shot: number;
}

export interface MascotMetrics {
  cell: number;
  foot: number;
  frames: string[];
  clubs: Record<string, { boxes: [number, number, number, number][] }>;
}

export interface PlayerSpriteMetrics {
  cell: number;
  foot: number;
  frames: string[];
  players: Record<string, { boxes: [number, number, number, number][]; head?: [number, number, number] }>;
}

export const SQUAD = squadRaw as SquadPlayer[];
export const MASCOT_METRICS = mascotMetricsRaw as unknown as MascotMetrics;
export const PLAYER_METRICS = playerMetricsRaw as unknown as PlayerSpriteMetrics;
export { OPPONENTS, OPPONENT_SLUGS, type OpponentSlug };

export const SEOUL_TEAM = {
  id: "seoul-eland",
  name: "Seoul E-Land FC",
  ko: "서울 이랜드 FC",
  color: "#1b2446",
};

export const RIVAL_STRENGTH: Record<OpponentSlug, number> = {
  "suwon-samsung-bluewings": 92,
  "busan-ipark": 89,
  "jeonnam-dragons": 84,
  "seongnam-fc": 80,
  "gyeongnam-fc": 78,
  "daegu-fc": 77,
  "chungnam-asan": 74,
  "gimpo-fc": 72,
  "chungbuk-cheongju": 70,
  "hwaseong-fc": 68,
  "cheonan-city": 66,
  "suwon-fc": 65,
  "ansan-greeners": 63,
  "gimhae-fc": 61,
  "yongin-fc": 59,
  "paju-frontier": 57,
};

export const POWER_ARCHETYPE: Record<OpponentSlug, "fire" | "lob" | "freeze"> = {
  "ansan-greeners": "fire",
  "busan-ipark": "freeze",
  "cheonan-city": "lob",
  "chungbuk-cheongju": "fire",
  "chungnam-asan": "lob",
  "daegu-fc": "freeze",
  "gimhae-fc": "lob",
  "gimpo-fc": "fire",
  "gyeongnam-fc": "fire",
  "hwaseong-fc": "lob",
  "jeonnam-dragons": "fire",
  "paju-frontier": "freeze",
  "seongnam-fc": "freeze",
  "suwon-fc": "lob",
  "suwon-samsung-bluewings": "fire",
  "yongin-fc": "freeze",
};

export const AI_TIER: Record<OpponentSlug, 1 | 2 | 3 | 4> = {
  "paju-frontier": 1,
  "yongin-fc": 1,
  "gimhae-fc": 1,
  "ansan-greeners": 1,
  "suwon-fc": 2,
  "cheonan-city": 2,
  "hwaseong-fc": 2,
  "chungbuk-cheongju": 2,
  "gimpo-fc": 2,
  "chungnam-asan": 3,
  "daegu-fc": 3,
  "gyeongnam-fc": 3,
  "seongnam-fc": 3,
  "jeonnam-dragons": 3,
  "busan-ipark": 4,
  "suwon-samsung-bluewings": 4,
};

export function playerStats(player: SquadPlayer): PlayerStats {
  const posBoost = {
    GK: { speed: -0.04, jump: 0.08, shot: -0.08 },
    DF: { speed: -0.02, jump: 0.06, shot: -0.03 },
    MF: { speed: 0.02, jump: 0, shot: 0.02 },
    AM: { speed: 0.07, jump: 0, shot: 0.06 },
    FW: { speed: 0.06, jump: 0.03, shot: 0.08 },
  }[player.pos];
  const heightJump = (player.height - 182) / 180;
  const production = Math.min(1, (player.goals * 2 + player.assists + Math.min(player.apps, 24) / 8) / 18);
  const senior = player.captain || player.vice ? 0.02 : 0;
  return {
    speed: clamp01(0.56 + posBoost.speed + (player.weight < 76 ? 0.04 : 0) - (player.height > 190 ? 0.025 : 0) + senior),
    jump: clamp01(0.56 + posBoost.jump + heightJump + senior),
    shot: clamp01(0.55 + posBoost.shot + production * 0.18 + senior),
  };
}

function clamp01(v: number): number {
  return Math.max(0.45, Math.min(0.72, v));
}

export function seedFromString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}
