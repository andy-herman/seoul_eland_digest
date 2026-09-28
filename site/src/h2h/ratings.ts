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

// Seoul E-Land 2026, keyed by squad number. Positions, strong foot and style from Namu Wiki, the K League
// data portal, Transfermarkt, FotMob and Korean press (researched 2026-09-27). Players who had EA FC or FIFA
// cards before joining (Osmar, Euller, Kim Oh-kyu, Kim Hyun, Cariús, Cho Jun-hyun, Bae Seo-jun, Caio Marcelo,
// Gabriel Santos) are anchored to those cards, adjusted for age and 2025-26 form; everyone else is scaled
// from minutes, output and role.
const SEEDS: Record<number, Seed> = {
  1: { ovr: 67, pos: "GK", foot: "R", skill: 1, weak: 3, delta: { pas: 4, dri: 3, pac: 1 }, styles: ["Quick Reflexes", "Footwork"] },
  2: { ovr: 61, pos: "CB", foot: "L", delta: { phy: 4, pac: -2, pas: 2 }, styles: ["Aerial"] },
  3: { ovr: 56, pos: "CB", delta: { pac: 6, def: 1, phy: -2 }, styles: ["Jockey"] },
  5: { ovr: 69, pos: "CB", alt: ["CDM", "CM"], foot: "L", skill: 2, weak: 3, delta: { pac: -12, pas: 12, dri: 6, sho: 10, phy: 8 }, styles: ["Pinged Pass", "Aerial", "Anticipate"] },
  6: { ovr: 64, pos: "CDM", alt: ["CM", "CB"], skill: 2, weak: 3, delta: { sho: 10, phy: 3, def: 1 }, styles: ["Aerial", "Intercept"] },
  7: { ovr: 72, pos: "LW", alt: ["LM", "LB"], foot: "L", skill: 4, weak: 2, delta: { pac: 2, sho: 5, pas: 10, dri: 2, def: 8, phy: 6 }, styles: ["Dead Ball", "Incisive Pass", "Technical"] },
  8: { ovr: 63, pos: "ST", foot: "R", skill: 2, weak: 3, delta: { pac: -8, phy: 6, dri: -6, sho: 2, pas: 1 }, styles: ["Aerial", "Power Shot"] },
  10: { ovr: 66, pos: "CAM", alt: ["LW", "ST"], foot: "R", skill: 4, weak: 3, delta: { pac: 6, sho: 5, pas: -6, dri: 2, phy: 2 }, styles: ["Rapid", "Dead Ball"] },
  11: { ovr: 63, pos: "RW", alt: ["ST"], foot: "L", skill: 3, weak: 2, delta: { pac: 8, sho: 5, def: 2 }, styles: ["Rapid", "Quick Step"] },
  13: { ovr: 66, pos: "RB", alt: ["RW", "LB"], foot: "L", skill: 3, weak: 3, delta: { pas: 6, pac: 4, sho: 6, dri: 4, phy: -4 }, styles: ["Whipped Pass", "Relentless"] },
  14: { ovr: 60, pos: "RW", alt: ["CAM", "ST"], skill: 3, weak: 3, delta: { dri: 2, def: 6, phy: 2 }, styles: ["Relentless"] },
  15: { ovr: 55, pos: "CDM", alt: ["CM"], skill: 2, weak: 4, delta: { def: 4, pac: 3, phy: 2 }, styles: ["Intercept", "Relentless"] },
  16: { ovr: 70, pos: "ST", skill: 3, weak: 3, delta: { sho: 6, phy: 4, pac: -4, dri: -1, def: 4 }, styles: ["Power Header", "Aerial", "Relentless"] },
  17: { ovr: 55, pos: "LB", alt: ["LW"], foot: "L", skill: 3, weak: 2, delta: { pac: 5, pas: 3 }, styles: ["Dead Ball"] },
  18: { ovr: 55, pos: "GK", foot: "R", skill: 1, weak: 3 },
  19: { ovr: 60, pos: "RB", alt: ["RWB", "RM"], skill: 2, weak: 3, delta: { pac: 4, pas: 2 }, styles: ["Relentless"] },
  20: { ovr: 67, pos: "CB", alt: ["RB", "CDM"], skill: 2, weak: 3, delta: { pac: -2, def: 3, pas: 9, phy: 4 }, styles: ["Aerial", "Long Ball Pass", "Bruiser"] },
  21: { ovr: 58, pos: "CM", foot: "L", skill: 3, weak: 2, delta: { sho: 4, pas: 4 }, styles: ["Dead Ball"] },
  22: { ovr: 59, pos: "CAM", alt: ["CM"], foot: "R", skill: 3, weak: 3, delta: { dri: 2, pas: 2, def: 6 }, styles: ["Technical"] },
  23: { ovr: 59, pos: "LB", alt: ["LWB", "LM"], foot: "L", skill: 3, weak: 2, delta: { pac: 6, pas: 3, phy: -3 }, styles: ["Quick Step"] },
  24: { ovr: 59, pos: "CDM", alt: ["CM"], foot: "R", skill: 2, weak: 3, delta: { def: 3, pas: 3 }, styles: ["Intercept", "Long Ball Pass"] },
  25: { ovr: 52, pos: "GK", skill: 1, weak: 2 },
  27: { ovr: 54, pos: "RW", alt: ["LW"], skill: 3, weak: 3, delta: { pac: 4, dri: 3 } },
  28: { ovr: 54, pos: "CB", foot: "R", delta: { pac: 3, phy: 2 } },
  29: { ovr: 56, pos: "LB", alt: ["CM", "CDM"], foot: "L", skill: 2, weak: 2, delta: { pas: 3 } },
  30: { ovr: 65, pos: "CM", alt: ["CAM", "LW"], foot: "R", skill: 3, weak: 3, delta: { pas: 3, def: 2, phy: -1, pac: 3 }, styles: ["Relentless", "Intercept"] },
  31: { ovr: 55, pos: "GK", skill: 1, weak: 3 },
  33: { ovr: 59, pos: "LB", alt: ["RB", "RW"], foot: "R", skill: 3, weak: 5, delta: { pac: 2, pas: 3, sho: 4 }, styles: ["Whipped Pass"] },
  38: { ovr: 66, pos: "CB", foot: "L", skill: 2, weak: 2, delta: { phy: 5, pac: -2, def: 2, pas: 3 }, styles: ["Aerial", "Power Header"] },
  47: { ovr: 60, pos: "LW", alt: ["CAM"], foot: "R", skill: 3, weak: 3, delta: { pac: 4 }, styles: ["Quick Step"] },
  70: { ovr: 60, pos: "LW", alt: ["ST"], foot: "R", skill: 3, weak: 4, delta: { pac: 5, sho: 5, phy: -6 }, styles: ["Rapid", "Finesse Shot"] },
  71: { ovr: 52, pos: "GK", skill: 1, weak: 2, delta: { pas: 3 } },
  77: { ovr: 61, pos: "RW", alt: ["LW", "CAM"], skill: 3, weak: 3, delta: { pac: 6, phy: -4 }, styles: ["Rapid"] },
  90: { ovr: 65, pos: "LW", alt: ["ST", "CF"], foot: "R", skill: 3, weak: 3, delta: { pac: 5, sho: 5, phy: 12, def: -4 }, styles: ["Aerial", "Rapid"] },
  99: { ovr: 53, pos: "ST", alt: ["RW"], foot: "R", skill: 2, weak: 3, delta: { phy: 4, pac: 3 }, styles: ["Relentless"] },
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
