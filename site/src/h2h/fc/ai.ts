import { BOX_DEPTH, BOX_W, GOAL_W, PITCH_L, PITCH_W, type FcPlayer, type Side } from "./types";

export interface FcRatings {
  pace: number;
  shooting: number;
  passing: number;
  defending: number;
  gk: number;
}

export interface FcAiConfig {
  reaction: number;
  decision: number;
  pass: number;
  shot: number;
  press: number;
  speed: number;
  gk: number;
  foulCare: number;
}

export type AiActionKind = "dribble" | "pass" | "through" | "lob" | "cross" | "shoot" | "press" | "hold";

export interface AiAction {
  kind: AiActionKind;
  target?: number;
  tx?: number;
  tz?: number;
  sprint?: boolean;
}

export interface TeamAiContext {
  side: Side;
  tier: 1 | 2 | 3 | 4;
  players: FcPlayer[];
  opponents: FcPlayer[];
  ball: { x: number; z: number; h: number; owner: { side: Side; index: number } | null; vx: number; vz: number };
  score: { home: number; away: number };
  elapsed: number;
  seconds: number;
  rand: () => number;
  ratings: FcRatings[];
}

export const FC_AI: Record<1 | 2 | 3 | 4, FcAiConfig> = {
  1: { reaction: 0.58, decision: 0.72, pass: 0.74, shot: 0.72, press: 0.72, speed: 0.94, gk: 0.7, foulCare: 0.55 },
  2: { reaction: 0.44, decision: 0.86, pass: 0.84, shot: 0.83, press: 0.9, speed: 1, gk: 0.82, foulCare: 0.7 },
  3: { reaction: 0.34, decision: 0.98, pass: 0.92, shot: 0.93, press: 1.04, speed: 1.03, gk: 0.92, foulCare: 0.82 },
  4: { reaction: 0.26, decision: 1.08, pass: 0.98, shot: 1.02, press: 1.15, speed: 1.06, gk: 1, foulCare: 0.92 },
};

export function sideDir(side: Side): 1 | -1 {
  return side === "home" ? 1 : -1;
}

export function goalX(side: Side): number {
  return side === "home" ? PITCH_L : 0;
}

export function ownGoalX(side: Side): number {
  return side === "home" ? 0 : PITCH_L;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function norm(x: number, z: number): { x: number; z: number; d: number } {
  const d = Math.hypot(x, z);
  return d > 1e-6 ? { x: x / d, z: z / d, d } : { x: 1, z: 0, d: 0 };
}

export function formationSpot(side: Side, index: number, ballX: number, ballZ: number, attacking: boolean): { x: number; z: number } {
  if (index === 0) return { x: side === "home" ? 2.2 : PITCH_L - 2.2, z: PITCH_W / 2 };
  const dir = sideDir(side);
  const attackShift = attacking ? 6 : -3;
  const baseX = side === "home" ? [0, 16, 18, 30, 40] : [0, PITCH_L - 16, PITCH_L - 18, PITCH_L - 30, PITCH_L - 40];
  const lanes = [0, PITCH_W * 0.28, PITCH_W * 0.72, PITCH_W * 0.5, PITCH_W * 0.5];
  const slide = clamp((ballX - PITCH_L / 2) * 0.32, -10, 10) * dir;
  const widthPull = (ballZ - PITCH_W / 2) * (index === 4 ? 0.18 : 0.28);
  return {
    x: clamp(baseX[index] + slide + dir * attackShift, 1.5, PITCH_L - 1.5),
    z: clamp(lanes[index] + widthPull, 3, PITCH_W - 3),
  };
}

export function pickPassTarget(ctx: TeamAiContext, carrier: FcPlayer, progressive = true): number {
  const dir = sideDir(ctx.side);
  let best = -1;
  let bestScore = -Infinity;
  for (const p of ctx.players) {
    if (p.index === 0 || p.index === carrier.index) continue;
    const dx = (p.x - carrier.x) * dir;
    const d = dist(carrier, p);
    if (d < 3 || d > 34) continue;
    const open = laneOpenness(carrier, p, ctx.opponents);
    const progress = progressive ? dx * 0.16 : -Math.abs(dx) * 0.03;
    const lane = 1.4 - Math.abs(p.z - carrier.z) / PITCH_W;
    const score = open * 3 + progress + lane - d * 0.025 + ctx.rand() * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = p.index;
    }
  }
  if (best > 0) return best;
  return ctx.players.filter((p) => p.index > 0 && p.index !== carrier.index).sort((a, b) => dist(carrier, a) - dist(carrier, b))[0]?.index ?? 1;
}

export function laneOpenness(from: { x: number; z: number }, to: { x: number; z: number }, opponents: FcPlayer[]): number {
  const lx = to.x - from.x;
  const lz = to.z - from.z;
  const len2 = lx * lx + lz * lz || 1;
  let nearest = 8;
  for (const o of opponents) {
    const t = clamp(((o.x - from.x) * lx + (o.z - from.z) * lz) / len2, 0, 1);
    const px = from.x + lx * t;
    const pz = from.z + lz * t;
    nearest = Math.min(nearest, Math.hypot(o.x - px, o.z - pz));
  }
  return clamp(nearest / 5, 0, 1);
}

export function chooseOnBallAction(ctx: TeamAiContext, carrier: FcPlayer): AiAction {
  const cfg = FC_AI[ctx.tier];
  const dir = sideDir(ctx.side);
  const goal = { x: goalX(ctx.side), z: PITCH_W / 2 };
  const goalDist = dist(carrier, goal);
  const wide = carrier.z < 7 || carrier.z > PITCH_W - 7;
  const boxX = ctx.side === "home" ? carrier.x > PITCH_L - BOX_DEPTH - 4 : carrier.x < BOX_DEPTH + 4;
  const pressure = ctx.opponents.some((o) => o.index > 0 && dist(o, carrier) < 2.2);
  const rating = ctx.ratings[carrier.index] ?? ctx.ratings[1];
  const shootScore = (34 - goalDist) * 0.055 + rating.shooting * 0.9 + cfg.shot * 0.35 - (pressure ? 0.28 : 0) + ctx.rand() * 0.28;
  if (goalDist < 16 && shootScore > 2.08) {
    return { kind: "shoot", tx: goal.x, tz: clamp(goal.z + (ctx.rand() - 0.5) * GOAL_W * 0.75, goal.z - GOAL_W / 2, goal.z + GOAL_W / 2) };
  }
  if (wide && boxX && ctx.rand() < 0.34 + cfg.decision * 0.12) {
    return { kind: "cross", tx: ctx.side === "home" ? PITCH_L - 6 : 6, tz: PITCH_W / 2 + (ctx.rand() - 0.5) * BOX_W * 0.45 };
  }
  const target = pickPassTarget(ctx, carrier, true);
  const receiver = ctx.players[target];
  const open = receiver ? laneOpenness(carrier, receiver, ctx.opponents) : 0;
  const passChance = 0.62 + cfg.pass * 0.20 + (pressure ? 0.18 : 0) + (open - 0.5) * 0.22;
  if (receiver && ctx.rand() < passChance) {
    const ahead = (receiver.x - carrier.x) * dir > 7 && ctx.rand() < 0.34 + cfg.decision * 0.06;
    return ahead ? { kind: "through", target, tx: receiver.x + dir * 6, tz: receiver.z } : { kind: "pass", target, tx: receiver.x, tz: receiver.z };
  }
  return { kind: "dribble", tx: clamp(carrier.x + dir * (8 + cfg.decision * 2), 1, PITCH_L - 1), tz: clamp(carrier.z + (ctx.rand() - 0.5) * 8, 2, PITCH_W - 2), sprint: !pressure };
}

export function chooseDefensiveAction(ctx: TeamAiContext, player: FcPlayer): AiAction {
  const owner = ctx.ball.owner;
  const carrier = owner?.side === (ctx.side === "home" ? "away" : "home") ? ctx.opponents[owner.index] : null;
  if (!carrier) {
    return { kind: "hold", tx: formationSpot(ctx.side, player.index, ctx.ball.x, ctx.ball.z, false).x, tz: formationSpot(ctx.side, player.index, ctx.ball.x, ctx.ball.z, false).z };
  }
  const sorted = ctx.players.filter((p) => p.index > 0).sort((a, b) => dist(a, carrier) - dist(b, carrier));
  if (sorted[0]?.index === player.index) return { kind: "press", tx: carrier.x, tz: carrier.z, sprint: true };
  const spot = formationSpot(ctx.side, player.index, ctx.ball.x, ctx.ball.z, false);
  return { kind: "hold", tx: (spot.x + carrier.x) / 2, tz: (spot.z + carrier.z) / 2 };
}
