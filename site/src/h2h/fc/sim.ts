// FC-style arcade five-a-side match engine: DOM-free, deterministic (seeded), 60 steps per second.
// Every outcome is physical: goals only when the ball crosses the line inside the mouth, passes are
// won or lost by who reaches the ball first, keepers dive to where the ball will cross their plane.
import { AI_TIER, rng, type SquadPlayer } from "../data";
import { attrsFor, cardFor, rivalAttrs, roleOf } from "../ratings";
import { FC_AI, attackGoalX, clamp, dist, formationSpot, gauss, isInBox, len, nearestDistance, noise, opposite, ownGoalX, sideDir, unit, type FcAiConfig, type FcRatings } from "./ai";
import {
  BALL_R,
  FC_STEP,
  GOAL_H,
  GOAL_W,
  GOLDEN_GOAL_SECONDS,
  MATCH_SECONDS,
  PEN_SPOT,
  PITCH_L,
  PITCH_W,
  PLAYER_R,
  type FcEventType,
  type FcInput,
  type FcMatchOptions,
  type FcPhase,
  type FcPlayer,
  type FcSideStats,
  type FcState,
  type RestartType,
  type Role,
  type Side,
} from "./types";

const G = 9.81;
const ROLL_DECEL = 3.6;
const AIR_DRAG = 0.08;
const RESTITUTION = 0.46;
const JOG = 4.7;
const SPRINT = 7.0;
const ACCEL = 17;
const POST_Z = [PITCH_W / 2 - GOAL_W / 2, PITCH_W / 2 + GOAL_W / 2];
const POST_R = 0.06;
const OPP_REACH = 0.8;
const ZERO: FcInput = Object.freeze({ mx: 0, mz: 0, sprint: false, pass: false, shoot: false, lob: false, through: false });
const HUMAN_SUPPORT: FcAiConfig = { ...FC_AI[3], gkReaction: FC_AI[4].gkReaction, gkDive: FC_AI[4].gkDive };
const HEADLINE: readonly FcEventType[] = ["goal", "corner", "freekick", "penalty", "throwin", "goalkick", "save", "catch", "post", "halftime", "fulltime", "kickoff"];

type IntentKind = "pass" | "through" | "lob" | "cross" | "shot" | "clear" | "throw" | "loose";

interface Intent {
  kind: IntentKind;
  side: Side;
  by: number; // global player index of the kicker
  target: number | null; // global index of the intended receiver
  tx: number;
  tz: number;
  age: number;
  shot: boolean;
  headed: Set<number>;
}

interface Ext {
  dvx: number; // desired velocity
  dvz: number;
  tackle: "stand" | "slide" | null;
  tackleT: number;
  tackleDone: boolean;
  mistimed: boolean;
  thinkT: number; // seconds to the next on-ball decision
  dribX: number; // current dribble target
  dribZ: number;
  holdT: number; // keeper holding time
}

interface Keeper {
  shotId: number;
  reactT: number;
  diving: boolean;
  diveT: number;
  guess: -1 | 0 | 1; // penalty guess
  readErr: number; // how far the keeper misreads the shot, metres
  startZ: number;
}

interface PassPlan {
  target: number; // global index
  tx: number;
  tz: number;
  v0: number;
  safety: number;
  d: number;
  through: boolean;
}

export class FcMatch {
  readonly opts: FcMatchOptions;
  state: FcState;
  private readonly rand: () => number;
  private readonly awayTier: 1 | 2 | 3 | 4;
  private readonly homeTier: 1 | 2 | 3 | 4;
  private readonly ratings: FcRatings[] = [];
  private readonly ext: Ext[] = [];
  private prevInput: FcInput = { ...ZERO };
  private intent: Intent | null = null;
  private ignore = { index: -1, until: 0 };
  private keepers: Record<Side, Keeper> = { home: { shotId: -1, reactT: 0, diving: false, diveT: 0, guess: 0, readErr: 0, startZ: 20 }, away: { shotId: -1, reactT: 0, diving: false, diveT: 0, guess: 0, readErr: 0, startZ: 20 } };
  private shotSeq = 0;
  private forceGoalSide: Side | null = null;
  private halfDone = false;
  private restartCounts: Record<RestartType, number> = { kickoff: 0, throwin: 0, corner: 0, goalkick: 0, freekick: 0, penalty: 0 };
  private headerCount = 0;
  private quietT = 0;
  private maxStuckT = 0;
  private restartWait = 0;
  private maxRestartWait = 0;
  private pressHeld = false;
  private penaltyShot = false;
  private time = 0;
  private restartDelay = 1;

  constructor(opts: FcMatchOptions) {
    this.opts = opts;
    this.rand = rng(opts.seed || 1);
    this.awayTier = opts.tier ?? AI_TIER[opts.opponent];
    this.homeTier = opts.homeAiTier ?? 2;
    const home = opts.mirror ? rivalRatings(this.homeTier) : homeRatings(opts.home, opts.captain);
    this.ratings.push(...home, ...rivalRatings(this.awayTier));
    const players = [...makeHome(opts.home), ...makeAway()];
    for (let i = 0; i < 10; i++) this.ext.push({ dvx: 0, dvz: 0, tackle: null, tackleT: 0, tackleDone: false, mistimed: false, thinkT: 0.3, dribX: 0, dribZ: 0, holdT: 0 });
    this.state = {
      phase: "restart",
      phaseT: 0,
      elapsed: 0,
      minute: 0,
      half: 1,
      goldenGoal: false,
      score: { home: 0, away: 0 },
      players,
      ball: { x: PITCH_L / 2, z: PITCH_W / 2, h: 0, vx: 0, vz: 0, vh: 0, spin: 0, owner: null, lastTouch: null },
      controlled: 3,
      passTarget: 4,
      charge: 0,
      chargeKind: null,
      setPiece: null,
      lastScorer: null,
      stats: { home: blankStats(), away: blankStats() },
      events: [],
      banner: null,
    };
    this.setupRestart("kickoff", "home", PITCH_L / 2, PITCH_W / 2);
  }

  // ---------------------------------------------------------------- public API

  step(input: FcInput = ZERO): void {
    const s = this.state;
    s.events = [];
    if (s.phase === "ended") return;
    this.time += FC_STEP;
    if (s.banner) s.banner.t = Math.max(0, s.banner.t - FC_STEP);
    if (this.forceGoalSide) {
      const side = this.forceGoalSide;
      this.forceGoalSide = null;
      this.scoreGoal(side);
      return;
    }
    s.phaseT += FC_STEP;
    const human = this.opts.homeAiTier ? ZERO : input;
    if (s.phase === "goal") {
      if (s.phaseT >= 2.5) this.setupRestart("kickoff", opposite(s.lastScorer ?? "home"), PITCH_L / 2, PITCH_W / 2);
      this.prevInput = { ...human };
      return;
    }
    if (s.phase === "halftime") {
      if (s.phaseT >= 2) this.setupRestart("kickoff", "away", PITCH_L / 2, PITCH_W / 2);
      this.prevInput = { ...human };
      return;
    }
    if (s.phase === "restart") {
      this.restartWait += FC_STEP;
      this.maxRestartWait = Math.max(this.maxRestartWait, this.restartWait);
      this.updateRestart(human);
      this.prevInput = { ...human };
      return;
    }
    this.restartWait = 0;
    s.elapsed += FC_STEP;
    this.updateMinute();
    if (!this.halfDone && s.elapsed >= this.seconds / 2) {
      this.halfDone = true;
      s.half = 2;
      this.stopBall();
      this.setPhase("halftime");
      this.event("halftime");
      this.prevInput = { ...human };
      return;
    }
    if (s.elapsed >= this.seconds + (s.goldenGoal ? GOLDEN_GOAL_SECONDS : 0)) {
      if (this.opts.mode === "quick" && !s.goldenGoal && s.score.home === s.score.away) s.goldenGoal = true;
      else {
        this.endNow();
        return;
      }
    }
    if (this.intent) this.intent.age += FC_STEP;
    this.updateCharge(human);
    this.humanStep(human);
    this.aiStep();
    this.keeperStep();
    this.movePlayers();
    this.ballStep();
    if (s.phase === "play") {
      this.tackleStep();
      this.touchStep();
      this.boundsStep();
      this.controlStep();
    }
    s.passTarget = this.opts.homeAiTier ? null : this.humanPassTarget(human, false);
    const o = s.ball.owner;
    if (o) s.stats[o.side].possession += FC_STEP;
    if (!o && len(s.ball.vx, s.ball.vz) < 0.1 && s.ball.h < 0.05) this.quietT += FC_STEP;
    else this.quietT = 0;
    this.maxStuckT = Math.max(this.maxStuckT, this.quietT);
    this.prevInput = { ...human };
  }

  endNow(): void {
    const s = this.state;
    if (this.opts.mode === "quick" && !s.goldenGoal && s.score.home === s.score.away) {
      s.goldenGoal = true;
      s.elapsed = this.seconds;
      return;
    }
    this.setPhase("ended");
    s.elapsed = Math.min(s.elapsed, this.seconds + (s.goldenGoal ? GOLDEN_GOAL_SECONDS : 0));
    this.updateMinute();
    this.event("fulltime");
  }

  forceGoal(side: Side): void {
    this.forceGoalSide = side;
  }

  debugRestart(type: RestartType, side: Side): void {
    const dir = sideDir(side);
    const x = type === "corner" ? attackGoalX(side) : type === "goalkick" ? ownGoalX(side) + dir * 5 : type === "penalty" ? attackGoalX(side) - dir * PEN_SPOT : type === "freekick" ? attackGoalX(side) - dir * 20 : type === "throwin" ? PITCH_L / 2 + dir * 10 : PITCH_L / 2;
    const z = type === "corner" ? (this.rand() < 0.5 ? 0 : PITCH_W) : type === "throwin" ? 0 : type === "freekick" ? PITCH_W / 2 - 6 : PITCH_W / 2;
    this.setupRestart(type, side, x, z);
  }

  get debug(): { restartCounts: Record<RestartType, number>; headers: number; maxStuckT: number; maxRestartWait: number } {
    return { restartCounts: { ...this.restartCounts }, headers: this.headerCount, maxStuckT: this.maxStuckT, maxRestartWait: this.maxRestartWait };
  }

  // ---------------------------------------------------------------- basics

  private get seconds(): number {
    return this.opts.seconds ?? MATCH_SECONDS;
  }

  // With a real user, the user's AI teammates play like a tier 3 side and the keeper like tier 4,
  // so one person's decisions matter most. Headless runs use homeAiTier for the whole home side.
  private cfg(side: Side): FcAiConfig {
    if (side === "home" && !this.opts.homeAiTier) return HUMAN_SUPPORT;
    return FC_AI[side === "home" ? this.homeTier : this.awayTier];
  }

  private gi(side: Side, index: number): number {
    return (side === "home" ? 0 : 5) + index;
  }

  private team(side: Side): FcPlayer[] {
    return side === "home" ? this.state.players.slice(0, 5) : this.state.players.slice(5, 10);
  }

  private human(side: Side, index: number): boolean {
    return side === "home" && !this.opts.homeAiTier && index === this.state.controlled;
  }

  private setPhase(phase: FcPhase): void {
    this.state.phase = phase;
    this.state.phaseT = 0;
  }

  private event(type: FcEventType, side?: Side, index?: number, x = this.state.ball.x, z = this.state.ball.z): void {
    if (type === "header") this.headerCount++;
    this.state.events.push({ type, side, index, x, z });
    if (HEADLINE.includes(type)) this.state.banner = { key: type, t: 1.2 };
  }

  private updateMinute(): void {
    this.state.minute = Math.min(120, Math.floor((this.state.elapsed / this.seconds) * 90));
  }

  private stopBall(): void {
    const b = this.state.ball;
    b.vx = 0;
    b.vz = 0;
    b.vh = 0;
    b.owner = null;
    this.intent = null;
  }

  // ---------------------------------------------------------------- restarts

  private setupRestart(type: RestartType, side: Side, x: number, z: number): void {
    const s = this.state;
    const dir = sideDir(side);
    const goalX = attackGoalX(side);
    const spotX = type === "kickoff" ? PITCH_L / 2 : type === "goalkick" ? ownGoalX(side) + dir * 5 : clamp(x, 0, PITCH_L);
    const spotZ = type === "kickoff" ? PITCH_W / 2 : type === "goalkick" ? PITCH_W / 2 + (z < PITCH_W / 2 ? -5 : 5) : clamp(z, 0, PITCH_W);
    const mates = this.team(side).filter((p) => p.index > 0);
    const nearest = mates.slice().sort((a, b) => dist(a, { x: spotX, z: spotZ }) - dist(b, { x: spotX, z: spotZ }))[0];
    let taker = 3;
    if (type === "goalkick") taker = 0;
    else if (type === "penalty") taker = mates.slice().sort((a, b) => this.ratings[this.gi(side, b.index)].shooting - this.ratings[this.gi(side, a.index)].shooting)[0].index;
    else if (type === "throwin" || type === "freekick") taker = nearest.index;
    else if (type === "corner") taker = nearest.index === 4 ? 3 : nearest.index;
    let aimX = clamp(spotX + dir * 14, 1, PITCH_L - 1);
    let aimZ = spotZ;
    if (type === "kickoff") {
      aimX = spotX - dir * 7;
      aimZ = PITCH_W / 2 + 6;
    } else if (type === "throwin") {
      aimX = clamp(spotX + dir * 6, 1, PITCH_L - 1);
      aimZ = spotZ < PITCH_W / 2 ? 7 : PITCH_W - 7;
    } else if (type === "corner") {
      aimX = goalX - dir * 7;
      aimZ = PITCH_W / 2;
    } else if (type === "goalkick") {
      aimX = spotX + dir * 16;
      aimZ = spotZ < PITCH_W / 2 ? 9 : PITCH_W - 9;
    } else if (type === "penalty") {
      aimX = goalX;
      aimZ = PITCH_W / 2 + 1.8;
    }
    const direct = type === "penalty" || (type === "freekick" && Math.abs(goalX - spotX) < 26 && Math.abs(spotZ - PITCH_W / 2) < 14);
    if (type === "freekick" && direct) {
      aimX = goalX;
      aimZ = PITCH_W / 2 + (spotZ < PITCH_W / 2 ? 1.8 : -1.8);
    }
    s.setPiece = { type, side, taker, spotX, spotZ, aimX, aimZ, direct, waitT: 0 };
    const b = s.ball;
    b.x = spotX;
    b.z = spotZ;
    b.h = 0;
    b.owner = null;
    b.lastTouch = side;
    this.stopBall();
    s.charge = 0;
    s.chargeKind = null;
    this.restartCounts[type]++;
    if (type === "corner") s.stats[side].corners++;
    this.setPhase("restart");
    this.event(type, side, taker, spotX, spotZ);
    this.placeForRestart();
    this.restartDelay = 0.7 + this.rand() * 0.7;
    this.penaltyShot = false;
  }

  private placeForRestart(): void {
    const s = this.state;
    const sp = s.setPiece!;
    const dir = sideDir(sp.side);
    const goalX = attackGoalX(sp.side);
    for (const p of s.players) {
      const e = this.ext[this.gi(p.side, p.index)];
      const attacking = p.side === sp.side;
      let spot = formationSpot(p.side, p.index, sp.spotX, sp.spotZ, attacking && sp.type !== "kickoff");
      if (sp.type === "kickoff") {
        const own = formationSpot(p.side, p.index, PITCH_L / 2, PITCH_W / 2, false);
        spot = { x: p.side === "home" ? Math.min(own.x, PITCH_L / 2 - 1) : Math.max(own.x, PITCH_L / 2 + 1), z: own.z };
        if (attacking && p.index === 4) spot = { x: PITCH_L / 2 + sideDir(p.side) * 0.2, z: PITCH_W / 2 + 3.5 };
      } else if (sp.type === "corner") {
        if (attacking && p.index !== sp.taker && p.index > 0) {
          const slots = [{ x: 7.5, z: -3 }, { x: 9.5, z: 3 }, { x: 14, z: 0 }, { x: 18, z: -6 }];
          const k = [4, 3, 2, 1].filter((i) => i !== sp.taker).indexOf(p.index);
          const slot = slots[Math.max(0, k)];
          spot = { x: goalX - dir * slot.x, z: PITCH_W / 2 + slot.z };
        } else if (!attacking && p.index > 0) {
          const slots = [{ x: 5, z: -2.5 }, { x: 5.5, z: 2.5 }, { x: 11, z: 0 }, { x: 16, z: 5 }];
          const slot = slots[p.index - 1];
          spot = { x: goalX - dir * slot.x, z: PITCH_W / 2 + slot.z };
        }
      } else if (sp.type === "penalty" && p.index > 0 && !(attacking && p.index === sp.taker)) {
        spot = { x: goalX - dir * (13.5 + (p.index % 2) * 2), z: PITCH_W / 2 + (p.index - 2.5) * 3.2 };
      } else if (sp.type === "freekick" && !attacking && p.index > 0 && Math.abs(ownGoalX(p.side) - sp.spotX) < 32) {
        // a two-man wall 6 m from the ball on the line to goal, others goal side
        const toGoal = unit(ownGoalX(p.side) - sp.spotX, PITCH_W / 2 - sp.spotZ);
        if (p.index <= 2) spot = { x: sp.spotX + toGoal.x * 6 + (p.index === 1 ? -toGoal.z : toGoal.z) * 0.45, z: sp.spotZ + toGoal.z * 6 + (p.index === 1 ? toGoal.x : -toGoal.x) * 0.45 };
      }
      if (attacking && p.index === sp.taker) {
        spot = sp.type === "throwin" ? { x: sp.spotX, z: sp.spotZ < PITCH_W / 2 ? -0.35 : PITCH_W + 0.35 } : { x: sp.spotX - dir * (sp.type === "penalty" ? 1.4 : 0.6), z: sp.spotZ };
        if (sp.type === "goalkick") spot = { x: sp.spotX - dir * 0.6, z: sp.spotZ };
      } else if (p.index === 0 && sp.type !== "goalkick") {
        spot = { x: ownGoalX(p.side) + sideDir(p.side) * (sp.type === "penalty" && !attacking ? 0.2 : 1.4), z: PITCH_W / 2 };
      }
      // nobody but the taker inside 4 m of the ball
      if (!(attacking && p.index === sp.taker) && sp.type !== "kickoff") {
        const away = unit(spot.x - sp.spotX, spot.z - sp.spotZ);
        if (away.d < 4) {
          spot = { x: sp.spotX + (away.d > 0.01 ? away.x : -dir) * 4, z: sp.spotZ + (away.d > 0.01 ? away.z : 0) * 4 };
        }
      }
      p.x = clamp(spot.x + (p.index === sp.taker && attacking ? 0 : noise(this.rand, 0.5)), -1, PITCH_L + 1);
      p.z = clamp(spot.z + (p.index === sp.taker && attacking ? 0 : noise(this.rand, 0.5)), -1, PITCH_W + 1);
      p.vx = 0;
      p.vz = 0;
      p.h = 0;
      const look = unit(sp.spotX - p.x, sp.spotZ - p.z);
      p.fx = attacking && p.index === sp.taker ? (sp.type === "throwin" ? 0 : dir) : look.x;
      p.fz = attacking && p.index === sp.taker ? (sp.type === "throwin" ? (sp.spotZ < PITCH_W / 2 ? 1 : -1) : 0) : look.z;
      p.stunT = 0;
      p.anim = attacking && p.index === sp.taker && sp.type === "throwin" ? "throw" : "idle";
      p.animT = 0;
      p.diveDir = 0;
      e.dvx = 0;
      e.dvz = 0;
      e.tackle = null;
      e.holdT = 0;
    }
    if (sp.side === "home" && sp.taker > 0 && !this.opts.homeAiTier) this.state.controlled = sp.taker;
  }

  private updateRestart(input: FcInput): void {
    const s = this.state;
    const sp = s.setPiece;
    if (!sp) return;
    sp.waitT += FC_STEP;
    const human = sp.side === "home" && !this.opts.homeAiTier;
    if (human) {
      const m = len(input.mx, input.mz);
      if (m > 0.12) {
        if (sp.type === "penalty" || (sp.type === "freekick" && sp.direct)) {
          sp.aimZ = clamp(sp.aimZ + input.mz * 0.09, POST_Z[0] + 0.25, POST_Z[1] - 0.25);
        } else {
          sp.aimX = clamp(sp.aimX + input.mx * 0.32, 0.5, PITCH_L - 0.5);
          sp.aimZ = clamp(sp.aimZ + input.mz * 0.32, 0.5, PITCH_W - 0.5);
        }
      }
      this.updateCharge(input);
      const pressPass = input.pass && !this.prevInput.pass;
      const releaseLob = !input.lob && this.prevInput.lob;
      const releaseShoot = !input.shoot && this.prevInput.shoot;
      if (pressPass && sp.type !== "penalty") return this.takeRestart("pass");
      if (releaseLob && sp.type !== "penalty") return this.takeRestart("lob");
      if (releaseShoot && sp.direct) return this.takeRestart("shoot");
      if (sp.waitT < 5) return;
    } else if (sp.waitT < this.restartDelay) return;
    // AI (or the 5 s auto-play for the user)
    const dir = sideDir(sp.side);
    if (sp.type === "penalty") {
      sp.aimZ = PITCH_W / 2 + (this.rand() < 0.5 ? -1 : 1) * (1.6 + this.rand() * 1.1);
      s.charge = 0.55 + this.rand() * 0.3;
      return this.takeRestart("shoot");
    }
    if (sp.type === "freekick" && sp.direct && Math.abs(attackGoalX(sp.side) - sp.spotX) < 23 && this.rand() < 0.55) {
      const gk = this.state.players[this.gi(opposite(sp.side), 0)];
      sp.aimZ = gk.z < PITCH_W / 2 ? POST_Z[1] - 0.55 : POST_Z[0] + 0.55;
      s.charge = 0.6 + this.rand() * 0.25;
      return this.takeRestart("shoot");
    }
    if (sp.type === "corner") {
      sp.aimX = attackGoalX(sp.side) - dir * (6 + this.rand() * 4);
      sp.aimZ = PITCH_W / 2 + noise(this.rand, 5);
      s.charge = 0.5 + this.rand() * 0.3;
      return this.takeRestart("lob");
    }
    const taker = this.gi(sp.side, sp.taker);
    const plan = this.bestPass(taker, sp.type === "throwin" ? 18 : 34, false);
    if (plan && (plan.safety > 0.55 || sp.type === "kickoff" || sp.type === "throwin")) {
      sp.aimX = plan.tx;
      sp.aimZ = plan.tz;
      return this.takeRestart("pass");
    }
    const fwd = this.state.players[this.gi(sp.side, 4)];
    sp.aimX = clamp(fwd.x + dir * 3, 2, PITCH_L - 2);
    sp.aimZ = clamp(fwd.z, 3, PITCH_W - 3);
    s.charge = 0.55;
    this.takeRestart("lob");
  }

  private takeRestart(kind: "pass" | "lob" | "shoot"): void {
    const s = this.state;
    const sp = s.setPiece;
    if (!sp) return;
    s.setPiece = null;
    this.setPhase("play");
    const taker = this.gi(sp.side, sp.taker);
    const p = s.players[taker];
    const b = s.ball;
    b.x = sp.spotX;
    b.z = sp.spotZ;
    b.h = sp.type === "throwin" ? 2.0 : 0;
    b.owner = null;
    const charge = s.charge;
    if (sp.type === "throwin") {
      p.anim = "throw";
      p.animT = 0;
      const target = this.mateNearest(taker, sp.aimX, sp.aimZ);
      this.throwBall(taker, target, sp.aimX, sp.aimZ, kind === "lob" ? 0.8 : 0.35);
    } else if (kind === "shoot") {
      this.penaltyShot = sp.type === "penalty";
      if (this.penaltyShot) {
        const keeper = this.keepers[opposite(sp.side)];
        const right = sp.aimZ > PITCH_W / 2;
        const t = this.cfg(opposite(sp.side));
        keeper.guess = this.rand() < 0.3 + (0.2 - t.gkReaction) * 0.8 ? (right ? 1 : -1) : this.rand() < 0.5 ? (right ? -1 : 1) : 0;
      }
      this.kickShot(taker, Math.max(0.45, charge || 0.7), sp.aimZ, 0.35 + (charge > 0.6 ? 0.9 : 0.4) + this.rand() * 0.5);
    } else if (kind === "lob") {
      const target = this.mateNearest(taker, sp.aimX, sp.aimZ);
      this.kickLob(taker, target, sp.aimX, sp.aimZ, charge || 0.5, sp.type === "corner" ? "cross" : "lob");
    } else {
      const target = this.mateNearest(taker, sp.aimX, sp.aimZ);
      const plan = this.planPass(taker, target, false, 40);
      if (plan) this.kickPass(taker, plan);
      else this.kickLob(taker, target, sp.aimX, sp.aimZ, 0.4, "lob");
    }
    s.charge = 0;
    s.chargeKind = null;
  }

  private mateNearest(from: number, x: number, z: number): number {
    const side = this.state.players[from].side;
    let best = -1;
    let bd = Infinity;
    for (const p of this.team(side)) {
      const g = this.gi(side, p.index);
      if (g === from || p.index === 0) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }

  private scoreGoal(side: Side): void {
    const s = this.state;
    s.score[side]++;
    s.lastScorer = side;
    s.stats[side].goals.push(s.goldenGoal || s.minute >= 90 ? "90+'" : `${Math.max(1, s.minute)}'`);
    const b = s.ball;
    b.owner = null;
    b.vx *= 0.15;
    b.vz *= 0.15;
    b.vh = 0;
    this.intent = null;
    for (const p of s.players) {
      p.anim = p.side === side ? "celebrate" : "sad";
      p.animT = 0;
      p.h = 0;
      p.vx = 0;
      p.vz = 0;
    }
    this.event("goal", side);
    if (s.goldenGoal) this.endNow();
    else this.setPhase("goal");
  }

  // ---------------------------------------------------------------- kicking

  private pressure(from: number, radius = 1.8): boolean {
    const p = this.state.players[from];
    return this.team(opposite(p.side)).some((o) => o.index > 0 && dist(o, p) < radius);
  }

  private ballTime(v0: number, s: number): number {
    const disc = v0 * v0 - 2 * ROLL_DECEL * s;
    if (disc <= 0) return 99;
    return (v0 - Math.sqrt(disc)) / ROLL_DECEL;
  }

  // Seconds of margin the passing side keeps over the quickest opponent along the ball's path
  // (negative: an opponent gets there first). Used by the AI and by the human pass assist.
  private laneMargin(side: Side, bx: number, bz: number, tx: number, tz: number, v0: number, receiver: number): number {
    const d = Math.hypot(tx - bx, tz - bz);
    const r = this.state.players[receiver];
    const tEnd = this.ballTime(v0, d);
    const tRecv = Math.max(0, dist(r, { x: tx, z: tz }) - 0.6) / 6.6;
    let margin = 9;
    for (const o of this.team(opposite(side))) {
      const keeperSlow = o.index === 0 ? 0.25 : 0;
      for (let k = 1; k <= 8; k++) {
        const f = k / 8;
        const px = bx + (tx - bx) * f;
        const pz = bz + (tz - bz) * f;
        if (o.index === 0 && !isInBox(px, pz, o.side)) continue;
        const tb = k === 8 ? Math.max(tEnd, tRecv) : this.ballTime(v0, d * f);
        const to = Math.max(0, Math.hypot(o.x - px, o.z - pz) - OPP_REACH) / 6.4 + 0.16 + keeperSlow;
        margin = Math.min(margin, to - tb);
      }
    }
    return margin;
  }

  private planPass(from: number, target: number, through: boolean, maxD = 36): PassPlan | null {
    if (target < 0 || target === from) return null;
    const s = this.state;
    const p = s.players[from];
    const r = s.players[target];
    const side = p.side;
    const dir = sideDir(side);
    const bx = s.ball.owner ? p.x + p.fx * 0.55 : s.ball.x;
    const bz = s.ball.owner ? p.z + p.fz * 0.55 : s.ball.z;
    let tx = r.x + r.vx * 0.35;
    let tz = r.z + r.vz * 0.35;
    if (through) {
      tx += dir * (4.5 + this.ratings[from].passing * 3.5);
      tz += clamp(r.vz * 0.4, -2.5, 2.5);
    }
    tx = clamp(tx, 1.2, PITCH_L - 1.2);
    tz = clamp(tz, 1.2, PITCH_W - 1.2);
    const d = Math.hypot(tx - bx, tz - bz);
    if (d < 2.5 || d > maxD) return null;
    const vEnd = through ? 4.6 : 5.2;
    const v0 = Math.min(26, Math.sqrt(vEnd * vEnd + 2 * ROLL_DECEL * d));
    const margin = this.laneMargin(side, bx, bz, tx, tz, v0, target);
    return { target, tx, tz, v0, safety: clamp(0.5 + margin * 1.4, 0, 1), d, through };
  }

  // Best pass for the carrier: safety first, then progress toward goal and the receiver's chance.
  private bestPass(from: number, maxD = 36, allowThrough = true): (PassPlan & { score: number }) | null {
    const p = this.state.players[from];
    const side = p.side;
    const dir = sideDir(side);
    const cfg = this.cfg(side);
    let best: (PassPlan & { score: number }) | null = null;
    for (const m of this.team(side)) {
      const g = this.gi(side, m.index);
      if (g === from) continue;
      if (m.index === 0 && !this.pressure(from, 1.4)) continue;
      for (const through of allowThrough && m.index > 0 ? [false, true] : [false]) {
        const plan = this.planPass(from, g, through, maxD);
        if (!plan) continue;
        if (through) {
          const toGoal = Math.abs(attackGoalX(side) - plan.tx);
          const lastDef = this.team(opposite(side)).filter((o) => o.index > 0).reduce((mx, o) => Math.max(mx, (o.x - PITCH_L / 2) * dir), -99);
          if (toGoal > 30 || (plan.tx - PITCH_L / 2) * dir < lastDef - 1) continue;
        }
        const progress = (plan.tx - p.x) * dir;
        const space = Math.min(6, nearestDistance({ x: plan.tx, z: plan.tz }, this.team(opposite(side)), false));
        const chance = this.xg(plan.tx, plan.tz, side);
        const score = plan.safety * 1.1 + clamp(progress, -12, 20) * 0.03 + space * 0.035 + chance * 1.4 - plan.d * 0.004 + (through ? -0.05 : 0) + noise(this.rand, cfg.noise * 0.25);
        if (!best || score > best.score) best = { ...plan, score };
      }
    }
    return best;
  }

  private release(from: number, fromSpot: boolean): void {
    const s = this.state;
    const p = s.players[from];
    const b = s.ball;
    if (!fromSpot && b.owner) {
      b.x = clamp(p.x + p.fx * 0.55, -1, PITCH_L + 1);
      b.z = clamp(p.z + p.fz * 0.55, -1, PITCH_W + 1);
    }
    b.owner = null;
    b.lastTouch = p.side;
    this.ignore = { index: from, until: this.time + 0.32 };
    this.ext[from].tackle = null;
    if (p.anim !== "throw") {
      p.anim = "kick";
      p.animT = 0;
    }
  }

  private setIntent(kind: IntentKind, from: number, target: number | null, tx: number, tz: number, shot = false): void {
    this.intent = { kind, side: this.state.players[from].side, by: from, target, tx, tz, age: 0, shot, headed: new Set() };
  }

  private kickPass(from: number, plan: PassPlan): void {
    const s = this.state;
    const p = s.players[from];
    const r = this.ratings[from];
    const human = this.human(p.side, p.index);
    const b = s.ball;
    this.release(from, !(b.owner && b.owner.side === p.side && b.owner.index === p.index));
    const base = human ? 0.042 : this.cfg(p.side).passError;
    const err = base * (1.35 - r.passing) * (this.pressure(from) ? 1.45 : 1) * (plan.through ? 1.2 : 1);
    const a = Math.atan2(plan.tz - b.z, plan.tx - b.x) + gauss(this.rand, err);
    const v = plan.v0 * (1 + gauss(this.rand, 0.035));
    b.vx = Math.cos(a) * v;
    b.vz = Math.sin(a) * v;
    b.vh = 0;
    b.h = 0;
    this.setIntent(plan.through ? "through" : "pass", from, plan.target, plan.tx, plan.tz);
    s.stats[p.side].passes++;
    this.event(plan.through ? "through" : "pass", p.side, p.index);
    this.event("kick", p.side, p.index);
    if (p.side === "home" && !this.opts.homeAiTier && plan.target >= 0 && plan.target < 5 && plan.target > 0) s.controlled = plan.target;
  }

  private kickLob(from: number, target: number, tx: number, tz: number, charge: number, kind: "lob" | "cross" | "clear"): void {
    const s = this.state;
    const p = s.players[from];
    const r = this.ratings[from];
    const b = s.ball;
    const human = this.human(p.side, p.index);
    this.release(from, !(b.owner && b.owner.side === p.side && b.owner.index === p.index));
    const d0 = Math.max(2, Math.hypot(tx - b.x, tz - b.z));
    const base = human ? 0.05 : this.cfg(p.side).passError * 1.15;
    const sigma = base * (1.35 - r.passing) * d0 * (0.8 + charge * 0.45) * (kind === "clear" ? 1.8 : 1);
    const ax = clamp(tx + gauss(this.rand, sigma), -3, PITCH_L + 3);
    const az = clamp(tz + gauss(this.rand, sigma), -3, PITCH_W + 3);
    const d = Math.hypot(ax - b.x, az - b.z);
    const T = kind === "cross" ? clamp(0.85 + d / 34, 0.9, 1.5) : clamp(0.8 + d / 27 + charge * 0.15, 0.85, 1.85);
    const hv = (d / T) * (1 + AIR_DRAG * T * 0.5);
    const n = unit(ax - b.x, az - b.z);
    b.vx = n.x * hv;
    b.vz = n.z * hv;
    b.vh = (0 - b.h + 0.5 * G * T * T) / T;
    this.setIntent(kind === "clear" ? "clear" : kind, from, target >= 0 ? target : null, ax, az);
    if (target >= 0 && kind !== "clear") s.stats[p.side].passes++;
    this.event("lob", p.side, p.index);
    this.event("kick", p.side, p.index);
    if (p.side === "home" && !this.opts.homeAiTier && target > 0 && target < 5) s.controlled = target;
  }

  private throwBall(from: number, target: number, tx: number, tz: number, power: number): void {
    const s = this.state;
    const p = s.players[from];
    const b = s.ball;
    this.release(from, true);
    b.h = 2.0;
    const aim = target >= 0 ? s.players[target] : { x: tx, z: tz };
    const d = clamp(Math.hypot(aim.x - b.x, aim.z - b.z), 3, 8 + power * 12);
    const n = unit(aim.x - b.x, aim.z - b.z);
    const T = 0.5 + d / 26;
    b.vx = (n.x * d) / T;
    b.vz = (n.z * d) / T;
    b.vh = (0.35 - b.h + 0.5 * G * T * T) / T;
    this.setIntent("throw", from, target >= 0 ? target : null, b.x + n.x * d, b.z + n.z * d);
    this.event("kick", p.side, p.index);
    if (p.side === "home" && !this.opts.homeAiTier && target > 0 && target < 5) s.controlled = target;
  }

  // Shots: aimZ across the goal mouth, aimH above the grass at the goal line.
  private kickShot(from: number, charge: number, aimZ: number, aimH: number, header = false): void {
    const s = this.state;
    const p = s.players[from];
    const r = this.ratings[from];
    const b = s.ball;
    const side = p.side;
    const dir = sideDir(side);
    const human = this.human(side, p.index);
    this.release(from, !(b.owner && b.owner.side === side && b.owner.index === p.index));
    const gx = attackGoalX(side);
    const dGoal = Math.max(1, Math.hypot(gx - b.x, aimZ - b.z));
    const speed = header ? 11 + r.physical * 3.5 : 18 + charge * 9 + r.shooting * 3;
    const facing = clamp((p.fx * (gx - p.x) + p.fz * (PITCH_W / 2 - p.z)) / Math.max(1, Math.hypot(gx - p.x, PITCH_W / 2 - p.z)), -1, 1);
    const base = human ? 0.05 : this.cfg(side).shotError;
    const err = base * (1.38 - r.shooting) * (this.pressure(from, 1.5) ? 1.45 : 1) * (1 + (1 - Math.max(0, facing)) * 0.9) * (header ? 1.5 : 1) * (this.penaltyShot ? 0.55 : 1);
    const over = Math.max(0, charge - 0.86);
    const z = aimZ + gauss(this.rand, err * dGoal);
    const h = clamp(aimH + gauss(this.rand, err * dGoal * 0.55) + over * 3.2 + (header ? -0.2 : 0), 0.05, 6);
    const n = unit(gx + dir * 0.3 - b.x, z - b.z);
    const t = Math.abs(gx - b.x) / Math.max(4, Math.abs(n.x * speed));
    b.vx = n.x * speed;
    b.vz = n.z * speed;
    b.vh = (h - b.h + 0.5 * G * t * t) / Math.max(0.08, t);
    this.shotSeq++;
    this.setIntent("shot", from, null, gx, z, true);
    s.stats[side].shots++;
    if (z > POST_Z[0] + BALL_R && z < POST_Z[1] - BALL_R && h < GOAL_H - BALL_R) s.stats[side].onTarget++;
    this.event(header ? "header" : "shot", side, p.index);
    this.event("kick", side, p.index);
  }

  private shotAim(from: number): { z: number; h: number } {
    const p = this.state.players[from];
    const gk = this.state.players[this.gi(opposite(p.side), 0)];
    const t = p.side === "home" ? this.homeTier : this.awayTier;
    const margin = 0.35 + (4 - t) * 0.12 + this.rand() * 0.4;
    const far = gk.z <= PITCH_W / 2 ? POST_Z[1] - margin : POST_Z[0] + margin;
    const near = gk.z <= PITCH_W / 2 ? POST_Z[0] + margin : POST_Z[1] - margin;
    const z = this.rand() < 0.75 ? far : near;
    const roll = this.rand();
    return { z, h: roll < 0.35 ? 0.3 : roll < 0.75 ? 0.95 : 1.7 };
  }

  // Rough expected goals from a spot: opening angle of the goal, distance, blockers in the way.
  private xg(x: number, z: number, side: Side): number {
    const gx = attackGoalX(side);
    const dx = Math.abs(gx - x);
    if (dx < 0.5) return 0;
    const a0 = Math.atan2(POST_Z[0] - z, dx);
    const a1 = Math.atan2(POST_Z[1] - z, dx);
    const angle = Math.abs(a1 - a0);
    const d = Math.hypot(dx, PITCH_W / 2 - z);
    let blockers = 0;
    for (const o of this.team(opposite(side))) {
      if (o.index === 0) continue;
      const ox = Math.abs(gx - o.x);
      if (ox > dx) continue;
      const lineZ = z + (PITCH_W / 2 - z) * (1 - ox / dx);
      if (Math.abs(o.z - lineZ) < 1.2 + (dx - ox) * 0.04) blockers++;
    }
    return clamp(angle * 0.62 * Math.exp(-Math.max(0, d - 9) / 14) * (1 - blockers * 0.3), 0, 0.7);
  }

  // ---------------------------------------------------------------- the user

  private updateCharge(input: FcInput): void {
    const s = this.state;
    if (input.shoot) {
      if (s.chargeKind !== "shoot") s.charge = 0;
      s.chargeKind = "shoot";
      s.charge = clamp(s.charge + FC_STEP / 0.9, 0, 1);
    } else if (input.lob) {
      if (s.chargeKind !== "lob") s.charge = 0;
      s.chargeKind = "lob";
      s.charge = clamp(s.charge + FC_STEP / 0.9, 0, 1);
    } else if (!this.prevInput.shoot && !this.prevInput.lob) {
      s.charge = 0;
      s.chargeKind = null;
    }
  }

  private speedFor(g: number, sprint: boolean, withBall: boolean): number {
    const p = this.state.players[g];
    const r = this.ratings[g];
    const tier = this.human(p.side, p.index) || (p.side === "home" && !this.opts.homeAiTier) ? 1 : this.cfg(p.side).speed;
    return (sprint ? SPRINT : JOG) * (0.9 + r.pace * 0.2) * tier * (withBall ? 0.9 + r.dribbling * 0.07 : 1);
  }

  private humanStep(input: FcInput): void {
    if (this.opts.homeAiTier) return;
    const s = this.state;
    const g = s.controlled;
    const p = s.players[g];
    const e = this.ext[g];
    const b = s.ball;
    const pressed = (k: "pass" | "shoot" | "lob" | "through") => input[k] && !this.prevInput[k];
    const released = (k: "shoot" | "lob") => !input[k] && this.prevInput[k];
    const own = b.owner?.side === "home" && b.owner.index === g;
    this.pressHeld = input.through && b.owner?.side === "away";
    const m = Math.min(1, len(input.mx, input.mz));
    const sp = this.speedFor(g, input.sprint, own);
    const k = m > 0.01 ? m / len(input.mx, input.mz) : 0;
    e.dvx = input.mx * k * sp;
    e.dvz = input.mz * k * sp;
    if (p.stunT > 0 || e.tackle === "slide") return;
    if (own) {
      if (pressed("pass") || pressed("through")) {
        const through = pressed("through");
        const plan = this.humanPlan(input, through);
        if (plan) this.kickPass(g, plan);
        return;
      }
      if (released("lob")) return this.humanLob(input);
      if (released("shoot")) return this.humanShot(input, false);
    } else if (b.owner?.side === "away") {
      if (pressed("pass")) this.switchControl();
      else if (pressed("shoot")) this.startTackle(g, "stand");
      else if (pressed("lob")) this.startTackle(g, "slide");
    } else if (!b.owner) {
      const d = dist(p, b);
      const ignored = this.ignore.index === g && this.time < this.ignore.until;
      if (d < 1.25 && b.h < 2.4 && !ignored) {
        if (pressed("pass")) {
          const plan = this.humanPlan(input, false);
          if (plan) return this.kickPass(g, plan);
        }
        if (released("shoot") || (pressed("shoot") && b.h > 0.9)) return this.humanShot(input, b.h > 0.9);
        if (released("lob")) return this.humanLob(input);
      } else if (pressed("lob") && d < 3.4 && b.h < 0.6) this.startTackle(g, "slide");
    }
  }

  // Stick-aligned pass target for the user, preferring open lanes (FC-style pass assist).
  private humanPassTarget(input: FcInput, through: boolean): number | null {
    const s = this.state;
    const g = s.controlled;
    const p = s.players[g];
    const stick = len(input.mx, input.mz);
    const dx = stick > 0.2 ? input.mx / stick : p.fx;
    const dz = stick > 0.2 ? input.mz / stick : p.fz;
    let best = -Infinity;
    let pick: number | null = null;
    for (const m of this.team("home")) {
      if (m.index === g || (m.index === 0 && stick < 0.2)) continue;
      const n = unit(m.x - p.x, m.z - p.z);
      const align = n.x * dx + n.z * dz;
      if (stick > 0.2 && align < 0.25) continue;
      const plan = this.planPass(g, m.index, through, 42);
      const score = align * 1.7 + (plan ? plan.safety * 1.5 : -0.4) - n.d * 0.012;
      if (score > best) {
        best = score;
        pick = m.index;
      }
    }
    return pick;
  }

  private humanPlan(input: FcInput, through: boolean): PassPlan | null {
    const s = this.state;
    const g = s.controlled;
    const p = s.players[g];
    const t = this.humanPassTarget(input, through);
    if (t !== null) {
      const plan = this.planPass(g, t, through, 48);
      if (plan) return plan;
      const m = s.players[t];
      const n = unit(m.x - p.x, m.z - p.z);
      return { target: t, tx: p.x + n.x * Math.max(3, n.d + 1), tz: p.z + n.z * Math.max(3, n.d + 1), v0: 9, safety: 0.5, d: Math.max(3, n.d), through };
    }
    const stick = len(input.mx, input.mz);
    const dx = stick > 0.2 ? input.mx / stick : p.fx;
    const dz = stick > 0.2 ? input.mz / stick : p.fz;
    const d = through ? 14 : 10;
    return { target: -1, tx: clamp(p.x + dx * d, 1, PITCH_L - 1), tz: clamp(p.z + dz * d, 1, PITCH_W - 1), v0: Math.sqrt(25 + 2 * ROLL_DECEL * d), safety: 0.5, d, through };
  }

  private humanShot(input: FcInput, header: boolean): void {
    const s = this.state;
    const g = s.controlled;
    const gk = s.players[5];
    const mz = input.mz;
    const aimZ = Math.abs(mz) > 0.25 ? PITCH_W / 2 + Math.sign(mz) * (GOAL_W / 2 - 0.55) * Math.min(1, Math.abs(mz) * 1.3) : gk.z <= PITCH_W / 2 ? POST_Z[1] - 0.6 : POST_Z[0] + 0.6;
    const c = header ? 0.5 : Math.max(0.15, s.charge);
    const aimH = c < 0.45 ? 0.35 : c < 0.78 ? 0.95 : 1.55;
    this.kickShot(g, c, aimZ, aimH, header);
  }

  private humanLob(input: FcInput): void {
    const s = this.state;
    const g = s.controlled;
    const p = s.players[g];
    const c = s.charge;
    const t = this.humanPassTarget(input, false);
    const wide = p.z < 9 || p.z > PITCH_W - 9;
    const final = PITCH_L - p.x < 22;
    if (t !== null) {
      const m = s.players[t];
      this.kickLob(g, t, clamp(m.x + 1.5 + m.vx * 0.5, 1, PITCH_L - 0.5), clamp(m.z + m.vz * 0.5, 1, PITCH_W - 1), c, wide && final ? "cross" : "lob");
      return;
    }
    const stick = len(input.mx, input.mz);
    const dx = stick > 0.2 ? input.mx / stick : p.fx;
    const dz = stick > 0.2 ? input.mz / stick : p.fz;
    const d = 10 + c * 24;
    this.kickLob(g, -1, clamp(p.x + dx * d, 0.5, PITCH_L - 0.5), clamp(p.z + dz * d, 0.5, PITCH_W - 0.5), c, "lob");
  }

  private switchControl(): void {
    const s = this.state;
    const b = s.ball;
    const list = this.team("home").filter((p) => p.index > 0).sort((a, c) => dist(a, b) - dist(c, b));
    const pick = list[0]?.index === s.controlled ? list[1] : list[0];
    if (pick) {
      s.controlled = pick.index;
      this.event("switch", "home", pick.index);
    }
  }

  private controlStep(): void {
    if (this.opts.homeAiTier) return;
    const s = this.state;
    const o = s.ball.owner;
    if (o?.side === "home") {
      if (o.index > 0) s.controlled = o.index;
      return;
    }
    if (!o && this.intent && this.intent.side === "home" && this.intent.target !== null && this.intent.target > 0 && this.intent.target < 5 && this.intent.kind !== "clear") return;
    const cur = s.players[s.controlled];
    if (this.ext[s.controlled].tackle) return;
    const nearest = this.team("home").filter((p) => p.index > 0 && p.stunT <= 0).sort((a, c) => dist(a, s.ball) - dist(c, s.ball))[0];
    if (nearest && nearest.index !== s.controlled && dist(cur, s.ball) > dist(nearest, s.ball) + 5) s.controlled = nearest.index;
  }

  // ---------------------------------------------------------------- tackles and fouls

  private startTackle(g: number, kind: "stand" | "slide"): void {
    const p = this.state.players[g];
    const e = this.ext[g];
    if (e.tackle || p.stunT > 0) return;
    e.tackle = kind;
    e.tackleT = 0;
    e.tackleDone = false;
    p.anim = kind === "stand" ? "tackle" : "slide";
    p.animT = 0;
    if (kind === "slide") {
      p.vx = p.fx * 7.6;
      p.vz = p.fz * 7.6;
    } else {
      p.vx += p.fx * 2.2;
      p.vz += p.fz * 2.2;
    }
    if (!this.human(p.side, p.index)) {
      const box = isInBox(p.x, p.z, p.side);
      e.mistimed = this.rand() < this.cfg(p.side).foul * (box ? 0.2 : 1);
    } else e.mistimed = false;
  }

  private tackleStep(): void {
    const s = this.state;
    const b = s.ball;
    for (let g = 0; g < 10; g++) {
      const e = this.ext[g];
      if (!e.tackle || e.tackleDone) continue;
      const p = s.players[g];
      const o = b.owner;
      if (o && o.side !== p.side) {
        const cg = this.gi(o.side, o.index);
        const c = s.players[cg];
        const ballD = dist(p, b);
        const bodyD = dist(p, c);
        const reach = e.tackle === "stand" ? 1.08 : 0.98;
        const behind = (c.fx * (p.x - c.x) + c.fz * (p.z - c.z)) / Math.max(0.01, bodyD) < -0.35;
        if (!e.mistimed && ballD < reach && ballD <= bodyD + 0.12) {
          e.tackleDone = true;
          const chance = 0.56 + this.ratings[g].defending * 0.34 - this.ratings[cg].dribbling * 0.26 + (e.tackle === "slide" ? 0.12 : 0) - (behind ? 0.25 : 0) + (this.human(p.side, p.index) ? 0.1 : 0);
          if (this.rand() < chance) {
            s.stats[p.side].tackles++;
            this.event("tackle", p.side, p.index);
            c.stunT = Math.max(c.stunT, 0.28);
            if (e.tackle === "stand" && this.rand() < 0.55) this.giveBall(g);
            else this.knock(g, e.tackle === "slide" ? 5.5 + this.rand() * 4 : 3 + this.rand() * 3);
          } else if (e.tackle === "stand") p.stunT = Math.max(p.stunT, 0.35);
        } else if (bodyD < 0.78 && (e.mistimed || behind || (e.tackle === "slide" && ballD > reach))) {
          e.tackleDone = true;
          const human = this.human(p.side, p.index);
          const chance = e.mistimed ? 1 : human ? (e.tackle === "slide" ? 0.5 : behind ? 0.15 : 0.05) : 0.8;
          if (this.rand() < chance) this.foul(g, cg);
        }
      } else if (!o && e.tackle === "slide" && dist(p, b) < 1.0 && b.h < 0.6 && !(this.ignore.index === g && this.time < this.ignore.until)) {
        e.tackleDone = true;
        b.lastTouch = p.side;
        this.knock(g, 6 + this.rand() * 4);
      }
    }
  }

  // Ball knocked loose along the player's facing (tackles, blocks, slides).
  private knock(g: number, speed: number): void {
    const s = this.state;
    const p = s.players[g];
    const b = s.ball;
    b.owner = null;
    b.lastTouch = p.side;
    const a = Math.atan2(p.fz, p.fx) + noise(this.rand, 0.7);
    b.vx = Math.cos(a) * speed;
    b.vz = Math.sin(a) * speed;
    b.vh = 0.4 + this.rand() * 0.8;
    this.ignore = { index: g, until: this.time + 0.2 };
    this.intent = { kind: "loose", side: p.side, by: g, target: null, tx: b.x, tz: b.z, age: 0, shot: false, headed: new Set() };
  }

  private foul(g: number, cg: number): void {
    const s = this.state;
    const p = s.players[g];
    const c = s.players[cg];
    s.stats[p.side].fouls++;
    this.event("foul", p.side, p.index);
    c.anim = "fallen";
    c.animT = 0;
    const box = isInBox(c.x, c.z, p.side);
    this.setupRestart(box ? "penalty" : "freekick", c.side, c.x, c.z);
  }

  private giveBall(g: number): void {
    const s = this.state;
    const p = s.players[g];
    const b = s.ball;
    b.owner = { side: p.side, index: p.index };
    b.lastTouch = p.side;
    b.vx = 0;
    b.vz = 0;
    b.vh = 0;
    b.h = 0;
    this.intent = null;
    this.ext[g].thinkT = Math.min(this.ext[g].thinkT, 0.12 + this.rand() * 0.1);
    this.ext[g].holdT = 0;
    if (p.index === 0) {
      p.anim = "hold";
      p.animT = 0;
    }
    if (p.side === "home" && p.index > 0 && !this.opts.homeAiTier) s.controlled = p.index;
  }

  // ---------------------------------------------------------------- AI

  private path: { x: number; z: number; h: number }[] = [];
  private icept: { t: number; x: number; z: number }[] = Array.from({ length: 10 }, () => ({ t: 99, x: 0, z: 0 }));
  private chaser: Record<Side, number> = { home: -1, away: -1 };
  private presser: Record<Side, number> = { home: -1, away: -1 };
  private cover: Record<Side, number> = { home: -1, away: -1 };

  // Predicted loose-ball positions every 0.05 s for 3 s (same physics as ballStep).
  private predictBall(): void {
    const b = this.state.ball;
    this.path.length = 0;
    let { x, z, h, vx, vz, vh } = b;
    const dt = 0.05;
    for (let i = 0; i < 60; i++) {
      vh -= G * dt;
      vx *= 1 - AIR_DRAG * dt;
      vz *= 1 - AIR_DRAG * dt;
      x += vx * dt;
      z += vz * dt;
      h += vh * dt;
      if (h <= 0) {
        h = 0;
        if (vh < -1.2) {
          vh = -vh * RESTITUTION;
          vx *= 0.86;
          vz *= 0.86;
        } else vh = 0;
      }
      if (h === 0 && vh === 0) {
        const sp = len(vx, vz);
        if (sp > 0) {
          const d = Math.min(sp, ROLL_DECEL * dt);
          vx -= (vx / sp) * d;
          vz -= (vz / sp) * d;
        }
      }
      this.path.push({ x, z, h });
    }
  }

  private interceptFor(g: number): { t: number; x: number; z: number } {
    const p = this.state.players[g];
    const speed = this.speedFor(g, true, false);
    for (let k = 0; k < this.path.length; k++) {
      const q = this.path[k];
      if (q.h > 2.3 || q.x < -1 || q.x > PITCH_L + 1 || q.z < -1 || q.z > PITCH_W + 1) continue;
      const t = (k + 1) * 0.05;
      const need = Math.max(0, Math.hypot(q.x - p.x, q.z - p.z) - 0.55) / speed + 0.12;
      if (need <= t) return { t, x: q.x, z: q.z };
    }
    const last = this.path[this.path.length - 1] ?? this.state.ball;
    return { t: 3 + dist(p, last) / speed, x: last.x, z: last.z };
  }

  private aiStep(): void {
    const s = this.state;
    const b = s.ball;
    const o = b.owner;
    this.chaser = { home: -1, away: -1 };
    if (!o) {
      this.predictBall();
      for (const side of ["home", "away"] as const) {
        let best = -1;
        let bt = Infinity;
        for (const p of this.team(side)) {
          if (p.index === 0) continue;
          const g = this.gi(side, p.index);
          if (p.stunT > 0 || (this.ignore.index === g && this.time < this.ignore.until)) continue;
          this.icept[g] = this.interceptFor(g);
          const bonus = this.intent && this.intent.target === g ? -0.35 : 0;
          if (this.icept[g].t + bonus < bt) {
            bt = this.icept[g].t + bonus;
            best = g;
          }
        }
        this.chaser[side] = best;
      }
    } else {
      const def = opposite(o.side);
      const carrier = s.players[this.gi(o.side, o.index)];
      const order = this.team(def)
        .filter((p) => p.index > 0 && !this.human(p.side, p.index) && p.stunT <= 0)
        .sort((a, c) => dist(a, carrier) - dist(c, carrier));
      const userIsNear = def === "home" && !this.opts.homeAiTier && dist(s.players[s.controlled], carrier) < (order[0] ? dist(order[0], carrier) : 99);
      this.presser[def] = userIsNear && !this.pressHeld ? -1 : order[0] ? this.gi(def, order[0].index) : -1;
      this.cover[def] = order[userIsNear && !this.pressHeld ? 0 : 1] ? this.gi(def, order[userIsNear && !this.pressHeld ? 0 : 1].index) : -1;
    }
    for (let g = 0; g < 10; g++) {
      const p = s.players[g];
      if (p.index === 0 || this.human(p.side, p.index)) continue;
      const e = this.ext[g];
      if (p.stunT > 0 || e.tackle === "slide") {
        e.dvx = 0;
        e.dvz = 0;
        continue;
      }
      const o = s.ball.owner;
      if (o && o.side === p.side && o.index === p.index) this.aiCarrier(g);
      else if (o && o.side === p.side) this.aiSupport(g);
      else if (o && o.index === 0) {
        const spot = formationSpot(p.side, p.index, s.ball.x, s.ball.z, false);
        const away = Math.abs(ownGoalX(o.side) - spot.x) < 17 ? { x: ownGoalX(o.side) + sideDir(o.side) * 17, z: spot.z } : spot;
        this.moveTo(g, away.x, away.z, false);
      } else if (o) this.aiDefend(g);
      else this.aiLoose(g);
    }
  }

  private moveTo(g: number, tx: number, tz: number, sprint: boolean, withBall = false): void {
    const p = this.state.players[g];
    const e = this.ext[g];
    const n = unit(tx - p.x, tz - p.z);
    const max = this.speedFor(g, sprint, withBall);
    const v = Math.min(max, n.d * 3.4);
    e.dvx = n.x * v;
    e.dvz = n.z * v;
  }

  private aiLoose(g: number): void {
    const s = this.state;
    const p = s.players[g];
    const side = p.side;
    if (this.chaser[side] === g) {
      const it = this.icept[g];
      this.moveTo(g, it.x, it.z, true);
      return;
    }
    const b = s.ball;
    const attacking = this.intent ? this.intent.side === side && this.intent.kind !== "shot" : b.lastTouch === side;
    const spot = formationSpot(side, p.index, b.x, b.z, attacking);
    this.moveTo(g, spot.x, spot.z, dist(p, spot) > 7);
  }

  private dribbleChoice(g: number): number {
    const s = this.state;
    const p = s.players[g];
    const e = this.ext[g];
    const side = p.side;
    const opp = this.team(opposite(side));
    const base = Math.atan2(PITCH_W / 2 - p.z, attackGoalX(side) - p.x);
    let best = -Infinity;
    for (const deg of [-80, -50, -25, 0, 25, 50, 80]) {
      const a = base + (deg * Math.PI) / 180;
      const x = clamp(p.x + Math.cos(a) * 5, 2, PITCH_L - 2);
      const z = clamp(p.z + Math.sin(a) * 5, 2, PITCH_W - 2);
      let danger = 0;
      for (const o of opp) danger += Math.max(0, 3.2 - Math.hypot(o.x - x, o.z - z)) * (o.index === 0 ? 0.15 : 0.3);
      const progress = (x - p.x) * sideDir(side);
      const final = Math.abs(attackGoalX(side) - p.x) < 26 ? 0.14 : 0;
      const score = 0.72 + final + progress * 0.06 - danger - Math.abs(deg) * 0.0012 + noise(this.rand, this.cfg(side).noise * 0.2);
      if (score > best) {
        best = score;
        e.dribX = x;
        e.dribZ = z;
      }
    }
    return best;
  }

  private aiCarrier(g: number): void {
    const s = this.state;
    const p = s.players[g];
    const side = p.side;
    const e = this.ext[g];
    const cfg = this.cfg(side);
    const r = this.ratings[g];
    const dir = sideDir(side);
    const opp = this.team(opposite(side));
    e.thinkT -= FC_STEP;
    if (e.thinkT <= 0) {
      e.thinkT = cfg.reaction * (0.75 + this.rand() * 0.5);
      const b = s.ball;
      const press = nearestDistance(p, opp);
      const xg = this.xg(b.x, b.z, side);
      const shoot = xg * 4.6 + r.shooting * 0.25 + cfg.shootBias - (press < 1.1 ? 0.12 : 0) + noise(this.rand, cfg.noise * 0.3);
      const pass = this.bestPass(g, 36, true);
      const passScore = pass ? pass.score : -9;
      let cross = -9;
      let crossTo = -1;
      if ((p.z < 9 || p.z > PITCH_W - 9) && Math.abs(attackGoalX(side) - p.x) < 20) {
        for (const m of this.team(side)) {
          const mg = this.gi(side, m.index);
          if (m.index === 0 || mg === g || !isInBox(m.x, m.z, opposite(side))) continue;
          const val = 0.9 + this.xg(m.x, m.z, side) * 1.3 + Math.min(3, nearestDistance(m, opp)) * 0.05 + noise(this.rand, cfg.noise * 0.3);
          if (val > cross) {
            cross = val;
            crossTo = mg;
          }
        }
      }
      const dribble = this.dribbleChoice(g);
      const passXg = pass ? this.xg(pass.tx, pass.tz, side) * pass.safety : 0;
      const longShot = xg > 0.035 && this.rand() < 0.06 + cfg.shootBias;
      const wantShot = (xg > 0.065 - cfg.shootBias && (xg >= passXg * 0.6 || xg > 0.14) && shoot > 0.3) || longShot;
      const top = wantShot ? shoot + 9 : Math.max(passScore, cross, dribble);
      if (wantShot) {
        const aim = this.shotAim(g);
        this.kickShot(g, 0.5 + this.rand() * 0.4, aim.z, aim.h);
        return;
      }
      if (top === passScore && pass) {
        this.kickPass(g, pass);
        return;
      }
      if (top === cross && crossTo >= 0) {
        const m = s.players[crossTo];
        this.kickLob(g, crossTo, m.x + m.vx * 0.4, m.z + m.vz * 0.4, 0.6, "cross");
        return;
      }
      if (press < 1.3 && Math.abs(p.x - ownGoalX(side)) < 17 && passScore < 0.75) {
        const out = this.rand() < 0.4;
        const tz = p.z < PITCH_W / 2 ? (out ? -4 : 4 + this.rand() * 6) : out ? PITCH_W + 4 : PITCH_W - 4 - this.rand() * 6;
        this.kickLob(g, -1, p.x + dir * (16 + this.rand() * 10), tz, 0.7, "clear");
        return;
      }
    }
    const ahead = opp.some((o) => o.index > 0 && dist(o, p) < 3.5 && (o.x - p.x) * dir > 0);
    this.moveTo(g, e.dribX, e.dribZ, !ahead, true);
  }

  private aiSupport(g: number): void {
    const s = this.state;
    const p = s.players[g];
    const side = p.side;
    const dir = sideDir(side);
    const b = s.ball;
    const carrier = s.players[this.gi(side, b.owner!.index)];
    const opp = this.team(opposite(side));
    let spot = formationSpot(side, p.index, b.x, b.z, true);
    if (p.index === 4) {
      // stay on the shoulder of the last defender, and make a run behind every few seconds
      const lastDef = opp.filter((o) => o.index > 0).reduce((m, o) => (side === "home" ? Math.max(m, o.x) : Math.min(m, o.x)), side === "home" ? 0 : PITCH_L);
      const run = Math.sin(this.time * 0.9 + g) > 0.35;
      const x = run ? lastDef + dir * 3 : lastDef - dir * 0.8;
      spot = { x: clamp(x, 3, PITCH_L - 3), z: spot.z };
    } else if (p.index === 3 && carrier.index !== 3) {
      let best = -Infinity;
      for (const deg of [-110, -60, -30, 30, 60, 110]) {
        const a = Math.atan2(0, dir) + (deg * Math.PI) / 180;
        const x = clamp(carrier.x + Math.cos(a) * 9, 3, PITCH_L - 3);
        const z = clamp(carrier.z + Math.sin(a) * 9, 3, PITCH_W - 3);
        const open = Math.min(4, nearestDistance({ x, z }, opp));
        const score = open * 0.3 + (x - carrier.x) * dir * 0.05 - Math.hypot(x - p.x, z - p.z) * 0.03;
        if (score > best) {
          best = score;
          spot = { x, z };
        }
      }
    }
    this.moveTo(g, spot.x, spot.z, dist(p, spot) > 5);
  }

  private aiDefend(g: number): void {
    const s = this.state;
    const p = s.players[g];
    const side = p.side;
    const e = this.ext[g];
    const cfg = this.cfg(side);
    const b = s.ball;
    const o = b.owner!;
    const c = s.players[this.gi(o.side, o.index)];
    const goal = { x: ownGoalX(side), z: PITCH_W / 2 };
    const toGoal = unit(goal.x - c.x, goal.z - c.z);
    if (g === this.presser[side]) {
      // jockey at the tier's distance, but close down a carrier who stands still
      const speed = len(c.vx, c.vz);
      const press = cfg.press * clamp(speed / 4, 0.22, 1);
      const k = clamp(speed / 3, 0, 1);
      const ax = b.x + (c.x - b.x) * k;
      const az = b.z + (c.z - b.z) * k;
      const from = unit(goal.x - ax, goal.z - az);
      const jx = ax + from.x * press;
      const jz = az + from.z * press;
      this.moveTo(g, jx, jz, Math.hypot(jx - p.x, jz - p.z) > 1.4);
      e.thinkT -= FC_STEP;
      if (e.thinkT <= 0) {
        e.thinkT = cfg.reaction * (0.55 + this.rand() * 0.5);
        const ballD = dist(p, b);
        const box = isInBox(p.x, p.z, side);
        const exposed = ballD < 1.12 && ballD < dist(p, c) + (speed < 1.2 ? 0.1 : -0.04);
        if (exposed && this.rand() < cfg.tackle * (box ? 0.55 : 1) * (speed < 1.2 ? 2 : 1)) {
          const n = unit(b.x - p.x, b.z - p.z);
          p.fx = n.x;
          p.fz = n.z;
          this.startTackle(g, "stand");
        } else if (!box && dist(p, c) < 2.6 && ballD < 2.6 && len(c.vx, c.vz) > 5 && this.rand() < cfg.tackle * 0.12) {
          const n = unit(b.x + b.vx * 0.15 - p.x, b.z + b.vz * 0.15 - p.z);
          p.fx = n.x;
          p.fz = n.z;
          this.startTackle(g, "slide");
        }
      }
      return;
    }
    if (g === this.cover[side]) {
      const x = c.x + toGoal.x * 6.5;
      const z = c.z + toGoal.z * 6.5;
      this.moveTo(g, x, z, Math.hypot(x - p.x, z - p.z) > 3);
      return;
    }
    // mark the most advanced attacker not already covered
    const attackers = this.team(o.side).filter((a) => a.index > 0 && a.index !== o.index);
    let mark: FcPlayer | null = null;
    let md = Infinity;
    for (const a of attackers) {
      const taken = [this.presser[side], this.cover[side]].some((q) => q >= 0 && q !== g && dist(s.players[q], a) < 2.5);
      if (taken) continue;
      const d = Math.abs(a.x - goal.x) + dist(a, p) * 0.4;
      if (d < md) {
        md = d;
        mark = a;
      }
    }
    if (mark) {
      const n = unit(goal.x - mark.x, goal.z - mark.z);
      const spot = formationSpot(side, p.index, b.x, b.z, false);
      const mx = (mark.x + n.x * 2.4) * 0.7 + spot.x * 0.3;
      const mz = (mark.z + n.z * 2.4) * 0.7 + spot.z * 0.3;
      this.moveTo(g, mx, mz, Math.hypot(mx - p.x, mz - p.z) > 5);
    } else {
      const spot = formationSpot(side, p.index, b.x, b.z, false);
      this.moveTo(g, spot.x, spot.z, dist(p, spot) > 6);
    }
  }

  // ---------------------------------------------------------------- keepers

  private keeperStep(): void {
    const s = this.state;
    const b = s.ball;
    for (const side of ["home", "away"] as const) {
      const g = this.gi(side, 0);
      const gk = s.players[g];
      const e = this.ext[g];
      const k = this.keepers[side];
      const cfg = this.cfg(side);
      const r = this.ratings[g];
      const goalX = ownGoalX(side);
      const dir = sideDir(side);
      if (b.owner?.side === side && b.owner.index === 0) {
        e.holdT += FC_STEP;
        e.dvx = 0;
        e.dvz = 0;
        if (e.holdT > 1.1) {
          const plan = this.bestPass(g, 30, false);
          if (plan && plan.safety > 0.7) this.kickPass(g, plan);
          else {
            const fwd = s.players[this.gi(side, 4)];
            this.kickLob(g, this.gi(side, 4), clamp(fwd.x + dir * 2, 3, PITCH_L - 3), clamp(fwd.z, 4, PITCH_W - 4), 0.7, "lob");
          }
        }
        continue;
      }
      if (gk.stunT > 0) {
        e.dvx = 0;
        e.dvz = 0;
        continue;
      }
      const shot = this.intent?.shot && this.intent.side !== side && b.vx * dir < -1;
      if (shot) {
        if (k.shotId !== this.shotSeq) {
          k.shotId = this.shotSeq;
          k.reactT = this.penaltyShot ? 0.02 : cfg.gkReaction + (1 - r.gk) * 0.1;
          k.diving = false;
          k.diveT = 0;
          k.readErr = gauss(this.rand, 0.45 + (1 - r.gk) * 0.4 + (1.6 - cfg.gkDive) * 0.25);
          k.startZ = gk.z;
        }
        k.reactT -= FC_STEP;
        const t = (gk.x - b.x) / (b.vx || -dir * 0.01);
        if (t < 0 || k.diveT > 0.6) {
          if (k.diving) {
            gk.vz *= 0.8;
            e.dvz = 0;
          }
          continue;
        }
        let zc = b.z + b.vz * t + k.readErr;
        const hc = b.h + b.vh * t - 0.5 * G * t * t;
        if (this.penaltyShot) zc = k.guess === 0 ? PITCH_W / 2 : k.guess > 0 === zc > PITCH_W / 2 ? zc : PITCH_W / 2 + k.guess * 2.2;
        if (k.reactT > 0) {
          e.dvx = 0;
          e.dvz = 0;
          continue;
        }
        const need = zc - gk.z;
        if (k.diving || Math.abs(need) > 0.75) {
          if (!k.diving) {
            k.diving = true;
            k.diveT = 0;
            gk.anim = "dive";
            gk.animT = 0;
            gk.diveDir = need > 0 ? 1 : -1;
          }
          k.diveT += FC_STEP;
          const speed = 4.2 + r.gk * 1.2 + cfg.gkDive * 0.5;
          const maxDive = 1.0 + cfg.gkDive * 0.25 + r.gk * 0.25;
          const room = maxDive - Math.abs(gk.z - k.startZ);
          const vz = room <= 0 ? 0 : clamp(need / Math.max(0.06, t), -speed, speed);
          e.dvx = 0;
          e.dvz = vz;
          gk.vz = vz;
          gk.vx = 0;
          gk.h = clamp(hc - 0.9, 0, 1.2) * Math.min(1, k.diveT / 0.2);
        } else {
          this.moveTo(g, gk.x, zc, true);
          gk.h = hc > 1.9 ? Math.min(0.5, hc - 1.9) : 0;
        }
        continue;
      }
      if (k.diving) {
        k.diving = false;
        gk.anim = "fallen";
        gk.animT = 0;
        gk.stunT = 0.55;
        gk.h = 0;
        continue;
      }
      gk.h = 0;
      // loose ball in the box that the keeper reaches first: come and get it
      if (!b.owner && isInBox(b.x, b.z, side) && b.h < 2.2) {
        this.predictBall();
        const mine = this.interceptFor(g);
        const theirs = this.team(opposite(side)).filter((p) => p.index > 0).map((p) => this.interceptFor(this.gi(side === "home" ? "away" : "home", p.index)).t);
        if (mine.t < Math.min(...theirs) - 0.1) {
          this.moveTo(g, mine.x, mine.z, true);
          continue;
        }
      }
      const toBall = unit(b.x - goalX, b.z - PITCH_W / 2);
      const far = Math.abs(b.x - goalX);
      let depth = clamp(1.1 + clamp((24 - far) * 0.06, 0, 1.5), 1.1, 2.6);
      const o = b.owner;
      if (o && o.side !== side) {
        const c = s.players[this.gi(o.side, o.index)];
        if (isInBox(c.x, c.z, side) && dist(c, { x: goalX, z: PITCH_W / 2 }) < 10) depth = clamp(dist(c, { x: goalX, z: PITCH_W / 2 }) * 0.4, 1.6, 3.8);
      }
      const tx = goalX + toBall.x * depth;
      const tz = clamp(PITCH_W / 2 + toBall.z * depth, POST_Z[0] - 0.6, POST_Z[1] + 0.6);
      this.moveTo(g, tx, tz, Math.hypot(tx - gk.x, tz - gk.z) > 2.5);
    }
  }

  // Did the keeper get to a shot as it crossed his plane? Called from ballStep with the previous position.
  private keeperSave(px: number, pz: number, ph: number): boolean {
    const s = this.state;
    const b = s.ball;
    if (!this.intent || (!this.intent.shot && len(b.vx, b.vz) < 11)) return false;
    for (const side of ["home", "away"] as const) {
      if (this.intent.side === side) continue;
      const g = this.gi(side, 0);
      const gk = s.players[g];
      if (gk.stunT > 0 && gk.anim !== "dive") continue;
      const dir = sideDir(side);
      if (b.vx * dir >= 0) continue;
      if ((px - gk.x) * (b.x - gk.x) > 0) continue;
      const f = (gk.x - px) / (b.x - px || 1e-6);
      const zc = pz + (b.z - pz) * f;
      const hc = ph + (b.h - ph) * f;
      const r = this.ratings[g];
      const reach = 0.34 + (gk.anim === "dive" ? 0.38 + this.cfg(side).gkDive * 0.08 : 0.2) + r.gk * 0.08;
      const dz = Math.abs(zc - gk.z);
      const lineT = Math.abs((ownGoalX(side) - b.x) / (b.vx || 1e-6));
      const hLine = b.h + b.vh * lineT - 0.5 * G * lineT * lineT;
      const zLine = b.z + b.vz * lineT;
      if (dz > reach || hc > 2.3 + gk.h * 0.3 || hLine > GOAL_H + 0.25 || Math.abs(zLine - PITCH_W / 2) > GOAL_W / 2 + 0.3) continue;
      const speed = Math.hypot(b.vx, b.vz, b.vh);
      s.stats[side].saves++;
      b.x = gk.x + dir * 0.25;
      b.z = zc;
      b.h = Math.max(0, hc);
      if (speed < 16 && dz < 0.5 && hc > 0.12 && hc < 1.85 && this.rand() < 0.55 + r.gk * 0.35) {
        this.event("catch", side, 0);
        this.giveBall(g);
        return true;
      }
      this.event("save", side, 0);
      const out = zc > PITCH_W / 2 ? 1 : -1;
      const stretch = dz > 0.7 || hc > 1.75;
      if (stretch && this.rand() < 0.5) {
        // tipped round the post or over the bar
        b.vx = -dir * (2 + this.rand() * 2);
        b.vz = out * (4 + this.rand() * 4);
        b.vh = hc > 1.75 ? 3.4 + this.rand() : 1 + this.rand();
      } else {
        b.vx = dir * (3 + speed * 0.18 + this.rand() * 2);
        b.vz = out * (2 + this.rand() * 5);
        b.vh = 1 + this.rand() * 2.5;
      }
      b.owner = null;
      b.lastTouch = side;
      this.ignore = { index: g, until: this.time + 0.4 };
      this.intent = { kind: "loose", side, by: g, target: null, tx: b.x, tz: b.z, age: 0, shot: false, headed: new Set() };
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- movement and ball

  private movePlayers(): void {
    const s = this.state;
    const b = s.ball;
    for (let g = 0; g < 10; g++) {
      const p = s.players[g];
      const e = this.ext[g];
      p.animT += FC_STEP;
      p.stunT = Math.max(0, p.stunT - FC_STEP);
      const keeperDiving = p.index === 0 && this.keepers[p.side].diving;
      if (e.tackle) {
        e.tackleT += FC_STEP;
        if (e.tackle === "slide") {
          p.vx *= 0.955;
          p.vz *= 0.955;
          if (e.tackleT > 0.55) {
            e.tackle = null;
            p.anim = "fallen";
            p.animT = 0;
            p.stunT = 0.5;
          }
        } else if (e.tackleT > 0.32) e.tackle = null;
      }
      if (!keeperDiving && e.tackle !== "slide") {
        const tx = p.stunT > 0 ? 0 : e.dvx;
        const tz = p.stunT > 0 ? 0 : e.dvz;
        const dx = tx - p.vx;
        const dz = tz - p.vz;
        const dl = len(dx, dz);
        const step = ACCEL * FC_STEP * (len(tx, tz) < len(p.vx, p.vz) ? 1.4 : 1);
        if (dl > step) {
          p.vx += (dx / dl) * step;
          p.vz += (dz / dl) * step;
        } else {
          p.vx = tx;
          p.vz = tz;
        }
      }
      p.x = clamp(p.x + p.vx * FC_STEP, -2, PITCH_L + 2);
      p.z = clamp(p.z + p.vz * FC_STEP, -2, PITCH_W + 2);
      const speed = len(p.vx, p.vz);
      const owner = b.owner && b.owner.side === p.side && b.owner.index === p.index;
      if (!keeperDiving && e.tackle !== "slide") {
        let fx = p.fx;
        let fz = p.fz;
        if (speed > 0.6) {
          fx = p.vx / speed;
          fz = p.vz / speed;
        } else if (!owner && p.anim !== "throw") {
          const n = unit(b.x - p.x, b.z - p.z);
          if (n.d > 0.3) {
            fx = n.x;
            fz = n.z;
          }
        }
        const turn = (owner && speed > 5.5 ? 6.5 : 13) * FC_STEP;
        const cur = Math.atan2(p.fz, p.fx);
        let want = Math.atan2(fz, fx) - cur;
        while (want > Math.PI) want -= Math.PI * 2;
        while (want < -Math.PI) want += Math.PI * 2;
        const a = cur + clamp(want, -turn, turn);
        p.fx = Math.cos(a);
        p.fz = Math.sin(a);
        if (owner && Math.abs(want) > 1.2 && speed > 5) {
          p.vx *= 0.97;
          p.vz *= 0.97;
        }
      }
      const special = ["kick", "tackle", "slide", "fallen", "header", "dive", "hold", "throw", "celebrate", "sad"];
      if (p.anim === "kick" && p.animT > 0.3) p.anim = "idle";
      if (p.anim === "tackle" && p.animT > 0.35) p.anim = "idle";
      if (p.anim === "header" && p.animT > 0.45) p.anim = "idle";
      if (p.anim === "throw" && p.animT > 0.45 && s.phase === "play") p.anim = "idle";
      if (p.anim === "fallen" && p.stunT <= 0 && p.animT > 0.4) p.anim = "idle";
      if (p.anim === "hold" && !(b.owner && b.owner.side === p.side && b.owner.index === p.index)) p.anim = "idle";
      if (p.anim === "dive" && !keeperDiving) p.anim = "fallen";
      if (!special.includes(p.anim)) p.anim = speed > 5.9 ? "sprint" : speed > 0.35 ? "run" : "idle";
      if (p.anim === "header") p.h = Math.max(0, p.h - FC_STEP * 1.2);
      else if (!keeperDiving) p.h = 0;
    }
    // soft collisions
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < 10; j++) {
        const a = s.players[i];
        const c = s.players[j];
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const d = len(dx, dz);
        const min = PLAYER_R * 1.75;
        if (d > 0.001 && d < min) {
          const push = (min - d) * 0.5;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          c.x += (dx / d) * push;
          c.z += (dz / d) * push;
        }
      }
    }
  }

  private ballStep(): void {
    const s = this.state;
    const b = s.ball;
    if (b.owner) {
      const g = this.gi(b.owner.side, b.owner.index);
      const p = s.players[g];
      const speed = len(p.vx, p.vz);
      if (p.index === 0 && p.anim === "hold") {
        b.x = p.x + p.fx * 0.3;
        b.z = p.z + p.fz * 0.3;
        b.h = 1.0;
      } else {
        const d = 0.5 + speed * 0.045;
        b.x = p.x + p.fx * d;
        b.z = p.z + p.fz * d;
        b.h = 0;
      }
      b.vx = p.vx;
      b.vz = p.vz;
      b.vh = 0;
      b.spin += (speed * FC_STEP) / BALL_R;
      b.lastTouch = b.owner.side;
      return;
    }
    const px = b.x;
    const pz = b.z;
    const ph = b.h;
    b.vh -= G * FC_STEP;
    b.vx *= 1 - AIR_DRAG * FC_STEP;
    b.vz *= 1 - AIR_DRAG * FC_STEP;
    b.x += b.vx * FC_STEP;
    b.z += b.vz * FC_STEP;
    b.h += b.vh * FC_STEP;
    if (b.h <= 0) {
      b.h = 0;
      if (b.vh < -1.2) {
        if (b.vh < -2.5) this.event("bounce");
        b.vh = -b.vh * RESTITUTION;
        b.vx *= 0.86;
        b.vz *= 0.86;
      } else b.vh = 0;
    }
    if (b.h === 0 && b.vh === 0) {
      const sp = len(b.vx, b.vz);
      if (sp > 0) {
        const d = Math.min(sp, ROLL_DECEL * FC_STEP);
        b.vx -= (b.vx / sp) * d;
        b.vz -= (b.vz / sp) * d;
      }
    }
    b.spin += (len(b.vx, b.vz) * FC_STEP) / BALL_R;
    if (this.keeperSave(px, pz, ph)) return;
    for (const gx of [0, PITCH_L]) {
      const inside = gx === 0 ? px >= 0 : px <= PITCH_L;
      const beyond = gx === 0 ? b.x < 0 : b.x > PITCH_L;
      if (!inside || !beyond) continue;
      const f = (gx - px) / (b.x - px || 1e-6);
      const zc = pz + (b.z - pz) * f;
      const hc = ph + (b.h - ph) * f;
      const back = gx === 0 ? 1 : -1;
      let hit = false;
      for (const postZ of POST_Z) {
        if (Math.abs(zc - postZ) < BALL_R + POST_R && hc < GOAL_H + BALL_R) {
          b.x = gx + back * 0.12;
          b.vx = -b.vx * 0.5;
          b.vz += Math.sign(zc - postZ || 0.01) * (1.5 + this.rand() * 2);
          hit = true;
        }
      }
      if (!hit && zc > POST_Z[0] && zc < POST_Z[1] && Math.abs(hc - GOAL_H) < BALL_R + POST_R) {
        b.x = gx + back * 0.12;
        b.vx = -b.vx * 0.45;
        b.vh = hc > GOAL_H ? Math.abs(b.vh) * 0.4 + 1.5 : -Math.abs(b.vh) * 0.4 - 1;
        hit = true;
      }
      if (hit) {
        this.event("post");
        if (this.intent) this.intent.shot = false;
        return;
      }
      if (zc > POST_Z[0] && zc < POST_Z[1] && hc < GOAL_H) {
        this.scoreGoal(gx === 0 ? "away" : "home");
        return;
      }
    }
  }

  // Loose ball meets a player: first touch, interception, header, block or keeper claim.
  private touchStep(): void {
    const s = this.state;
    const b = s.ball;
    if (b.owner || s.phase !== "play") return;
    const intent = this.intent;
    let best = -1;
    let bestK = Infinity;
    for (let g = 0; g < 10; g++) {
      const p = s.players[g];
      if (p.stunT > 0 || p.anim === "fallen") continue;
      if (this.ignore.index === g && this.time < this.ignore.until) continue;
      if (this.ignore.index === g && intent && intent.by === g && intent.age < 0.8 && dist(p, b) < 1.4) continue;
      const d = dist(p, b);
      let reach = 0;
      if (p.index === 0) reach = b.h < 2.5 && isInBox(p.x, p.z, p.side) ? 1.0 + this.ratings[g].gk * 0.2 : b.h < 0.6 ? 0.7 : 0;
      else if (b.h < 0.55) reach = 0.62 + this.ratings[g].dribbling * 0.18 + (intent && intent.target === g ? 0.15 : 0);
      else if (b.h < 1.05) reach = 0.55;
      else if (b.h < 2.35 && !(intent && intent.headed.has(g))) reach = 0.6 + this.ratings[g].physical * 0.15;
      if (intent?.shot && intent.headed.has(g)) continue;
      if (reach <= 0 || d > reach) continue;
      const k = d / reach;
      if (k < bestK) {
        bestK = k;
        best = g;
      }
    }
    if (best < 0) return;
    const g = best;
    const p = s.players[g];
    const side = p.side;
    const speed = Math.hypot(b.vx, b.vz, b.vh * 0.5);
    const passKind = intent && ["pass", "through", "lob", "cross", "throw"].includes(intent.kind);
    const teammatePass = !!(intent && passKind && intent.side === side && intent.by !== g);
    if (p.index === 0 && isInBox(p.x, p.z, side) && !(intent && intent.side === side && intent.kind === "pass") && !(intent?.shot && speed > 8)) {
      if (speed < 21 || this.rand() < 0.5) {
        this.event("catch", side, 0);
        this.giveBall(g);
      } else this.deflect(g, 0.4);
      return;
    }
    if (intent?.shot && intent.side !== side) {
      // a shot only hits a body when it really passes through it; otherwise it flies past
      if (b.h < 1.7 && dist(p, b) < 0.42 && this.rand() < 0.7) this.deflect(g, 0.4 + this.rand() * 0.2);
      else intent.headed.add(g);
      return;
    }
    if (b.h >= 1.05) {
      intent?.headed.add(g);
      p.anim = "header";
      p.animT = 0;
      p.h = clamp(b.h - 1.6, 0.1, 0.9);
      this.header(g);
      return;
    }
    const r = this.ratings[g];
    const limit = teammatePass || (intent && intent.side === side) ? 13 + r.dribbling * 9 : 7.5 + r.defending * 7;
    if (speed < limit) {
      if (teammatePass) s.stats[side].passesDone++;
      this.giveBall(g);
    } else this.deflect(g, 0.45);
  }

  private header(g: number): void {
    const s = this.state;
    const p = s.players[g];
    const side = p.side;
    const b = s.ball;
    const chance = this.xg(p.x, p.z, side);
    const own = Math.abs(p.x - ownGoalX(side)) < 18;
    if (chance > 0.07 && !own) {
      const aim = this.shotAim(g);
      this.kickShot(g, 0.5, aim.z, clamp(aim.h, 0.3, 1.6), true);
      return;
    }
    this.event("header", side, p.index);
    if (own) {
      const dir = sideDir(side);
      this.kickLob(g, -1, p.x + dir * (14 + this.rand() * 8), clamp(p.z + noise(this.rand, 14), 2, PITCH_W - 2), 0.5, "clear");
      return;
    }
    const plan = this.bestPass(g, 14, false);
    if (plan && plan.safety > 0.4) {
      this.release(g, true);
      const n = unit(plan.tx - b.x, plan.tz - b.z);
      const v = Math.min(12, 4 + plan.d * 0.7);
      b.vx = n.x * v;
      b.vz = n.z * v;
      b.vh = 1.2;
      this.setIntent("pass", g, plan.target, plan.tx, plan.tz);
      s.stats[side].passes++;
      return;
    }
    this.deflect(g, 0.3);
  }

  private deflect(g: number, keep: number): void {
    const s = this.state;
    const p = s.players[g];
    const b = s.ball;
    const n = unit(b.x - p.x, b.z - p.z);
    const speed = Math.hypot(b.vx, b.vz) * keep + 1;
    const a = Math.atan2(n.z, n.x) + noise(this.rand, 0.9);
    b.vx = Math.cos(a) * speed + p.vx * 0.3;
    b.vz = Math.sin(a) * speed + p.vz * 0.3;
    b.vh = Math.max(0.3, Math.abs(b.vh) * 0.3) + this.rand() * 1.2;
    b.lastTouch = p.side;
    this.ignore = { index: g, until: this.time + 0.22 };
    this.intent = { kind: "loose", side: p.side, by: g, target: null, tx: b.x, tz: b.z, age: 0, shot: false, headed: new Set([g]) };
  }

  private boundsStep(): void {
    const s = this.state;
    const b = s.ball;
    const last = b.lastTouch ?? "home";
    if (b.z < -0.12 || b.z > PITCH_W + 0.12) {
      this.setupRestart("throwin", opposite(last), clamp(b.x, 1, PITCH_L - 1), b.z < 0 ? 0 : PITCH_W);
      return;
    }
    if (b.x < -0.12 || b.x > PITCH_L + 0.12) {
      const defending: Side = b.x < 0 ? "home" : "away";
      if (last === defending) this.setupRestart("corner", opposite(defending), b.x < 0 ? 0 : PITCH_L, b.z < PITCH_W / 2 ? 0 : PITCH_W);
      else this.setupRestart("goalkick", defending, 0, b.z);
    }
  }
}

// ---------------------------------------------------------------- module helpers

export function blankFcInput(): FcInput {
  return { mx: 0, mz: 0, sprint: false, pass: false, shoot: false, lob: false, through: false };
}

export function simulateFcMatch(opts: FcMatchOptions): FcMatch {
  const match = new FcMatch({ ...opts, homeAiTier: opts.homeAiTier ?? 2 });
  const limit = Math.ceil(((opts.seconds ?? MATCH_SECONDS) + GOLDEN_GOAL_SECONDS + 40) / FC_STEP);
  for (let i = 0; i < limit && match.state.phase !== "ended"; i++) match.step(ZERO);
  if (match.state.phase !== "ended") match.endNow();
  return match;
}

function makePlayer(side: Side, index: number, role: Role, num: number, squadNum?: number): FcPlayer {
  const spot = formationSpot(side, index, PITCH_L / 2, PITCH_W / 2, false);
  return { side, index, role, num, squadNum, x: spot.x, z: spot.z, vx: 0, vz: 0, h: 0, fx: sideDir(side), fz: 0, anim: "idle", animT: 0, diveDir: 0, stunT: 0 };
}

function makeHome(home: SquadPlayer[]): FcPlayer[] {
  return [0, 1, 2, 3, 4].map((i) => {
    const p = home[i] ?? home[0];
    const role: Role = i === 0 ? "GK" : p ? roleOf(cardFor(p.num).pos) : "MID";
    return makePlayer("home", i, role, p?.num ?? i + 1, p?.num);
  });
}

function makeAway(): FcPlayer[] {
  const nums = [1, 4, 6, 8, 9];
  const roles: Role[] = ["GK", "DEF", "DEF", "MID", "FWD"];
  return nums.map((num, i) => makePlayer("away", i, roles[i], num));
}

function homeRatings(home: SquadPlayer[], captain: number): FcRatings[] {
  return [0, 1, 2, 3, 4].map((i) => {
    const p = home[i] ?? home[0];
    const a = attrsFor(p.num);
    const cap = p.num === captain ? 0.04 : 0;
    const c = (v: number) => clamp(v + cap, 0.08, 0.95);
    return { pace: c(a.pace), shooting: c(a.shooting), passing: c(a.passing), dribbling: c(a.dribbling), defending: c(a.defending), physical: c(a.physical), gk: clamp(a.gk + (i === 0 ? cap : 0), 0.08, 0.95) };
  });
}

function rivalRatings(tier: 1 | 2 | 3 | 4): FcRatings[] {
  return [0, 1, 2, 3, 4].map((i) => {
    const a = rivalAttrs(tier, i);
    const c = (v: number) => clamp(v, 0.08, 0.95);
    return { pace: c(a.pace), shooting: c(a.shooting), passing: c(a.passing), dribbling: c(a.dribbling), defending: c(a.defending), physical: c(a.physical), gk: c(a.gk) };
  });
}

function blankStats(): FcSideStats {
  return { shots: 0, onTarget: 0, passes: 0, passesDone: 0, tackles: 0, fouls: 0, corners: 0, saves: 0, possession: 0, goals: [] };
}
