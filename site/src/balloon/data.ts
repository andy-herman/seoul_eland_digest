// Balloon Battle game data: heroes, the 16 K League 2 mascot enemies, items,
// worlds and bosses. Mascot names, clubs and facts come from the Dribble Dash
// research (dash/data.ts); every mascot is used with permission.

import { OPPONENTS, type Hero, type Locale, type OpponentSlug } from "../dash/data";

export type { Hero, Locale, OpponentSlug };
export { OPPONENTS };

export type Dir = "down" | "up" | "left" | "right";
export const DIRS: Dir[] = ["down", "up", "left", "right"];
export const DV: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { down: "up", up: "down", left: "right", right: "left" };

export interface HeroStats {
  balloons: [number, number];
  range: [number, number];
  speed: [number, number];
}

// Crazy Arcade style 1-10 stat scale (base / max), like Bazzi (SPEED) and Marid (COUNT).
export const HERO_STATS: Record<Hero, HeroStats> = {
  leoul: { balloons: [1, 7], range: [1, 7], speed: [5, 9] },
  lenyang: { balloons: [2, 8], range: [1, 7], speed: [4, 8] },
};

/** Tiles per second for a speed level. */
export function speedTps(level: number): number {
  return 1.9 + 0.38 * level;
}

export type Behavior =
  | "wander"
  | "dasher"
  | "thief"
  | "knight"
  | "clay"
  | "lobber"
  | "hopper"
  | "flyer"
  | "charger"
  | "floater"
  | "teleporter"
  | "breather"
  | "armored"
  | "roller"
  | "hunter"
  | "swooper";

export interface EnemyDef {
  behavior: Behavior;
  speed: number; // tiles per second
  smart?: boolean; // reads blast zones and steps out of them
  flies?: "soft" | "all"; // passes over soft blocks and balloons, or over everything
}

export const ENEMIES: Record<OpponentSlug, EnemyDef> = {
  "gimpo-fc": { behavior: "wander", speed: 1.5 },
  "suwon-fc": { behavior: "dasher", speed: 1.7 },
  "seongnam-fc": { behavior: "thief", speed: 2.0, smart: true },
  "busan-ipark": { behavior: "knight", speed: 1.45 },
  "gimhae-fc": { behavior: "clay", speed: 1.3 },
  "gyeongnam-fc": { behavior: "lobber", speed: 1.7, smart: true },
  "cheonan-city": { behavior: "hopper", speed: 2.4 },
  "chungnam-asan": { behavior: "flyer", speed: 1.75, flies: "soft" },
  "chungbuk-cheongju": { behavior: "charger", speed: 1.6 },
  "paju-frontier": { behavior: "floater", speed: 2.0 },
  "hwaseong-fc": { behavior: "teleporter", speed: 1.25 },
  "yongin-fc": { behavior: "breather", speed: 1.6 },
  "jeonnam-dragons": { behavior: "armored", speed: 1.35, smart: true },
  "daegu-fc": { behavior: "roller", speed: 3.1 },
  "ansan-greeners": { behavior: "hunter", speed: 2.1, smart: true },
  "suwon-samsung-bluewings": { behavior: "swooper", speed: 1.8, flies: "all" },
};

export type ItemKind = "balloon" | "potion" | "gold" | "cleats" | "kick" | "needle" | "shield" | "ginseng" | "heart" | "coin" | "card";

export const ITEM_KINDS: ItemKind[] = ["balloon", "potion", "gold", "cleats", "kick", "needle", "shield", "ginseng", "heart", "coin", "card"];
export const RARE_ITEMS = new Set<ItemKind>(["gold", "kick", "ginseng", "heart"]);

export type WorldId = "toytown" | "harbor" | "forest" | "frost" | "steel" | "stadium";

export interface WorldDef {
  id: WorldId;
  color: string; // accent for the world card
  sky: string; // canvas backdrop around the board
  ground: [string, string]; // checkerboard ground sprites
  soft: string[]; // soft-block sprites picked by position
  hard: string[]; // generic hard-block sprites picked by position
  mascots: OpponentSlug[]; // mascots this world introduces
  boss: BossKind;
}

export type BossKind = "swoony" | "gunhami" | "chaba" | "mars" | "cheolryong" | "aguileon";

export const WORLDS: WorldDef[] = [
  {
    id: "toytown",
    color: "#e64a3b",
    sky: "#4f9636",
    ground: ["grass_a", "grass_b"],
    soft: ["brick_red", "brick_yellow", "brick_blue", "brick_orange"],
    hard: ["house_blue", "house_yellow", "house_red", "shop_green"],
    mascots: ["gimpo-fc", "suwon-fc", "seongnam-fc"],
    boss: "swoony",
  },
  {
    id: "harbor",
    color: "#e0a24a",
    sky: "#2a74b5",
    ground: ["deck_a", "deck_b"],
    soft: ["barrel", "crate", "crate_blue", "crate_red", "crate_green", "barrel_blue", "crate_dark"],
    hard: ["bollard", "mast", "anchor", "chest"],
    mascots: ["busan-ipark", "gimhae-fc", "gyeongnam-fc"],
    boss: "gunhami",
  },
  {
    id: "forest",
    color: "#3fa34d",
    sky: "#2b6e35",
    ground: ["moss_a", "moss_b"],
    soft: ["flower_pink", "flower_yellow", "flower_purple", "mushroom"],
    hard: ["tree_big", "tree", "rock", "stump"],
    mascots: ["cheonan-city", "chungnam-asan", "chungbuk-cheongju"],
    boss: "chaba",
  },
  {
    id: "frost",
    color: "#5bb8e8",
    sky: "#7fb3dc",
    ground: ["snow_a", "snow_b"],
    soft: ["snow_block", "ice_cube"],
    hard: ["pine_snow", "crystal", "snowman", "igloo"],
    mascots: ["paju-frontier", "hwaseong-fc", "yongin-fc"],
    boss: "mars",
  },
  {
    id: "steel",
    color: "#6f7b8b",
    sky: "#353c49",
    ground: ["metal_a", "metal_b"],
    soft: ["steel_crate", "drum", "crate", "steel_crate_red", "drum_yellow"],
    hard: ["machine", "machine_orange", "tank"],
    mascots: ["jeonnam-dragons", "daegu-fc"],
    boss: "cheolryong",
  },
  {
    id: "stadium",
    color: "#0b3d91",
    sky: "#1c5528",
    ground: ["pitch_a", "pitch_b"],
    soft: ["kit_bag", "cone_stack", "cooler", "kit_bag_red"],
    hard: ["ad_board", "ad_board_red", "bench"],
    mascots: ["ansan-greeners", "suwon-samsung-bluewings"],
    boss: "aguileon",
  },
];

export interface BossDef {
  kind: BossKind;
  slug: OpponentSlug;
  hp: number;
  speed: number;
  flies?: boolean;
}

export const BOSSES: Record<BossKind, BossDef> = {
  swoony: { kind: "swoony", slug: "suwon-fc", hp: 12, speed: 1.15 },
  gunhami: { kind: "gunhami", slug: "gyeongnam-fc", hp: 15, speed: 1.0 },
  chaba: { kind: "chaba", slug: "chungbuk-cheongju", hp: 16, speed: 1.2 },
  mars: { kind: "mars", slug: "hwaseong-fc", hp: 16, speed: 1.1 },
  cheolryong: { kind: "cheolryong", slug: "jeonnam-dragons", hp: 18, speed: 1.15 },
  aguileon: { kind: "aguileon", slug: "suwon-samsung-bluewings", hp: 22, speed: 1.45, flies: true },
};

export const ALL_MASCOTS = Object.keys(ENEMIES) as OpponentSlug[];
