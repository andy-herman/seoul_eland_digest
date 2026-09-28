// Mascot Kart racers, cups and tracks. The player drives Leoul or Lenyang; each cup's field is eight
// of the other 2026 K League 2 clubs' mascots, so all sixteen race across the two cups.
import { OPPONENTS, type OpponentSlug } from "../dash/data";
import type { RacerSpec } from "./types";

export type Hero = "leoul" | "lenyang";
export type CupId = "seoul" | "korea";

export interface CupDef {
  id: CupId;
  tracks: string[];
  field: OpponentSlug[]; // the eight rivals in this cup
}

// Seoul Cup: Seoul tracks against the capital-region clubs. Korea Cup: tracks in rival cities.
export const CUPS: Record<CupId, CupDef> = {
  seoul: {
    id: "seoul",
    tracks: ["mokdong", "hangang", "namsan", "suwon"],
    field: ["seongnam-fc", "suwon-fc", "suwon-samsung-bluewings", "gimpo-fc", "ansan-greeners", "hwaseong-fc", "yongin-fc", "paju-frontier"],
  },
  korea: {
    id: "korea",
    tracks: ["busan", "jinhae", "gwangyang", "daegu"],
    field: ["busan-ipark", "gyeongnam-fc", "jeonnam-dragons", "daegu-fc", "cheonan-city", "chungbuk-cheongju", "chungnam-asan", "gimhae-fc"],
  },
};

export const HERO_INFO: Record<Hero, { name: string; korean: string; color: string }> = {
  leoul: { name: "Leoul", korean: "레울", color: "#1b2446" },
  lenyang: { name: "Lenyang", korean: "레냥", color: "#1b2446" },
};

// Small personal differences between rivals: skill offset and driving style.
export const RIVAL_TRAITS: Record<OpponentSlug, { skill: number; style: RacerSpec["style"] }> = {
  "ansan-greeners": { skill: 0.2, style: "aggressive" },
  "busan-ipark": { skill: 0.5, style: "aggressive" },
  "cheonan-city": { skill: -0.3, style: "tricky" },
  "chungbuk-cheongju": { skill: -0.5, style: "clean" },
  "chungnam-asan": { skill: -0.1, style: "clean" },
  "daegu-fc": { skill: 0.6, style: "clean" },
  "gimhae-fc": { skill: -0.6, style: "tricky" },
  "gimpo-fc": { skill: 0.1, style: "tricky" },
  "gyeongnam-fc": { skill: 0.3, style: "clean" },
  "hwaseong-fc": { skill: -0.4, style: "aggressive" },
  "jeonnam-dragons": { skill: 0.4, style: "aggressive" },
  "paju-frontier": { skill: -0.7, style: "clean" },
  "seongnam-fc": { skill: 0.3, style: "clean" },
  "suwon-fc": { skill: 0.5, style: "tricky" },
  "suwon-samsung-bluewings": { skill: 0.7, style: "clean" },
  "yongin-fc": { skill: -0.2, style: "tricky" },
};

export function racerColor(id: string): string {
  return id === "leoul" || id === "lenyang" ? "#1b2446" : OPPONENTS[id as OpponentSlug]?.color ?? "#888888";
}

// Grid for a cup race: the player starts in the middle of the pack on race 1, then by reverse standings.
export function buildGrid(hero: Hero, field: OpponentSlug[], order?: string[], humanSlot = 4): RacerSpec[] {
  const rivals: RacerSpec[] = (order ? order.filter((id) => id !== hero) : field).map((id) => ({
    id,
    human: false,
    skill: RIVAL_TRAITS[id as OpponentSlug]?.skill ?? 0,
    style: RIVAL_TRAITS[id as OpponentSlug]?.style ?? "clean",
  }));
  const me: RacerSpec = { id: hero, human: true };
  const slot = Math.max(0, Math.min(rivals.length, humanSlot));
  return [...rivals.slice(0, slot), me, ...rivals.slice(slot)];
}

export const CUP_POINTS = [10, 8, 6, 5, 4, 3, 2, 1, 0];
