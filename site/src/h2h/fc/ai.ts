// Tier configs, geometry helpers and team shape for the FC match engine (sim.ts).
import { BOX_DEPTH, PITCH_L, PITCH_W, type FcPlayer, type Side } from "./types";

export interface FcRatings {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  gk: number;
}

export interface FcAiConfig {
  reaction: number; // seconds between on-ball decisions
  noise: number; // decision noise added to option scores
  passError: number; // radians of aim error at passing 0.5
  shotError: number; // radians of aim error at shooting 0.5
  gkReaction: number; // keeper delay before moving on a shot
  gkDive: number; // extra dive reach in metres
  press: number; // how tight the first defender closes (metres of jockey distance, lower = tighter)
  tackle: number; // chance per decision tick to lunge when the ball is exposed
  foul: number; // chance that a lunge is mistimed into the carrier
  speed: number; // speed factor
  shootBias: number; // shot threshold shift (positive shoots more)
}

// Tier 1 is the easiest rival. The home side in headless runs uses homeAiTier (default 2).
export const FC_AI: Record<1 | 2 | 3 | 4, FcAiConfig> = {
  1: { reaction: 0.46, noise: 0.5, passError: 0.075, shotError: 0.085, gkReaction: 0.46, gkDive: 0.9, press: 2.8, tackle: 0.22, foul: 0.1, speed: 0.93, shootBias: 0 },
  2: { reaction: 0.36, noise: 0.34, passError: 0.055, shotError: 0.064, gkReaction: 0.39, gkDive: 1.1, press: 2.4, tackle: 0.3, foul: 0.08, speed: 0.97, shootBias: 0.02 },
  3: { reaction: 0.33, noise: 0.3, passError: 0.05, shotError: 0.06, gkReaction: 0.37, gkDive: 1.15, press: 2.3, tackle: 0.32, foul: 0.075, speed: 0.985, shootBias: 0.025 },
  4: { reaction: 0.3, noise: 0.24, passError: 0.043, shotError: 0.053, gkReaction: 0.34, gkDive: 1.25, press: 2.1, tackle: 0.36, foul: 0.065, speed: 1.0, shootBias: 0.035 },
};

export function sideDir(side: Side): 1 | -1 {
  return side === "home" ? 1 : -1;
}

export function attackGoalX(side: Side): number {
  return side === "home" ? PITCH_L : 0;
}

export function ownGoalX(side: Side): number {
  return side === "home" ? 0 : PITCH_L;
}

export function opposite(side: Side): Side {
  return side === "home" ? "away" : "home";
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function len(x: number, z: number): number {
  return Math.hypot(x, z);
}

export function unit(x: number, z: number): { x: number; z: number; d: number } {
  const d = len(x, z);
  return d > 1e-7 ? { x: x / d, z: z / d, d } : { x: 1, z: 0, d: 0 };
}

// Triangular noise in [-amount, amount], mean 0.
export function noise(rand: () => number, amount: number): number {
  return (rand() - rand()) * amount;
}

// Normal-ish noise (sum of three uniforms), standard deviation about sigma.
export function gauss(rand: () => number, sigma: number): number {
  return (rand() + rand() + rand() - 1.5) * 2 * sigma;
}

// Team shape for the four outfield players (index 1..4: two defenders, a midfielder, a forward).
// Base spots are for the home side attacking +x; the away side is mirrored through the centre spot.
const BASE: Record<number, { x: number; z: number }> = {
  1: { x: 13, z: 12.5 },
  2: { x: 13, z: 27.5 },
  3: { x: 24, z: 20 },
  4: { x: 33, z: 20 },
};

export function formationSpot(side: Side, index: number, ballX: number, ballZ: number, attacking: boolean): { x: number; z: number } {
  const dir = sideDir(side);
  if (index === 0) return { x: side === "home" ? 1.6 : PITCH_L - 1.6, z: PITCH_W / 2 };
  const base = BASE[index] ?? BASE[3];
  // own-goal-relative depth (0 = own goal line)
  let depth = base.x;
  const ballDepth = side === "home" ? ballX : PITCH_L - ballX;
  depth += clamp((ballDepth - PITCH_L / 2) * 0.45, -10, 12);
  depth += attacking ? (index === 4 ? 9 : index === 3 ? 6 : 4) : index === 4 ? -3 : -4;
  if (!attacking) depth = Math.min(depth, ballDepth + (index === 4 ? 4 : -1.5));
  const lane = side === "home" ? base.z : PITCH_W - base.z;
  const width = attacking ? 1.25 : 0.9;
  let z = PITCH_W / 2 + (lane - PITCH_W / 2) * width + (ballZ - PITCH_W / 2) * (index >= 3 ? 0.35 : 0.22);
  z = clamp(z, 2.5, PITCH_W - 2.5);
  const x = side === "home" ? depth : PITCH_L - depth;
  return { x: clamp(x, 2.5, PITCH_L - 2.5), z };
}

export function isInBox(x: number, z: number, defending: Side): boolean {
  const near = defending === "home" ? x < BOX_DEPTH : x > PITCH_L - BOX_DEPTH;
  return near && Math.abs(z - PITCH_W / 2) < 12;
}

export function nearestDistance(p: { x: number; z: number }, others: FcPlayer[], skipKeeper = true): number {
  let best = 99;
  for (const o of others) if (!skipKeeper || o.index > 0) best = Math.min(best, dist(p, o));
  return best;
}
