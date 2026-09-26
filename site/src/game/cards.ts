import type { ImageKey } from "./assets";

// Twelve collectible cards, six per mascot. Facts come from the club's
// official mascot introductions; unlock rules live in main.ts.
export const CARD_IDS = [
  "leoul-soccer-crazy",
  "leoul-blue-mane",
  "leoul-short-legs",
  "leoul-born-2015",
  "leoul-meat",
  "leoul-inwangsan",
  "lenyang-jamsil-cat",
  "lenyang-brothers",
  "lenyang-jersey",
  "lenyang-spy",
  "lenyang-round-things",
  "lenyang-nap",
] as const;

export type CardId = (typeof CARD_IDS)[number];

export interface CardDef {
  id: CardId;
  mascot: "leoul" | "lenyang";
  art: ImageKey;
}

export const CARDS: CardDef[] = [
  { id: "leoul-soccer-crazy", mascot: "leoul", art: "leoulReady" },
  { id: "leoul-blue-mane", mascot: "leoul", art: "leoulCelebrate" },
  { id: "leoul-short-legs", mascot: "leoul", art: "leoulKick" },
  { id: "leoul-born-2015", mascot: "leoul", art: "leoulWave" },
  { id: "leoul-meat", mascot: "leoul", art: "leoulMeat" },
  { id: "leoul-inwangsan", mascot: "leoul", art: "leoulRun" },
  { id: "lenyang-jamsil-cat", mascot: "lenyang", art: "lenyangReady" },
  { id: "lenyang-brothers", mascot: "lenyang", art: "lenyangHug" },
  { id: "lenyang-jersey", mascot: "lenyang", art: "lenyangDive" },
  { id: "lenyang-spy", mascot: "lenyang", art: "lenyangStarry" },
  { id: "lenyang-round-things", mascot: "lenyang", art: "lenyangJump" },
  { id: "lenyang-nap", mascot: "lenyang", art: "lenyangNap" },
];

const CARD_STORE = "pp-cards-v1";
const BEST_STORE = "pp-best-v1";

export function loadUnlocked(): Set<CardId> {
  try {
    const raw = JSON.parse(localStorage.getItem(CARD_STORE) ?? "[]");
    return new Set((Array.isArray(raw) ? raw : []).filter((id): id is CardId => (CARD_IDS as readonly string[]).includes(id)));
  } catch {
    return new Set();
  }
}

export function saveUnlocked(unlocked: Set<CardId>): void {
  try {
    localStorage.setItem(CARD_STORE, JSON.stringify([...unlocked]));
  } catch {
    // Private browsing or storage full: the collection just won't persist.
  }
}

export interface BestScores {
  shoot: number;
  save: number;
}

export function loadBest(): BestScores {
  try {
    const raw = JSON.parse(localStorage.getItem(BEST_STORE) ?? "{}");
    return { shoot: Number(raw.shoot) || 0, save: Number(raw.save) || 0 };
  } catch {
    return { shoot: 0, save: 0 };
  }
}

export function saveBest(best: BestScores): void {
  try {
    localStorage.setItem(BEST_STORE, JSON.stringify(best));
  } catch {
    // Not fatal.
  }
}
