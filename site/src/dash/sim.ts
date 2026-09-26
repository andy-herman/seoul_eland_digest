// Dribble Dash simulation: pure game logic with no DOM, so it runs the same in
// the browser and in the headless balance tests. World units are pixels of the
// 900 px wide logical view; heights are measured up from the pitch.

import { OPPONENT_SLUGS, SPRITES, type Hero, type OpponentSlug } from "./data";

export const VIEW_W = 900;
export const PLAYER_X = 170;
export const PX_PER_M = 40;
export const STEP = 1 / 120;

const START_SPEED = 400;
const MAX_SPEED = 880;
const ACCEL = 6;
const GRAVITY = 2800;
const JUMP_VELOCITY = 1000;
const FAST_FALL = 4200;
const SLIDE_MIN = 0.42;
const JUMP_BUFFER = 0.13;
const SPAWN_X = VIEW_W + 40;
const TREAT_SIZE = 34;
export const TREAT_POINTS = 25;
export const LEAP_LOW = 84;
export const LEAP_HIGH = 152;
export const NIGHT_EVERY_M = 700;

export type PlayerPose = "run" | "jump" | "slide" | "fall";
export type ObstacleKind = "tackle" | "leap" | "cone";

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  slug: OpponentSlug | null;
  x: number;
  w: number;
  h: number;
  /** Height of the sprite's bottom edge above the pitch. */
  fly: number;
  /** Extra speed toward the player on top of the scroll speed. */
  vx: number;
  high: boolean;
  passed: boolean;
  age: number;
}

export interface Treat {
  id: number;
  x: number;
  y: number;
  taken: boolean;
  age: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  free: boolean;
}

export interface Player {
  y: number;
  vy: number;
  pose: PlayerPose;
  slideTime: number;
  runPhase: number;
  landTime: number;
  airTime: number;
}

export type SimEvent =
  | { type: "jump" }
  | { type: "land" }
  | { type: "slide" }
  | { type: "pass"; slug: OpponentSlug; obstacle: number }
  | { type: "cone" }
  | { type: "treat"; x: number; y: number }
  | { type: "milestone"; meters: number }
  | { type: "night"; on: boolean }
  | { type: "crash"; obstacle: Obstacle };

export interface SimState {
  hero: Hero;
  time: number;
  dist: number;
  speed: number;
  player: Player;
  ball: Ball;
  obstacles: Obstacle[];
  treats: Treat[];
  passed: number;
  treatsTaken: number;
  over: boolean;
  overTime: number;
  crashedBy: Obstacle | null;
  night: number;
  nightOn: boolean;
  events: SimEvent[];
  nextSpawnAt: number;
  lastArrival: number;
  pending: PendingObstacle;
  pendingTreat: { at: number; high: boolean } | null;
  nextId: number;
  milestone: number;
  bag: OpponentSlug[];
  jumpBuffer: number;
  slideHeld: boolean;
  seed: number;
}

interface PendingObstacle {
  kind: ObstacleKind;
  double: boolean;
  high: boolean;
  cones: number;
}

// Hitboxes per hero and pose: width, height and a forward offset from PLAYER_X.
const HITBOX: Record<Hero, Record<"run" | "jump" | "slide", { w: number; h: number; dx: number }>> = {
  leoul: {
    run: { w: 56, h: 104, dx: 0 },
    jump: { w: 54, h: 96, dx: 0 },
    slide: { w: 100, h: 56, dx: 8 },
  },
  lenyang: {
    run: { w: 96, h: 96, dx: 12 },
    jump: { w: 80, h: 92, dx: 6 },
    slide: { w: 120, h: 56, dx: 16 },
  },
};

/** Where the ball sits ahead of the hero's center while running. */
export const BALL_AHEAD: Record<Hero, number> = { leoul: 64, lenyang: 104 };
export const BALL_R = 15;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DashSim {
  state: SimState;
  private rand: () => number;

  constructor(hero: Hero, seed = Math.floor(Math.random() * 2 ** 31)) {
    this.rand = mulberry32(seed);
    this.state = {
      hero,
      time: 0,
      dist: 0,
      speed: START_SPEED,
      player: { y: 0, vy: 0, pose: "run", slideTime: 0, runPhase: 0, landTime: 1, airTime: 0 },
      ball: { x: PLAYER_X + BALL_AHEAD[hero], y: 0, vx: 0, vy: 0, spin: 0, free: false },
      obstacles: [],
      treats: [],
      passed: 0,
      treatsTaken: 0,
      over: false,
      overTime: 0,
      crashedBy: null,
      night: 0,
      nightOn: false,
      events: [],
      nextSpawnAt: 0,
      lastArrival: 2.6,
      pending: { kind: "tackle", double: false, high: false, cones: 0 },
      pendingTreat: null,
      nextId: 1,
      milestone: 0,
      bag: [],
      jumpBuffer: 0,
      slideHeld: false,
      seed,
    };
    this.planNext(0);
  }

  get meters(): number {
    return Math.floor(this.state.dist / PX_PER_M);
  }

  get score(): number {
    return this.meters + this.state.treatsTaken * TREAT_POINTS;
  }

  /** Jump requests are buffered briefly so a press just before landing still counts. */
  pressJump(): void {
    if (!this.state.over) this.state.jumpBuffer = JUMP_BUFFER;
  }

  /** A tap that turned into a swipe down: drop straight back to the pitch (and slide). */
  cancelFreshJump(): boolean {
    const p = this.state.player;
    if (p.pose === "jump" && p.airTime < 0.22) {
      p.vy = Math.min(p.vy, -900);
      return true;
    }
    return false;
  }

  setSlide(held: boolean): void {
    this.state.slideHeld = held;
  }

  playerBox(): Box {
    const s = this.state;
    const pose = s.player.pose === "fall" ? "run" : s.player.pose;
    const hb = HITBOX[s.hero][pose];
    const cx = PLAYER_X + hb.dx;
    return { x0: cx - hb.w / 2, x1: cx + hb.w / 2, y0: s.player.y, y1: s.player.y + hb.h };
  }

  static obstacleBox(o: Obstacle): Box {
    if (o.kind === "leap") {
      return { x0: o.x + o.w * 0.14, x1: o.x + o.w * 0.86, y0: o.fly + 6, y1: o.fly + o.h * 0.85 };
    }
    if (o.kind === "cone") {
      return { x0: o.x + o.w * 0.18, x1: o.x + o.w * 0.82, y0: 0, y1: o.h * 0.8 };
    }
    return { x0: o.x + o.w * 0.14, x1: o.x + o.w * 0.86, y0: 0, y1: Math.min(o.h * 0.6, 58) };
  }

  /** Advance one fixed step. Events from this step are appended to state.events. */
  update(dt = STEP): void {
    const s = this.state;
    s.time += dt;
    if (s.over) {
      this.updateAfterCrash(dt);
      return;
    }
    s.speed = Math.min(MAX_SPEED, START_SPEED + ACCEL * s.time);
    s.dist += s.speed * dt;
    this.updatePlayer(dt);
    this.updateBall(dt);
    this.spawn();
    this.updateObstacles(dt);
    this.updateTreats(dt);
    this.updateProgress(dt);
  }

  private updatePlayer(dt: number): void {
    const s = this.state;
    const p = s.player;
    s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
    p.landTime += dt;
    const onGround = p.y <= 0 && p.vy <= 0;

    if (s.jumpBuffer > 0 && onGround) {
      s.jumpBuffer = 0;
      p.vy = JUMP_VELOCITY;
      p.pose = "jump";
      p.slideTime = 0;
      p.airTime = 0;
      s.events.push({ type: "jump" });
    }

    if (p.pose === "jump") {
      p.airTime += dt;
      p.vy -= (GRAVITY + (s.slideHeld && p.vy < JUMP_VELOCITY * 0.9 ? FAST_FALL : 0)) * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.landTime = 0;
        p.pose = s.slideHeld ? "slide" : "run";
        p.slideTime = 0;
        s.events.push({ type: "land" });
        if (p.pose === "slide") s.events.push({ type: "slide" });
      }
      return;
    }

    if (p.pose === "run" && s.slideHeld) {
      p.pose = "slide";
      p.slideTime = 0;
      s.events.push({ type: "slide" });
    } else if (p.pose === "slide") {
      p.slideTime += dt;
      if (!s.slideHeld && p.slideTime >= SLIDE_MIN) p.pose = "run";
    }
    if (p.pose === "run") p.runPhase += dt * (6.5 + s.speed / 120);
  }

  private updateBall(dt: number): void {
    const s = this.state;
    const b = s.ball;
    const p = s.player;
    b.spin += ((s.speed + (b.free ? b.vx : 0)) * dt) / BALL_R;
    if (b.free) return;
    const ahead = BALL_AHEAD[s.hero] + (p.pose === "slide" ? 30 : 0);
    const targetX = PLAYER_X + ahead;
    // Dribble touches: a low hop every stride while running; flicked up with the hero in a jump.
    const hop = p.pose === "run" ? Math.abs(Math.sin(p.runPhase * Math.PI * 0.5)) * 7 : 0;
    const targetY = p.pose === "jump" ? p.y * 0.88 + 10 : hop;
    const follow = 1 - Math.exp(-dt * (p.pose === "jump" ? 22 : 14));
    b.x += (targetX - b.x) * follow;
    b.y += (targetY - b.y) * follow;
  }

  private nextFromBag(): OpponentSlug {
    const s = this.state;
    if (s.bag.length === 0) {
      s.bag = [...OPPONENT_SLUGS];
      for (let i = s.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [s.bag[i], s.bag[j]] = [s.bag[j], s.bag[i]];
      }
    }
    return s.bag.pop() as OpponentSlug;
  }

  private obstacleSpeed(kind: ObstacleKind): number {
    return kind === "leap" ? 120 : kind === "tackle" ? 60 : 0;
  }

  /** Decide what comes next and when to spawn it so it reaches the hero after a fair gap. */
  private planNext(now: number): void {
    const s = this.state;
    const m = s.dist / PX_PER_M;
    const r = this.rand;
    const pLeap = m < 110 ? 0 : Math.min(0.42, 0.2 + m / 3000);
    const pCone = m < 180 ? 0 : 0.12;
    let kind: ObstacleKind = "tackle";
    const roll = r();
    if (roll < pLeap) kind = "leap";
    else if (roll < pLeap + pCone) kind = "cone";
    const pending: PendingObstacle = {
      kind,
      double: kind === "tackle" && m > 550 && s.speed >= 540 && r() < 0.16,
      high: kind === "leap" && m > 900 && r() < 0.25,
      cones: kind === "cone" ? (m > 600 && r() < 0.4 ? 2 : 1) : 0,
    };
    s.pending = pending;

    // Time gap between arrivals at the hero, in seconds. Shrinks slowly with distance.
    let gap = 0.98 + r() * 0.72 - Math.min(0.22, m / 4500);
    gap = Math.max(0.92, gap);
    const prev = s.obstacles[s.obstacles.length - 1];
    if (prev && prev.kind === "leap") gap += 0.12;
    if (pending.double) gap += 0.25;
    const arrival = Math.max(now + 1.2, s.lastArrival + gap);
    const travel = (SPAWN_X - PLAYER_X) / (s.speed + this.obstacleSpeed(kind));
    s.nextSpawnAt = Math.max(now, arrival - travel);
    s.lastArrival = arrival;

    // Now and then, a treat between this obstacle and the one before it.
    if (!s.pendingTreat && m > 25 && r() < 0.38) {
      const between = arrival - gap / 2;
      const high = gap >= 1.32 && r() < 0.6;
      const treatTravel = (SPAWN_X - PLAYER_X) / s.speed;
      s.pendingTreat = { at: Math.max(now, between - treatTravel), high };
    }
  }

  private makeOpponent(kind: "tackle" | "leap", x: number, high: boolean): Obstacle {
    const s = this.state;
    const slug = this.nextFromBag();
    const sprite = SPRITES.opponents[slug][kind];
    return {
      id: s.nextId++,
      kind,
      slug,
      x,
      w: sprite.w,
      h: sprite.h,
      fly: kind === "leap" ? (high ? LEAP_HIGH : LEAP_LOW) : 0,
      vx: this.obstacleSpeed(kind),
      high,
      passed: false,
      age: 0,
    };
  }

  private spawn(): void {
    const s = this.state;
    if (s.pendingTreat && s.time >= s.pendingTreat.at) {
      s.treats.push({ id: s.nextId++, x: SPAWN_X, y: s.pendingTreat.high ? 132 : 16, taken: false, age: 0 });
      s.pendingTreat = null;
    }
    if (s.time < s.nextSpawnAt) return;
    const p = s.pending;
    if (p.kind === "cone") {
      for (let i = 0; i < p.cones; i++) {
        s.obstacles.push({
          id: s.nextId++,
          kind: "cone",
          slug: null,
          x: SPAWN_X + i * (SPRITES.cone.w + 6),
          w: SPRITES.cone.w,
          h: SPRITES.cone.h,
          fly: 0,
          vx: 0,
          high: false,
          passed: false,
          age: 0,
        });
      }
    } else if (p.kind === "leap") {
      s.obstacles.push(this.makeOpponent("leap", SPAWN_X, p.high));
    } else {
      const first = this.makeOpponent("tackle", SPAWN_X, false);
      s.obstacles.push(first);
      if (p.double) s.obstacles.push(this.makeOpponent("tackle", SPAWN_X + first.w * 0.78, false));
    }
    this.planNext(s.time);
  }

  private updateObstacles(dt: number): void {
    const s = this.state;
    const box = this.playerBox();
    for (const o of s.obstacles) {
      o.x -= (s.speed + o.vx) * dt;
      o.age += dt;
      const ob = DashSim.obstacleBox(o);
      if (ob.x0 < box.x1 && ob.x1 > box.x0 && ob.y0 < box.y1 && ob.y1 > box.y0) {
        this.crash(o);
        return;
      }
      if (!o.passed && ob.x1 < box.x0) {
        o.passed = true;
        if (o.slug) {
          s.passed += 1;
          s.events.push({ type: "pass", slug: o.slug, obstacle: o.id });
        } else {
          s.events.push({ type: "cone" });
        }
      }
    }
    s.obstacles = s.obstacles.filter((o) => o.x + o.w > -80);
  }

  private updateTreats(dt: number): void {
    const s = this.state;
    const box = this.playerBox();
    for (const t of s.treats) {
      t.x -= s.speed * dt;
      t.age += dt;
      if (t.taken) continue;
      const half = TREAT_SIZE / 2;
      if (t.x - half < box.x1 + 10 && t.x + half > box.x0 && t.y < box.y1 && t.y + TREAT_SIZE > box.y0) {
        t.taken = true;
        s.treatsTaken += 1;
        s.events.push({ type: "treat", x: t.x, y: t.y });
      }
    }
    s.treats = s.treats.filter((t) => t.x > -60 && !t.taken);
  }

  private updateProgress(dt: number): void {
    const s = this.state;
    const m = this.meters;
    const milestone = Math.floor(m / 100);
    if (milestone > s.milestone) {
      s.milestone = milestone;
      s.events.push({ type: "milestone", meters: milestone * 100 });
    }
    const nightOn = Math.floor(m / NIGHT_EVERY_M) % 2 === 1;
    if (nightOn !== s.nightOn) {
      s.nightOn = nightOn;
      s.events.push({ type: "night", on: nightOn });
    }
    const target = nightOn ? 1 : 0;
    s.night += Math.sign(target - s.night) * Math.min(Math.abs(target - s.night), dt * 0.6);
  }

  private crash(o: Obstacle): void {
    const s = this.state;
    s.over = true;
    s.overTime = 0;
    s.crashedBy = o;
    s.player.pose = "fall";
    s.player.vy = Math.min(s.player.vy, 0);
    s.ball.free = true;
    s.ball.vx = s.speed * 0.25;
    s.ball.vy = 380;
    s.events.push({ type: "crash", obstacle: o });
  }

  private updateAfterCrash(dt: number): void {
    const s = this.state;
    s.overTime += dt;
    const decay = Math.exp(-dt * 6);
    s.speed *= decay;
    for (const o of s.obstacles) {
      o.vx *= decay;
      o.x -= (s.speed + o.vx) * dt;
      o.age += dt;
    }
    for (const t of s.treats) t.x -= s.speed * dt;
    const p = s.player;
    if (p.y > 0) {
      p.vy -= GRAVITY * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
    }
    const b = s.ball;
    b.vy -= GRAVITY * 0.8 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx *= Math.exp(-dt * 1.4);
    b.spin += (b.vx * dt) / BALL_R;
    if (b.y < 0) {
      b.y = 0;
      b.vy = Math.abs(b.vy) > 120 ? -b.vy * 0.45 : 0;
    }
  }

  drainEvents(): SimEvent[] {
    const events = this.state.events;
    this.state.events = [];
    return events;
  }
}

/**
 * A simple bot that plays well: jumps ground obstacles with the apex centred
 * over them and slides under low leaps. Used for the menu's attract demo and
 * for the headless balance tests.
 */
export function autopilot(sim: DashSim, skill = 1): void {
  const s = sim.state;
  if (s.over) return;
  const box = sim.playerBox();
  const ahead = s.obstacles
    .filter((o) => !o.passed)
    .map((o) => ({ o, b: DashSim.obstacleBox(o) }))
    .filter(({ b }) => b.x1 > box.x0)
    .sort((a, b) => a.b.x0 - b.b.x0);
  let slide = false;
  for (const { o, b } of ahead) {
    const rel = s.speed + o.vx;
    const toContact = (b.x0 - box.x1) / rel;
    if (o.kind === "leap") {
      if (o.high) continue;
      if (toContact < 0.32) slide = true;
      break;
    }
    let x1 = b.x1;
    for (const next of ahead) {
      if (next.o.kind !== "leap" && next.b.x0 < x1 + 30 && next.b.x1 > x1) x1 = next.b.x1;
    }
    const overlap = (x1 - b.x0 + (box.x1 - box.x0)) / rel;
    const lead = 0.064 + Math.max(0, (0.587 - overlap) / 2);
    if (toContact <= lead * skill && s.player.pose !== "jump") sim.pressJump();
    break;
  }
  sim.setSlide(slide);
}
