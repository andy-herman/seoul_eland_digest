import { GOAL_FRAME_OFFSET, LENYANG_UNIT, LEOUL_UNIT, RENDER_SCALE, type ImageKey, type Images } from "./assets";
import type { GameAudio } from "./audio";
import type { Strings } from "./i18n";
import { goalX, goalZ, project, SPOT_Y, VIEW_H, VIEW_W } from "./projection";

export type Mode = "shoot" | "save";
export type DiveZone = "left" | "center" | "right";
export type Outcome = "goal" | "save" | "post" | "bar" | "wide" | "over";
export type Special = "none" | "nap" | "balloon" | "meat" | "power";
export type Phase = "attract" | "intro" | "aimX" | "aimY" | "windup" | "runup" | "flight" | "result" | "over";

export interface ShotReport {
  mode: Mode;
  outcome: Outcome;
  points: number;
  u: number;
  v: number;
  corner: boolean;
  topCorner: boolean;
  diveZone: DiveZone | null;
  special: Special;
  meatHit: boolean;
  healed: boolean;
  leveledUp: boolean;
  score: number;
  lives: number;
  level: number;
  goals: number;
  saves: number;
}

export interface EngineHooks {
  onPhase(phase: Phase, mode: Mode): void;
  onRoundStart(mode: Mode, special: Special): void;
  onKick(mode: Mode): void;
  onShot(report: ShotReport): void;
  onGameOver(mode: Mode, score: number, goals: number, saves: number, level: number): void;
}

type ShooterPose = "wave" | "ready" | "run" | "kick" | "celebrate" | "sad" | "meat";
type KeeperPose = "ready" | "dive" | "jump" | "nap" | "sad" | "starry" | "hug";

interface Round {
  special: Special;
  target: { u: number; v: number };
  flight: number;
  curve: number;
  aimU: number;
  aimV: number;
  aimDir: number;
  lockedU: number;
  keeperDelay: number;
  readProb: number;
  plannedDive: DiveZone | null;
  tellU: number;
  tellV: number;
  tellDuration: number;
  windup: number;
  balloonSide: -1 | 1;
  meatU: number;
  meatV: number;
  meatHit: boolean;
  outcome: Outcome | null;
}

interface Keeper {
  zone: DiveZone | null;
  diveStart: number;
  diveZ: number;
  pose: KeeperPose;
  landedU: number;
  popStart: number;
}

interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  spinRate: number;
  visible: boolean;
  free: boolean;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  life: number;
  size: number;
  fill: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  t: number;
  life: number;
}

interface Bubble {
  text: string;
  who: "leoul" | "lenyang";
  t: number;
  life: number;
}

const BALL_R = 0.22;
const DIVE_TIME = 0.3;
const RUNUP_TIME = 0.45;
const RESULT_TIME = 1.7;
const KEEPER_Y = -0.35;
const ZONE_U: Record<DiveZone, number> = { left: 0.2, center: 0.5, right: 0.8 };
// Solved against the Blender camera: feet at y = 1160 px at the start, and the
// official kicking pose places the ball against Leoul's raised foot.
const SHOOTER_START = { x: -0.56, y: -12.88 };
const SHOOTER_KICK = { x: -0.33, y: -11.1 };
// After the kick Leoul is drawn smaller and steps aside so he never hides the
// bottom of the goal mouth.
const KICK_SCALE = 0.84;
const U_MIN = -0.14;
const U_MAX = 1.14;
const V_MIN = 0.02;
const V_MAX = 1.18;
const FONT = '"Pretendard Variable", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
const CONFETTI = ["#D4A872", "#FFF4DC", "#113EAE", "#56C1E8", "#EB003B", "#FFFFFF"];
const NAVY = "#0B1752";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const zoneOf = (u: number): DiveZone => (u < 0.36 ? "left" : u > 0.64 ? "right" : "center");

function pick<T>(options: [T, number][]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return options[options.length - 1][0];
}

export class PenaltyEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private mode: Mode = "shoot";
  private phase: Phase = "attract";
  private phaseT = 0;
  private clock = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private score = 0;
  private lives = 3;
  private goals = 0;
  private saves = 0;
  private streak = 0;
  private level = 1;
  private roundCount = 0;
  private round: Round;
  private keeper: Keeper = { zone: null, diveStart: -1, diveZ: 0.9, pose: "ready", landedU: 0.5, popStart: -1 };
  private ball: Ball = { x: 0, y: SPOT_Y, z: BALL_R, vx: 0, vy: 0, vz: 0, spin: 0, spinRate: 0, visible: true, free: false };
  private shooterPose: ShooterPose = "wave";
  private popups: Popup[] = [];
  private particles: Particle[] = [];
  private bubble: Bubble | null = null;
  private flash = 0;
  private shooterStep = 0;
  /** Backdrop + pitch pre-composited at the canvas's backing size (rebuilt on resize). */
  private background: HTMLCanvasElement | null = null;
  paused = false;
  reducedMotion = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly img: Images,
    private readonly audio: GameAudio,
    private readonly text: Strings,
    private readonly hooks: EngineHooks,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not supported.");
    this.ctx = ctx;
    this.round = this.blankRound();
  }

  get state() {
    return { mode: this.mode, phase: this.phase, score: this.score, lives: this.lives, level: this.level, goals: this.goals, saves: this.saves };
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.setTransform(w / VIEW_W, 0, 0, h / VIEW_H, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    if (!this.background || this.background.width !== w || this.background.height !== h) this.buildBackground(w, h);
  }

  // Two full-screen layers per frame is the biggest cost on phones, so the
  // static ones are drawn once into a canvas that matches the backing store.
  private buildBackground(w: number, h: number): void {
    if (typeof document === "undefined") return;
    const cache = document.createElement("canvas");
    cache.width = w;
    cache.height = h;
    const g = cache.getContext("2d", { alpha: false });
    if (!g) return;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(this.img.backdrop, 0, 0, w, h);
    g.drawImage(this.img.pitch, 0, 0, w, h);
    this.background = cache;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  attract(): void {
    this.phase = "attract";
    this.phaseT = 0;
    this.paused = false;
    this.shooterPose = "wave";
    this.resetKeeper("ready");
    this.resetBall();
    this.popups = [];
    this.bubble = null;
    this.round = this.blankRound();
    this.hooks.onPhase("attract", this.mode);
  }

  newGame(mode: Mode): void {
    this.mode = mode;
    this.score = 0;
    this.lives = 3;
    this.goals = 0;
    this.saves = 0;
    this.streak = 0;
    this.level = 1;
    this.roundCount = 0;
    this.paused = false;
    this.popups = [];
    this.particles = [];
    this.newRound();
  }

  /** Shoot mode: lock the direction, then the height. */
  action(): boolean {
    if (this.paused || this.mode !== "shoot") return false;
    const r = this.round;
    if (this.phase === "aimX") {
      r.lockedU = r.aimU;
      r.aimV = V_MIN;
      r.aimDir = 1;
      this.audio.click();
      this.setPhase("aimY");
      return true;
    }
    if (this.phase === "aimY") {
      r.target = { u: r.lockedU + rand(-0.012, 0.012), v: clamp(r.aimV + rand(-0.015, 0.015), 0, 1.3) };
      this.audio.click();
      this.shooterPose = "run";
      this.setPhase("runup");
      return true;
    }
    return false;
  }

  /** Save mode: the player's dive. */
  dive(zone: DiveZone): boolean {
    if (this.paused || this.mode !== "save" || this.keeper.zone) return false;
    if (this.phase !== "windup" && this.phase !== "runup" && this.phase !== "flight") return false;
    this.startDive(zone);
    return true;
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (!this.paused) this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseT = 0;
    this.hooks.onPhase(phase, this.mode);
  }

  private blankRound(): Round {
    return {
      special: "none",
      target: { u: 0.5, v: 0.3 },
      flight: 0.6,
      curve: 0,
      aimU: U_MIN,
      aimV: V_MIN,
      aimDir: 1,
      lockedU: 0.5,
      keeperDelay: 0.2,
      readProb: 0.15,
      plannedDive: null,
      tellU: 0.5,
      tellV: 0.5,
      tellDuration: 0.5,
      windup: 0.8,
      balloonSide: 1,
      meatU: 0.2,
      meatV: 0.5,
      meatHit: false,
      outcome: null,
    };
  }

  private resetBall(): void {
    this.ball = { x: 0, y: SPOT_Y, z: BALL_R, vx: 0, vy: 0, vz: 0, spin: 0, spinRate: 0, visible: true, free: false };
  }

  private resetKeeper(pose: KeeperPose): void {
    this.keeper = { zone: null, diveStart: -1, diveZ: 0.9, pose, landedU: 0.5, popStart: -1 };
  }

  private newRound(): void {
    const level = this.level;
    const r = this.blankRound();
    this.roundCount += 1;
    if (this.mode === "shoot") {
      r.readProb = Math.min(0.14 + 0.08 * (level - 1), 0.62);
      r.keeperDelay = Math.max(0.2 - 0.02 * (level - 1), 0.1);
      r.flight = Math.max(0.62 - 0.025 * (level - 1), 0.48);
      if (level >= 2) {
        const roll = Math.random();
        if (roll < 0.09) r.special = "nap";
        else if (roll < 0.2) r.special = "balloon";
        else if (roll < 0.33) r.special = "meat";
      }
      const fromLeft = Math.random() < 0.5;
      r.aimU = fromLeft ? U_MIN : U_MAX;
      r.aimDir = fromLeft ? 1 : -1;
      r.balloonSide = Math.random() < 0.5 ? -1 : 1;
      r.meatU = Math.random() < 0.5 ? rand(0.1, 0.28) : rand(0.72, 0.9);
      r.meatV = rand(0.28, 0.82);
    } else {
      r.flight = Math.max(0.95 - 0.07 * (level - 1), 0.5);
      if (level >= 3 && Math.random() < 0.14) {
        r.special = "power";
        r.flight *= 0.82;
      }
      const zone = pick<DiveZone>([["left", 0.4], ["center", 0.2], ["right", 0.4]]);
      let u = zone === "left" ? rand(0.05, 0.3) : zone === "right" ? rand(0.7, 0.95) : rand(0.38, 0.62);
      let v = Math.random() < 0.55 ? rand(0.06, 0.4) : rand(0.52, 0.92);
      if (Math.random() < Math.max(0.1 - 0.012 * (level - 1), 0.04)) {
        if (Math.random() < 0.5) u = zone === "right" ? rand(1.04, 1.12) : rand(-0.12, -0.04);
        else v = rand(1.06, 1.16);
      }
      r.target = { u, v };
      if (r.special === "power") r.curve = (u < 0.5 ? 1 : -1) * 0.3;
      r.tellDuration = Math.max(0.55 - 0.07 * (level - 1), 0.16);
      const fake = level >= 3 && Math.random() < Math.min(0.1 * (level - 2), 0.4);
      const shownU = clamp(u, 0.06, 0.94);
      r.tellU = fake ? 1 - shownU : shownU;
      r.tellV = clamp(v, 0.12, 0.88);
      r.windup = rand(0.45, 1.0);
    }
    this.round = r;
    this.resetBall();
    this.resetKeeper(r.special === "nap" ? "nap" : r.special === "balloon" ? "starry" : "ready");
    this.shooterPose = "ready";
    this.shooterStep = 0;
    this.bubble = null;
    if (r.special === "balloon") this.say("lenyang", this.text.quips.lenyang[1]);
    else if (r.special === "meat") this.say("leoul", this.text.quips.leoul[5]);
    else if (r.special === "power") {
      this.say("leoul", this.text.quips.leoul[2]);
      this.popup(this.text.popups.power, 480, 318, 58, "#FFE38A");
    } else if (r.special === "nap") this.popup(this.text.popups.nap, 480, 318, 44, "#FFF4DC");
    else if (this.roundCount === 1 || Math.random() < 0.3) {
      const who = Math.random() < 0.5 ? "leoul" : "lenyang";
      const lines = this.text.quips[who];
      this.say(who, lines[Math.floor(Math.random() * lines.length)]);
    }
    this.hooks.onRoundStart(this.mode, r.special);
    this.setPhase("intro");
  }

  private sweepSpeed(): number {
    return Math.min(0.82 + 0.11 * (this.level - 1), 1.65);
  }

  private sweep(value: number, dt: number, min: number, max: number, speed: number): number {
    const r = this.round;
    let next = value + r.aimDir * speed * dt;
    if (next > max) {
      next = max - (next - max);
      r.aimDir = -1;
    } else if (next < min) {
      next = min + (min - next);
      r.aimDir = 1;
    }
    return next;
  }

  private update(dt: number): void {
    this.clock += dt;
    this.phaseT += dt;
    const r = this.round;
    switch (this.phase) {
      case "intro":
        if (this.phaseT >= 0.75) {
          this.audio.whistle();
          this.setPhase(this.mode === "shoot" ? "aimX" : "windup");
        }
        break;
      case "aimX":
        r.aimU = this.sweep(r.aimU, dt, U_MIN, U_MAX, this.sweepSpeed());
        break;
      case "aimY":
        r.aimV = this.sweep(r.aimV, dt, V_MIN, V_MAX, this.sweepSpeed() * 1.05);
        break;
      case "windup":
        if (this.phaseT >= r.windup) {
          this.shooterPose = "run";
          this.setPhase("runup");
        }
        break;
      case "runup":
        if (this.phaseT >= RUNUP_TIME) this.kick();
        break;
      case "flight":
        this.updateFlight();
        break;
      case "result":
        this.updateResult(dt);
        if (this.phaseT >= RESULT_TIME) this.afterResult();
        break;
      case "over":
        this.updateFreeBall(dt);
        break;
      default:
        break;
    }
    this.updateEffects(dt);
  }

  private kick(): void {
    const r = this.round;
    this.shooterPose = "kick";
    this.audio.kick();
    this.ball.spinRate = 26;
    if (this.mode === "shoot") {
      const shotZone = zoneOf(r.target.u);
      let zone: DiveZone | null;
      if (r.special === "nap") zone = null;
      else if (r.special === "balloon") zone = r.balloonSide < 0 ? "left" : "right";
      else if (Math.random() < r.readProb) zone = shotZone;
      else zone = pick<DiveZone>([["left", 0.42], ["center", 0.16], ["right", 0.42]]);
      r.plannedDive = zone;
      this.keeper.diveZ = zone === shotZone && zone !== "center" ? clamp(goalZ(r.target.v) * 0.8, 0.8, 1.4) : 0.95;
    } else if (this.keeper.zone && zoneOf(r.target.u) === this.keeper.zone) {
      // Leoul sees an early dive and rolls it the other way.
      if (Math.random() < Math.min(0.55 + 0.08 * (this.level - 1), 0.9)) {
        const dove = this.keeper.zone;
        r.target.u = dove === "left" ? rand(0.7, 0.93) : dove === "right" ? rand(0.07, 0.3) : Math.random() < 0.5 ? rand(0.07, 0.25) : rand(0.75, 0.93);
        r.curve = 0;
      }
    }
    this.hooks.onKick(this.mode);
    this.setPhase("flight");
  }

  private startDive(zone: DiveZone): void {
    if (this.keeper.zone) return;
    this.keeper.zone = zone;
    this.keeper.diveStart = this.clock;
    this.keeper.pose = zone === "center" ? "jump" : "dive";
    if (this.mode === "save") this.keeper.diveZ = 0.95;
  }

  private diveProgress(): number {
    const k = this.keeper;
    return k.diveStart < 0 ? 0 : clamp((this.clock - k.diveStart) / DIVE_TIME, 0, 1);
  }

  private keeperU(): number {
    const k = this.keeper;
    if (!k.zone) return 0.5;
    return 0.5 + (ZONE_U[k.zone] - 0.5) * easeOut(this.diveProgress());
  }

  private keeperCovers(u: number, v: number): boolean {
    const k = this.keeper;
    if (k.pose === "nap") return Math.abs(u - 0.5) < 0.1 && v < 0.25;
    const p = this.diveProgress();
    const zone = k.zone;
    const uk = this.keeperU();
    const bonus = this.mode === "shoot" && this.level >= 4 ? 0.02 : 0;
    if (!zone) return Math.abs(u - 0.5) <= (k.pose === "starry" ? 0.1 : 0.14) && v <= 0.62;
    const w = 0.14 + 0.06 * p + bonus;
    const vmax = zone === "center" ? 0.62 + 0.38 * p : 0.62 + 0.2 * p;
    return Math.abs(u - uk) <= w && v <= vmax;
  }

  private updateFlight(): void {
    const r = this.round;
    if (this.mode === "shoot" && r.plannedDive && !this.keeper.zone && this.phaseT >= r.keeperDelay) this.startDive(r.plannedDive);
    const t = Math.min(this.phaseT / r.flight, 1);
    const tx = goalX(r.target.u);
    const tz = Math.max(goalZ(r.target.v), BALL_R);
    const bend = r.curve * Math.sin(Math.PI * t) * 3.66;
    this.ball.x = tx * t + bend;
    this.ball.y = SPOT_Y * (1 - t);
    this.ball.z = BALL_R + (tz - BALL_R) * t + (0.18 + 0.4 * clamp(r.target.v, 0, 1.2)) * Math.sin(Math.PI * t);
    this.ball.spin += this.ball.spinRate / 60;
    if (t >= 1) this.resolve();
  }

  private resolve(): void {
    const r = this.round;
    const { u, v } = r.target;
    const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
    const onPost = ((u >= -0.03 && u <= 0.005) || (u >= 0.995 && u <= 1.03)) && v <= 1.02;
    const onBar = v >= 0.99 && v <= 1.045 && u > 0 && u < 1;
    let outcome: Outcome;
    if (inside && this.keeperCovers(u, v)) outcome = "save";
    else if (onPost) outcome = "post";
    else if (onBar) outcome = "bar";
    else if (!inside) outcome = v > 1 ? "over" : "wide";
    else outcome = "goal";
    r.outcome = outcome;

    const corner = u < 0.2 || u > 0.8;
    const topCorner = corner && v > 0.7;
    const prevLevel = this.level;
    let points = 0;
    let healed = false;
    let meatHit = false;

    if (this.mode === "shoot") {
      if (outcome === "goal") {
        points = 100 + (corner ? 100 : 0) + (v > 0.7 ? 100 : 0);
        if (r.special === "nap") points *= 2;
        if (r.special === "balloon") points += 100;
        meatHit = r.special === "meat" && Math.abs(u - r.meatU) < 0.1 && Math.abs(v - r.meatV) < 0.14;
        r.meatHit = meatHit;
        if (meatHit) {
          points += 250;
          if (this.lives < 3) {
            this.lives += 1;
            healed = true;
          }
        }
        points = Math.round(points * (1 + 0.25 * Math.min(this.streak, 4)));
        this.streak += 1;
        this.goals += 1;
        this.level = 1 + Math.floor(this.goals / 5);
      } else {
        this.streak = 0;
        this.lives -= 1;
      }
    } else if (outcome === "save") {
      points = 100 + (corner && this.keeper.zone && this.keeper.zone !== "center" ? 100 : 0) + (r.special === "power" ? 200 : 0);
      points = Math.round(points * (1 + 0.25 * Math.min(this.streak, 4)));
      this.streak += 1;
      this.saves += 1;
      if (this.saves % 5 === 0 && this.lives < 3) {
        this.lives += 1;
        healed = true;
      }
      this.level = 1 + Math.floor(this.saves / 5);
    } else if (outcome === "goal") {
      this.streak = 0;
      this.lives -= 1;
    } else {
      points = 25;
    }
    this.score += points;
    const leveledUp = this.level > prevLevel;

    this.stageOutcome(outcome, points, topCorner, meatHit, healed, leveledUp);
    this.hooks.onShot({
      mode: this.mode,
      outcome,
      points,
      u,
      v,
      corner,
      topCorner,
      diveZone: this.keeper.zone,
      special: r.special,
      meatHit,
      healed,
      leveledUp,
      score: this.score,
      lives: this.lives,
      level: this.level,
      goals: this.goals,
      saves: this.saves,
    });
    this.setPhase("result");
  }

  private stageOutcome(outcome: Outcome, points: number, topCorner: boolean, meatHit: boolean, healed: boolean, leveledUp: boolean): void {
    const p = this.text.popups;
    const k = this.keeper;
    const b = this.ball;
    const playerWon = this.mode === "shoot" ? outcome === "goal" : outcome !== "goal";
    k.landedU = this.keeperU();
    b.free = true;
    b.spinRate = 10;

    if (outcome === "goal") {
      b.vx = rand(-0.4, 0.4);
      b.vy = 6.5;
      b.vz = 0.4;
      this.shooterPose = meatHit ? "meat" : "celebrate";
      if (this.mode === "shoot") {
        this.audio.goal();
        this.confetti(480, 520, 90);
        this.flash = 0.35;
      } else {
        this.audio.miss();
      }
      this.popup(p.goal, 480, 318, 108, this.mode === "shoot" ? "#FFE38A" : "#FFB3C1");
      if (topCorner) this.popup(p.topCorner, 480, 196, 50, "#FFF4DC");
    } else if (outcome === "save") {
      b.visible = false;
      b.free = false;
      k.pose = "hug";
      k.popStart = this.clock;
      this.shooterPose = "sad";
      this.audio.save();
      if (this.mode === "save") this.confetti(project(goalX(k.landedU), KEEPER_Y, 1).x, 560, 70);
      this.popup(p.save, 480, 318, 100, this.mode === "save" ? "#FFE38A" : "#DDE7FF");
    } else if (outcome === "post" || outcome === "bar") {
      b.vx = (b.x < 0 ? 1 : -1) * rand(1, 2);
      b.vy = -rand(3.5, 5);
      b.vz = outcome === "bar" ? 1.5 : 2.5;
      this.shooterPose = "sad";
      this.audio.post();
      this.popup(outcome === "post" ? p.post : p.bar, 480, 318, 92, "#FFF4DC");
      if (this.mode === "save") this.popup(p.lucky, 480, 200, 54, "#FFE38A");
    } else {
      b.vx = b.x * 0.25;
      b.vy = 9;
      b.vz = outcome === "over" ? 2.2 : 0.6;
      this.shooterPose = "sad";
      this.audio.miss();
      this.popup(outcome === "over" ? p.over : p.wide, 480, 318, 92, "#FFF4DC");
      if (this.mode === "save") this.popup(p.lucky, 480, 200, 54, "#FFE38A");
    }
    if (outcome !== "save" && k.pose !== "nap") {
      if (outcome === "goal") k.popStart = this.clock + 0.35;
      else if (this.mode === "save" && k.pose === "ready") k.pose = "starry";
    }
    if (points > 0) this.popup(`+${points}`, 480, 432, 56, playerWon ? "#FFFFFF" : "#FFF4DC");
    if (healed) this.popup(this.mode === "save" ? p.fish : p.heal, 480, 500, 46, "#B9F5C6");
    if (leveledUp) {
      this.popup(p.level(this.level), 480, 112, 60, "#FFE38A");
      this.audio.levelUp();
    }
  }

  private updateResult(dt: number): void {
    const k = this.keeper;
    if (this.round.outcome === "goal" && k.pose !== "nap" && k.pose !== "hug" && this.clock >= k.popStart && k.popStart > 0) {
      k.pose = "sad";
      k.popStart = -1;
    }
    this.updateFreeBall(dt);
  }

  private updateFreeBall(dt: number): void {
    const b = this.ball;
    if (!b.free || !b.visible) return;
    b.vz -= 9.8 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.spin += b.spinRate * dt;
    if (b.z < BALL_R) {
      b.z = BALL_R;
      b.vz = Math.abs(b.vz) > 1 ? -b.vz * 0.35 : 0;
      b.vx *= 0.9;
      b.vy *= 0.9;
    }
    if (this.round.outcome === "goal") {
      const netY = 1 + (1 - clamp(b.z / 2.44, 0, 1));
      if (b.y > netY - BALL_R) {
        b.y = netY - BALL_R;
        b.vy = -b.vy * 0.12;
        b.vx *= 0.5;
      }
    } else if (b.y > 5) {
      b.visible = false;
    }
    b.spinRate *= 0.985;
  }

  private afterResult(): void {
    if (this.lives <= 0) {
      this.setPhase("over");
      this.hooks.onGameOver(this.mode, this.score, this.goals, this.saves, this.level);
      return;
    }
    this.newRound();
  }

  private say(who: "leoul" | "lenyang", text: string): void {
    this.bubble = { text, who, t: 0, life: 2.4 };
  }

  private popup(text: string, x: number, y: number, size: number, fill: string): void {
    this.popups.push({ text, x, y, t: 0, life: 1.5, size, fill });
  }

  private confetti(x: number, y: number, count: number): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const speed = rand(380, 900);
      this.particles.push({
        x: x + rand(-120, 120),
        y: y + rand(-30, 30),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: rand(0, Math.PI),
        vr: rand(-9, 9),
        w: rand(10, 18),
        h: rand(6, 11),
        color: CONFETTI[i % CONFETTI.length],
        t: 0,
        life: rand(1.2, 2),
      });
    }
  }

  private updateEffects(dt: number): void {
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < p.life);
    for (const p of this.particles) {
      p.t += dt;
      p.vy += 1500 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.t < p.life && p.y < VIEW_H + 40);
    if (this.bubble) {
      this.bubble.t += dt;
      if (this.bubble.t > this.bubble.life) this.bubble = null;
    }
    this.flash = Math.max(0, this.flash - dt);
    if (this.phase === "result" || this.phase === "over") this.shooterStep = Math.min(1, this.shooterStep + dt / 0.35);
  }

  // Drawing ------------------------------------------------------------------

  private draw(): void {
    const ctx = this.ctx;
    if (this.background) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.background, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(this.img.backdrop, 0, 0, VIEW_W, VIEW_H);
      ctx.drawImage(this.img.pitch, 0, 0, VIEW_W, VIEW_H);
    }
    // The balloon floats in the sky, where the pitch layer is transparent.
    this.drawBalloon();
    const b = this.ball;
    if (b.y > 0.02) this.drawBall();
    this.drawGoalMarkers();
    const f = this.img.goalFrame;
    ctx.drawImage(f, GOAL_FRAME_OFFSET.x, GOAL_FRAME_OFFSET.y, f.naturalWidth / RENDER_SCALE, f.naturalHeight / RENDER_SCALE);
    if (b.y <= 0.02 && b.y > KEEPER_Y) this.drawBall();
    this.drawKeeper();
    if (b.y <= KEEPER_Y) this.drawBall();
    this.drawShooter();
    this.drawAim();
    this.drawParticles();
    this.drawBubble();
    this.drawPopups();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 250, 235, ${this.flash * 0.6})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private drawSprite(key: ImageKey, x: number, y: number, z: number, unit: number, options: { anchorY?: number; flip?: boolean; scale?: number; rotate?: number } = {}): void {
    const ctx = this.ctx;
    const img = this.img[key];
    const p = project(x, y, z);
    const s = unit * p.scale * (options.scale ?? 1);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (options.rotate) ctx.rotate(options.rotate);
    if (options.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h * (options.anchorY ?? 1), w, h);
    ctx.restore();
  }

  private drawShadow(x: number, y: number, radius: number, alpha: number): void {
    const p = project(x, y, 0);
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(22, 52, 24, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius * p.scale, radius * p.scale * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBall(): void {
    const b = this.ball;
    if (!b.visible) return;
    const p = project(b.x, b.y, b.z);
    const r = BALL_R * p.scale;
    this.drawShadow(b.x, b.y, BALL_R * 1.05, 0.26 * clamp(1 - b.z / 3, 0.25, 1));
    const frame = Math.floor(Math.abs(b.spin)) % 16;
    const size = r * 2 * 1.09;
    this.ctx.drawImage(this.img.ball, (frame % 4) * 256, Math.floor(frame / 4) * 256, 256, 256, p.x - size / 2, p.y - size / 2, size, size);
  }

  private drawKeeper(): void {
    const k = this.keeper;
    const bob = this.reducedMotion ? 0 : Math.sin(this.clock * 5) * 0.025;
    const cx = goalX(0.5);
    switch (k.pose) {
      case "ready":
        this.drawShadow(cx, KEEPER_Y, 0.8, 0.22);
        this.drawSprite("lenyangReady", cx, KEEPER_Y, Math.max(0, bob), LENYANG_UNIT);
        break;
      case "starry":
        this.drawShadow(cx, KEEPER_Y, 0.75, 0.22);
        this.drawSprite("lenyangStarry", cx, KEEPER_Y, 0, LENYANG_UNIT);
        break;
      case "nap": {
        this.drawShadow(cx, KEEPER_Y, 0.95, 0.22);
        this.drawSprite("lenyangNap", cx, KEEPER_Y, 0, LENYANG_UNIT);
        this.drawZzz(cx, KEEPER_Y);
        break;
      }
      case "dive": {
        const e = easeOut(this.diveProgress());
        const x = goalX(this.keeperU());
        const z = 0.45 + (k.diveZ - 0.45) * e;
        this.drawShadow(x, KEEPER_Y, 1.1, 0.18);
        const tilt = (k.zone === "left" ? 1 : -1) * 0.12 * e;
        this.drawSprite("lenyangDive", x, KEEPER_Y, z, LENYANG_UNIT, { anchorY: 0.5, flip: k.zone === "left", rotate: tilt });
        break;
      }
      case "jump": {
        const e = easeOut(this.diveProgress());
        this.drawShadow(cx, KEEPER_Y, 0.7, 0.2);
        this.drawSprite("lenyangJump", cx, KEEPER_Y, 0.55 * Math.sin((e * Math.PI) / 2), LENYANG_UNIT);
        break;
      }
      case "hug": {
        const t = k.popStart < 0 ? 1 : clamp((this.clock - k.popStart) / 0.35, 0, 1);
        const pop = this.reducedMotion ? 1 : 1 + Math.sin(t * Math.PI) * 0.12;
        const x = goalX(k.landedU);
        this.drawShadow(x, KEEPER_Y, 0.8, 0.22);
        this.drawSprite("lenyangHug", x, KEEPER_Y, 0, LENYANG_UNIT, { scale: pop });
        break;
      }
      case "sad": {
        const x = goalX(k.landedU);
        this.drawShadow(x, KEEPER_Y, 0.8, 0.22);
        this.drawSprite("lenyangSad", x, KEEPER_Y, 0, LENYANG_UNIT);
        break;
      }
    }
  }

  private drawZzz(x: number, y: number): void {
    const ctx = this.ctx;
    const base = project(x - 0.35, y, 1.7);
    ctx.save();
    ctx.font = `900 40px ${FONT}`;
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    for (let i = 0; i < 3; i++) {
      const t = (this.clock * 0.6 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(t * Math.PI);
      const px = base.x + i * 22 + Math.sin(t * 6) * 6;
      const py = base.y - t * 80 - i * 12;
      ctx.lineWidth = 8;
      ctx.strokeStyle = NAVY;
      ctx.strokeText("z", px, py);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("z", px, py);
    }
    ctx.restore();
  }

  private drawShooter(): void {
    const pose = this.shooterPose;
    const bob = this.reducedMotion ? 0 : Math.abs(Math.sin(this.clock * 4)) * 0.03;
    if (pose === "wave" || pose === "ready") {
      this.drawShadow(SHOOTER_START.x, SHOOTER_START.y, 0.42, 0.24);
      this.drawSprite(pose === "wave" ? "leoulWave" : "leoulReady", SHOOTER_START.x, SHOOTER_START.y, bob, LEOUL_UNIT);
      return;
    }
    if (pose === "run") {
      const t = this.phase === "runup" ? clamp(this.phaseT / RUNUP_TIME, 0, 1) : 1;
      const x = SHOOTER_START.x + (SHOOTER_KICK.x - SHOOTER_START.x) * t;
      const y = SHOOTER_START.y + (SHOOTER_KICK.y - SHOOTER_START.y) * t;
      const scale = 1 + (KICK_SCALE - 1) * t;
      const hop = this.reducedMotion ? 0 : Math.abs(Math.sin(t * Math.PI * 3)) * 0.07;
      this.drawShadow(x, y, 0.42 * scale, 0.24);
      this.drawSprite("leoulRun", x, y, hop, LEOUL_UNIT, { scale });
      return;
    }
    const key: ImageKey = pose === "kick" ? "leoulKick" : pose === "celebrate" ? "leoulCelebrate" : pose === "meat" ? "leoulMeat" : "leoulSad";
    const step = easeOut(this.shooterStep);
    const x = SHOOTER_KICK.x - 0.55 * step;
    const y = SHOOTER_KICK.y - 0.2 * step;
    const hop = pose === "celebrate" && !this.reducedMotion ? Math.abs(Math.sin(this.phaseT * 9)) * 0.07 : 0;
    this.drawShadow(x, y, 0.42 * KICK_SCALE, 0.24);
    this.drawSprite(key, x, y, hop, LEOUL_UNIT, { scale: KICK_SCALE });
  }

  private drawGoalMarkers(): void {
    const r = this.round;
    const ctx = this.ctx;
    if (this.mode === "shoot" && r.special === "meat" && this.phase !== "attract" && this.phase !== "over" && !r.meatHit) {
      const p = project(goalX(r.meatU), 0, goalZ(r.meatV));
      const bob = this.reducedMotion ? 0 : Math.sin(this.clock * 4) * 6;
      const glow = ctx.createRadialGradient(p.x, p.y + bob, 4, p.x, p.y + bob, 58);
      glow.addColorStop(0, "rgba(255, 227, 138, 0.75)");
      glow.addColorStop(1, "rgba(255, 227, 138, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 58, 0, Math.PI * 2);
      ctx.fill();
      const img = this.img.iconMeat;
      ctx.drawImage(img, p.x - 34, p.y + bob - 36, 68, 72);
    }
    if (this.mode === "save" && (this.phase === "windup" || this.phase === "runup")) {
      const untilKick = this.phase === "windup" ? r.windup - this.phaseT + RUNUP_TIME : RUNUP_TIME - this.phaseT;
      if (untilKick <= r.tellDuration) {
        const p = project(goalX(r.tellU), 0, goalZ(r.tellV));
        const pulse = 0.6 + 0.4 * Math.sin(this.clock * 18);
        const glow = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, 96);
        glow.addColorStop(0, `rgba(255, 227, 138, ${0.95 * pulse})`);
        glow.addColorStop(0.55, `rgba(255, 227, 138, ${0.45 * pulse})`);
        glow.addColorStop(1, "rgba(255, 227, 138, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 96, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.75 + 0.25 * pulse;
        ctx.drawImage(this.img.iconPaw, p.x - 37, p.y - 36, 74, 71);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawBalloon(): void {
    const r = this.round;
    if (this.mode !== "shoot" || r.special !== "balloon" || this.phase === "attract") return;
    const drift = this.reducedMotion ? 0 : Math.sin(this.clock * 1.3) * 18;
    const x = (r.balloonSide < 0 ? 175 : 785) + drift;
    const y = 250 + (this.reducedMotion ? 0 : Math.sin(this.clock * 1.9) * 12);
    const img = this.img.iconBalloon;
    this.ctx.drawImage(img, x - 45, y - 70, 90, 141);
  }

  private drawAim(): void {
    if (this.mode !== "shoot" || (this.phase !== "aimX" && this.phase !== "aimY")) return;
    const r = this.round;
    const ctx = this.ctx;
    const u = this.phase === "aimX" ? r.aimU : r.lockedU;
    const v = this.phase === "aimX" ? 0.5 : r.aimV;
    const bottom = project(goalX(u), 0, 0);
    const top = project(goalX(u), 0, goalZ(1.12));
    ctx.save();
    ctx.lineCap = "round";
    ctx.setLineDash(this.phase === "aimX" ? [18, 12] : []);
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(top.x, top.y);
    ctx.lineWidth = 11;
    ctx.strokeStyle = "rgba(11, 23, 82, 0.6)";
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#FFE38A";
    ctx.stroke();
    ctx.setLineDash([]);
    const p = project(goalX(u), 0, goalZ(v));
    const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.clock * 10) * 0.08;
    const radius = 38 * pulse;
    ctx.fillStyle = "rgba(255, 227, 138, 0.28)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = NAVY;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#FFE38A";
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(p.x - radius - 12, p.y);
    ctx.lineTo(p.x - radius + 10, p.y);
    ctx.moveTo(p.x + radius - 10, p.y);
    ctx.lineTo(p.x + radius + 12, p.y);
    ctx.moveTo(p.x, p.y - radius - 12);
    ctx.lineTo(p.x, p.y - radius + 10);
    ctx.moveTo(p.x, p.y + radius - 10);
    ctx.lineTo(p.x, p.y + radius + 12);
    ctx.stroke();
    ctx.restore();
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }

  private drawPopups(): void {
    const ctx = this.ctx;
    for (const p of this.popups) {
      const intro = clamp(p.t / 0.18, 0, 1);
      const scale = this.reducedMotion ? 1 : 0.6 + 0.4 * easeOut(intro) + (intro < 1 ? 0.12 * Math.sin(intro * Math.PI) : 0);
      const alpha = clamp((p.life - p.t) / 0.35, 0, 1);
      const rise = this.reducedMotion ? 0 : p.t * 26;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y - rise);
      ctx.scale(scale, scale);
      ctx.font = `900 ${p.size}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = p.size * 0.2;
      ctx.strokeStyle = NAVY;
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.fill;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  private drawBubble(): void {
    const bubble = this.bubble;
    if (!bubble) return;
    const ctx = this.ctx;
    const alpha = clamp(Math.min(bubble.t / 0.2, (bubble.life - bubble.t) / 0.3), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `800 36px ${FONT}`;
    const maxWidth = 470;
    const words = bubble.text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 48;
    const height = lines.length * 44 + 28;
    const anchor = bubble.who === "leoul" ? { x: 300, y: 690 } : { x: 530, y: 455 };
    const x = clamp(anchor.x - width / 2, 16, VIEW_W - width - 16);
    const y = anchor.y - height - 26;
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 5;
    this.roundedRect(x, y, width, height, 24);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(anchor.x - 16, y + height - 2);
    ctx.lineTo(anchor.x - 4, y + height + 24);
    ctx.lineTo(anchor.x + 14, y + height - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(anchor.x - 13, y + height - 6, 24, 6);
    ctx.fillStyle = "#15182A";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((l, i) => ctx.fillText(l, x + width / 2, y + 36 + i * 44));
    ctx.restore();
  }

  /** CanvasRenderingContext2D.roundRect is missing before Safari 16, so draw it by hand there. */
  private roundedRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
