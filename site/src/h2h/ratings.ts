// EA SPORTS FC style player cards for the 2026 Seoul E-Land squad (fan-made ratings, not official EA data).
// Calibration: K League 2 is not in FC, and typical K League 1 players sit in the high 50s to low 70s in
// recent FC editions, so the squad spans about 52 (youth backups) to 71 (top starters). Card colour follows
// FC: gold 75+, silver 65-74, bronze 64 and below.
// Face stats come from the card OVR, a position profile and per-player traits, then hand overrides.
import { SQUAD, type SquadPlayer } from "./data";

export type FcPos = "GK" | "CB" | "LB" | "RB" | "LWB" | "RWB" | "CDM" | "CM" | "CAM" | "LM" | "RM" | "LW" | "RW" | "CF" | "ST";
export type Foot = "R" | "L";
export type Stars = 1 | 2 | 3 | 4 | 5;
export type CardColor = "gold" | "silver" | "bronze";

export interface GkStats {
  div: number;
  han: number;
  kic: number;
  ref: number;
  spd: number;
  pos: number;
}

export interface FcCard {
  num: number;
  ovr: number;
  pos: FcPos;
  alt: FcPos[];
  foot: Foot;
  skill: Stars;
  weak: Stars;
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
  gk?: GkStats;
  styles: string[]; // FC PlayStyles, English names
  color: CardColor;
}

// 0..1 engine attributes derived from the card
export interface FcAttrs {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  gk: number;
}

type Six = [number, number, number, number, number, number];

interface Seed {
  ovr: number;
  pos: FcPos;
  alt?: FcPos[];
  foot?: Foot;
  skill?: Stars;
  weak?: Stars;
  delta?: Partial<Record<"pac" | "sho" | "pas" | "dri" | "def" | "phy", number>>;
  face?: Six; // full override, PAC SHO PAS DRI DEF PHY (or DIV HAN KIC REF SPD POS for keepers)
  styles?: string[];
}

// Position profiles: offsets from OVR for PAC SHO PAS DRI DEF PHY.
const PROFILE: Record<FcPos, Six> = {
  ST: [3, 4, -8, 0, -38, 3],
  CF: [1, 3, -2, 3, -36, -2],
  LW: [8, -3, -3, 5, -38, -8],
  RW: [8, -3, -3, 5, -38, -8],
  LM: [6, -5, 0, 3, -22, -6],
  RM: [6, -5, 0, 3, -22, -6],
  CAM: [1, 0, 4, 5, -28, -10],
  CM: [-3, -7, 4, 1, -4, 0],
  CDM: [-7, -13, 1, -4, 3, 6],
  LB: [5, -24, -4, -3, 1, 0],
  RB: [5, -24, -4, -3, 1, 0],
  LWB: [6, -20, -2, 0, -2, -2],
  RWB: [6, -20, -2, 0, -2, -2],
  CB: [-10, -32, -12, -15, 4, 6],
  GK: [1, -2, -6, 2, -22, 0], // DIV HAN KIC REF SPD POS
};

// Seoul E-Land 2026, keyed by squad number. Positions and traits from club, K League and press
// profiles; see h2h-work/fc/squad_research.md for sources.
const SEEDS: Record<number, Seed> = {
  1: { ovr: 66, pos: "GK", skill: 1, weak: 3, delta: { pac: 2, dri: 1 }, styles: ["Far Reach"] },
  2: { ovr: 61, pos: "CB", delta: { phy: 4, pac: -2 }, styles: ["Aerial"] },
  3: { ovr: 56, pos: "CB", delta: { phy: 2 } },
  5: { ovr: 68, pos: "CB", alt: ["CDM"], foot: "R", skill: 2, weak: 3, delta: { pac: -10, pas: 12, dri: 6, sho: 8, phy: -2 }, styles: ["Pinged Pass", "Anticipate"] },
  6: { ovr: 64, pos: "CM", alt: ["CAM", "CDM"], skill: 3, weak: 3, delta: { sho: 5, phy: 3 }, styles: ["Power Shot"] },
  7: { ovr: 71, pos: "LW", alt: ["RW", "ST"], skill: 4, weak: 3, delta: { pac: 4, dri: 3, sho: 3 }, styles: ["Rapid", "Technical"] },
  8: { ovr: 63, pos: "ST", skill: 2, weak: 3, delta: { pac: -12, phy: 8, dri: -6, sho: 1, pas: 2 }, styles: ["Aerial", "Bruiser"] },
  10: { ovr: 67, pos: "CAM", alt: ["LW", "RW"], skill: 4, weak: 3, delta: { dri: 3, pac: 2 }, styles: ["Technical", "Finesse Shot"] },
  11: { ovr: 63, pos: "CAM", alt: ["LW"], skill: 3, weak: 3, delta: { pac: 4 }, styles: ["Quick Step"] },
  13: { ovr: 65, pos: "RB", alt: ["LB", "RM"], skill: 3, weak: 3, delta: { pas: 6, pac: 2, phy: -6 }, styles: ["Whipped Pass"] },
  14: { ovr: 60, pos: "ST", alt: ["RW"], skill: 3, weak: 3, delta: { dri: 2 } },
  15: { ovr: 55, pos: "CDM", alt: ["CM"], skill: 2, weak: 3, delta: { def: 3 } },
  16: { ovr: 70, pos: "ST", skill: 3, weak: 3, delta: { sho: 5, phy: 3, pac: -4, dri: -2 }, styles: ["Power Header", "Finesse Shot"] },
  17: { ovr: 55, pos: "CB" },
  18: { ovr: 57, pos: "GK", skill: 1, weak: 3 },
  19: { ovr: 60, pos: "LB", alt: ["RB"], skill: 2, weak: 3 },
  20: { ovr: 66, pos: "CB", skill: 2, weak: 3, delta: { pac: -6, def: 3, pas: 6, phy: 1 }, styles: ["Block", "Anticipate"] },
  21: { ovr: 58, pos: "CM", skill: 3, weak: 3, delta: { sho: 3 } },
  22: { ovr: 60, pos: "CM", alt: ["CAM"], skill: 3, weak: 3, delta: { dri: 3 } },
  23: { ovr: 59, pos: "LB", alt: ["LWB"], skill: 2, weak: 3, delta: { pac: 3, phy: -3 } },
  24: { ovr: 59, pos: "CDM", alt: ["CM"], skill: 2, weak: 3 },
  25: { ovr: 52, pos: "GK", skill: 1, weak: 2 },
  27: { ovr: 54, pos: "RW", alt: ["ST"], skill: 3, weak: 3 },
  28: { ovr: 54, pos: "CB", alt: ["RB"] },
  29: { ovr: 56, pos: "CB", delta: { pac: 2 } },
  30: { ovr: 65, pos: "CM", alt: ["CDM"], skill: 3, weak: 3, delta: { pas: 3, def: 2, phy: -2 }, styles: ["Tiki Taka", "Intercept"] },
  31: { ovr: 55, pos: "GK", skill: 1, weak: 3 },
  33: { ovr: 59, pos: "RB", alt: ["LB"], skill: 2, weak: 3, delta: { pac: 2 } },
  38: { ovr: 63, pos: "CB", skill: 2, weak: 3, delta: { phy: 5, pac: -2 }, styles: ["Aerial"] },
  47: { ovr: 60, pos: "RW", alt: ["LW"], skill: 3, weak: 3, delta: { pac: 3 } },
  70: { ovr: 60, pos: "ST", alt: ["LW"], skill: 3, weak: 3, delta: { pac: 5, sho: 2, phy: -6 }, styles: ["Rapid"] },
  71: { ovr: 52, pos: "GK", skill: 1, weak: 2 },
  77: { ovr: 61, pos: "LW", alt: ["RW"], skill: 3, weak: 3, delta: { pac: 5, phy: -4 }, styles: ["Quick Step"] },
  90: { ovr: 64, pos: "ST", skill: 3, weak: 3, delta: { phy: 4, sho: 2 }, styles: ["Power Shot"] },
  99: { ovr: 53, pos: "ST", skill: 2, weak: 3, delta: { phy: 2 } },
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function cardColor(ovr: number): CardColor {
  return ovr >= 75 ? "gold" : ovr >= 65 ? "silver" : "bronze";
}

function traits(p: SquadPlayer): Six {
  const t: Six = [0, 0, 0, 0, 0, 0];
  if (p.height >= 189) {
    t[0] -= 2;
    t[5] += 3;
  } else if (p.height <= 175) {
    t[0] += 2;
    t[3] += 2;
    t[5] -= 3;
  }
  if (p.weight <= 68) t[5] -= 2;
  if (p.age >= 33) {
    t[0] -= 5;
    t[2] += 2;
  } else if (p.age <= 20) {
    t[0] += 2;
    t[5] -= 3;
  }
  return t;
}

function buildCard(p: SquadPlayer): FcCard {
  const seed: Seed = SEEDS[p.num] ?? { ovr: 55, pos: p.gk ? "GK" : p.pos === "DF" ? "CB" : p.pos === "FW" ? "ST" : p.pos === "AM" ? "CAM" : "CM" };
  const prof = PROFILE[seed.pos];
  const tr = seed.pos === "GK" ? ([0, 0, 0, 0, 0, 0] as Six) : traits(p);
  const keys = ["pac", "sho", "pas", "dri", "def", "phy"] as const;
  const face = seed.face ?? (keys.map((k, i) => clamp(Math.round(seed.ovr + prof[i] + tr[i] + (seed.delta?.[k] ?? 0)), 20, 95)) as Six);
  const outfield: Six = seed.pos === "GK" ? [40 + Math.round((seed.ovr - 50) * 0.3), 18, 30 + Math.round((seed.ovr - 50) * 0.8), 25, 18, 45 + Math.round((seed.ovr - 50) * 0.6)] : face;
  const card: FcCard = {
    num: p.num,
    ovr: seed.ovr,
    pos: seed.pos,
    alt: seed.alt ?? [],
    foot: seed.foot ?? "R",
    skill: seed.skill ?? (seed.pos === "GK" ? 1 : seed.pos === "CB" ? 2 : 3),
    weak: seed.weak ?? 3,
    pac: outfield[0],
    sho: outfield[1],
    pas: outfield[2],
    dri: outfield[3],
    def: outfield[4],
    phy: outfield[5],
    styles: seed.styles ?? [],
    color: cardColor(seed.ovr),
  };
  if (seed.pos === "GK") card.gk = { div: face[0], han: face[1], kic: face[2], ref: face[3], spd: face[4], pos: face[5] };
  return card;
}

export const CARDS: Record<number, FcCard> = Object.fromEntries(SQUAD.map((p) => [p.num, buildCard(p)]));

export function cardFor(num: number): FcCard {
  const c = CARDS[num];
  if (!c) throw new Error(`No FC card for squad number ${num}`);
  return c;
}

const unit = (s: number): number => clamp((s - 30) / 60, 0, 1);

export function attrsFor(num: number): FcAttrs {
  const c = cardFor(num);
  const gk = c.gk ? unit((c.gk.div + c.gk.han + c.gk.ref + c.gk.pos) / 4) : 0.15;
  return { pace: unit(c.pac), shooting: unit(c.sho), passing: unit(c.pas), dribbling: unit(c.dri), defending: unit(c.def), physical: unit(c.phy), gk };
}

// Detailed position to engine role
export function roleOf(pos: FcPos): "GK" | "DEF" | "MID" | "FWD" {
  if (pos === "GK") return "GK";
  if (pos === "CB" || pos === "LB" || pos === "RB" || pos === "LWB" || pos === "RWB") return "DEF";
  if (pos === "CDM" || pos === "CM" || pos === "CAM" || pos === "LM" || pos === "RM") return "MID";
  return "FWD";
}

// Best five for the 5-a-side (GK, 2 DEF, 1 MID, 1 FWD), always including the featured player.
export function bestFive(featured: number): SquadPlayer[] {
  const by = (role: ReturnType<typeof roleOf>) =>
    SQUAD.filter((p) => roleOf(cardFor(p.num).pos) === role).sort((a, b) => cardFor(b.num).ovr - cardFor(a.num).ovr);
  const star = SQUAD.find((p) => p.num === featured) ?? SQUAD[0];
  const starRole = roleOf(cardFor(star.num).pos);
  const need: Record<ReturnType<typeof roleOf>, number> = { GK: 1, DEF: 2, MID: 1, FWD: 1 };
  need[starRole] = Math.max(0, need[starRole] - 1);
  const pick: SquadPlayer[] = [star];
  for (const role of ["GK", "DEF", "MID", "FWD"] as const) {
    for (const p of by(role)) {
      if (need[role] <= 0) break;
      if (pick.includes(p)) continue;
      pick.push(p);
      need[role]--;
    }
  }
  while (pick.length < 5) {
    const next = SQUAD.filter((p) => !pick.includes(p) && !cardFor(p.num).gk).sort((a, b) => cardFor(b.num).ovr - cardFor(a.num).ovr)[0];
    if (!next) break;
    pick.push(next);
  }
  const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
  return pick.slice(0, 5).sort((a, b) => order[roleOf(cardFor(a.num).pos)] - order[roleOf(cardFor(b.num).pos)] || cardFor(b.num).ovr - cardFor(a.num).ovr);
}

export function teamOvr(players: SquadPlayer[]): number {
  return Math.round(players.reduce((s, p) => s + cardFor(p.num).ovr, 0) / Math.max(1, players.length));
}

// Rival mascot squads: OVR by AI tier (1 easiest).
export const RIVAL_OVR: Record<1 | 2 | 3 | 4, number> = { 1: 61, 2: 64, 3: 67, 4: 71 };
