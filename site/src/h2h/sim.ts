import { AI_TIER, POWER_ARCHETYPE, RIVAL_STRENGTH, playerStats, rng, type Kit, type OpponentSlug, type PlayerStats, type SquadPlayer } from "./data";

export const WORLD_W = 1600;
export const WORLD_H = 900;
export const GROUND_Y = 780;
export const GOAL_LINE_L = 150;
export const GOAL_LINE_R = 1450;
export const NET_BACK_L = 40;
export const NET_BACK_R = 1560;
export const CROSSBAR_Y = 470;
export const CROSSBAR_R = 9;
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
  kickCooldown: number;
  kickHit: boolean;
  headerT: number;
  power: number;
  powerBanked: boolean;
  powerArmedT: number;
  speedBoostT: number;
  bigHeadT: number;
  freezeT: number;
  headBalanceT: number;
  anim: number;
  mood: "idle" | "run" | "jump" | "kick" | "header" | "celebrate" | "sad";
  stats: PlayerStats;
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
  powerKind: "leopard" | "fire" | "lob" | "freeze" | null;
  powerT: number;
  freezeT: number;
  netSide: "left" | "right" | null;
}

export interface PowerUp {
  kind: "speed" | "bigHead" | "tinyBall" | "freezePuddle";
  x: number;
  y: number;
  t: number;
}

export interface PopText {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
}

export interface MatchEvent {
  type: "goal" | "post" | "kick" | "power" | "pickup" | "end" | "freeze" | "counter" | "countdown" | "fulltime" | "kickoff";
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

const ZERO = blankInput();

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
  popTexts: PopText[] = [];
  clock = MATCH_SECONDS;
  elapsed = 0;
  score = { left: 0, right: 0 };
  phase: "ready" | "play" | "goal" | "kickoff" | "ended" = "ready";
  phaseT = 1.8;
  timeScale = 1;
  lastScorer: "left" | "right" | null = null;
  events: MatchEvent[] = [];
  stuckT = 0;
  nextPowerUp = 18;
  goldenGoal = false;
  shakeT = 0;
  ai = { leftNext: 0, rightNext: 0, left: blankInput(), right: blankInput() };
  stats = {
    freezes: 0,
    counters: 0,
    illegalGoalAttempts: 0,
    aboveBarGoals: 0,
    maxBallStep: 0,
    kickContacts: 0,
    kickSwings: 0,
    powerShots: 0,
  };

  constructor(config: MatchConfig) {
    this.player = config.player;
    this.opponent = config.opponent;
    this.kit = config.kit;
    this.mode = config.mode;
    this.rand = rng(config.seed ?? 1);
    this.left = makePlayerBody(config.player);
    this.right = config.mode === "ai" ? makeBody("right", 1270, -1, playerStats(config.player)) : makeMascotBody(config.opponent);
    this.ball = makeKickoffBall(this.rand);
  }

  start(): void {
    this.phase = "ready";
    this.phaseT = 1.8;
    this.events.push({ type: "countdown" });
  }

  step(dt: number, leftInput: InputState = ZERO, rightInput: InputState = ZERO): void {
    this.events = [];
    const prevX = this.ball.x;
    const prevY = this.ball.y;
    this.popTexts = this.popTexts.map((p) => ({ ...p, t: p.t - dt })).filter((p) => p.t > 0);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.phase === "ended") return;
    if (this.phase === "ready") {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = "play";
        this.phaseT = 0;
        this.events.push({ type: "kickoff" });
        this.pop("GO!", WORLD_W / 2, 210, "#ffd64a");
      }
      return;
    }
    if (this.phase === "goal") {
      this.phaseT -= dt;
      this.timeScale = this.phaseT > 1.4 ? 0.3 : 1;
      this.left.mood = this.lastScorer === "left" ? "celebrate" : "sad";
      this.right.mood = this.lastScorer === "right" ? "celebrate" : "sad";
      if (this.phaseT <= 0) {
        this.phase = "kickoff";
        this.phaseT = 0.7;
      }
      return;
    }
    if (this.phase === "kickoff") {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.resetKickoff();
      return;
    }

    this.timeScale = 1;
    this.elapsed += dt;
    this.clock = Math.max(0, MATCH_SECONDS - this.elapsed);
    if (this.clock <= 0 && !this.goldenGoal) {
      if (this.mode === "quick" && this.score.left === this.score.right) {
        this.goldenGoal = true;
        this.clock = 0;
        this.pop("GOLDEN GOAL", WORLD_W / 2, 255, "#ffd64a");
      } else {
        this.end();
        return;
      }
    }

    this.updateBody(this.left, leftInput, dt);
    this.updateBody(this.right, rightInput, dt);
    this.updateBall(dt);
    this.updatePowerUp(dt);
    const moved = Math.hypot(this.ball.x - prevX, this.ball.y - prevY);
    if (moved > 58) {
      const k = 58 / moved;
      this.ball.x = prevX + (this.ball.x - prevX) * k;
      this.ball.y = prevY + (this.ball.y - prevY) * k;
    }
    this.stats.maxBallStep = Math.max(this.stats.maxBallStep, Math.hypot(this.ball.x - prevX, this.ball.y - prevY));
  }

  aiInput(side: "left" | "right", dt: number): InputState {
    const body = side === "left" ? this.left : this.right;
    const stateKey = side === "left" ? "left" : "right";
    const nextKey = side === "left" ? "leftNext" : "rightNext";
    this.ai[nextKey] -= dt;
    if (this.ai[nextKey] > 0) return this.ai[stateKey];
    const baseTier = AI_TIER[this.opponent];
    const tier = this.mode === "ai" ? (side === "left" ? Math.max(1, baseTier - 1) : Math.min(4, baseTier + 2)) : side === "right" ? baseTier : 3;
    const reaction = Math.max(0.08, [0.24, 0.18, 0.125, 0.085][tier - 1] + this.rand() * 0.035);
    this.ai[nextKey] = reaction;
    const attack = side === "left" ? 1 : -1;
    const ownGoal = side === "left" ? GOAL_LINE_L : GOAL_LINE_R;
    const ballOnOwnHalf = this.mode === "ai" ? (side === "left" ? this.ball.x < WORLD_W * 0.57 : this.ball.x > WORLD_W * 0.43) : side === "left" ? this.ball.x < WORLD_W * 0.48 : this.ball.x > WORLD_W * 0.52;
    const defensiveSpot = ownGoal + attack * (190 + tier * 18);
    const chaseSpot = this.ball.x - attack * (this.ball.y < 430 ? 24 : 80);
    let wanted = ballOnOwnHalf ? defensiveSpot : chaseSpot;
    if (this.powerUp && tier >= 3 && Math.abs(this.powerUp.x - body.x) < 430) wanted = this.powerUp.x;
    const input = blankInput();
    if (wanted < body.x - 16) input.left = true;
    if (wanted > body.x + 16) input.right = true;
    const head = headCenter(body);
    const fallingIntoHead = this.ball.vy > 30 && Math.abs(this.ball.x - head.x) < 145 && this.ball.y < head.y + 30 && this.ball.y > CROSSBAR_Y - 20;
    if ((fallingIntoHead || (this.ball.y < body.y - 120 && Math.abs(this.ball.x - body.x) < 165)) && body.onGround) input.jump = true;
    const soonX = this.ball.x + this.ball.vx * reaction;
    const contactZone = Math.abs(soonX - (body.x + body.facing * 76)) < 75 && Math.abs(this.ball.y - (body.y - 70)) < 115;
    const counterChance = tier >= 3 && this.ball.poweredBy !== null && this.ball.poweredBy !== side && this.rand() < (tier === 4 ? 0.72 : 0.42);
    input.kick = (this.mode === "ai" ? contactZone && this.rand() < 0.68 : contactZone) || counterChance;
    const outOfPosition = side === "right" ? this.left.x > 430 || this.left.y < GROUND_Y - 70 : this.right.x < 1170 || this.right.y < GROUND_Y - 70;
    input.power = body.powerBanked && tier >= 3 && outOfPosition && Math.abs(this.ball.x - body.x) < 210;
    this.ai[stateKey] = input;
    return input;
  }

  private updateBody(b: Body, input: InputState, dt: number): void {
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const frozen = b.freezeT > 0;
    const maxSpeed = (325 + b.stats.speed * 185) * (b.speedBoostT > 0 ? 1.34 : 1);
    b.facing = b.side === "left" ? 1 : -1;
    if (!frozen) {
      if (dir !== 0) b.vx += dir * 2050 * dt;
      else b.vx *= Math.pow(0.0009, dt);
      b.vx = clamp(b.vx, -maxSpeed, maxSpeed);
      if (input.jump && b.onGround) {
        b.vy = -(780 + b.stats.jump * 320);
        b.onGround = false;
      }
      if (input.kick && b.kickT <= 0 && b.kickCooldown <= 0) {
        b.kickT = 0.24;
        b.kickCooldown = this.mode === "ai" ? 1.05 : 0.88;
        b.kickHit = false;
        this.stats.kickSwings += 1;
        this.events.push({ type: "kick", by: b.side });
      }
      if (input.power && b.powerBanked && b.powerArmedT <= 0) {
        b.powerBanked = false;
        b.power = 0;
        b.powerArmedT = 2.5;
        this.pop("POWER SHOT!", b.x, b.y - 225, b.side === "left" ? "#ffd64a" : "#ff6b35");
        this.events.push({ type: "power", by: b.side, kind: b.side === "left" ? "leopard" : POWER_ARCHETYPE[this.opponent] });
      }
    } else {
      b.vx *= Math.pow(0.05, dt);
    }
    b.vy += 1780 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.x = clamp(b.x, GOAL_LINE_L - 50, GOAL_LINE_R + 50);
    if (b.y >= GROUND_Y) {
      b.y = GROUND_Y;
      b.vy = 0;
      b.onGround = true;
    }
    b.kickT = Math.max(0, b.kickT - dt);
    b.kickCooldown = Math.max(0, b.kickCooldown - dt);
    b.powerArmedT = Math.max(0, b.powerArmedT - dt);
    b.speedBoostT = Math.max(0, b.speedBoostT - dt);
    b.bigHeadT = Math.max(0, b.bigHeadT - dt);
    b.freezeT = Math.max(0, b.freezeT - dt);
    if (!b.powerBanked && b.powerArmedT <= 0) {
      b.power += dt / 35 + (b.side === "right" ? AI_TIER[this.opponent] * 0.0009 : 0);
      if (b.power >= 1) {
        b.power = 1;
        b.powerBanked = true;
      }
    }
    b.anim += dt * (Math.abs(b.vx) > 30 ? 7 : 2.7);
    this.collideBodyBall(b);
    b.mood = b.kickT > 0 ? "kick" : b.headerT > 0 ? "header" : !b.onGround ? "jump" : Math.abs(b.vx) > 45 ? "run" : "idle";
    b.headerT = Math.max(0, b.headerT - dt);
  }

  private updateBall(dt: number): void {
    const ball = this.ball;
    ball.vy += 1030 * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += ball.vx * dt * 0.015;
    ball.powerT = Math.max(0, ball.powerT - dt);
    ball.freezeT = Math.max(0, ball.freezeT - dt);
    ball.tinyT = Math.max(0, ball.tinyT - dt);
    ball.r = ball.tinyT > 0 ? 18 : 28;

    if (ball.powerKind === "lob" && ball.powerT > 0 && ((ball.poweredBy === "left" && ball.x > GOAL_LINE_R - 360) || (ball.poweredBy === "right" && ball.x < GOAL_LINE_L + 360))) {
      ball.vy += 1650 * dt;
    }
    if (ball.y - ball.r < -150) {
      ball.y = -150 + ball.r;
      ball.vy = Math.abs(ball.vy) * 0.74;
    }
    if (ball.y + ball.r > GROUND_Y) {
      ball.y = GROUND_Y - ball.r;
      ball.vy = -Math.abs(ball.vy) * 0.66;
      ball.vx *= Math.pow(0.9, dt * 60);
      if (Math.abs(ball.vy) < 42) ball.vy = 0;
    }
    this.goalFrameCollision();
    if (ball.y - ball.r < CROSSBAR_Y) {
      if (ball.x - ball.r < 0) {
        ball.x = ball.r;
        ball.vx = Math.abs(ball.vx) * 0.84;
      }
      if (ball.x + ball.r > WORLD_W) {
        ball.x = WORLD_W - ball.r;
        ball.vx = -Math.abs(ball.vx) * 0.84;
      }
    }
    ball.vx *= Math.pow(ball.y + ball.r >= GROUND_Y - 1 ? 0.94 : 0.996, dt * 60);
    ball.vy *= Math.pow(0.9985, dt * 60);
    this.stuckDetection(dt);
    if (ball.x + ball.r < GOAL_LINE_L && ball.y + ball.r > CROSSBAR_Y) this.goal("right");
    else if (ball.x - ball.r > GOAL_LINE_R && ball.y + ball.r > CROSSBAR_Y) this.goal("left");
    else if ((ball.x + ball.r < GOAL_LINE_L || ball.x - ball.r > GOAL_LINE_R) && ball.y + ball.r <= CROSSBAR_Y) {
      this.stats.illegalGoalAttempts += 1;
    }
    ball.x = clamp(ball.x, -80, WORLD_W + 80);
    ball.y = clamp(ball.y, -150, WORLD_H);
  }

  private collideBodyBall(b: Body): void {
    const head = headCenter(b);
    const headR = b.headR * (b.bigHeadT > 0 ? 1.3 : 1);
    const beforeVy = this.ball.vy;
    const hitHead = circleHit(this.ball, head.x, head.y, headR, b.vx * 0.26, b.vy * 0.18);
    if (hitHead && b.vy < -90) {
      this.applyContactShot(b, head.x, head.y - headR * 0.35, "header", beforeVy);
      b.headerT = 0.22;
    } else if (hitHead && Math.abs(this.ball.vx) < 65 && Math.abs(this.ball.vy) < 65 && Math.abs(this.ball.x - head.x) < 18) {
      b.headBalanceT += STEP;
      if (b.headBalanceT > 2.5) {
        this.ball.vx += b.side === "left" ? 95 : -95;
        this.ball.vy -= 80;
        b.headBalanceT = 0;
      }
    } else if (!hitHead) {
      b.headBalanceT = 0;
    }
    circleHit(this.ball, b.x, b.y - 54, 43, b.vx * 0.2, b.vy * 0.1);
    if (b.kickT > 0 && !b.kickHit) {
      const p = 1 - b.kickT / 0.24;
      const arc = kickPoint(b, p);
      const d = Math.hypot(this.ball.x - arc.x, this.ball.y - arc.y);
      if (d < this.ball.r + 30) {
        b.kickHit = true;
        this.applyContactShot(b, arc.x, arc.y, "kick", beforeVy);
        this.stats.kickContacts += 1;
      }
    }
    if (this.ball.powerKind === "freeze" && this.ball.poweredBy && this.ball.poweredBy !== b.side && (hitHead || Math.hypot(this.ball.x - b.x, this.ball.y - (b.y - 60)) < this.ball.r + 54)) {
      b.freezeT = Math.max(b.freezeT, 1);
      this.stats.freezes += 1;
      this.pop("FROZEN!", b.x, b.y - 215, "#9ee7ff");
      this.events.push({ type: "freeze", by: this.ball.poweredBy });
      this.ball.powerKind = null;
      this.ball.poweredBy = null;
      this.ball.powerT = 0;
    }
  }

  private applyContactShot(b: Body, cx: number, cy: number, kind: "kick" | "header", prevBallVy: number): void {
    const toward = b.side === "left" ? 1 : -1;
    const poweredIncoming = this.ball.poweredBy && this.ball.poweredBy !== b.side && this.ball.powerT > 0;
    const armed = b.powerArmedT > 0;
    const highContact = clamp((GROUND_Y - cy - 30) / 220, 0, 1);
    const base = kind === "header" ? 390 + b.stats.jump * 210 : 390 + b.stats.shot * 270;
    this.ball.vx = toward * (base + Math.abs(b.vx) * 0.34);
    this.ball.vy = kind === "header" ? -360 - b.stats.jump * 240 : -80 - highContact * 520 + Math.min(120, prevBallVy * 0.08);
    if (armed || poweredIncoming) {
      const counter = !!poweredIncoming;
      const shot = b.side === "left" ? "leopard" : POWER_ARCHETYPE[this.opponent];
      this.ball.poweredBy = b.side;
      this.ball.powerKind = counter ? "fire" : shot;
      this.ball.powerT = 1.35;
      const speed = counter ? 1180 : shot === "leopard" ? 1150 : shot === "fire" ? 1250 : shot === "freeze" ? 960 : 880;
      this.ball.vx = toward * speed;
      this.ball.vy = shot === "lob" && !counter ? -720 : kind === "header" ? -190 : -60;
      b.powerArmedT = 0;
      this.stats.powerShots += 1;
      if (counter) {
        this.stats.counters += 1;
        this.pop("COUNTER!", cx, cy - 80, "#fff2a8");
        this.events.push({ type: "counter", by: b.side });
      }
    } else {
      this.ball.poweredBy = null;
      this.ball.powerKind = null;
      this.ball.powerT = 0;
    }
  }

  private updatePowerUp(dt: number): void {
    if (this.powerUp) {
      this.powerUp.t -= dt;
      for (const b of [this.left, this.right]) {
        if (Math.hypot(b.x - this.powerUp.x, b.y - this.powerUp.y) < 80) {
          const kind = this.powerUp.kind;
          if (kind === "speed") b.speedBoostT = 6;
          if (kind === "bigHead") b.bigHeadT = 6;
          if (kind === "tinyBall") this.ball.tinyT = 6;
          if (kind === "freezePuddle") (b.side === "left" ? this.right : this.left).freezeT = 1.05;
          this.pop(kind === "speed" ? "SPEED!" : kind === "bigHead" ? "BIG HEAD!" : kind === "tinyBall" ? "TINY BALL!" : "FROZEN!", this.powerUp.x, this.powerUp.y - 60, "#ffffff");
          this.events.push({ type: "pickup", by: b.side, kind });
          this.powerUp = null;
          this.nextPowerUp = this.elapsed + 20 + this.rand() * 5;
          return;
        }
      }
      if (this.powerUp && this.powerUp.t <= 0) this.powerUp = null;
    } else if (this.elapsed > this.nextPowerUp) {
      const kinds: PowerUp["kind"][] = ["speed", "bigHead", "tinyBall", "freezePuddle"];
      this.powerUp = { kind: kinds[Math.floor(this.rand() * kinds.length)], x: 675 + this.rand() * 250, y: GROUND_Y - 34, t: 9 };
    }
  }

  private goalFrameCollision(): void {
    const b = this.ball;
    for (const [x, towardField] of [[GOAL_LINE_L, 1], [GOAL_LINE_R, -1]] as const) {
      const dx = b.x - x;
      const dy = b.y - CROSSBAR_Y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < b.r + CROSSBAR_R) {
        const nx = dx / d;
        const ny = dy / d;
        const dot = b.vx * nx + b.vy * ny;
        if (dot < 0) {
          b.x += nx * (b.r + CROSSBAR_R - d + 0.5);
          b.y += ny * (b.r + CROSSBAR_R - d + 0.5);
          b.vx -= (1 + 0.75) * dot * nx;
          b.vy -= (1 + 0.75) * dot * ny;
          b.vx += towardField * 45;
          this.pop("CROSSBAR!", x + towardField * 55, CROSSBAR_Y - 35, "#ffffff");
          this.events.push({ type: "post" });
        }
      }
    }
    const inLeftRoof = b.x > NET_BACK_L && b.x < GOAL_LINE_L;
    const inRightRoof = b.x > GOAL_LINE_R && b.x < NET_BACK_R;
    if ((inLeftRoof || inRightRoof) && Math.abs(b.y - CROSSBAR_Y) < b.r + 6) {
      const side = inLeftRoof ? 1 : -1;
      if (b.y < CROSSBAR_Y) {
        b.y = CROSSBAR_Y - b.r - 7;
        b.vy = -Math.max(240, Math.abs(b.vy) * 0.7);
        b.vx += side * (Math.abs(b.vx) < 80 ? 180 : 60);
      } else {
        b.y = CROSSBAR_Y + b.r + 7;
        b.vy = Math.max(200, Math.abs(b.vy) * 0.65);
      }
      if (Math.hypot(b.vx, b.vy) < 160) {
        b.vx += side * 240;
        b.vy -= 150;
      }
    }
    if (b.x - b.r < NET_BACK_L && b.y + b.r > CROSSBAR_Y) {
      b.x = NET_BACK_L + b.r;
      b.vx = Math.abs(b.vx) * 0.25;
      b.netSide = "left";
    }
    if (b.x + b.r > NET_BACK_R && b.y + b.r > CROSSBAR_Y) {
      b.x = NET_BACK_R - b.r;
      b.vx = -Math.abs(b.vx) * 0.25;
      b.netSide = "right";
    }
  }

  private stuckDetection(dt: number): void {
    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    if (speed < 16 && !(this.ball.y < GROUND_Y - 170 && Math.abs(this.ball.x - this.left.x) < 35)) this.stuckT += dt;
    else this.stuckT = 0;
    if (this.stuckT > 3.6) {
      const toward = this.ball.x < WORLD_W / 2 ? 1 : -1;
      this.ball.vx += toward * 230;
      this.ball.vy -= 340;
      this.stuckT = 0;
    }
  }

  private goal(by: "left" | "right"): void {
    if (this.ball.y + this.ball.r <= CROSSBAR_Y) this.stats.aboveBarGoals += 1;
    this.score[by] += 1;
    this.lastScorer = by;
    this.shakeT = 0.25;
    this.events.push({ type: "goal", by });
    if (this.goldenGoal) {
      this.end();
      return;
    }
    this.phase = "goal";
    this.phaseT = 2.4;
    this.ball.netSide = by === "left" ? "right" : "left";
  }

  private resetKickoff(): void {
    this.left = makePlayerBody(this.player);
    this.right = makeMascotBody(this.opponent);
    this.ball = makeKickoffBall(this.rand);
    this.phase = "ready";
    this.phaseT = 1.0;
    this.events.push({ type: "kickoff" });
  }

  private end(): void {
    this.phase = "ended";
    this.clock = 0;
    this.pop("FULL TIME", WORLD_W / 2, 220, "#ffffff");
    this.events.push({ type: "fulltime" });
    this.events.push({ type: "end" });
  }

  private pop(text: string, x: number, y: number, color: string): void {
    this.popTexts.push({ text, x, y, t: 1.1, color });
  }
}

function makePlayerBody(player: SquadPlayer): Body {
  const stats = playerStats(player);
  return makeBody("left", 330, 1, stats);
}

function makeMascotBody(opponent: OpponentSlug): Body {
  const tier = AI_TIER[opponent];
  const strength = RIVAL_STRENGTH[opponent];
  return makeBody("right", 1270, -1, {
    speed: clamp(0.48 + tier * 0.045 + (strength - 70) / 500, 0.45, 0.72),
    jump: clamp(0.5 + tier * 0.035 + (strength - 70) / 650, 0.45, 0.72),
    shot: clamp(0.5 + tier * 0.04 + (strength - 70) / 450, 0.45, 0.72),
  });
}

function makeBody(side: "left" | "right", x: number, facing: 1 | -1, stats: PlayerStats): Body {
  return {
    side,
    x,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    w: 92,
    h: 232,
    headR: 62 + stats.jump * 10,
    facing,
    onGround: true,
    kickT: 0,
    kickCooldown: 0,
    kickHit: false,
    headerT: 0,
    power: 0.08,
    powerBanked: false,
    powerArmedT: 0,
    speedBoostT: 0,
    bigHeadT: 0,
    freezeT: 0,
    headBalanceT: 0,
    anim: 0,
    mood: "idle",
    stats,
  };
}

function makeKickoffBall(rand: () => number): Ball {
  return { x: WORLD_W / 2, y: 335, vx: (rand() - 0.5) * 90, vy: 0, r: 28, spin: 0, tinyT: 0, poweredBy: null, powerKind: null, powerT: 0, freezeT: 0, netSide: null };
}

export function blankInput(): InputState {
  return { left: false, right: false, jump: false, kick: false, power: false };
}

export function headCenter(b: Body): { x: number; y: number } {
  const r = b.headR * (b.bigHeadT > 0 ? 1.3 : 1);
  return { x: b.x, y: b.y - b.h + r + 4 };
}

export function kickPoint(b: Body, p: number): { x: number; y: number } {
  const dir = b.side === "left" ? 1 : -1;
  const a = -1.1 + p * 2.35;
  return {
    x: b.x + dir * (30 + Math.cos(a) * 68),
    y: b.y - 63 - Math.sin(a) * 76,
  };
}

function circleHit(ball: Ball, x: number, y: number, r: number, addVx: number, addVy: number): boolean {
  const dx = ball.x - x;
  const dy = ball.y - y;
  const dist = Math.hypot(dx, dy) || 1;
  const min = ball.r + r;
  if (dist >= min) return false;
  const nx = dx / dist;
  const ny = dy / dist;
  const push = min - dist;
  ball.x += nx * push;
  ball.y += ny * push;
  const dot = ball.vx * nx + ball.vy * ny;
  if (dot < 260) {
    ball.vx += nx * (260 - dot) + addVx;
    ball.vy += ny * (260 - dot) + addVy;
  }
  return true;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
