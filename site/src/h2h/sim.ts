import { AI_TIER, POWER_ARCHETYPE, playerStats, rng, type Kit, type OpponentSlug, type SquadPlayer } from "./data";

export const WORLD_W = 1600;
export const WORLD_H = 900;
export const GROUND_Y = 780;
export const GOAL_LEFT = 42;
export const GOAL_RIGHT = 1558;
export const GOAL_DEPTH = 116;
export const CROSSBAR_Y = 480;
export const MATCH_SECONDS = 90;
export const STEP = 1 / 60;

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  kick: boolean;
  power: boolean;
}

export interface Body {
  side: "left" | "right";
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  headR: number;
  facing: 1 | -1;
  onGround: boolean;
  kickT: number;
  power: number;
  powerBanked: boolean;
  speedBoostT: number;
  bigHeadT: number;
  freezeT: number;
  anim: number;
  mood: "idle" | "run" | "jump" | "kick" | "celebrate" | "sad";
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
  tinyT: number;
  poweredBy: "left" | "right" | null;
  fireT: number;
  freezeT: number;
}

export interface PowerUp {
  kind: "speed" | "bigHead" | "tinyBall" | "freezePuddle";
  x: number;
  y: number;
  t: number;
}

export interface MatchEvent {
  type: "goal" | "post" | "kick" | "power" | "pickup" | "end";
  by?: "left" | "right";
  kind?: string;
}

export interface MatchConfig {
  player: SquadPlayer;
  opponent: OpponentSlug;
  kit: Kit;
  mode: "league" | "quick" | "ai";
  seed?: number;
}

export class H2HMatch {
  readonly player: SquadPlayer;
  readonly opponent: OpponentSlug;
  readonly kit: Kit;
  readonly mode: "league" | "quick" | "ai";
  readonly rand: () => number;
  left: Body;
  right: Body;
  ball: Ball;
  powerUp: PowerUp | null = null;
  clock = MATCH_SECONDS;
  elapsed = 0;
  score = { left: 0, right: 0 };
  phase: "ready" | "play" | "goal" | "ended" = "ready";
  phaseT = 1.2;
  lastScorer: "left" | "right" | null = null;
  events: MatchEvent[] = [];
  stuckT = 0;
  nextPowerUp = 18;
  goldenGoal = false;
  ai = {
    leftNext: 0,
    rightNext: 0,
    left: blankInput(),
    right: blankInput(),
  };

  constructor(config: MatchConfig) {
    this.player = config.player;
    this.opponent = config.opponent;
    this.kit = config.kit;
    this.mode = config.mode;
    this.rand = rng(config.seed ?? 1);
    this.left = makeBody("left", 315, this.player, 1);
    this.right = makeBody("right", 1285, this.player, -1);
    this.ball = { x: WORLD_W / 2, y: 360, vx: (this.rand() - 0.5) * 180, vy: 0, r: 28, spin: 0, tinyT: 0, poweredBy: null, fireT: 0, freezeT: 0 };
  }

  start(): void {
    if (this.phase === "ready") {
      this.phase = "play";
      this.phaseT = 0;
    }
  }

  step(dt: number, leftInput: InputState = blankInput(), rightInput: InputState = blankInput()): void {
    this.events = [];
    if (this.phase === "ready") {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.start();
      return;
    }
    if (this.phase === "ended") return;
    if (this.phase === "goal") {
      this.elapsed += dt;
      this.clock = Math.max(0, MATCH_SECONDS - this.elapsed);
      if (this.clock <= 0) {
        this.end();
        return;
      }
      this.phaseT -= dt;
      this.left.mood = this.lastScorer === "left" ? "celebrate" : "sad";
      this.right.mood = this.lastScorer === "right" ? "celebrate" : "sad";
      if (this.phaseT <= 0) this.resetKickoff();
      return;
    }
    this.elapsed += dt;
    this.clock = Math.max(0, MATCH_SECONDS - this.elapsed);
    if (this.clock <= 0 && !this.goldenGoal) {
      if (this.mode === "quick" && this.score.left === this.score.right) {
        this.goldenGoal = true;
        this.clock = 0;
      } else {
        this.end();
        return;
      }
    }
    this.updateBody(this.left, leftInput, dt);
    this.updateBody(this.right, rightInput, dt);
    this.updateBall(dt);
    this.updatePowerUp(dt);
  }

  aiInput(side: "left" | "right", dt: number): InputState {
    const body = side === "left" ? this.left : this.right;
    const stateKey = side === "left" ? "left" : "right";
    const nextKey = side === "left" ? "leftNext" : "rightNext";
    this.ai[nextKey] -= dt;
    if (this.ai[nextKey] > 0) return this.ai[stateKey];
    const tier = side === "right" ? (Math.min(4, AI_TIER[this.opponent] + 1) as 1 | 2 | 3 | 4) : 2;
    const reaction = [0.24, 0.18, 0.13, 0.095][tier - 1] + this.rand() * 0.04;
    this.ai[nextKey] = reaction;
    const attackDir = side === "left" ? 1 : -1;
    const ownGoal = side === "left" ? GOAL_LEFT : GOAL_RIGHT;
    const targetX = this.ball.x - attackDir * (this.ball.y < 550 ? 35 : 75);
    const defend = Math.abs(this.ball.x - ownGoal) < 330 && this.ball.y > 430;
    const wanted = defend ? ownGoal + attackDir * 160 : targetX;
    const input = blankInput();
    if (wanted < body.x - 18) input.left = true;
    if (wanted > body.x + 18) input.right = true;
    if (this.ball.y < body.y - 95 && Math.abs(this.ball.x - body.x) < 185 && body.onGround) input.jump = true;
    const dist = Math.hypot(this.ball.x - body.x, this.ball.y - (body.y - body.h * 0.55));
    input.kick = dist < 115 || (defend && dist < 155);
    input.power = body.powerBanked && Math.abs(this.ball.y - (body.y - 115)) < 170 && ((side === "left" && this.ball.x > body.x) || (side === "right" && this.ball.x < body.x));
    this.ai[stateKey] = input;
    return input;
  }

  private updateBody(b: Body, input: InputState, dt: number): void {
    const stats = playerStats(this.player);
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const frozen = b.freezeT > 0;
    const speedScale = b.side === "right" ? 0.92 + AI_TIER[this.opponent] * 0.055 : 1;
    const maxSpeed = (355 + stats.speed * 150) * (b.speedBoostT > 0 ? 1.34 : 1) * speedScale;
    if (!frozen) {
      if (dir !== 0) {
        b.vx += dir * 2100 * dt;
        b.facing = dir as 1 | -1;
      } else {
        b.vx *= Math.pow(0.0008, dt);
      }
      b.vx = clamp(b.vx, -maxSpeed, maxSpeed);
      if (input.jump && b.onGround) {
        b.vy = -(725 + stats.jump * 245);
        b.onGround = false;
      }
    } else {
      b.vx *= Math.pow(0.05, dt);
    }
    if (input.kick && b.kickT <= 0) {
      b.kickT = 0.22;
      this.events.push({ type: "kick", by: b.side });
    }
    if (input.power && b.powerBanked) this.firePower(b);
    b.vy += 1900 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.x = clamp(b.x, 130, WORLD_W - 130);
    if (b.y >= GROUND_Y) {
      b.y = GROUND_Y;
      b.vy = 0;
      b.onGround = true;
    }
    b.kickT = Math.max(0, b.kickT - dt);
    b.speedBoostT = Math.max(0, b.speedBoostT - dt);
    b.bigHeadT = Math.max(0, b.bigHeadT - dt);
    b.freezeT = Math.max(0, b.freezeT - dt);
    if (!b.powerBanked) {
      b.power += dt / 35 + (b.side === "right" ? AI_TIER[this.opponent] * 0.0008 : 0);
      if (b.power >= 1) {
        b.power = 1;
        b.powerBanked = true;
      }
    }
    b.anim += dt * (Math.abs(b.vx) > 30 ? 7 : 2.5);
    b.mood = b.kickT > 0 ? "kick" : !b.onGround ? "jump" : Math.abs(b.vx) > 45 ? "run" : "idle";
    this.collidePlayerBall(b);
  }

  private updateBall(dt: number): void {
    const ball = this.ball;
    ball.vy += 1120 * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += ball.vx * dt * 0.015;
    ball.fireT = Math.max(0, ball.fireT - dt);
    ball.freezeT = Math.max(0, ball.freezeT - dt);
    ball.tinyT = Math.max(0, ball.tinyT - dt);
    ball.r = ball.tinyT > 0 ? 18 : 28;
    if (ball.y + ball.r > GROUND_Y) {
      ball.y = GROUND_Y - ball.r;
      ball.vy = -Math.abs(ball.vy) * 0.72;
      ball.vx *= 0.985;
      if (Math.abs(ball.vy) < 45) ball.vy = 0;
    }
    if (ball.y - ball.r < 44) {
      ball.y = 44 + ball.r;
      ball.vy = Math.abs(ball.vy) * 0.82;
    }
    this.goalFrameCollision();
    if (ball.x - ball.r < -70) {
      ball.x = -70 + ball.r;
      ball.vx = Math.abs(ball.vx) * 0.86;
    }
    if (ball.x + ball.r > WORLD_W + 70) {
      ball.x = WORLD_W + 70 - ball.r;
      ball.vx = -Math.abs(ball.vx) * 0.86;
    }
    ball.vx *= Math.pow(0.992, dt * 60);
    ball.vy *= Math.pow(0.998, dt * 60);
    if (Math.hypot(ball.vx, ball.vy) < 18) this.stuckT += dt;
    else this.stuckT = 0;
    if (this.stuckT > 3.6) {
      ball.vx += (this.rand() < 0.5 ? -1 : 1) * 260;
      ball.vy -= 360;
      this.stuckT = 0;
    }
    if (ball.x + ball.r < GOAL_LEFT && ball.y + ball.r > CROSSBAR_Y) this.goal("right");
    if (ball.x - ball.r > GOAL_RIGHT && ball.y + ball.r > CROSSBAR_Y) this.goal("left");
    ball.x = clamp(ball.x, -80, WORLD_W + 80);
    ball.y = clamp(ball.y, 0, WORLD_H);
  }

  private collidePlayerBall(b: Body): void {
    const headR = b.headR * (b.bigHeadT > 0 ? 1.25 : 1);
    const headX = b.x;
    const headY = b.y - b.h + headR + 6;
    circleHit(this.ball, headX, headY, headR, b.vx * 0.34, b.vy * 0.2);
    circleHit(this.ball, b.x, b.y - 54, 46, b.vx * 0.22, b.vy * 0.1);
    if (b.kickT > 0) {
      const footX = b.x + b.facing * 74;
      const footY = b.y - 42;
      const dx = this.ball.x - footX;
      const dy = this.ball.y - footY;
      const d = Math.hypot(dx, dy);
      if (d < this.ball.r + 42) {
        const stats = playerStats(this.player);
        this.ball.vx = b.facing * (650 + stats.shot * 310) + b.vx * 0.22;
        this.ball.vy = -300 - stats.jump * 95 + dy * 1.9;
      }
    }
  }

  private firePower(b: Body): void {
    b.powerBanked = false;
    b.power = 0;
    const dir = b.facing;
    this.ball.poweredBy = b.side;
    this.ball.fireT = 1.0;
    if (b.side === "right" && POWER_ARCHETYPE[this.opponent] === "freeze") this.ball.freezeT = 1.1;
    this.ball.vx = dir * (980 + (b.side === "right" && POWER_ARCHETYPE[this.opponent] === "fire" ? 180 : 0));
    this.ball.vy = b.side === "right" && POWER_ARCHETYPE[this.opponent] === "lob" ? -640 : -80;
    this.ball.x = b.x + dir * 105;
    this.ball.y = b.y - 115;
    this.events.push({ type: "power", by: b.side, kind: b.side === "left" ? "leopard" : POWER_ARCHETYPE[this.opponent] });
  }

  private updatePowerUp(dt: number): void {
    if (this.powerUp) {
      this.powerUp.t -= dt;
      for (const b of [this.left, this.right]) {
        if (Math.hypot(b.x - this.powerUp.x, b.y - this.powerUp.y) < 78) {
          const kind = this.powerUp.kind;
          if (kind === "speed") b.speedBoostT = 6;
          if (kind === "bigHead") b.bigHeadT = 6;
          if (kind === "tinyBall") this.ball.tinyT = 6;
          if (kind === "freezePuddle") (b.side === "left" ? this.right : this.left).freezeT = 1.05;
          this.events.push({ type: "pickup", by: b.side, kind });
          this.powerUp = null;
          this.nextPowerUp = this.elapsed + 20 + this.rand() * 5;
          return;
        }
      }
      if (this.powerUp && this.powerUp.t <= 0) this.powerUp = null;
    } else if (this.elapsed > this.nextPowerUp) {
      const kinds: PowerUp["kind"][] = ["speed", "bigHead", "tinyBall", "freezePuddle"];
      this.powerUp = { kind: kinds[Math.floor(this.rand() * kinds.length)], x: 720 + this.rand() * 160, y: GROUND_Y - 34, t: 9 };
    }
  }

  private goalFrameCollision(): void {
    const b = this.ball;
    const inLeftFrame = b.x - b.r < GOAL_LEFT + GOAL_DEPTH;
    const inRightFrame = b.x + b.r > GOAL_RIGHT - GOAL_DEPTH;
    for (const x of [GOAL_LEFT, GOAL_RIGHT]) {
      const nearPost = Math.abs(b.x - x) < b.r + 12 && b.y - b.r < CROSSBAR_Y;
      if (nearPost && b.y - b.r < GROUND_Y) {
        b.x = x + (x === GOAL_LEFT ? b.r + 12 : -(b.r + 12));
        b.vx = (x === GOAL_LEFT ? 1 : -1) * Math.max(260, Math.abs(b.vx) * 0.82);
        this.events.push({ type: "post" });
      }
    }
    if ((inLeftFrame || inRightFrame) && Math.abs(b.y - CROSSBAR_Y) < b.r + 10) {
      b.y = CROSSBAR_Y - b.r - 12;
      b.vy = -Math.max(360, Math.abs(b.vy) * 0.78);
      b.vx += inLeftFrame ? 140 : -140;
      this.events.push({ type: "post" });
    }
  }

  private goal(by: "left" | "right"): void {
    this.score[by] += 1;
    this.lastScorer = by;
    this.events.push({ type: "goal", by });
    if (this.goldenGoal) {
      this.end();
      return;
    }
    this.phase = "goal";
    this.phaseT = 4.0;
  }

  private resetKickoff(): void {
    this.left = makeBody("left", 315, this.player, 1);
    this.right = makeBody("right", 1285, this.player, -1);
    this.ball = { x: WORLD_W / 2, y: 360, vx: (this.lastScorer === "left" ? -1 : 1) * 180, vy: 0, r: 28, spin: 0, tinyT: 0, poweredBy: null, fireT: 0, freezeT: 0 };
    this.phase = "play";
  }

  private end(): void {
    this.phase = "ended";
    this.clock = 0;
    this.events.push({ type: "end" });
  }
}

function makeBody(side: "left" | "right", x: number, player: SquadPlayer, facing: 1 | -1): Body {
  const stats = playerStats(player);
  return {
    side,
    x,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    w: 92,
    h: 216,
    headR: 66 + stats.jump * 8,
    facing,
    onGround: true,
    kickT: 0,
    power: 0.08,
    powerBanked: false,
    speedBoostT: 0,
    bigHeadT: 0,
    freezeT: 0,
    anim: 0,
    mood: "idle",
  };
}

export function blankInput(): InputState {
  return { left: false, right: false, jump: false, kick: false, power: false };
}

function circleHit(ball: Ball, x: number, y: number, r: number, addVx: number, addVy: number): void {
  const dx = ball.x - x;
  const dy = ball.y - y;
  const dist = Math.hypot(dx, dy) || 1;
  const min = ball.r + r;
  if (dist >= min) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const push = min - dist;
  ball.x += nx * push;
  ball.y += ny * push;
  const dot = ball.vx * nx + ball.vy * ny;
  if (dot < 640) {
    ball.vx += nx * (640 - dot) + addVx;
    ball.vy += ny * (640 - dot) + addVy;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
