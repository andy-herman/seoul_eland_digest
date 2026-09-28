import { BOX_DEPTH, BOX_W, GOAL_W, PITCH_L, PITCH_W, type FcBall, type FcPlayer, type Side } from "./types";

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
  reaction: number;
  decisionNoise: number;
  passError: number;
  shotError: number;
  press: number;
  speed: number;
  gkReaction: number;
  gkReach: number;
  foulCare: number;
}

export interface TeamAiContext {
  side: Side;
  tier: 1 | 2 | 3 | 4;
  players: FcPlayer[];
  opponents: FcPlayer[];
  ball: FcBall;
  intent?: { side: Side; target: number | null; targetX: number; targetZ: number; kind: string } | null;
  ratings: FcRatings[];
  rand: () => number;
}

export interface AiAction {
  kind: "shoot" | "pass" | "through" | "lob" | "cross" | "dribble" | "chase" | "hold";
  target?: number;
  x?: number;
  z?: number;
  sprint?: boolean;
}

export const FC_AI: Record<1 | 2 | 3 | 4, FcAiConfig> = {
  1: { reaction: 0.68, decisionNoise: 0.48, passError: 0.155, shotError: 0.19, press: 0.76, speed: 0.94, gkReaction: 0.32, gkReach: 1.75, foulCare: 0.45 },
  2: { reaction: 0.5, decisionNoise: 0.32, passError: 0.105, shotError: 0.13, press: 0.94, speed: 1, gkReaction: 0.24, gkReach: 2.0, foulCare: 0.64 },
  3: { reaction: 0.46, decisionNoise: 0.26, passError: 0.12, shotError: 0.18, press: 0.88, speed: 0.99, gkReaction: 0.24, gkReach: 1.85, foulCare: 0.68 },
  4: { reaction: 0.2, decisionNoise: 0.08, passError: 0.025, shotError: 0.035, press: 0.92, speed: 1.04, gkReaction: 0.04, gkReach: 4.8, foulCare: 0.94 },
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

export function angleNoise(rand: () => number, amount: number): number {
  return (rand() - rand()) * amount;
}

export function formationSpot(side: Side, index: number, ballX: number, ballZ: number, attacking: boolean): { x: number; z: number } {
  if (index === 0) return { x: side === "home" ? 2.1 : PITCH_L - 2.1, z: PITCH_W / 2 };
  const dir = sideDir(side);
  const lanes = [PITCH_W / 2, PITCH_W * 0.28, PITCH_W * 0.72, PITCH_W * 0.48, PITCH_W * 0.52];
  const baseHome = [2, 15, 17, 29, 40];
  const baseAway = [PITCH_L - 2, PITCH_L - 15, PITCH_L - 17, PITCH_L - 29, PITCH_L - 40];
  const base = side === "home" ? baseHome[index] : baseAway[index];
  const slide = clamp((ballX - PITCH_L / 2) * 0.34, -9.5, 9.5);
  const phase = (attacking ? 5.5 : -4) * dir;
  const lane = side === "away" ? PITCH_W - lanes[index] : lanes[index];
  const width = (ballZ - PITCH_W / 2) * (index === 4 ? 0.14 : 0.25);
  return { x: clamp(base + slide + phase, 1.4, PITCH_L - 1.4), z: clamp(lane + width, 3, PITCH_W - 3) };
}

export function laneOpenness(from: { x: number; z: number }, to: { x: number; z: number }, opponents: FcPlayer[]): number {
  const vx = to.x - from.x;
  const vz = to.z - from.z;
  const l2 = vx * vx + vz * vz || 1;
  let clearance = 7;
  for (const o of opponents) {
    if (o.index === 0) continue;
    const t = clamp(((o.x - from.x) * vx + (o.z - from.z) * vz) / l2, 0, 1);
    clearance = Math.min(clearance, Math.hypot(o.x - (from.x + vx * t), o.z - (from.z + vz * t)));
  }
  return clamp((clearance - 0.7) / 4.8, 0, 1);
}

export function pickPassTarget(ctx: TeamAiContext, carrier: FcPlayer, lead: boolean): number {
  const dir = sideDir(ctx.side);
  let best = -Infinity;
  let chosen = ctx.players.find((p) => p.index > 0 && p.index !== carrier.index)?.index ?? 1;
  for (const p of ctx.players) {
    if (p.index === 0 || p.index === carrier.index) continue;
    const d = dist(carrier, p);
    const progress = (p.x - carrier.x) * dir;
    const open = laneOpenness(carrier, p, ctx.opponents);
    const space = nearestOpponentDistance(p, ctx.opponents) / 8;
    const score = open * 2.1 + progress * (lead ? 0.075 : 0.045) + space - d * 0.018 + (ctx.rand() - 0.5) * FC_AI[ctx.tier].decisionNoise;
    if (d > 3 && d < 36 && score > best) {
      best = score;
      chosen = p.index;
    }
  }
  return chosen;
}

export function chooseOnBallAction(ctx: TeamAiContext, carrier: FcPlayer): AiAction {
  const cfg = FC_AI[ctx.tier];
  const dir = sideDir(ctx.side);
  const goal = { x: attackGoalX(ctx.side), z: PITCH_W / 2 };
  const goalDist = dist(carrier, goal);
  const angle = Math.abs(carrier.z - PITCH_W / 2) / Math.max(8, goalDist);
  const pressure = nearestOpponentDistance(carrier, ctx.opponents);
  const rating = ctx.ratings[carrier.index] ?? ctx.ratings[1];
  const openShot = countLaneBlockers(carrier, goal, ctx.opponents) === 0;
  const shootValue = (28 - goalDist) * 0.052 + rating.shooting * 0.85 - angle * 1.3 + (openShot ? 0.32 : -0.18) - (pressure < 2.1 ? 0.25 : 0) + (ctx.rand() - 0.5) * cfg.decisionNoise;
  if (goalDist < 20 + ctx.tier * 1.0 && shootValue > 1.46 - ctx.tier * 0.065) return { kind: "shoot", x: goal.x, z: clamp(PITCH_W / 2 + (ctx.rand() - 0.5) * GOAL_W * 0.75, PITCH_W / 2 - GOAL_W / 2 + 0.2, PITCH_W / 2 + GOAL_W / 2 - 0.2) };

  const wide = carrier.z < 7.5 || carrier.z > PITCH_W - 7.5;
  const nearBox = ctx.side === "home" ? carrier.x > PITCH_L - BOX_DEPTH - 5 : carrier.x < BOX_DEPTH + 5;
  if (wide && nearBox && ctx.rand() < 0.42 + rating.passing * 0.28) return { kind: "cross", x: attackGoalX(ctx.side) - dir * 6.5, z: PITCH_W / 2 + (ctx.rand() - 0.5) * BOX_W * 0.35 };

  const target = pickPassTarget(ctx, carrier, true);
  const receiver = ctx.players[target];
  if (receiver) {
    const open = laneOpenness(carrier, receiver, ctx.opponents);
    const progressive = (receiver.x - carrier.x) * dir > 3;
    const passValue = open + (progressive ? 0.25 : 0) + (pressure < 2.2 ? 0.25 : 0) + rating.passing * 0.35 + (ctx.rand() - 0.5) * cfg.decisionNoise;
    if (passValue > 0.95) {
      const through = progressive && nearestOpponentDistance(receiver, ctx.opponents) > 3.2 && ctx.rand() < 0.34 + rating.passing * 0.22;
      return through ? { kind: "through", target } : { kind: "pass", target };
    }
  }

  return { kind: "dribble", x: clamp(carrier.x + dir * (8 + rating.dribbling * 6), 1.5, PITCH_L - 1.5), z: clamp(carrier.z + (ctx.rand() - 0.5) * 8, 2.5, PITCH_W - 2.5), sprint: pressure > 2.2 };
}

export function chooseOffBallTarget(ctx: TeamAiContext, p: FcPlayer): AiAction {
  const owner = ctx.ball.owner;
  const attacking = owner?.side === ctx.side;
  if (!owner && ctx.intent?.side === ctx.side && ctx.intent.target === p.index) return { kind: "chase", x: ctx.intent.targetX, z: ctx.intent.targetZ, sprint: true };
  if (!owner && p.index > 0) {
    const sortedOwn = ctx.players.filter((q) => q.index > 0).sort((a, b) => dist(a, ctx.ball) - dist(b, ctx.ball));
    const sortedOpp = ctx.opponents.filter((q) => q.index > 0).sort((a, b) => dist(a, ctx.ball) - dist(b, ctx.ball));
    if (sortedOwn[0]?.index === p.index || dist(p, ctx.ball) < dist(sortedOpp[0] ?? p, ctx.ball) + 2.4) return { kind: "chase", x: ctx.ball.x, z: ctx.ball.z, sprint: true };
  }
  if (owner?.side === opposite(ctx.side)) {
    const carrier = ctx.opponents[owner.index];
    const pressOrder = ctx.players.filter((q) => q.index > 0).sort((a, b) => dist(a, carrier) - dist(b, carrier));
    if (pressOrder[0]?.index === p.index) return { kind: "chase", x: carrier.x, z: carrier.z, sprint: true };
    if (pressOrder[1]?.index === p.index) return { kind: "hold", x: (carrier.x + ownGoalX(ctx.side)) / 2, z: (carrier.z + PITCH_W / 2) / 2, sprint: false };
  }
  const spot = formationSpot(ctx.side, p.index, ctx.ball.x, ctx.ball.z, attacking);
  if (attacking && p.index === 4) spot.x = clamp(spot.x + sideDir(ctx.side) * 5, 1.5, PITCH_L - 1.5);
  return { kind: "hold", x: spot.x, z: spot.z, sprint: false };
}

export function nearestOpponentDistance(p: { x: number; z: number }, opponents: FcPlayer[]): number {
  let best = 99;
  for (const o of opponents) if (o.index > 0) best = Math.min(best, dist(p, o));
  return best;
}

export function countLaneBlockers(from: { x: number; z: number }, to: { x: number; z: number }, opponents: FcPlayer[]): number {
  const vx = to.x - from.x;
  const vz = to.z - from.z;
  const l2 = vx * vx + vz * vz || 1;
  let c = 0;
  for (const o of opponents) {
    const t = clamp(((o.x - from.x) * vx + (o.z - from.z) * vz) / l2, 0, 1);
    const px = from.x + vx * t;
    const pz = from.z + vz * t;
    if (Math.hypot(o.x - px, o.z - pz) < 1.3) c++;
  }
  return c;
}
