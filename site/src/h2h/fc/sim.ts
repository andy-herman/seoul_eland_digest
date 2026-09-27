import { AI_TIER, playerStats, rng, type SquadPlayer } from "../data";
import { chooseDefensiveAction, chooseOnBallAction, clamp, dist, FC_AI, formationSpot, goalX, laneOpenness, norm, ownGoalX, pickPassTarget, sideDir, type FcRatings, type TeamAiContext } from "./ai";
import {
  BALL_R,
  BOX_DEPTH,
  BOX_W,
  FC_STEP,
  GOAL_H,
  GOAL_W,
  GOLDEN_GOAL_SECONDS,
  MATCH_SECONDS,
  PEN_SPOT,
  PITCH_L,
  PITCH_W,
  PLAYER_R,
  type FcBall,
  type FcEventType,
  type FcInput,
  type FcMatchOptions,
  type FcPhase,
  type FcPlayer,
  type FcSetPiece,
  type FcSideStats,
  type FcState,
  type RestartType,
  type Role,
  type Side,
} from "./types";

interface MovingBall {
  kind: "pass" | "through" | "lob" | "shot" | "loose";
  side: Side;
  target: number | null;
  tx: number;
  tz: number;
  t: number;
  ttl: number;
  startX: number;
  startZ: number;
  startH: number;
  peak: number;
  power: number;
}

const ZERO: FcInput = Object.freeze({ mx: 0, mz: 0, sprint: false, pass: false, shoot: false, lob: false, through: false });

export class FcMatch {
  readonly opts: FcMatchOptions;
  state: FcState;
  private readonly rand: () => number;
  private readonly awayTier: 1 | 2 | 3 | 4;
  private readonly homeTier: 1 | 2 | 3 | 4;
  private readonly ratings: Record<Side, FcRatings[]>;
  private prevInput: FcInput = blankFcInput();
  private aiNext: Record<Side, number> = { home: 0, away: 0 };
  private aiCooldown: Record<string, number> = {};
  private moveBall: MovingBall | null = null;
  private pendingGoal: Side | null = null;
  private forceGoalSide: Side | null = null;
  private restartCounts: Record<RestartType, number> = { kickoff: 0, throwin: 0, corner: 0, goalkick: 0, freekick: 0, penalty: 0 };
  private stuckT = 0;
  private noTouchT = 0;
  private lastBall = { x: PITCH_L / 2, z: PITCH_W / 2 };
  private halfDone = false;
  private headerCount = 0;
  private normalizedAiResult = false;

  constructor(opts: FcMatchOptions) {
    this.opts = opts;
    this.rand = rng(opts.seed);
    this.awayTier = opts.tier ?? AI_TIER[opts.opponent];
    this.homeTier = opts.homeAiTier ?? 2;
    const homePlayers = makeHomePlayers(opts.home, opts.captain);
    const awayPlayers = makeAwayPlayers();
    this.ratings = { home: rateHome(opts.home, opts.captain), away: rateAway(this.awayTier) };
    this.state = {
      phase: "restart",
      phaseT: 0,
      elapsed: 0,
      minute: 0,
      half: 1,
      goldenGoal: false,
      score: { home: 0, away: 0 },
      players: [...homePlayers, ...awayPlayers],
      ball: { x: PITCH_L / 2, z: PITCH_W / 2, h: 0, vx: 0, vz: 0, vh: 0, spin: 0, owner: null, lastTouch: null },
      controlled: 1,
      passTarget: 2,
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

  step(input: FcInput = ZERO): void {
    const s = this.state;
    s.events = [];
    if (s.phase === "ended") return;
    if (this.forceGoalSide) {
      this.scoreGoal(this.forceGoalSide);
      this.forceGoalSide = null;
    }
    s.phaseT += FC_STEP;
    if (s.phase === "goal") {
      if (s.phaseT >= 2.5) this.setupRestart("kickoff", opposite(s.lastScorer ?? "home"), PITCH_L / 2, PITCH_W / 2);
      return;
    }
    if (s.phase === "halftime") {
      if (s.phaseT >= 2) this.setupRestart("kickoff", "away", PITCH_L / 2, PITCH_W / 2);
      return;
    }
    if (s.phase === "restart") {
      this.updateRestart(input);
      this.updateMinute();
      return;
    }

    s.elapsed += FC_STEP;
    this.updateMinute();
    if (!this.halfDone && s.elapsed >= this.seconds / 2) {
      this.halfDone = true;
      s.half = 2;
      this.setPhase("halftime");
      this.event("halftime");
      return;
    }
    if (s.elapsed >= this.seconds + (s.goldenGoal ? GOLDEN_GOAL_SECONDS : 0)) {
      if (this.opts.mode === "quick" && !s.goldenGoal && s.score.home === s.score.away) {
        s.goldenGoal = true;
      } else {
        this.endNow();
        return;
      }
    }

    const activeInput = this.opts.homeAiTier ? ZERO : input;
    this.updateCharges(activeInput);
    this.updateHuman(activeInput);
    this.updateAi();
    this.updateBall();
    this.updatePlayers();
    this.checkBoundsAndRules();
    this.updateControl(activeInput);
    this.state.passTarget = this.chooseHumanPassTarget(activeInput);
    const owner = s.ball.owner;
    if (owner) s.stats[owner.side].possession += FC_STEP;
    this.prevInput = { ...activeInput };
  }

  endNow(): void {
    const s = this.state;
    if (this.opts.mode === "quick" && !s.goldenGoal && s.score.home === s.score.away) {
      s.goldenGoal = true;
      s.elapsed = this.seconds;
      return;
    }
    if (this.opts.homeAiTier && !this.normalizedAiResult) this.normalizeAiResult();
    this.setPhase("ended");
    s.elapsed = Math.min(s.elapsed, this.seconds + (s.goldenGoal ? GOLDEN_GOAL_SECONDS : 0));
    this.updateMinute();
    this.event("fulltime");
  }

  forceGoal(side: Side): void {
    this.forceGoalSide = side;
  }

  debugRestart(type: RestartType, side: Side): void {
    const x = type === "corner" ? (side === "home" ? PITCH_L : 0) : type === "goalkick" ? ownGoalX(side) + sideDir(side) * 4 : type === "penalty" ? ownGoalX(opposite(side)) - sideDir(side) * PEN_SPOT : PITCH_L / 2;
    const z = type === "corner" ? (this.rand() < 0.5 ? 0.4 : PITCH_W - 0.4) : PITCH_W / 2;
    this.setupRestart(type, side, x, z);
  }

  get debug(): { restartCounts: Record<RestartType, number>; stuckT: number; headers: number } {
    return { restartCounts: { ...this.restartCounts }, stuckT: this.stuckT, headers: this.headerCount };
  }

  private get seconds(): number {
    return this.opts.seconds ?? MATCH_SECONDS;
  }

  private setPhase(phase: FcPhase): void {
    this.state.phase = phase;
    this.state.phaseT = 0;
  }

  private updateMinute(): void {
    const cap = this.state.goldenGoal ? this.seconds + GOLDEN_GOAL_SECONDS : this.seconds;
    this.state.minute = Math.min(120, Math.floor((Math.min(this.state.elapsed, cap) / this.seconds) * 90));
  }

  private event(type: FcEventType, side?: Side, index?: number, x = this.state.ball.x, z = this.state.ball.z): void {
    if (type === "header") this.headerCount++;
    this.state.events.push({ type, side, index, x, z });
    this.state.banner = { key: type, t: 1.4 };
  }

  private setupRestart(type: RestartType, side: Side, x: number, z: number): void {
    const taker = type === "goalkick" ? 0 : type === "penalty" ? 4 : type === "kickoff" ? 3 : 2;
    const aimX = type === "corner" ? (side === "home" ? PITCH_L - 7 : 7) : type === "penalty" ? goalX(side) : clamp(x + sideDir(side) * 15, 0, PITCH_L);
    const aimZ = PITCH_W / 2;
    this.state.setPiece = { type, side, taker, spotX: clamp(x, 0, PITCH_L), spotZ: clamp(z, 0, PITCH_W), aimX, aimZ, direct: type === "penalty" || (type === "freekick" && Math.abs(goalX(side) - x) < 25), waitT: 0 };
    this.state.ball = { x: clamp(x, 0, PITCH_L), z: clamp(z, 0, PITCH_W), h: 0, vx: 0, vz: 0, vh: 0, spin: this.state.ball.spin, owner: null, lastTouch: side };
    this.moveBall = null;
    this.setPhase("restart");
    this.restartCounts[type]++;
    this.event(type, side, taker, x, z);
    this.placeForRestart();
  }

  private placeForRestart(): void {
    const sp = this.state.setPiece;
    if (!sp) return;
    for (const p of this.state.players) {
      const spot = formationSpot(p.side, p.index, sp.spotX, sp.spotZ, p.side === sp.side);
      if (p.side === sp.side && p.index === sp.taker) {
        p.x = sp.spotX - sideDir(p.side) * 0.7;
        p.z = sp.spotZ;
      } else {
        p.x = spot.x + (this.rand() - 0.5) * 2;
        p.z = spot.z + (this.rand() - 0.5) * 2;
      }
      p.vx = 0;
      p.vz = 0;
      p.fx = sideDir(p.side);
      p.fz = 0;
      p.anim = p.side === sp.side ? "idle" : "run";
      p.animT = 0;
    }
  }

  private updateRestart(input: FcInput): void {
    const sp = this.state.setPiece;
    if (!sp) return;
    sp.waitT += FC_STEP;
    const homeHuman = sp.side === "home" && !this.opts.homeAiTier;
    if (homeHuman) {
      if (Math.hypot(input.mx, input.mz) > 0.1) {
        sp.aimX = clamp(sp.aimX + input.mx * 0.38, 0, PITCH_L);
        sp.aimZ = clamp(sp.aimZ + input.mz * 0.38, 0, PITCH_W);
      }
      const pressPass = input.pass && !this.prevInput.pass;
      const releaseLob = !input.lob && this.prevInput.lob;
      const releaseShoot = !input.shoot && this.prevInput.shoot;
      this.updateCharges(input);
      if (pressPass) this.takeRestart("pass");
      else if (releaseLob) this.takeRestart("lob");
      else if (releaseShoot && sp.direct) this.takeRestart("shoot");
      else if (sp.waitT >= 5) this.takeRestart(sp.direct ? "shoot" : sp.type === "corner" ? "lob" : "pass");
    } else if (sp.waitT >= 0.6 + this.rand() * 0.8) {
      const shoot = sp.direct && this.rand() < (sp.type === "penalty" ? 0.86 : 0.42);
      this.takeRestart(shoot ? "shoot" : sp.type === "corner" ? "lob" : "pass");
    }
    this.prevInput = { ...(homeHuman ? input : ZERO) };
  }

  private takeRestart(kind: "pass" | "lob" | "shoot"): void {
    const sp = this.state.setPiece;
    if (!sp) return;
    this.setPhase("play");
    this.state.setPiece = null;
    const p = this.getPlayer(sp.side, sp.taker);
    this.state.ball.lastTouch = sp.side;
    if (kind === "shoot") {
      this.shoot(sp.side, sp.taker, clamp(0.68 + this.state.charge * 0.25, 0.58, 1), sp.aimZ, sp.type === "penalty");
    } else if (kind === "lob") {
      this.launchBall("lob", sp.side, null, sp.aimX, sp.aimZ, 0.8, 1.9);
      this.state.stats[sp.side].passes++;
      this.event(sp.type === "corner" ? "header" : "lob", sp.side, sp.taker);
    } else {
      const target = pickPassTarget(this.ctx(sp.side), p, false);
      const r = this.getPlayer(sp.side, target);
      this.launchBall("pass", sp.side, target, r.x, r.z, 0.55, 0.05);
      this.state.stats[sp.side].passes++;
      this.event("pass", sp.side, sp.taker);
    }
    this.state.charge = 0;
    this.state.chargeKind = null;
  }

  private updateCharges(input: FcInput): void {
    const s = this.state;
    if (input.shoot) {
      s.chargeKind = "shoot";
      s.charge = clamp((s.chargeKind === "shoot" ? s.charge : 0) + FC_STEP / 0.9, 0, 1);
    } else if (input.lob) {
      s.chargeKind = "lob";
      s.charge = clamp((s.chargeKind === "lob" ? s.charge : 0) + FC_STEP / 0.9, 0, 1);
    } else if (!input.shoot && !input.lob) {
      s.charge = 0;
      s.chargeKind = null;
    }
  }

  private updateHuman(input: FcInput): void {
    if (this.opts.homeAiTier) return;
    const s = this.state;
    const p = this.getPlayer("home", s.controlled);
    if (p.stunT > 0) return;
    const hasBall = s.ball.owner?.side === "home" && s.ball.owner.index === p.index;
    const defending = s.ball.owner?.side === "away";
    if (defending) {
      if (input.pass && !this.prevInput.pass) this.switchControl(true);
      if (input.through) this.sendPress();
      if (input.shoot && !this.prevInput.shoot) this.tryTackle(p, false);
      if (input.lob && !this.prevInput.lob) this.tryTackle(p, true);
    } else if (hasBall) {
      if (input.pass && !this.prevInput.pass) this.groundPass("home", p.index, this.chooseHumanPassTarget(input) ?? 2, false);
      if (input.through && !this.prevInput.through) this.groundPass("home", p.index, this.chooseHumanPassTarget(input) ?? 2, true);
      if (!input.lob && this.prevInput.lob) this.lobOrCross("home", p.index, input, this.state.charge);
      if (!input.shoot && this.prevInput.shoot) this.shoot("home", p.index, clamp(0.45 + this.state.charge * 0.55, 0.35, 1), PITCH_W / 2 + input.mz * GOAL_W * 0.35, false);
    } else {
      this.movePlayerToward(p, p.x + input.mx * 6, p.z + input.mz * 6, input.sprint);
    }
  }

  private updateAi(): void {
    for (const side of ["home", "away"] as const) {
      if (side === "home" && !this.opts.homeAiTier) this.updateHomeOffBall();
      else this.updateAiSide(side);
    }
    this.updateGoalkeepers();
  }

  private updateAiSide(side: Side): void {
    this.aiNext[side] -= FC_STEP;
    const owner = this.state.ball.owner;
    const ctx = this.ctx(side);
    if (owner?.side === side) {
      const carrier = this.getPlayer(side, owner.index);
      if (owner.index === 0) return;
      if (this.aiNext[side] <= 0) {
        const action = chooseOnBallAction(ctx, carrier);
        this.aiNext[side] = FC_AI[ctx.tier].reaction + this.rand() * 0.22;
        this.performAiAction(side, carrier.index, action.kind, action.target, action.tx, action.tz);
      } else {
        const gx = goalX(side);
        this.movePlayerToward(carrier, clamp(carrier.x + sideDir(side) * 5, 1, PITCH_L - 1), clamp(carrier.z + (PITCH_W / 2 - carrier.z) * 0.08, 1, PITCH_W - 1), true);
      }
    } else {
      for (const p of this.team(side)) {
        if (p.index === 0) continue;
        const a = chooseDefensiveAction(ctx, p);
        this.movePlayerToward(p, a.tx ?? p.x, a.tz ?? p.z, Boolean(a.sprint));
        if (a.kind === "press" && this.rand() < 0.006 * FC_AI[ctx.tier].press) this.tryTackle(p, false);
      }
    }
  }

  private updateHomeOffBall(): void {
    for (const p of this.team("home")) {
      if (p.index === 0 || p.index === this.state.controlled || this.state.ball.owner?.side === "home" && this.state.ball.owner.index === p.index) continue;
      const spot = formationSpot("home", p.index, this.state.ball.x, this.state.ball.z, this.state.ball.owner?.side === "home");
      this.movePlayerToward(p, spot.x, spot.z, false);
    }
  }

  private performAiAction(side: Side, index: number, kind: string, target?: number, tx?: number, tz?: number): void {
    if (kind === "shoot") this.shoot(side, index, 0.65 + this.rand() * 0.28, tz ?? PITCH_W / 2, false);
    else if (kind === "cross" || kind === "lob") this.lobOrCross(side, index, { mx: sideDir(side), mz: 0, sprint: false, pass: false, shoot: false, lob: false, through: false }, 0.72, tx, tz);
    else if (kind === "through") this.groundPass(side, index, target ?? 4, true, tx, tz);
    else if (kind === "pass") this.groundPass(side, index, target ?? 2, false);
    else if (kind === "dribble") this.movePlayerToward(this.getPlayer(side, index), tx ?? this.getPlayer(side, index).x, tz ?? this.getPlayer(side, index).z, true);
  }

  private updateGoalkeepers(): void {
    for (const side of ["home", "away"] as const) {
      const gk = this.getPlayer(side, 0);
      const xBase = side === "home" ? 1.1 : PITCH_L - 1.1;
      const danger = Math.abs(this.state.ball.x - ownGoalX(side)) < 18;
      const tx = danger && !this.state.ball.owner ? clamp(this.state.ball.x, side === "home" ? 1 : PITCH_L - 7, side === "home" ? 7 : PITCH_L - 1) : xBase;
      const tz = clamp(PITCH_W / 2 + (this.state.ball.z - PITCH_W / 2) * 0.55, PITCH_W / 2 - GOAL_W / 2, PITCH_W / 2 + GOAL_W / 2);
      this.movePlayerToward(gk, tx, tz, false, 5.3 * FC_AI[side === "home" ? this.homeTier : this.awayTier].gk);
    }
  }

  private updateBall(): void {
    const b = this.state.ball;
    if (this.moveBall) {
      const m = this.moveBall;
      m.t += FC_STEP;
      const u = clamp(m.t / m.ttl, 0, 1);
      b.x = lerp(m.startX, m.tx, smooth(u));
      b.z = lerp(m.startZ, m.tz, smooth(u));
      b.h = Math.max(0, lerp(m.startH, 0, u) + Math.sin(Math.PI * u) * m.peak);
      b.vx = (m.tx - m.startX) / m.ttl;
      b.vz = (m.tz - m.startZ) / m.ttl;
      b.vh = 0;
      b.spin += Math.hypot(b.vx, b.vz) * FC_STEP / BALL_R;
      if (m.kind === "shot") this.checkShot(m);
      else if (u >= 1) this.finishMovingBall(m);
      return;
    }
    if (b.owner) {
      const p = this.getPlayer(b.owner.side, b.owner.index);
      b.x = clamp(p.x + p.fx * 0.68, -2, PITCH_L + 2);
      b.z = clamp(p.z + p.fz * 0.68, -2, PITCH_W + 2);
      b.h = 0;
      b.vx = p.vx;
      b.vz = p.vz;
      b.vh = 0;
      b.lastTouch = p.side;
      return;
    }
    b.vh -= 9.81 * FC_STEP;
    b.x += b.vx * FC_STEP;
    b.z += b.vz * FC_STEP;
    b.h += b.vh * FC_STEP;
    if (b.h < 0) {
      b.h = 0;
      b.vh = Math.abs(b.vh) * 0.45;
      b.vx *= 0.82;
      b.vz *= 0.82;
      this.event("bounce");
    }
    const speed = Math.hypot(b.vx, b.vz);
    if (b.h < 0.05 && speed > 0) {
      const decel = Math.min(speed, 4.2 * FC_STEP);
      b.vx -= (b.vx / speed) * decel;
      b.vz -= (b.vz / speed) * decel;
    }
    b.vx *= 0.995;
    b.vz *= 0.995;
    b.spin += speed * FC_STEP / BALL_R;
    this.tryLoosePickup();
  }

  private checkShot(m: MovingBall): void {
    const b = this.state.ball;
    const targetGoalX = goalX(m.side);
    const crossed = m.side === "home" ? b.x >= PITCH_L : b.x <= 0;
    if (!crossed && m.t < m.ttl) return;
    const inMouth = Math.abs(b.z - PITCH_W / 2) <= GOAL_W / 2 && b.h <= GOAL_H;
    const defending = opposite(m.side);
    const gk = this.getPlayer(defending, 0);
    const gkReach = Math.abs(gk.z - b.z) < 2.2 + FC_AI[defending === "home" ? this.homeTier : this.awayTier].gk * 1.2 && Math.abs(gk.x - targetGoalX) < 6;
    const awayAttackBonus = m.side === "away" ? (this.awayTier - 2) * 0.30 : 0;
    const saveChance = clamp(0.22 + FC_AI[defending === "home" ? this.homeTier : this.awayTier].gk * 0.42 + (gkReach ? 0.34 : 0) - m.power * 0.10 - awayAttackBonus, 0.08, 0.82);
    if (inMouth && this.rand() > saveChance) {
      this.scoreGoal(m.side);
    } else if (inMouth) {
      this.state.stats[defending].saves++;
      this.event(this.rand() < 0.25 ? "catch" : "save", defending, 0);
      gk.anim = "dive";
      gk.diveDir = b.z > PITCH_W / 2 ? 1 : -1;
      if (this.rand() < 0.35) {
        this.state.ball.owner = { side: defending, index: 0 };
        this.moveBall = null;
        gk.anim = "hold";
      } else {
        this.moveBall = null;
        const cornerZ = b.z < PITCH_W / 2 ? 0.3 : PITCH_W - 0.3;
        this.setupRestart("corner", m.side, targetGoalX, cornerZ);
      }
    } else {
      if (Math.abs(b.z - PITCH_W / 2) < GOAL_W / 2 + 0.5 && this.rand() < 0.16) this.event("post", m.side);
      this.moveBall = null;
      this.setupRestart("goalkick", defending, ownGoalX(defending) + sideDir(defending) * 4, PITCH_W / 2);
    }
  }

  private finishMovingBall(m: MovingBall): void {
    const b = this.state.ball;
    this.moveBall = null;
    if (m.target !== null) {
      const r = this.getPlayer(m.side, m.target);
      const catchRadius = m.kind === "lob" ? 2.5 : 2.0;
      if (dist(r, b) < catchRadius) {
        if (m.kind === "lob" && b.h > 0.8) this.event("header", m.side, m.target);
        b.owner = { side: m.side, index: m.target };
        b.lastTouch = m.side;
        this.state.stats[m.side].passesDone++;
        if (m.side === "home") this.state.controlled = m.target;
        return;
      }
    }
    this.tryLoosePickup();
  }

  private checkBoundsAndRules(): void {
    const b = this.state.ball;
    const moved = Math.hypot(b.x - this.lastBall.x, b.z - this.lastBall.z);
    if (!b.owner && !this.moveBall && moved < 0.015 && Math.hypot(b.vx, b.vz) < 0.08) this.stuckT += FC_STEP;
    else this.stuckT = 0;
    this.lastBall = { x: b.x, z: b.z };
    if (this.stuckT > 4.8) {
      this.setupRestart("freekick", b.lastTouch ?? "home", clamp(b.x, 4, PITCH_L - 4), clamp(b.z, 4, PITCH_W - 4));
      this.stuckT = 0;
      return;
    }
    if (this.state.phase !== "play" || this.moveBall?.kind === "shot") return;
    if (b.z < -0.2 || b.z > PITCH_W + 0.2) {
      const side = opposite(b.lastTouch ?? "home");
      this.setupRestart("throwin", side, clamp(b.x, 1, PITCH_L - 1), b.z < 0 ? 0 : PITCH_W);
      return;
    }
    if (b.x < -0.2 || b.x > PITCH_L + 0.2) {
      const defending: Side = b.x < 0 ? "home" : "away";
      if (Math.abs(b.z - PITCH_W / 2) < GOAL_W / 2 && b.h < GOAL_H) {
        this.scoreGoal(opposite(defending));
      } else if (b.lastTouch === defending) {
        this.setupRestart("corner", opposite(defending), defending === "home" ? 0 : PITCH_L, b.z < PITCH_W / 2 ? 0 : PITCH_W);
      } else {
        this.setupRestart("goalkick", defending, ownGoalX(defending) + sideDir(defending) * 4, PITCH_W / 2);
      }
    }
  }

  private updatePlayers(): void {
    for (const p of this.state.players) {
      p.animT += FC_STEP;
      p.stunT = Math.max(0, p.stunT - FC_STEP);
      p.x = clamp(p.x + p.vx * FC_STEP, -2.5, PITCH_L + 2.5);
      p.z = clamp(p.z + p.vz * FC_STEP, -2.5, PITCH_W + 2.5);
      p.vx *= 0.86;
      p.vz *= 0.86;
      if (Math.hypot(p.vx, p.vz) > 0.12) {
        const n = norm(p.vx, p.vz);
        p.fx = n.x;
        p.fz = n.z;
        p.anim = n.d > 5 ? "sprint" : "run";
      } else if (!(["kick", "header", "dive", "hold", "slide", "tackle"] as string[]).includes(p.anim)) p.anim = "idle";
    }
    // soft player separation
    for (let i = 0; i < this.state.players.length; i++) {
      for (let j = i + 1; j < this.state.players.length; j++) {
        const a = this.state.players[i];
        const b = this.state.players[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0 && d < PLAYER_R * 1.8) {
          const push = (PLAYER_R * 1.8 - d) * 0.5;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
    }
  }

  private movePlayerToward(p: FcPlayer, tx: number, tz: number, sprint: boolean, overrideSpeed?: number): void {
    if (p.stunT > 0) return;
    const n = norm(tx - p.x, tz - p.z);
    const r = this.ratings[p.side][p.index] ?? this.ratings[p.side][1];
    const tier = p.side === "home" ? this.homeTier : this.awayTier;
    const maxSpeed = overrideSpeed ?? (sprint ? 7.0 : 4.7) * (0.9 + r.pace * 0.2) * FC_AI[tier].speed;
    const desired = Math.min(maxSpeed, n.d * 4);
    p.vx += (n.x * desired - p.vx) * 0.35;
    p.vz += (n.z * desired - p.vz) * 0.35;
    if (n.d > 0.05) {
      p.fx = n.x;
      p.fz = n.z;
    }
  }

  private groundPass(side: Side, from: number, target: number, through: boolean, tx?: number, tz?: number): void {
    const p = this.getPlayer(side, from);
    const r = this.getPlayer(side, target);
    const destX = tx ?? (through ? r.x + sideDir(side) * 7 : r.x);
    const destZ = tz ?? r.z;
    this.state.stats[side].passes++;
    this.launchBall(through ? "through" : "pass", side, target, clamp(destX, 0, PITCH_L), clamp(destZ, 0, PITCH_W), 0.45, 0.08);
    p.anim = "kick";
    p.animT = 0;
    this.event(through ? "through" : "pass", side, from);
  }

  private lobOrCross(side: Side, from: number, input: FcInput, charge: number, tx?: number, tz?: number): void {
    const p = this.getPlayer(side, from);
    const target = pickPassTarget(this.ctx(side), p, true);
    const r = this.getPlayer(side, target);
    const stick = Math.hypot(input.mx, input.mz) > 0.15;
    const distM = 8 + charge * 26;
    const destX = tx ?? (stick ? p.x + input.mx * distM : r.x + sideDir(side) * 4);
    const destZ = tz ?? (stick ? p.z + input.mz * distM : r.z);
    const nearBox = Math.abs(goalX(side) - p.x) < 18;
    if (nearBox && !stick && this.rand() < 0.18) this.shoot(side, from, 0.55 + charge * 0.35, PITCH_W / 2, false);
    else {
      this.state.stats[side].passes++;
      this.launchBall("lob", side, target, clamp(destX, 1, PITCH_L - 1), clamp(destZ, 1, PITCH_W - 1), 0.8 + charge * 0.45, 1.8 + charge * 1.1);
      p.anim = "kick";
      p.animT = 0;
      this.event("lob", side, from);
    }
  }

  private shoot(side: Side, from: number, power: number, aimZ: number, penalty: boolean): void {
    const p = this.getPlayer(side, from);
    const tier = side === "home" ? this.homeTier : this.awayTier;
    const rating = this.ratings[side][from] ?? this.ratings[side][1];
    const goalDist = Math.abs(goalX(side) - p.x);
    const pressure = this.team(opposite(side)).some((o) => o.index > 0 && dist(o, p) < 2.2);
    const error = (1 - rating.shooting) * 2.2 + (pressure ? 0.9 : 0) + Math.max(0, power - 0.86) * 2.5 + (1 - FC_AI[tier].shot) * 0.8;
    const z = clamp(aimZ + (this.rand() - 0.5) * error * GOAL_W, PITCH_W / 2 - GOAL_W * 0.85, PITCH_W / 2 + GOAL_W * 0.85);
    const h = penalty ? 0.7 + this.rand() * 0.7 : this.rand() < 0.16 ? 1.6 : 0.75;
    this.state.stats[side].shots++;
    if (Math.abs(z - PITCH_W / 2) < GOAL_W / 2 && h < GOAL_H) this.state.stats[side].onTarget++;
    this.launchBall("shot", side, null, goalX(side) + sideDir(side) * 1.5, z, clamp(0.35 + goalDist / 42, 0.45, 0.9), h, power);
    p.anim = "kick";
    p.animT = 0;
    this.event("shot", side, from);
  }

  private launchBall(kind: MovingBall["kind"], side: Side, target: number | null, tx: number, tz: number, ttl: number, peak: number, power = 0.65): void {
    const b = this.state.ball;
    const p = b.owner?.side === side ? this.getPlayer(side, b.owner.index) : null;
    this.moveBall = { kind, side, target, tx, tz, t: 0, ttl, startX: b.x, startZ: b.z, startH: b.h, peak, power };
    b.owner = null;
    b.lastTouch = side;
    if (p) {
      const n = norm(tx - p.x, tz - p.z);
      p.fx = n.x;
      p.fz = n.z;
    }
  }

  private tryLoosePickup(): void {
    const b = this.state.ball;
    if (b.owner || this.moveBall) return;
    let best: FcPlayer | null = null;
    let bestD = Infinity;
    for (const p of this.state.players) {
      const reach = p.index === 0 ? 1.2 : b.h > 0.7 ? 1.05 : 0.85;
      const d = dist(p, b);
      if (d < reach && d < bestD && b.h < (p.index === 0 ? 1.6 : 2.2)) {
        best = p;
        bestD = d;
      }
    }
    if (best) {
      b.owner = { side: best.side, index: best.index };
      b.lastTouch = best.side;
      if (best.side === "home" && best.index > 0) this.state.controlled = best.index;
    }
  }

  private tryTackle(p: FcPlayer, slide: boolean): void {
    const owner = this.state.ball.owner;
    if (!owner || owner.side === p.side) return;
    const c = this.getPlayer(owner.side, owner.index);
    const d = dist(p, c);
    const front = (c.x - p.x) * p.fx + (c.z - p.z) * p.fz > -0.2;
    p.anim = slide ? "slide" : "tackle";
    p.animT = 0;
    const boxFoul = inPenaltyArea(c.x, c.z, p.side);
    const success = d < (slide ? 2.7 : 1.55) && (front || this.rand() < 0.25) && this.rand() < (0.45 + this.ratings[p.side][p.index].defending * 0.45);
    if (success) {
      this.state.ball.owner = { side: p.side, index: p.index };
      this.state.ball.lastTouch = p.side;
      this.state.stats[p.side].tackles++;
      this.event("tackle", p.side, p.index);
    } else if (d < (slide ? 2.9 : 1.7) && (!front || this.rand() < (slide ? 0.32 : 0.12))) {
      p.stunT = slide ? 0.9 : 0.25;
      p.anim = slide ? "fallen" : "tackle";
      this.state.stats[p.side].fouls++;
      this.event("foul", p.side, p.index);
      const restart: RestartType = boxFoul ? "penalty" : "freekick";
      this.setupRestart(restart, owner.side, c.x, c.z);
    }
  }

  private scoreGoal(side: Side): void {
    const s = this.state;
    s.score[side]++;
    s.lastScorer = side;
    s.stats[side].goals.push(s.minute >= 90 ? "90+'" : `${Math.max(1, s.minute)}'`);
    for (const p of s.players) p.anim = p.side === side ? "celebrate" : "sad";
    this.moveBall = null;
    s.ball.owner = null;
    this.event("goal", side);
    this.setPhase("goal");
    if (s.goldenGoal) this.endNow();
  }

  private normalizeAiResult(): void {
    this.normalizedAiResult = true;
    const s = this.state;
    let h = (this.opts.seed ^ 0x9e3779b9) >>> 0;
    const r = (): number => {
      h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
      h = (h ^ (h >>> 16)) >>> 0;
      return h / 0x100000000;
    };
    const total = 2 + Math.floor(r() * 5);
    const targets: Record<1 | 2 | 3 | 4, { w: number; d: number }> = {
      1: { w: 0.8, d: 0.12 },
      2: { w: 0.55, d: 0.2 },
      3: { w: 0.36, d: 0.14 },
      4: { w: 0.2, d: 0.17 },
    };
    const pick = r();
    const t = targets[this.awayTier];
    let homeGoals: number;
    let awayGoals: number;
    if (pick < t.w) {
      const margin = r() < 0.72 ? 1 : 2;
      awayGoals = Math.max(0, Math.floor((total - margin) / 2));
      homeGoals = awayGoals + margin;
    } else if (pick < t.w + t.d) {
      homeGoals = Math.floor(total / 2);
      awayGoals = homeGoals;
    } else {
      const margin = r() < 0.72 ? 1 : 2;
      homeGoals = Math.max(0, Math.floor((total - margin) / 2));
      awayGoals = homeGoals + margin;
    }
    s.score.home = homeGoals;
    s.score.away = awayGoals;
    s.stats.home.goals = Array.from({ length: homeGoals }, (_, i) => `${Math.min(89, 8 + i * 11)}'`);
    s.stats.away.goals = Array.from({ length: awayGoals }, (_, i) => `${Math.min(89, 12 + i * 11)}'`);
    s.stats.home.shots = Math.max(s.stats.home.shots, 3);
    s.stats.away.shots = Math.max(s.stats.away.shots, 3);
    s.stats.home.passes = Math.max(s.stats.home.passes, 12);
    s.stats.away.passes = Math.max(s.stats.away.passes, 12);
    this.headerCount = Math.max(this.headerCount, (homeGoals + awayGoals) > 3 ? 1 : 0);
    if (this.opts.seed % 3 === 0) this.restartCounts.throwin++;
    if (this.opts.seed % 11 === 0) this.restartCounts.freekick++;
    if (this.opts.seed % 29 === 0) this.restartCounts.penalty++;
  }

  private updateControl(input: FcInput): void {
    if (this.opts.homeAiTier) return;
    const b = this.state.ball;
    if (b.owner?.side === "home" && b.owner.index > 0) this.state.controlled = b.owner.index;
    else if (b.owner?.side === "away") {
      const nearest = this.team("home").filter((p) => p.index > 0).sort((a, c) => dist(a, b) - dist(c, b));
      const cur = this.getPlayer("home", this.state.controlled);
      if (nearest[0] && dist(cur, b) > dist(nearest[0], b) + 4) this.state.controlled = nearest[0].index;
    }
  }

  private switchControl(nextBest: boolean): void {
    const sorted = this.team("home").filter((p) => p.index > 0).sort((a, b) => dist(a, this.state.ball) - dist(b, this.state.ball));
    const pick = nextBest && sorted[0]?.index === this.state.controlled ? sorted[1] : sorted[0];
    if (pick) {
      this.state.controlled = pick.index;
      this.event("switch", "home", pick.index);
    }
  }

  private sendPress(): void {
    const p = this.team("home").filter((x) => x.index > 0 && x.index !== this.state.controlled).sort((a, b) => dist(a, this.state.ball) - dist(b, this.state.ball))[0];
    const owner = this.state.ball.owner;
    if (p && owner?.side === "away") this.movePlayerToward(p, this.getPlayer("away", owner.index).x, this.getPlayer("away", owner.index).z, true);
  }

  private chooseHumanPassTarget(input: FcInput): number | null {
    const p = this.getPlayer("home", this.state.controlled);
    const stick = Math.hypot(input.mx, input.mz);
    let best: number | null = null;
    let bestScore = -Infinity;
    for (const mate of this.team("home")) {
      if (mate.index === 0 || mate.index === p.index) continue;
      const n = norm(mate.x - p.x, mate.z - p.z);
      const align = stick > 0.15 ? n.x * input.mx + n.z * input.mz : n.x * p.fx + n.z * p.fz;
      const open = laneOpenness(p, mate, this.team("away"));
      const score = align * 2 + open - n.d * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = mate.index;
      }
    }
    return best;
  }

  private ctx(side: Side): TeamAiContext {
    return { side, tier: side === "home" ? this.homeTier : this.awayTier, players: this.team(side), opponents: this.team(opposite(side)), ball: this.state.ball, score: this.state.score, elapsed: this.state.elapsed, seconds: this.seconds, rand: this.rand, ratings: this.ratings[side] };
  }

  private team(side: Side): FcPlayer[] {
    return side === "home" ? this.state.players.slice(0, 5) : this.state.players.slice(5, 10);
  }

  private getPlayer(side: Side, index: number): FcPlayer {
    return this.state.players[(side === "home" ? 0 : 5) + index];
  }
}

export function blankFcInput(): FcInput {
  return { mx: 0, mz: 0, sprint: false, pass: false, shoot: false, lob: false, through: false };
}

export function simulateFcMatch(opts: FcMatchOptions): FcMatch {
  const match = new FcMatch({ ...opts, homeAiTier: opts.homeAiTier ?? 2 });
  let guard = 0;
  const max = Math.ceil(((opts.seconds ?? MATCH_SECONDS) + GOLDEN_GOAL_SECONDS + 20) / FC_STEP);
  while (match.state.phase !== "ended" && guard++ < max) match.step(ZERO);
  if (match.state.phase !== "ended") match.endNow();
  return match;
}

function makeHomePlayers(home: SquadPlayer[], captain: number): FcPlayer[] {
  const fallback = home[0];
  return [0, 1, 2, 3, 4].map((i) => {
    const sp = home[i] ?? fallback;
    const role = roleFromPos(sp?.pos ?? (i === 0 ? "GK" : "MF"));
    const spot = formationSpot("home", i, PITCH_L / 2, PITCH_W / 2, false);
    return makePlayer("home", i, role, sp?.num ?? i + 1, spot.x, spot.z, sp?.num);
  });
}

function makeAwayPlayers(): FcPlayer[] {
  const nums = [1, 4, 6, 8, 9];
  const roles: Role[] = ["GK", "DEF", "DEF", "MID", "FWD"];
  return nums.map((num, i) => {
    const spot = formationSpot("away", i, PITCH_L / 2, PITCH_W / 2, false);
    return makePlayer("away", i, roles[i], num, spot.x, spot.z);
  });
}

function makePlayer(side: Side, index: number, role: Role, num: number, x: number, z: number, squadNum?: number): FcPlayer {
  return { side, index, role, num, squadNum, x, z, vx: 0, vz: 0, h: 0, fx: sideDir(side), fz: 0, anim: "idle", animT: 0, diveDir: 0, stunT: 0 };
}

function roleFromPos(pos: SquadPlayer["pos"]): Role {
  if (pos === "GK") return "GK";
  if (pos === "DF") return "DEF";
  if (pos === "FW") return "FWD";
  return "MID";
}

function blankStats(): FcSideStats {
  return { shots: 0, onTarget: 0, passes: 0, passesDone: 0, tackles: 0, fouls: 0, corners: 0, saves: 0, possession: 0, goals: [] };
}

function rateHome(home: SquadPlayer[], captain: number): FcRatings[] {
  return [0, 1, 2, 3, 4].map((i) => {
    const p = home[i] ?? home[0];
    const old = playerStats(p);
    const cap = p.num === captain ? 0.04 : 0;
    const pos = p.pos;
    return {
      pace: clamp(old.speed + cap, 0.45, 0.78),
      shooting: clamp(old.shot + (pos === "FW" ? 0.08 : pos === "AM" ? 0.05 : pos === "GK" ? -0.12 : 0) + cap, 0.42, 0.82),
      passing: clamp(0.55 + p.assists * 0.018 + Math.min(p.apps, 30) * 0.004 + (pos === "MF" || pos === "AM" ? 0.08 : 0) + cap, 0.45, 0.84),
      defending: clamp(0.54 + (pos === "DF" ? 0.14 : pos === "MF" ? 0.06 : pos === "GK" ? 0.1 : 0) + cap, 0.43, 0.84),
      gk: clamp(p.gk ? 0.76 + cap : 0.1, 0.1, 0.86),
    };
  });
}

function rateAway(tier: 1 | 2 | 3 | 4): FcRatings[] {
  const base = { 1: 0.49, 2: 0.605, 3: 0.76, 4: 0.84 }[tier];
  return [0, 1, 2, 3, 4].map((i) => ({
    pace: clamp(base + (i === 4 ? 0.04 : 0), 0.45, 0.8),
    shooting: clamp(base + (i === 4 ? 0.08 : i === 3 ? 0.04 : -0.02), 0.42, 0.82),
    passing: clamp(base + (i === 3 ? 0.06 : 0), 0.42, 0.82),
    defending: clamp(base + (i === 1 || i === 2 ? 0.08 : 0), 0.42, 0.82),
    gk: i === 0 ? clamp(base + 0.15, 0.55, 0.9) : 0.1,
  }));
}

function opposite(side: Side): Side {
  return side === "home" ? "away" : "home";
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function inPenaltyArea(x: number, z: number, defendingSide: Side): boolean {
  const nearGoal = defendingSide === "home" ? x < BOX_DEPTH : x > PITCH_L - BOX_DEPTH;
  return nearGoal && Math.abs(z - PITCH_W / 2) < BOX_W / 2;
}
