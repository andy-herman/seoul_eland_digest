import { AI_TIER, rng, type SquadPlayer } from "../data";
import { attrsFor, cardFor, rivalAttrs, roleOf } from "../ratings";
import {
  attackGoalX,
  angleNoise,
  chooseOffBallTarget,
  chooseOnBallAction,
  clamp,
  dist,
  FC_AI,
  formationSpot,
  laneOpenness,
  len,
  opposite,
  ownGoalX,
  pickPassTarget,
  sideDir,
  unit,
  type FcRatings,
  type TeamAiContext,
} from "./ai";
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

const GRAVITY = 9.81;
const ROLL_DECEL = 4.1;
const AIR_DRAG = 0.16;
const GROUND_DRAG = 0.996;
const RESTITUTION = 0.5;
const ZERO: FcInput = Object.freeze({ mx: 0, mz: 0, sprint: false, pass: false, shoot: false, lob: false, through: false });
const HEADLINE_EVENTS: readonly FcEventType[] = ["goal", "corner", "freekick", "penalty", "throwin", "goalkick", "save", "catch", "post", "halftime", "fulltime", "kickoff"];

type BallIntentKind = "pass" | "through" | "lob" | "cross" | "shot" | "clear" | "throw";
interface BallIntent {
  kind: BallIntentKind;
  side: Side;
  by: number;
  target: number | null;
  targetX: number;
  targetZ: number;
  shot: boolean;
}

interface KeeperState {
  reactionT: number;
  diveT: number;
  diveZ: number;
  diveH: number;
  active: boolean;
}

export class FcMatch {
  readonly opts: FcMatchOptions;
  state: FcState;
  private readonly rand: () => number;
  private readonly awayTier: 1 | 2 | 3 | 4;
  private readonly homeTier: 1 | 2 | 3 | 4;
  private readonly ratings: Record<Side, FcRatings[]>;
  private prevInput: FcInput = blankFcInput();
  private forceGoalSide: Side | null = null;
  private halfDone = false;
  private aiNext: Record<Side, number> = { home: 0.2, away: 0.35 };
  private ballIntent: BallIntent | null = null;
  private keeper: Record<Side, KeeperState> = { home: { reactionT: 0, diveT: 0, diveZ: PITCH_W / 2, diveH: 0, active: false }, away: { reactionT: 0, diveT: 0, diveZ: PITCH_W / 2, diveH: 0, active: false } };
  private restartCounts: Record<RestartType, number> = { kickoff: 0, throwin: 0, corner: 0, goalkick: 0, freekick: 0, penalty: 0 };
  private headerCount = 0;
  private maxStuckT = 0;
  private quietBallT = 0;
  private lastTouchPoint = { x: PITCH_L / 2, z: PITCH_W / 2 };

  constructor(opts: FcMatchOptions) {
    this.opts = opts;
    this.rand = rng(opts.seed);
    this.awayTier = opts.tier ?? AI_TIER[opts.opponent];
    this.homeTier = opts.homeAiTier ?? 2;
    this.ratings = { home: opts.mirror ? rateRival(this.homeTier) : rateHome(opts.home, opts.captain), away: rateRival(this.awayTier) };
    this.state = {
      phase: "restart",
      phaseT: 0,
      elapsed: 0,
      minute: 0,
      half: 1,
      goldenGoal: false,
      score: { home: 0, away: 0 },
      players: [...makeHomePlayers(opts.home), ...makeAwayPlayers()],
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
      if (this.opts.mode === "quick" && !s.goldenGoal && s.score.home === s.score.away) s.goldenGoal = true;
      else {
        this.endNow();
        return;
      }
    }

    const humanInput = this.opts.homeAiTier ? ZERO : input;
    this.updateCharge(humanInput);
    this.updateHuman(humanInput);
    this.updateAi();
    this.updateKeepers();
    this.updateBallPhysics();
    this.updatePlayerPhysics();
    this.handleTouchesAndInterceptions();
    this.handleBounds();
    this.updateControl();
    s.passTarget = this.chooseHumanPassTarget(humanInput);
    if (s.ball.owner) s.stats[s.ball.owner.side].possession += FC_STEP;
    this.prevInput = { ...humanInput };
  }

  endNow(): void {
    if (this.opts.mode === "quick" && !this.state.goldenGoal && this.state.score.home === this.state.score.away) {
      this.state.goldenGoal = true;
      this.state.elapsed = this.seconds;
      return;
    }
    this.setPhase("ended");
    this.state.elapsed = Math.min(this.state.elapsed, this.seconds + (this.state.goldenGoal ? GOLDEN_GOAL_SECONDS : 0));
    this.updateMinute();
    this.event("fulltime");
  }

  forceGoal(side: Side): void {
    this.forceGoalSide = side;
  }

  debugRestart(type: RestartType, side: Side): void {
    const x = type === "corner" ? attackGoalX(side) : type === "goalkick" ? ownGoalX(side) + sideDir(side) * 5 : type === "penalty" ? attackGoalX(side) - sideDir(side) * PEN_SPOT : PITCH_L / 2;
    const z = type === "corner" ? (this.rand() < 0.5 ? 0 : PITCH_W) : PITCH_W / 2;
    this.setupRestart(type, side, x, z);
  }

  get debug(): { restartCounts: Record<RestartType, number>; headers: number; maxStuckT: number } {
    return { restartCounts: { ...this.restartCounts }, headers: this.headerCount, maxStuckT: this.maxStuckT };
  }

  private get seconds(): number {
    return this.opts.seconds ?? MATCH_SECONDS;
  }

  private setPhase(phase: FcPhase): void {
    this.state.phase = phase;
    this.state.phaseT = 0;
  }

  private event(type: FcEventType, side?: Side, index?: number, x = this.state.ball.x, z = this.state.ball.z): void {
    if (type === "header") this.headerCount++;
    this.state.events.push({ type, side, index, x, z });
    if (HEADLINE_EVENTS.includes(type)) this.state.banner = { key: type, t: 1.2 };
  }

  private updateMinute(): void {
    this.state.minute = Math.min(120, Math.floor((this.state.elapsed / this.seconds) * 90));
  }

  private setupRestart(type: RestartType, side: Side, x: number, z: number): void {
    const taker = type === "goalkick" ? 0 : type === "penalty" ? 4 : type === "kickoff" ? 3 : 2;
    const spotX = clamp(x, 0, PITCH_L);
    const spotZ = clamp(z, 0, PITCH_W);
    const aimX = type === "corner" ? attackGoalX(side) - sideDir(side) * 6 : type === "penalty" ? attackGoalX(side) : clamp(spotX + sideDir(side) * 18, 0, PITCH_L);
    const aimZ = PITCH_W / 2;
    this.state.setPiece = { type, side, taker, spotX, spotZ, aimX, aimZ, direct: type === "penalty" || (type === "freekick" && Math.abs(attackGoalX(side) - spotX) < 25), waitT: 0 };
    this.state.ball.x = spotX;
    this.state.ball.z = spotZ;
    this.state.ball.h = 0;
    this.state.ball.vx = 0;
    this.state.ball.vz = 0;
    this.state.ball.vh = 0;
    this.state.ball.owner = null;
    this.state.ball.lastTouch = side;
    this.ballIntent = null;
    this.restartCounts[type]++;
    if (type === "corner") this.state.stats[side].corners++;
    this.setPhase("restart");
    this.event(type, side, taker, spotX, spotZ);
    this.placePlayersForRestart();
  }

  private placePlayersForRestart(): void {
    const sp = this.state.setPiece;
    if (!sp) return;
    for (const p of this.state.players) {
      const spot = formationSpot(p.side, p.index, sp.spotX, sp.spotZ, p.side === sp.side);
      if (p.side === sp.side && p.index === sp.taker) {
        p.x = sp.spotX - sideDir(p.side) * 0.65;
        p.z = clamp(sp.spotZ, 1, PITCH_W - 1);
      } else {
        p.x = spot.x + (this.rand() - 0.5) * 1.8;
        p.z = spot.z + (this.rand() - 0.5) * 1.8;
      }
      p.vx = 0;
      p.vz = 0;
      p.fx = sideDir(p.side);
      p.fz = 0;
      p.stunT = 0;
      p.anim = "idle";
      p.animT = 0;
    }
  }

  private updateRestart(input: FcInput): void {
    const sp = this.state.setPiece;
    if (!sp) return;
    sp.waitT += FC_STEP;
    const human = sp.side === "home" && !this.opts.homeAiTier;
    if (human && len(input.mx, input.mz) > 0.12) {
      sp.aimX = clamp(sp.aimX + input.mx * 0.42, 0, PITCH_L);
      sp.aimZ = clamp(sp.aimZ + input.mz * 0.42, 0, PITCH_W);
    }
    if (human) this.updateCharge(input);
    const auto = sp.waitT >= (human ? 5 : 0.65 + this.rand() * 0.75);
    const pressPass = human && input.pass && !this.prevInput.pass;
    const releaseLob = human && !input.lob && this.prevInput.lob;
    const releaseShoot = human && sp.direct && !input.shoot && this.prevInput.shoot;
    if (pressPass || releaseLob || releaseShoot || auto) {
      const kind = releaseShoot || (auto && sp.direct && (sp.type === "penalty" || this.rand() < 0.2)) ? "shoot" : releaseLob || sp.type === "corner" ? "lob" : "pass";
      this.takeRestart(kind);
    }
    this.prevInput = { ...(human ? input : ZERO) };
  }

  private takeRestart(kind: "pass" | "lob" | "shoot"): void {
    const sp = this.state.setPiece;
    if (!sp) return;
    this.state.setPiece = null;
    this.setPhase("play");
    this.state.ball.x = sp.spotX;
    this.state.ball.z = sp.spotZ;
    this.state.ball.h = kind === "lob" ? 1.5 : 0;
    this.state.ball.owner = { side: sp.side, index: sp.taker };
    if (kind === "shoot") this.kickShot(sp.side, sp.taker, 0.68 + this.state.charge * 0.25, sp.aimZ, sp.type === "penalty");
    else if (kind === "lob") this.kickLob(sp.side, sp.taker, null, sp.aimX, sp.aimZ, 0.75 + this.state.charge * 0.2, sp.type === "corner" ? "cross" : "lob");
    else {
      const target = pickPassTarget(this.ctx(sp.side), this.player(sp.side, sp.taker), false);
      this.kickPass(sp.side, sp.taker, target, false);
    }
    this.state.charge = 0;
    this.state.chargeKind = null;
  }

  private updateCharge(input: FcInput): void {
    if (input.shoot) {
      this.state.chargeKind = "shoot";
      this.state.charge = clamp(this.state.charge + FC_STEP / 0.9, 0, 1);
    } else if (input.lob) {
      this.state.chargeKind = "lob";
      this.state.charge = clamp(this.state.charge + FC_STEP / 0.9, 0, 1);
    } else {
      this.state.charge = 0;
      this.state.chargeKind = null;
    }
  }

  private updateHuman(input: FcInput): void {
    if (this.opts.homeAiTier) return;
    const p = this.player("home", this.state.controlled);
    const owner = this.state.ball.owner;
    if (owner?.side === "home" && owner.index === p.index) {
      if (input.pass && !this.prevInput.pass) this.kickPass("home", p.index, this.chooseHumanPassTarget(input) ?? 2, false);
      if (input.through && !this.prevInput.through) this.kickPass("home", p.index, this.chooseHumanPassTarget(input) ?? 2, true);
      if (!input.lob && this.prevInput.lob) {
        const target = this.chooseHumanPassTarget(input);
        const d = 10 + this.state.charge * 25;
        const x = target ? this.player("home", target).x + sideDir("home") * 3 : p.x + (len(input.mx, input.mz) > 0.1 ? input.mx : p.fx) * d;
        const z = target ? this.player("home", target).z : p.z + input.mz * d;
        this.kickLob("home", p.index, target, clamp(x, 1, PITCH_L - 1), clamp(z, 1, PITCH_W - 1), this.state.charge, "lob");
      }
      if (!input.shoot && this.prevInput.shoot) this.kickShot("home", p.index, 0.42 + this.state.charge * 0.58, PITCH_W / 2 + input.mz * GOAL_W * 0.36, false);
      this.movePlayer(p, p.x + input.mx * 4, p.z + input.mz * 4, input.sprint);
    } else if (owner?.side === "away") {
      if (input.pass && !this.prevInput.pass) this.switchControl();
      if (input.through) this.pressWithNearestTeammate();
      if (input.shoot && !this.prevInput.shoot) this.startTackle(p, false);
      if (input.lob && !this.prevInput.lob) this.startTackle(p, true);
      this.movePlayer(p, p.x + input.mx * 5, p.z + input.mz * 5, input.sprint);
    } else this.movePlayer(p, p.x + input.mx * 5, p.z + input.mz * 5, input.sprint);
  }

  private updateAi(): void {
    for (const side of ["home", "away"] as const) {
      if (side === "home" && !this.opts.homeAiTier) this.updateHomeSupport();
      else this.updateAiSide(side);
    }
  }

  private updateAiSide(side: Side): void {
    this.aiNext[side] -= FC_STEP;
    const owner = this.state.ball.owner;
    if (owner?.side === side && owner.index > 0) {
      const carrier = this.player(side, owner.index);
      if (this.aiNext[side] <= 0) {
        const action = chooseOnBallAction(this.ctx(side), carrier);
        this.aiNext[side] = FC_AI[side === "home" ? this.homeTier : this.awayTier].reaction * (0.75 + this.rand() * 0.5);
        this.performAiAction(side, carrier.index, action);
      } else this.movePlayer(carrier, carrier.x + sideDir(side) * 4, carrier.z + (PITCH_W / 2 - carrier.z) * 0.08, true);
    }
    for (const p of this.team(side)) {
      if (p.index === 0 || owner?.side === side && owner.index === p.index) continue;
      const action = chooseOffBallTarget(this.ctx(side), p);
      this.movePlayer(p, action.x ?? p.x, action.z ?? p.z, Boolean(action.sprint));
      if (action.kind === "chase" && owner?.side === opposite(side)) {
        const carrier = this.player(owner.side, owner.index);
        const ballVec = (this.state.ball.x - p.x) * p.fx + (this.state.ball.z - p.z) * p.fz;
        const goalSide = sideDir(side) * (p.x - carrier.x) < 0;
        const ownBox = isInPenaltyArea(p.x, p.z, side);
        if (goalSide && !ownBox && ballVec > 0.15 && dist(p, this.state.ball) < 1.0 && dist(p, this.state.ball) + 0.15 < dist(p, carrier)) this.startTackle(p, false);
      }
    }
  }

  private updateHomeSupport(): void {
    for (const p of this.team("home")) {
      if (p.index === 0 || p.index === this.state.controlled || this.state.ball.owner?.side === "home" && this.state.ball.owner.index === p.index) continue;
      const action = chooseOffBallTarget(this.ctx("home"), p);
      this.movePlayer(p, action.x ?? p.x, action.z ?? p.z, Boolean(action.sprint));
    }
  }

  private performAiAction(side: Side, index: number, action: ReturnType<typeof chooseOnBallAction>): void {
    if (action.kind === "shoot") this.kickShot(side, index, 0.62 + this.rand() * 0.33, action.z ?? PITCH_W / 2, false);
    else if (action.kind === "pass") this.kickPass(side, index, action.target ?? 2, false);
    else if (action.kind === "through") this.kickPass(side, index, action.target ?? 4, true);
    else if (action.kind === "cross" || action.kind === "lob") this.kickLob(side, index, null, action.x ?? attackGoalX(side) - sideDir(side) * 6, action.z ?? PITCH_W / 2, 0.75, action.kind === "cross" ? "cross" : "lob");
    else this.movePlayer(this.player(side, index), action.x ?? this.player(side, index).x, action.z ?? this.player(side, index).z, Boolean(action.sprint));
  }

  private updateKeepers(): void {
    for (const side of ["home", "away"] as const) {
      const gk = this.player(side, 0);
      const st = this.keeper[side];
      const cfg = FC_AI[side === "home" ? this.homeTier : this.awayTier];
      const rx = ownGoalX(side) + sideDir(side) * 1.15;
      const incoming = this.ballIntent?.shot && this.ballIntent.side === opposite(side) && Math.sign(this.state.ball.vx || sideDir(opposite(side))) === sideDir(opposite(side));
      if (incoming) {
        if (!st.active) {
          st.active = true;
          st.reactionT = cfg.gkReaction + (1 - this.ratings[side][0].gk) * 0.12;
          st.diveT = 0;
          st.diveZ = predictZAtX(this.state.ball, rx);
          st.diveH = predictHAtX(this.state.ball, rx);
        } else st.reactionT = Math.max(0, st.reactionT - FC_STEP);
        if (st.reactionT <= 0 && st.diveT < 0.55) {
          st.diveT += FC_STEP;
          const maxDive = cfg.gkReach + this.ratings[side][0].gk * 0.25;
          const targetZ = clamp(st.diveZ, gk.z - maxDive, gk.z + maxDive);
          this.movePlayer(gk, rx, clamp(targetZ, PITCH_W / 2 - GOAL_W / 2 - 1.4, PITCH_W / 2 + GOAL_W / 2 + 1.4), true, 5.5 + this.ratings[side][0].gk * 1.5);
          gk.h = clamp(st.diveH, 0, 1.9);
          gk.anim = "dive";
          gk.diveDir = gk.z < targetZ ? 1 : -1;
        } else if (st.diveT >= 0.55) {
          gk.anim = "fallen";
          gk.stunT = Math.max(gk.stunT, 0.25);
        }
      } else {
        st.active = false;
        st.diveT = 0;
        gk.h = 0;
        const danger = this.state.ball.owner === null && Math.abs(this.state.ball.x - ownGoalX(side)) < 13;
        const tx = danger ? clamp(this.state.ball.x, side === "home" ? 1 : PITCH_L - 8, side === "home" ? 8 : PITCH_L - 1) : rx;
        const tz = clamp(PITCH_W / 2 + (this.state.ball.z - PITCH_W / 2) * 0.58, PITCH_W / 2 - GOAL_W / 2, PITCH_W / 2 + GOAL_W / 2);
        this.movePlayer(gk, tx, tz, false, 5.4 + this.ratings[side][0].gk * 1.5);
      }
    }
  }

  private movePlayer(p: FcPlayer, tx: number, tz: number, sprint: boolean, speedOverride?: number): void {
    if (p.stunT > 0) return;
    const n = unit(tx - p.x, tz - p.z);
    const r = this.ratings[p.side][p.index] ?? this.ratings[p.side][1];
    const tier = p.side === "home" ? this.homeTier : this.awayTier;
    const maxSpeed = speedOverride ?? (sprint ? 7.0 : 4.65) * (0.86 + r.pace * 0.28) * FC_AI[tier].speed;
    const desired = Math.min(maxSpeed, n.d * 4.2);
    let turnCost = 1;
    if (sprint && this.state.ball.owner?.side === p.side && this.state.ball.owner.index === p.index) turnCost = clamp(0.7 + (p.fx * n.x + p.fz * n.z) * 0.3, 0.55, 1);
    p.vx += (n.x * desired * turnCost - p.vx) * 0.58;
    p.vz += (n.z * desired * turnCost - p.vz) * 0.58;
    if (n.d > 0.02) {
      p.fx = n.x;
      p.fz = n.z;
    }
  }

  private updatePlayerPhysics(): void {
    for (const p of this.state.players) {
      p.animT += FC_STEP;
      p.stunT = Math.max(0, p.stunT - FC_STEP);
      p.x = clamp(p.x + p.vx * FC_STEP, -2.5, PITCH_L + 2.5);
      p.z = clamp(p.z + p.vz * FC_STEP, -2.5, PITCH_W + 2.5);
      p.vx *= 0.96;
      p.vz *= 0.96;
      const speed = len(p.vx, p.vz);
      if (p.anim !== "header" && p.anim !== "dive") p.h = 0;
      if (!["kick", "tackle", "slide", "fallen", "header", "dive", "hold"].includes(p.anim)) p.anim = speed > 5.8 ? "sprint" : speed > 0.35 ? "run" : "idle";
      if (p.animT > 0.45 && (p.anim === "kick" || p.anim === "tackle" || p.anim === "header")) {
        p.anim = "idle";
        p.h = 0;
      }
      if (p.animT > 0.85 && p.anim === "slide") p.anim = "fallen";
      if (p.animT > 1.1 && p.anim === "fallen") p.anim = "idle";
    }
    this.separatePlayers();
    this.updateStickyBall();
  }

  private separatePlayers(): void {
    for (let i = 0; i < this.state.players.length; i++) {
      for (let j = i + 1; j < this.state.players.length; j++) {
        const a = this.state.players[i];
        const b = this.state.players[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = len(dx, dz);
        const minD = PLAYER_R * 1.82;
        if (d > 0.001 && d < minD) {
          const push = (minD - d) * 0.45;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
    }
  }

  private updateStickyBall(): void {
    const o = this.state.ball.owner;
    if (!o) return;
    const p = this.player(o.side, o.index);
    const d = p.anim === "sprint" ? 0.84 : 0.62;
    this.state.ball.x = clamp(p.x + p.fx * d, -2.5, PITCH_L + 2.5);
    this.state.ball.z = clamp(p.z + p.fz * d, -2.5, PITCH_W + 2.5);
    this.state.ball.h = 0;
    this.state.ball.vx = p.vx;
    this.state.ball.vz = p.vz;
    this.state.ball.vh = 0;
    this.state.ball.lastTouch = o.side;
    this.lastTouchPoint = { x: p.x, z: p.z };
  }

  private updateBallPhysics(): void {
    const b = this.state.ball;
    if (b.owner) return;
    const prevX = b.x;
    const prevZ = b.z;
    const prevH = b.h;
    b.vh -= GRAVITY * FC_STEP;
    b.vx *= 1 - AIR_DRAG * FC_STEP;
    b.vz *= 1 - AIR_DRAG * FC_STEP;
    b.x += b.vx * FC_STEP;
    b.z += b.vz * FC_STEP;
    b.h += b.vh * FC_STEP;
    if (b.h <= 0) {
      if (b.vh < -0.8) this.event("bounce");
      b.h = 0;
      b.vh = Math.abs(b.vh) * RESTITUTION;
      if (Math.abs(b.vh) < 0.7) b.vh = 0;
      b.vx *= GROUND_DRAG;
      b.vz *= GROUND_DRAG;
      const speed = len(b.vx, b.vz);
      if (speed > 0) {
        const decel = Math.min(speed, ROLL_DECEL * FC_STEP);
        b.vx -= (b.vx / speed) * decel;
        b.vz -= (b.vz / speed) * decel;
      }
    }
    b.spin += len(b.vx, b.vz) * FC_STEP / BALL_R;
    this.collideGoalFrame(prevX, prevZ, prevH);
    this.handleGoalPlane(prevX, prevZ);
    if (!b.owner && len(b.vx, b.vz) < 0.08 && b.h < 0.05) this.quietBallT += FC_STEP;
    else this.quietBallT = 0;
    this.maxStuckT = Math.max(this.maxStuckT, this.quietBallT);
  }

  private collideGoalFrame(_prevX: number, _prevZ: number, _prevH: number): void {
    const b = this.state.ball;
    for (const gx of [0, PITCH_L]) {
      const nearX = Math.abs(b.x - gx) < 0.25;
      if (!nearX) continue;
      for (const postZ of [PITCH_W / 2 - GOAL_W / 2, PITCH_W / 2 + GOAL_W / 2]) {
        const dz = b.z - postZ;
        const dh = b.h;
        const d = Math.hypot(dz, dh);
        if (d < 0.17 && b.h < GOAL_H + 0.2) {
          b.vx *= -0.55;
          b.vz += Math.sign(dz || (this.rand() - 0.5)) * 3.5;
          this.event("post");
        }
      }
      if (Math.abs(b.z - PITCH_W / 2) < GOAL_W / 2 && Math.abs(b.h - GOAL_H) < 0.12 && Math.abs(b.vh) > 0.4) {
        b.vh = -Math.abs(b.vh) * 0.55;
        b.vx *= 0.75;
        this.event("post");
      }
    }
  }

  private handleGoalPlane(prevX: number, _prevZ: number): void {
    const b = this.state.ball;
    if (b.owner) return;
    if (prevX <= PITCH_L && b.x > PITCH_L) this.crossGoalLine("away", "home");
    if (prevX >= 0 && b.x < 0) this.crossGoalLine("home", "away");
  }

  private crossGoalLine(defending: Side, attacking: Side): void {
    const b = this.state.ball;
    const inMouth = Math.abs(b.z - PITCH_W / 2) <= GOAL_W / 2 && b.h <= GOAL_H;
    if (inMouth) {
      this.scoreGoal(attacking);
      return;
    }
    const last = b.lastTouch;
    if (last === defending) this.setupRestart("corner", attacking, defending === "home" ? 0 : PITCH_L, b.z < PITCH_W / 2 ? 0 : PITCH_W);
    else this.setupRestart("goalkick", defending, ownGoalX(defending) + sideDir(defending) * 5, PITCH_W / 2);
  }

  private handleTouchesAndInterceptions(): void {
    if (this.state.ball.owner) return;
    let best: { p: FcPlayer; d: number } | null = null;
    for (const p of this.state.players) {
      const reach = this.reachFor(p);
      const d = Math.hypot(this.state.ball.x - p.x, this.state.ball.z - p.z);
      if (d < reach && (!best || d < best.d)) best = { p, d };
    }
    if (!best) return;
    const p = best.p;
    const ballSpeed = Math.hypot(this.state.ball.vx, this.state.ball.vz, this.state.ball.vh * 0.45);
    const r = this.ratings[p.side][p.index];
    const controlLimit = p.index === 0 ? 15 + r.gk * 9 : 6 + r.dribbling * 9 + r.physical * 3;
    const opponentBall = this.ballIntent && this.ballIntent.side !== p.side;
    if (this.ballIntent?.side === p.side && this.ballIntent.target === p.index && best.d < 1.2 && this.state.ball.h < 0.85) {
      this.state.stats[p.side].passesDone++;
      this.giveBallTo(p.side, p.index);
      return;
    }
    if (this.state.ball.h > 1.0 && this.state.ball.h < 2.5 && p.index > 0) {
      p.anim = "header";
      p.animT = 0;
      p.h = clamp(this.state.ball.h * 0.55, 0.35, 1.15);
      this.event("header", p.side, p.index);
      if (this.ballIntent?.kind === "cross" || this.ballIntent?.kind === "lob") this.redirectHeader(p);
      else this.deflectFrom(p, 0.45);
      return;
    }
    if (p.index === 0 && this.ballIntent?.shot && this.ballIntent.side !== p.side) {
      this.state.stats[p.side].saves++;
      const nearBody = best.d < 0.75 && ballSpeed < 18;
      this.event(nearBody ? "catch" : "save", p.side, p.index);
      if (nearBody) {
        this.giveBallTo(p.side, p.index);
        p.anim = "hold";
      } else {
        const wide = this.state.ball.z < PITCH_W / 2 ? -1 : 1;
        this.state.ball.owner = null;
        this.state.ball.lastTouch = p.side;
        this.state.ball.vx = -this.state.ball.vx * 0.35 + sideDir(p.side) * 2;
        this.state.ball.vz = wide * (6 + this.rand() * 5);
        this.state.ball.vh = Math.max(0.8, Math.abs(this.state.ball.vh) * 0.4);
        this.ballIntent = { kind: "clear", side: p.side, by: p.index, target: null, targetX: this.state.ball.x + sideDir(p.side) * 8, targetZ: this.state.ball.z + wide * 8, shot: false };
      }
    } else if (ballSpeed < controlLimit && (!opponentBall || this.rand() < 0.68 + r.defending * 0.18)) {
      const intent = this.ballIntent;
      this.giveBallTo(p.side, p.index);
      if (intent?.side === p.side && intent.target === p.index && intent.kind !== "shot") this.state.stats[p.side].passesDone++;
      if (p.index === 0) p.anim = "hold";
    } else this.deflectFrom(p, opponentBall ? 0.75 : 0.45);
  }

  private reachFor(p: FcPlayer): number {
    if (p.index === 0) {
      const st = this.keeper[p.side];
      if (p.anim === "dive" && st.active && st.reactionT <= 0 && this.state.ball.h <= 2.35) return 0.30 + FC_AI[p.side === "home" ? this.homeTier : this.awayTier].gkReach * 0.3 + this.ratings[p.side][0].gk * 0.1;
      return this.state.ball.h <= 2.3 ? 0.82 + this.ratings[p.side][0].gk * 0.12 : 0;
    }
    if (this.state.ball.h < 0.55) return 0.72 + this.ratings[p.side][p.index].dribbling * 0.22;
    if (this.state.ball.h < 1.0) return 0.62 + this.ratings[p.side][p.index].physical * 0.12;
    if (this.state.ball.h < 2.5) return 0.68 + this.ratings[p.side][p.index].physical * 0.22;
    return 0;
  }

  private redirectHeader(p: FcPlayer): void {
    const dir = sideDir(p.side);
    const towardsGoal = Math.abs(attackGoalX(p.side) - p.x) < 14;
    const targetX = towardsGoal ? attackGoalX(p.side) + dir * 1.5 : p.x + dir * 10;
    const targetZ = towardsGoal ? PITCH_W / 2 + (this.rand() - 0.5) * GOAL_W * 0.7 : p.z + (this.rand() - 0.5) * 8;
    const n = unit(targetX - p.x, targetZ - p.z);
    this.state.ball.owner = null;
    this.state.ball.lastTouch = p.side;
    this.state.ball.vx = n.x * (towardsGoal ? 12 : 8);
    this.state.ball.vz = n.z * (towardsGoal ? 12 : 8);
    this.state.ball.vh = towardsGoal ? 0.4 : 1.1;
    this.ballIntent = { kind: towardsGoal ? "shot" : "pass", side: p.side, by: p.index, target: null, targetX, targetZ, shot: towardsGoal };
    if (towardsGoal) this.state.stats[p.side].shots++;
  }

  private deflectFrom(p: FcPlayer, scale: number): void {
    const n = unit(this.state.ball.x - p.x, this.state.ball.z - p.z);
    this.state.ball.owner = null;
    this.state.ball.lastTouch = p.side;
    this.state.ball.vx = n.x * (5 + this.rand() * 7) * scale + p.vx * 0.4;
    this.state.ball.vz = n.z * (5 + this.rand() * 7) * scale + p.vz * 0.4;
    this.state.ball.vh = Math.max(this.state.ball.vh * -0.2, 0.3 + this.rand() * 1.4);
    this.ballIntent = { kind: "clear", side: p.side, by: p.index, target: null, targetX: this.state.ball.x + n.x * 8, targetZ: this.state.ball.z + n.z * 8, shot: false };
  }

  private handleBounds(): void {
    if (this.state.phase !== "play" || this.state.ball.owner) return;
    const b = this.state.ball;
    if (b.z < -0.15 || b.z > PITCH_W + 0.15) this.setupRestart("throwin", opposite(b.lastTouch ?? "home"), clamp(b.x, 1, PITCH_L - 1), b.z < 0 ? 0 : PITCH_W);
    else if (b.x < -0.3) this.crossGoalLine("home", "away");
    else if (b.x > PITCH_L + 0.3) this.crossGoalLine("away", "home");
  }

  private kickPass(side: Side, from: number, target: number, through: boolean): void {
    const p = this.player(side, from);
    const r = this.player(side, target);
    const lead = through ? sideDir(side) * (4.5 + this.ratings[side][from].passing * 5) : 0;
    const tx = clamp(r.x + r.vx * 0.45 + lead, 1, PITCH_L - 1);
    const tz = clamp(r.z + r.vz * 0.45, 1, PITCH_W - 1);
    this.state.stats[side].passes++;
    this.launchGroundKick(side, from, target, tx, tz, through ? "through" : "pass");
    this.event(through ? "through" : "pass", side, from);
  }

  private launchGroundKick(side: Side, from: number, target: number | null, tx: number, tz: number, kind: BallIntentKind): void {
    const p = this.player(side, from);
    const r = this.ratings[side][from];
    const tier = side === "home" ? this.homeTier : this.awayTier;
    const dx = tx - this.state.ball.x;
    const dz = tz - this.state.ball.z;
    const d = Math.max(0.1, len(dx, dz));
    const endSpeed = kind === "through" ? 4.5 : 3.4;
    const v0 = Math.sqrt(endSpeed * endSpeed + 2 * ROLL_DECEL * d);
    const pressure = this.pressureOn(p, opposite(side));
    const err = FC_AI[tier].passError * (1.25 - r.passing) * (pressure ? 1.6 : 1);
    this.setKickVelocity(side, from, tx, tz, v0, 0, err, kind, target, false);
  }

  private kickLob(side: Side, from: number, target: number | null, tx: number, tz: number, charge: number, kind: BallIntentKind): void {
    const p = this.player(side, from);
    const r = this.ratings[side][from];
    const tier = side === "home" ? this.homeTier : this.awayTier;
    const dx = tx - this.state.ball.x;
    const dz = tz - this.state.ball.z;
    const d = Math.max(1, len(dx, dz));
    const t = clamp(0.88 + d / 32 + charge * 0.35, 0.9, 1.75);
    const speed = d / t;
    const err = FC_AI[tier].passError * (1.4 - r.passing) * (0.8 + charge * 0.6);
    this.state.stats[side].passes++;
    this.setKickVelocity(side, from, tx, tz, speed, GRAVITY * t / 2, err, kind, target, false);
    this.event(kind === "cross" ? "lob" : "lob", side, from);
  }

  private kickShot(side: Side, from: number, charge: number, aimZ: number, penalty: boolean): void {
    const p = this.player(side, from);
    const r = this.ratings[side][from];
    const tier = side === "home" ? this.homeTier : this.awayTier;
    const gx = attackGoalX(side);
    const dx = gx - this.state.ball.x;
    const travel = Math.max(0.2, Math.abs(dx));
    const targetH = penalty ? 0.5 + this.rand() * 1.2 : clamp(0.25 + this.rand() * 1.65 + Math.max(0, charge - 0.85) * 1.4, 0.15, 2.8);
    const speed = 17 + charge * 8 + r.shooting * 5;
    const time = travel / Math.max(6, Math.abs(speed * sideDir(side)));
    const pressure = this.pressureOn(p, opposite(side));
    const body = clamp((p.fx * sideDir(side) + 1) / 2, 0, 1);
    const err = FC_AI[tier].shotError * (1.55 - r.shooting) * (pressure ? 1.6 : 1) * (1.25 - body * 0.3) + Math.max(0, charge - 0.85) * 0.045;
    const tz = clamp(aimZ, PITCH_W / 2 - GOAL_W / 2 + 0.12, PITCH_W / 2 + GOAL_W / 2 - 0.12);
    const n = unit(gx - this.state.ball.x, tz - this.state.ball.z);
    const a = Math.atan2(n.z, n.x) + angleNoise(this.rand, err * 7.0);
    this.releaseBall(side, from);
    this.state.ball.vx = Math.cos(a) * speed;
    this.state.ball.vz = Math.sin(a) * speed;
    this.state.ball.vh = (targetH - this.state.ball.h + 0.5 * GRAVITY * time * time) / Math.max(0.05, time) + angleNoise(this.rand, err * 30);
    this.state.stats[side].shots++;
    if (predictShotOnTarget(this.state.ball, attackGoalX(side))) this.state.stats[side].onTarget++;
    this.ballIntent = { kind: "shot", side, by: from, target: null, targetX: gx, targetZ: tz, shot: true };
    p.anim = "kick";
    p.animT = 0;
    this.event("shot", side, from);
  }

  private setKickVelocity(side: Side, from: number, tx: number, tz: number, speed: number, vh: number, angularError: number, kind: BallIntentKind, target: number | null, shot: boolean): void {
    const p = this.player(side, from);
    const n = unit(tx - this.state.ball.x, tz - this.state.ball.z);
    const a = Math.atan2(n.z, n.x) + angleNoise(this.rand, angularError * 4.5);
    this.releaseBall(side, from);
    this.state.ball.vx = Math.cos(a) * speed;
    this.state.ball.vz = Math.sin(a) * speed;
    this.state.ball.vh = vh;
    this.ballIntent = { kind, side, by: from, target, targetX: tx, targetZ: tz, shot };
    p.anim = "kick";
    p.animT = 0;
    this.event("kick", side, from);
  }

  private releaseBall(side: Side, from: number): void {
    const p = this.player(side, from);
    this.state.ball.owner = null;
    this.state.ball.lastTouch = side;
    this.state.ball.x = clamp(p.x + p.fx * 0.72, -2.5, PITCH_L + 2.5);
    this.state.ball.z = clamp(p.z + p.fz * 0.72, -2.5, PITCH_W + 2.5);
    this.lastTouchPoint = { x: p.x, z: p.z };
  }

  private giveBallTo(side: Side, index: number): void {
    this.state.ball.owner = { side, index };
    this.state.ball.lastTouch = side;
    this.state.ball.vx = 0;
    this.state.ball.vz = 0;
    this.state.ball.vh = 0;
    this.ballIntent = null;
    if (side === "home" && index > 0) this.state.controlled = index;
  }

  private startTackle(p: FcPlayer, slide: boolean): void {
    if (p.stunT > 0 || ((p.anim === "tackle" || p.anim === "slide") && p.animT < (slide ? 0.7 : 0.35))) return;
    p.anim = slide ? "slide" : "tackle";
    p.animT = 0;
    const owner = this.state.ball.owner;
    if (!owner || owner.side === p.side) return;
    const carrier = this.player(owner.side, owner.index);
    const ballD = dist(p, this.state.ball);
    const bodyD = dist(p, carrier);
    const front = (carrier.x - p.x) * p.fx + (carrier.z - p.z) * p.fz > -0.15;
    const range = slide ? 2.75 : 1.35;
    const ballFirst = ballD < (slide ? 1.05 : 0.88) && ballD < bodyD + 0.15;
    if (ballD < range && ballFirst) {
      this.giveBallTo(p.side, p.index);
      p.stunT = slide ? 0.18 : 0.1;
      carrier.stunT = 0.22;
      this.state.stats[p.side].tackles++;
      this.event("tackle", p.side, p.index);
      return;
    }
    if (bodyD < (slide ? 1.25 : 0.88) && (!front || slide || this.rand() > FC_AI[p.side === "home" ? this.homeTier : this.awayTier].foulCare)) {
      this.state.stats[p.side].fouls++;
      p.stunT = slide ? 0.8 : 0.25;
      carrier.stunT = 0.35;
      this.event("foul", p.side, p.index);
      const inBox = isInPenaltyArea(carrier.x, carrier.z, p.side);
      this.setupRestart(inBox ? "penalty" : "freekick", owner.side, carrier.x, carrier.z);
    }
  }

  private scoreGoal(side: Side): void {
    this.state.score[side]++;
    this.state.lastScorer = side;
    this.state.stats[side].goals.push(this.state.minute >= 90 ? "90+'" : `${Math.max(1, this.state.minute)}'`);
    this.state.ball.owner = null;
    this.state.ball.vx = 0;
    this.state.ball.vz = 0;
    this.state.ball.vh = 0;
    for (const p of this.state.players) p.anim = p.side === side ? "celebrate" : "sad";
    this.event("goal", side);
    if (this.state.goldenGoal) this.endNow();
    else this.setPhase("goal");
  }

  private pressureOn(p: FcPlayer, opponent: Side): boolean {
    return this.team(opponent).some((o) => o.index > 0 && dist(o, p) < 2.2);
  }

  private updateControl(): void {
    const owner = this.state.ball.owner;
    if (this.opts.homeAiTier) return;
    if (owner?.side === "home" && owner.index > 0) this.state.controlled = owner.index;
    else if (owner?.side === "away") {
      const nearest = this.team("home").filter((p) => p.index > 0).sort((a, b) => dist(a, this.state.ball) - dist(b, this.state.ball))[0];
      const current = this.player("home", this.state.controlled);
      if (nearest && dist(current, this.state.ball) > dist(nearest, this.state.ball) + 4) this.state.controlled = nearest.index;
    }
  }

  private switchControl(): void {
    const list = this.team("home").filter((p) => p.index > 0).sort((a, b) => dist(a, this.state.ball) - dist(b, this.state.ball));
    const pick = list[0]?.index === this.state.controlled ? list[1] : list[0];
    if (pick) {
      this.state.controlled = pick.index;
      this.event("switch", "home", pick.index);
    }
  }

  private pressWithNearestTeammate(): void {
    const owner = this.state.ball.owner;
    if (owner?.side !== "away") return;
    const carrier = this.player("away", owner.index);
    const p = this.team("home").filter((q) => q.index > 0 && q.index !== this.state.controlled).sort((a, b) => dist(a, carrier) - dist(b, carrier))[0];
    if (p) this.movePlayer(p, carrier.x, carrier.z, true);
  }

  private chooseHumanPassTarget(input: FcInput): number | null {
    const p = this.player("home", this.state.controlled);
    const stick = len(input.mx, input.mz);
    let best = -Infinity;
    let chosen: number | null = null;
    for (const m of this.team("home")) {
      if (m.index === 0 || m.index === p.index) continue;
      const n = unit(m.x - p.x, m.z - p.z);
      const align = stick > 0.12 ? n.x * input.mx + n.z * input.mz : n.x * p.fx + n.z * p.fz;
      const score = align * 1.8 + laneOpenness(p, m, this.team("away")) - n.d * 0.02;
      if (score > best) {
        best = score;
        chosen = m.index;
      }
    }
    return chosen;
  }

  private ctx(side: Side): TeamAiContext {
    return { side, tier: side === "home" ? this.homeTier : this.awayTier, players: this.team(side), opponents: this.team(opposite(side)), ball: this.state.ball, intent: this.ballIntent, ratings: this.ratings[side], rand: this.rand };
  }

  private team(side: Side): FcPlayer[] {
    return side === "home" ? this.state.players.slice(0, 5) : this.state.players.slice(5, 10);
  }

  private player(side: Side, index: number): FcPlayer {
    return this.state.players[(side === "home" ? 0 : 5) + index];
  }
}

export function blankFcInput(): FcInput {
  return { mx: 0, mz: 0, sprint: false, pass: false, shoot: false, lob: false, through: false };
}

export function simulateFcMatch(opts: FcMatchOptions): FcMatch {
  const match = new FcMatch({ ...opts, homeAiTier: opts.homeAiTier ?? 2 });
  const limit = Math.ceil(((opts.seconds ?? MATCH_SECONDS) + GOLDEN_GOAL_SECONDS + 12) / FC_STEP);
  for (let i = 0; i < limit && match.state.phase !== "ended"; i++) match.step(ZERO);
  if (match.state.phase !== "ended") match.endNow();
  return match;
}

function makeHomePlayers(home: SquadPlayer[]): FcPlayer[] {
  const fallback = home[0];
  return [0, 1, 2, 3, 4].map((i) => {
    const p = home[i] ?? fallback;
    const spot = formationSpot("home", i, PITCH_L / 2, PITCH_W / 2, false);
    return makePlayer("home", i, roleFromPlayer(p, i), p?.num ?? i + 1, spot.x, spot.z, p?.num);
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

function roleFromPlayer(p: SquadPlayer | undefined, index: number): Role {
  if (!p || index === 0) return "GK";
  return roleOf(cardFor(p.num).pos);
}

function blankStats(): FcSideStats {
  return { shots: 0, onTarget: 0, passes: 0, passesDone: 0, tackles: 0, fouls: 0, corners: 0, saves: 0, possession: 0, goals: [] };
}

function rateHome(home: SquadPlayer[], captain: number): FcRatings[] {
  return [0, 1, 2, 3, 4].map((i) => {
    const p = home[i] ?? home[0];
    const attrs = attrsFor(p.num);
    const cap = p.num === captain ? 0.04 : 0;
    return {
      pace: clamp(attrs.pace + cap, 0.08, 0.95),
      shooting: clamp(attrs.shooting + cap, 0.08, 0.95),
      passing: clamp(attrs.passing + cap, 0.08, 0.95),
      dribbling: clamp(attrs.dribbling + cap, 0.08, 0.95),
      defending: clamp(attrs.defending + cap, 0.08, 0.95),
      physical: clamp(attrs.physical + cap, 0.08, 0.95),
      gk: clamp(attrs.gk + (roleOf(cardFor(p.num).pos) === "GK" ? cap : 0), 0.08, 0.95),
    };
  });
}

function rateRival(tier: 1 | 2 | 3 | 4): FcRatings[] {
  return [0, 1, 2, 3, 4].map((i) => {
    const attrs = rivalAttrs(tier, i);
    return {
      pace: clamp(attrs.pace, 0.08, 0.95),
      shooting: clamp(attrs.shooting, 0.08, 0.95),
      passing: clamp(attrs.passing, 0.08, 0.95),
      dribbling: clamp(attrs.dribbling, 0.08, 0.95),
      defending: clamp(attrs.defending, 0.08, 0.95),
      physical: clamp(attrs.physical, 0.08, 0.95),
      gk: clamp(attrs.gk, 0.08, 0.95),
    };
  });
}

function predictZAtX(ball: { x: number; z: number; vx: number; vz: number }, x: number): number {
  const t = (x - ball.x) / (ball.vx || 0.001);
  return ball.z + ball.vz * clamp(t, 0, 1.4);
}

function predictHAtX(ball: { x: number; h: number; vx: number; vh: number }, x: number): number {
  const t = (x - ball.x) / (ball.vx || 0.001);
  const tt = clamp(t, 0, 1.4);
  return Math.max(0, ball.h + ball.vh * tt - 0.5 * GRAVITY * tt * tt);
}

function predictShotOnTarget(ball: { x: number; z: number; h: number; vx: number; vz: number; vh: number }, gx: number): boolean {
  const t = (gx - ball.x) / (ball.vx || 0.001);
  if (t <= 0 || t > 2) return false;
  const z = ball.z + ball.vz * t;
  const h = ball.h + ball.vh * t - 0.5 * GRAVITY * t * t;
  return Math.abs(z - PITCH_W / 2) <= GOAL_W / 2 && h >= 0 && h <= GOAL_H;
}

function isInPenaltyArea(x: number, z: number, defendingSide: Side): boolean {
  const near = defendingSide === "home" ? x < BOX_DEPTH : x > PITCH_L - BOX_DEPTH;
  return near && Math.abs(z - PITCH_W / 2) < BOX_W / 2;
}
