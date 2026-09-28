// Take Five (나 혼자 FC) engine: one attack, played one player at a time.
// Each take records one attacker; earlier takes replay as echoes. Movement is pure input kinematics
// (no body collisions), so an echo always runs exactly the route it was recorded with. The ball,
// the mascot defenders and the keeper react to everyone on the pitch, so adding a take can change
// what happens to an earlier one: an echo that expected the ball and does not get it is a paradox.
// DOM-free and deterministic: no random numbers at all, 60 steps per second.
import { attrsFor, type FcAttrs } from "../h2h/ratings";

export const STEP = 1 / 60;
export const PITCH_W = 40; // x: 0 (left touchline) .. 40 (right touchline)
export const PITCH_D = 34; // y: 0 (goal line we attack) .. 34 (just past halfway)
export const GOAL_X = 20;
export const GOAL_HALF = 3.5; // posts at x = 20 +- 3.5
export const GOAL_H = 2.4;
export const BOX_D = 12;
export const BOX_HALF = 13;
export const SIX_D = 4.5;
export const SIX_HALF = 7;
export const PEN_SPOT = 8.5;
export const G = 9.81;
const ROLL = 1.5; // m/s^2 rolling deceleration
const BOUNCE = 0.45;
const OWN_REACH = 0.9; // attacker first touch radius
const DEF_REACH = 0.75;
// how far from his man a marker will leave him to attack a loose ball
const MARK_LEASH = 3;
const TOUCH_MAX = 21; // m/s: faster balls cannot be controlled
const BUFFER = 15; // steps an action waits for the ball
const IGNORE = 21; // steps the kicker cannot touch its own kick
const HIST = 40;
const POKE = 0.85; // a defender this close to a dribbled ball takes it
const LOB_H = 0.95; // a lob or cross arrives at the target at this height (chest or volley)
const CONTROL_H = 1.05; // highest ball an attacker can control
const HEADER_H = 1.05; // lowest ball an attacker heads

export type Tier = 1 | 2 | 3 | 4;
export type ActKind = "pass" | "lob" | "shot";
export type Outcome = "goal" | "saved" | "blocked" | "intercepted" | "tackled" | "claimed" | "wide" | "over" | "post-out" | "out" | "lost" | "time";

export interface SlotDef {
  num: number; // squad number (sets the name, the sticker and the stats)
  x: number;
  y: number;
  label?: string; // role hint such as "Winger"
}

export type DefRole = "gk" | "mark" | "zone" | "press" | "wall";

export interface DefDef {
  role: DefRole;
  x: number;
  y: number;
  mark?: number; // slot index for "mark"
  radius?: number; // zone radius for "zone" (default 4 m)
}

export interface Keyframe {
  t: number;
  x: number;
  y: number;
  // wait here until t instead of moving on to the next keyframe early
  hold?: boolean;
}

export interface ScriptAction {
  t: number;
  kind: ActKind;
  tx: number;
  ty: number;
  th?: number; // shot aim height or lob arrival height
  power?: number; // shots, 0..1
}

export interface ScriptTrack {
  slot: number;
  keys: Keyframe[];
  acts: ScriptAction[];
}

export interface Objective {
  kind: "time" | "passes" | "allTouch" | "header" | "oneTouch" | "maxSlots" | "scorer" | "noParadox";
  value?: number;
}

export interface LevelDef {
  id: string;
  seconds: number;
  slots: SlotDef[];
  defenders: DefDef[];
  opponent: string; // mascot slug for the defenders
  tier: Tier;
  ball: { slot: number } | { x: number; y: number };
  stars: [Objective, Objective]; // star 2 and star 3 (star 1 is the goal)
  solution: ScriptTrack[];
}

export interface Action {
  step: number;
  kind: ActKind;
  tx: number;
  ty: number;
  th: number;
  tt: number; // pass and lob travel time, s
  speed: number; // shot speed, m/s
  done: boolean; // executed while it was recorded (the echo had the ball)
}

export interface Track {
  slot: number;
  moves: Int8Array; // 2 per step: stick x, stick y, scaled to +-127
  actions: Action[];
  touches: number[]; // steps at which this player took the ball while recording
}

export interface Attacker {
  slot: number;
  num: number;
  attrs: FcAttrs;
  present: boolean;
  live: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  kickT: number; // steps since the last kick, for the animation
}

export interface Defender {
  index: number;
  role: DefRole;
  gk: boolean;
  ax: number;
  ay: number;
  mark: number;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  tackleT: number;
  diveT: number; // keeper: seconds into a dive, -1 when not diving
  diveX: number;
  diveY: number;
}

export interface Ball {
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  owner: { team: "att" | "def"; i: number } | null;
  kick: { slot: number; kind: ActKind; step: number; header: boolean; oneTouch: boolean } | null;
  ignore: { slot: number; until: number } | null;
  spin: number;
}

export type SimEvent =
  | { type: "kick"; slot: number; kind: ActKind; header: boolean }
  | { type: "touch"; slot: number }
  | { type: "defball"; index: number; how: Outcome }
  | { type: "save"; index: number }
  | { type: "post" }
  | { type: "goal"; slot: number }
  | { type: "paradox"; slot: number; what: "kick" | "receive" }
  | { type: "end"; outcome: Outcome };

export interface Paradox {
  slot: number;
  step: number;
  what: "kick" | "receive";
}

export interface Stats {
  passes: number; // completed attacker-to-attacker passes
  touched: Set<number>;
  scorer: number;
  header: boolean;
  oneTouch: boolean;
  goalStep: number;
}

export interface Tuning {
  defSpeed: number;
  react: number; // perception lag, s
  tackle: number; // tackle time factor
  gkReact: number;
  gkDive: number; // dive speed m/s
}

export const TIERS: Record<Tier, Tuning> = {
  1: { defSpeed: 5.0, react: 0.32, tackle: 1.2, gkReact: 0.26, gkDive: 3.9 },
  2: { defSpeed: 5.4, react: 0.27, tackle: 1.08, gkReact: 0.22, gkDive: 4.3 },
  3: { defSpeed: 5.8, react: 0.22, tackle: 0.96, gkReact: 0.19, gkDive: 4.7 },
  4: { defSpeed: 6.15, react: 0.18, tackle: 0.86, gkReact: 0.16, gkDive: 5.1 },
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const q2 = (v: number) => Math.round(v * 100) / 100;
const hyp = Math.hypot;

export function maxSpeed(a: FcAttrs): number {
  return 5.9 + a.pace * 1.3;
}

export function passTime(d: number): number {
  return 0.3 + d / 17;
}

export function lobTime(d: number): number {
  return 0.55 + d / 21;
}

export function steps(level: LevelDef): number {
  return Math.round(level.seconds / STEP);
}

// Integrate the input kinematics: the same function moves live players and echoes.
export function moveBody(b: { x: number; y: number; vx: number; vy: number; fx: number; fy: number }, sx: number, sy: number, top: number): void {
  let m = hyp(sx, sy);
  if (m > 1) {
    sx /= m;
    sy /= m;
    m = 1;
  }
  const k = 0.14; // about 1 - exp(-9 / 60)
  b.vx += (sx * top - b.vx) * k;
  b.vy += (sy * top - b.vy) * k;
  b.x = clamp(b.x + b.vx * STEP, 0.4, PITCH_W - 0.4);
  b.y = clamp(b.y + b.vy * STEP, 0.3, PITCH_D - 0.3);
  const sp = hyp(b.vx, b.vy);
  if (sp > 0.4) {
    // turn the facing toward the running direction, at most 12 rad/s
    const want = Math.atan2(b.vy, b.vx);
    const have = Math.atan2(b.fy, b.fx);
    let d = want - have;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const a = have + clamp(d, -12 * STEP, 12 * STEP);
    b.fx = Math.cos(a);
    b.fy = Math.sin(a);
  }
}

// Where an echo will be at every step: movement ignores the world, so this is exact.
export function pathOf(track: Track, start: SlotDef, attrs: FcAttrs, n: number): Float32Array {
  const out = new Float32Array(n * 2 + 2);
  const b = { x: start.x, y: start.y, vx: 0, vy: 0, fx: 0, fy: -1 };
  const top = maxSpeed(attrs);
  out[0] = b.x;
  out[1] = b.y;
  for (let s = 0; s < n; s++) {
    moveBody(b, (track.moves[s * 2] ?? 0) / 127, (track.moves[s * 2 + 1] ?? 0) / 127, top);
    out[s * 2 + 2] = b.x;
    out[s * 2 + 3] = b.y;
  }
  return out;
}

export function emptyTrack(slot: number, n: number): Track {
  return { slot, moves: new Int8Array(n * 2), actions: [], touches: [] };
}

interface Snap {
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  own: number; // -1 loose, 0..4 attacker slot, 10 + i defender
  att: Float32Array; // attacker positions, NaN when absent
}

export class TakeSim {
  readonly n: number;
  readonly att: Attacker[];
  readonly def: Defender[];
  readonly ball: Ball;
  readonly tune: Tuning;
  readonly tracks: (Track | null)[];
  readonly paths: (Float32Array | null)[];
  step = 0;
  outcome: Outcome | null = null;
  endStep = -1;
  events: SimEvent[] = [];
  paradoxes: Paradox[] = [];
  stats: Stats = { passes: 0, touched: new Set(), scorer: -1, header: false, oneTouch: false, goalStep: -1 };
  private hist: Snap[] = [];
  private pending: { slot: number; act: Action; until: number }[] = [];
  private nextAct: number[];
  private expectTouch: number[][]; // per slot, recorded touch steps still to check
  private liveTrack: Track | null = null;
  private presser = -1;
  private lastPasser = -1;
  private gainStep: number[] = [];
  private shotSeen = -1;

  constructor(
    readonly level: LevelDef,
    tracks: (Track | null)[],
    readonly live: number | null = null, // slot index recorded live (its old track is ignored)
    liveStart?: { track: Track; fromStep: number }, // punch-in: replay this track until fromStep, then go live
  ) {
    this.n = steps(level);
    this.tune = TIERS[level.tier];
    this.tracks = level.slots.map((_, i) => (i === live && !liveStart ? null : tracks[i] ?? null));
    this.att = level.slots.map((s, i) => {
      const attrs = attrsFor(s.num);
      return { slot: i, num: s.num, attrs, present: !!this.tracks[i] || i === live, live: i === live, x: s.x, y: s.y, vx: 0, vy: 0, fx: 0, fy: -1, kickT: 99 };
    });
    this.paths = this.att.map((a, i) => (this.tracks[i] && i !== live ? pathOf(this.tracks[i]!, level.slots[i], a.attrs, this.n) : null));
    this.def = level.defenders.map((d, i) => ({
      index: i,
      role: d.role,
      gk: d.role === "gk",
      ax: d.x,
      ay: d.y,
      mark: d.mark ?? -1,
      radius: d.radius ?? 4,
      x: d.x,
      y: d.y,
      vx: 0,
      vy: 0,
      fx: 0,
      fy: 1,
      tackleT: 0,
      diveT: -1,
      diveX: 0,
      diveY: 0,
    }));
    const b0 = "slot" in level.ball ? level.slots[level.ball.slot] : level.ball;
    this.ball = { x: b0.x, y: b0.y - ("slot" in level.ball ? 0.55 : 0), h: 0, vx: 0, vy: 0, vh: 0, owner: null, kick: null, ignore: null, spin: 0 };
    if ("slot" in level.ball && this.att[level.ball.slot].present) {
      this.ball.owner = { team: "att", i: level.ball.slot };
      this.stats.touched.add(level.ball.slot);
    }
    this.nextAct = level.slots.map(() => 0);
    this.expectTouch = level.slots.map((_, i) => (this.tracks[i] && i !== live ? [...this.tracks[i]!.touches] : []));
    this.gainStep = level.slots.map(() => -99);
    if (live !== null) {
      if (liveStart) {
        // punch-in: keep the old recording up to fromStep, then the live input takes over
        const t = liveStart.track;
        this.liveTrack = { slot: live, moves: new Int8Array(this.n * 2), actions: t.actions.filter((a) => a.step < liveStart.fromStep).map((a) => ({ ...a })), touches: t.touches.filter((s) => s < liveStart.fromStep) };
        this.liveTrack.moves.set(t.moves.subarray(0, liveStart.fromStep * 2));
        this.tracks[live] = this.liveTrack;
        this.punchFrom = liveStart.fromStep;
      } else this.liveTrack = emptyTrack(live, this.n);
    }
  }

  private punchFrom = 0;

  get time(): number {
    return this.step * STEP;
  }

  get done(): boolean {
    return this.step >= this.n || (this.endStep >= 0 && this.step >= this.endStep + 70);
  }

  /** The track recorded for the live slot so far. */
  get recorded(): Track | null {
    return this.liveTrack;
  }

  /** True while the live player is being replayed before a punch-in point. */
  get beforePunch(): boolean {
    return this.live !== null && this.step < this.punchFrom;
  }

  // ------------------------------------------------------------------ stepping

  /** Advance one step. `sx, sy` is the live stick (ignored before a punch-in point). */
  advance(sx = 0, sy = 0): void {
    if (this.done) return;
    this.events = [];
    const s = this.step;
    // 1. movement
    for (const a of this.att) {
      if (!a.present) continue;
      let mx = 0;
      let my = 0;
      if (a.live && !this.beforePunch) {
        const qx = Math.round(clamp(sx, -1, 1) * 127);
        const qy = Math.round(clamp(sy, -1, 1) * 127);
        this.liveTrack!.moves[s * 2] = qx;
        this.liveTrack!.moves[s * 2 + 1] = qy;
        mx = qx / 127;
        my = qy / 127;
      } else {
        const t = this.tracks[a.slot];
        if (t) {
          mx = t.moves[s * 2] / 127;
          my = t.moves[s * 2 + 1] / 127;
        }
      }
      moveBody(a, mx, my, maxSpeed(a.attrs));
      a.kickT++;
    }
    // 2. recorded actions reach their step
    for (const a of this.att) {
      if (!a.present) continue;
      const t = this.tracks[a.slot];
      if (!t || (a.live && !this.beforePunch)) continue;
      while (this.nextAct[a.slot] < t.actions.length && t.actions[this.nextAct[a.slot]].step <= s) {
        const act = t.actions[this.nextAct[a.slot]++];
        this.pending.push({ slot: a.slot, act, until: s + BUFFER });
      }
    }
    this.runPending();
    // 3. defenders and keeper
    this.remember();
    if (!this.outcome) this.defend();
    // 4. ball
    this.moveBall();
    // 5. contacts
    if (!this.outcome) this.contacts();
    this.checkParadox();
    if (!this.outcome && s + 1 >= this.n) this.finish("time");
    this.step++;
  }

  /** The live player kicks now. Returns the resolved action (also stored in the live track). */
  act(kind: ActKind, charge: number, sx: number, sy: number): Action | null {
    if (this.live === null || this.outcome || this.beforePunch) return null;
    const a = this.att[this.live];
    const act = this.resolve(a, kind, charge, sx, sy);
    delete (act as { snap?: number }).snap;
    this.liveTrack!.actions.push(act);
    // executed inside the next advance(), at the same point where echo kicks run, so a take replays
    // exactly as it was played
    this.pending.push({ slot: a.slot, act, until: this.step + BUFFER });
    return act;
  }

  /** Queue an already resolved kick for the live player (scripted takes use this). */
  queue(act: Action): void {
    if (this.live === null || this.outcome) return;
    act.step = this.step;
    this.liveTrack!.actions.push(act);
    this.pending.push({ slot: this.live, act, until: this.step + BUFFER });
  }

  /** Where a live kick would go right now, for the aiming reticle. */
  preview(kind: ActKind, charge: number, sx: number, sy: number): { x: number; y: number; h: number; snap: number } {
    if (this.live === null) return { x: 0, y: 0, h: 0, snap: -1 };
    const a = this.att[this.live];
    const act = this.resolve(a, kind, charge, sx, sy);
    return { x: act.tx, y: act.ty, h: act.th, snap: (act as Action & { snap?: number }).snap ?? -1 };
  }

  // Turn a button release into a concrete kick: direction from the stick (or facing), distance from
  // the charge, snapped onto an echo's route when the ball would meet them there.
  private resolve(a: Attacker, kind: ActKind, charge: number, sx: number, sy: number): Action & { snap?: number } {
    let dx = sx;
    let dy = sy;
    const m = hyp(dx, dy);
    if (m < 0.25) {
      dx = a.fx;
      dy = a.fy;
    } else {
      dx /= m;
      dy /= m;
    }
    const base = { step: this.step, kind, done: false } as const;
    const from = this.ball.owner?.team === "att" && this.ball.owner.i === a.slot ? this.ball : { x: a.x + a.fx * 0.55, y: a.y + a.fy * 0.55 };
    if (kind === "shot") {
      const gk = this.def.find((d) => d.gk);
      let aimX: number;
      if (Math.abs(sx) > 0.3) aimX = GOAL_X + Math.sign(sx) * (GOAL_HALF - 0.45) * clamp(Math.abs(sx) * 1.25, 0.35, 1);
      else aimX = GOAL_X + (gk && gk.x > GOAL_X ? -1 : 1) * (GOAL_HALF - 0.55);
      const c = clamp(charge, 0.25, 1);
      const th = c < 0.5 ? 0.3 : c < 0.8 ? 1.0 : 1.75;
      const speed = (16 + 12 * c) * (0.88 + a.attrs.shooting * 0.2);
      return { ...base, tx: q2(aimX), ty: 0, th, tt: 0, speed: q2(speed) };
    }
    const lob = kind === "lob";
    const tap = charge < 0.12;
    const d0 = tap ? (lob ? 14 : 11) : lob ? 8 + 24 * charge : 6 + 26 * charge;
    const rawX = from.x + dx * d0;
    const rawY = from.y + dy * d0;
    let tx = rawX;
    let ty = rawY;
    let snap = -1;
    let best = Infinity;
    // snap onto an echo: one that will be near the target when the ball gets there or, for a quick
    // tap, the echo best lined up with the stick
    for (let i = 0; i < this.att.length; i++) {
      const o = this.att[i];
      if (i === a.slot || !o.present || !this.paths[i]) continue;
      let px = tap ? this.at(i, this.step).x : rawX;
      let py = tap ? this.at(i, this.step).y : rawY;
      for (let iter = 0; iter < 4; iter++) {
        const dd = Math.max(2, hyp(px - from.x, py - from.y));
        const p = this.at(i, this.step + Math.round((lob ? lobTime(dd) : passTime(dd)) / STEP));
        px = p.x;
        py = p.y;
      }
      const to = hyp(px - from.x, py - from.y);
      let score: number;
      if (tap) {
        const align = ((px - from.x) * dx + (py - from.y) * dy) / Math.max(0.01, to);
        if (align < 0.8 || to > 38 || to < 2) continue;
        score = (1 - align) * 30 + to * 0.05;
      } else {
        const miss = hyp(px - rawX, py - rawY);
        if (miss > 4) continue;
        score = miss;
      }
      if (score < best) {
        best = score;
        snap = i;
        tx = px;
        ty = py;
      }
    }
    tx = clamp(tx, 0.5, PITCH_W - 0.5);
    ty = clamp(ty, 0.3, PITCH_D - 0.5);
    tx = q2(tx);
    ty = q2(ty);
    const d = Math.max(2, hyp(tx - from.x, ty - from.y));
    return { ...base, tx, ty, th: lob ? LOB_H : 0, tt: lob ? lobTime(d) : passTime(d), speed: 0, snap };
  }

  /** Position of slot i at step s (echo path, or the current position for others). */
  at(i: number, s: number): { x: number; y: number } {
    const p = this.paths[i];
    if (!p) return { x: this.att[i].x, y: this.att[i].y };
    const k = clamp(s, 0, this.n);
    return { x: p[k * 2], y: p[k * 2 + 1] };
  }

  private runPending(): void {
    if (!this.pending.length) return;
    const keep: typeof this.pending = [];
    this.pending.sort((x, y) => x.slot - y.slot || x.act.step - y.act.step);
    for (const p of this.pending) {
      if (this.outcome) break;
      if (this.tryKick(p.slot, p.act)) continue;
      if (this.step < p.until) keep.push(p);
      else if (p.act.done && !this.att[p.slot].live) this.paradox(p.slot, "kick");
    }
    this.pending = this.outcome ? [] : keep;
  }

  private tryKick(slot: number, act: Action): boolean {
    const a = this.att[slot];
    const b = this.ball;
    const own = b.owner?.team === "att" && b.owner.i === slot;
    const d = hyp(b.x - a.x, b.y - a.y);
    const ignored = b.ignore && b.ignore.slot === slot && this.step < b.ignore.until;
    const loose = !b.owner && !ignored && d < OWN_REACH + 0.15;
    const header = !own && loose && b.h >= HEADER_H && b.h <= 2.6 && act.kind === "shot";
    const ground = own || (loose && b.h < CONTROL_H);
    if (!ground && !header) return false;
    if (a.live) act.done = true;
    const oneTouch = !own || this.step - this.gainStep[slot] < 20;
    if (!own) {
      // a first-time kick is also a touch, and completes the pass that reached it
      const k = b.kick;
      if (k && k.kind !== "shot" && k.slot !== slot && this.lastPasser === k.slot) this.stats.passes++;
      this.stats.touched.add(slot);
      if (a.live && !this.beforePunch) this.liveTrack!.touches.push(this.step);
      this.gainStep[slot] = this.step;
    }
    this.kick(a, act, header, oneTouch);
    return true;
  }

  private kick(a: Attacker, act: Action, header: boolean, oneTouch: boolean): void {
    const b = this.ball;
    b.owner = null;
    b.ignore = { slot: a.slot, until: this.step + IGNORE };
    const h0 = header ? b.h : Math.max(0.1, b.h);
    b.h = h0;
    a.kickT = 0;
    if (act.kind === "shot") {
      const speed = header ? Math.min(16, act.speed * 0.65) : act.speed;
      const aimH = header ? 0.5 : act.th;
      const dx = act.tx - b.x;
      const dy = act.ty - b.y;
      const d = Math.max(0.5, hyp(dx, dy));
      const t = d / speed;
      b.vx = (dx / d) * speed;
      b.vy = (dy / d) * speed;
      b.vh = (aimH - h0 + 0.5 * G * t * t) / t;
      this.shotSeen = -1;
    } else if (act.kind === "pass") {
      const dx = act.tx - b.x;
      const dy = act.ty - b.y;
      const d = Math.max(0.5, hyp(dx, dy));
      const t = passTime(d);
      const v0 = Math.min(26, d / t + (ROLL * t) / 2);
      b.vx = (dx / d) * v0;
      b.vy = (dy / d) * v0;
      b.vh = 0;
      b.h = 0;
    } else {
      const dx = act.tx - b.x;
      const dy = act.ty - b.y;
      const d = Math.max(0.5, hyp(dx, dy));
      const t = lobTime(d);
      b.vx = (dx / t) * 1;
      b.vy = (dy / t) * 1;
      b.vh = (act.th - h0 + 0.5 * G * t * t) / t;
    }
    b.kick = { slot: a.slot, kind: act.kind, step: this.step, header, oneTouch };
    this.lastPasser = act.kind === "shot" ? -1 : a.slot;
    this.events.push({ type: "kick", slot: a.slot, kind: act.kind, header });
  }

  // ------------------------------------------------------------------ defenders

  private remember(): void {
    const b = this.ball;
    const att = new Float32Array(this.att.length * 2);
    this.att.forEach((a, i) => {
      att[i * 2] = a.present ? a.x : NaN;
      att[i * 2 + 1] = a.present ? a.y : NaN;
    });
    const own = !b.owner ? -1 : b.owner.team === "att" ? b.owner.i : 10 + b.owner.i;
    this.hist.push({ x: b.x, y: b.y, h: b.h, vx: b.vx, vy: b.vy, vh: b.vh, own, att });
    if (this.hist.length > HIST) this.hist.shift();
  }

  private seen(lagS: number): Snap {
    const k = Math.round(lagS / STEP);
    return this.hist[Math.max(0, this.hist.length - 1 - k)];
  }

  // Predict a loose ball: ground roll or flight, at time t seconds after the snapshot.
  private predict(s: Snap, t: number): { x: number; y: number; h: number } {
    const sp = hyp(s.vx, s.vy);
    if (s.h > 0.02 || s.vh > 0.1) {
      const h = s.h + s.vh * t - 0.5 * G * t * t;
      return { x: s.x + s.vx * t, y: s.y + s.vy * t, h: Math.max(0, h) };
    }
    if (sp < 0.01) return { x: s.x, y: s.y, h: 0 };
    const tStop = sp / ROLL;
    const tt = Math.min(t, tStop);
    const dist = sp * tt - 0.5 * ROLL * tt * tt;
    return { x: s.x + (s.vx / sp) * dist, y: s.y + (s.vy / sp) * dist, h: 0 };
  }

  private defend(): void {
    const tune = this.tune;
    const seen = this.seen(tune.react);
    const carrier = seen.own >= 0 && seen.own < 10 ? seen.own : -1;
    const loose = seen.own === -1;
    const outfield = this.def.filter((d) => !d.gk);
    const targets = new Map<number, { x: number; y: number; sprint: number }>();
    // the defender best placed to intercept a loose ball goes for it
    let chaser = -1;
    let chase = { x: 0, y: 0 };
    if (loose && hyp(seen.vx, seen.vy) + Math.abs(seen.vh) > 0.2) {
      let bestT = Infinity;
      for (const d of outfield) {
        if (d.role === "wall") continue;
        // how far from his post a defender will go for a ball: zones and markers hold their shape
        const hx = d.role === "mark" && d.mark >= 0 && !Number.isNaN(seen.att[d.mark * 2]) ? seen.att[d.mark * 2] : d.role === "press" ? d.x : d.ax;
        const hy = d.role === "mark" && d.mark >= 0 && !Number.isNaN(seen.att[d.mark * 2 + 1]) ? seen.att[d.mark * 2 + 1] : d.role === "press" ? d.y : d.ay;
        const leash = d.role === "zone" ? d.radius + 3 : d.role === "mark" ? MARK_LEASH : 4.5;
        for (let k = 1; k <= 40; k++) {
          const t = k * 0.05;
          const p = this.predict(seen, t + tune.react);
          if (p.h > 1.4) continue;
          if (p.x < 0 || p.x > PITCH_W || p.y < 0 || p.y > PITCH_D) break;
          if (hyp(p.x - hx, p.y - hy) > leash) continue;
          const need = Math.max(0, hyp(p.x - d.x, p.y - d.y) - DEF_REACH) / tune.defSpeed;
          if (need <= t) {
            if (t < bestT) {
              bestT = t;
              chaser = d.index;
              chase = p;
            }
            break;
          }
        }
      }
    } else if (loose) {
      let bd = Infinity;
      for (const d of outfield) {
        if (d.role === "wall") continue;
        const dd = hyp(seen.x - d.x, seen.y - d.y);
        if (dd < bd) {
          bd = dd;
          chaser = d.index;
          chase = { x: seen.x, y: seen.y };
        }
      }
      if (bd > 9) chaser = -1;
    }
    if (chaser >= 0) targets.set(chaser, { ...chase, sprint: 1 });
    // pressing the carrier
    if (carrier >= 0) {
      const cx = seen.att[carrier * 2];
      const cy = seen.att[carrier * 2 + 1];
      let pick = -1;
      let pd = Infinity;
      for (const d of outfield) {
        if (d.role === "wall") continue;
        if (d.role === "mark" && d.mark !== carrier && this.att[d.mark]?.present) continue;
        if (d.role === "zone" && hyp(cx - d.ax, cy - d.ay) > d.radius + 5 && d.index !== this.presser) continue;
        const dd = hyp(cx - d.x, cy - d.y) - (d.index === this.presser ? 1.5 : 0);
        if (dd < pd) {
          pd = dd;
          pick = d.index;
        }
      }
      if (pick < 0) {
        // nobody free: the nearest defender steps out anyway
        for (const d of outfield) {
          if (d.role === "wall") continue;
          const dd = hyp(cx - d.x, cy - d.y);
          if (dd < pd) {
            pd = dd;
            pick = d.index;
          }
        }
      }
      this.presser = pick;
      if (pick >= 0 && !targets.has(pick)) {
        const d = this.def[pick];
        // cut the dribbler off: aim where he is going, goal-side
        const back = this.seen(tune.react + 0.1);
        const cvx = (cx - back.att[carrier * 2]) / 0.1;
        const cvy = (cy - back.att[carrier * 2 + 1]) / 0.1;
        const lead = Math.min(0.7, hyp(cx - d.x, cy - d.y) / tune.defSpeed);
        const px = cx + (Number.isFinite(cvx) ? cvx : 0) * lead;
        const py = cy + (Number.isFinite(cvy) ? cvy : 0) * lead;
        const gx = GOAL_X - px;
        const gy = 0 - py;
        const gl = Math.max(0.01, hyp(gx, gy));
        const near = hyp(cx - d.x, cy - d.y) < 1.6;
        targets.set(pick, near ? { x: this.ball.x, y: this.ball.y, sprint: 1 } : { x: px + (gx / gl) * 0.6, y: py + (gy / gl) * 0.6, sprint: 1 });
      }
    } else this.presser = -1;
    // everyone else keeps shape: markers goal-side of their man, zones shade toward the ball
    for (const d of outfield) {
      if (targets.has(d.index)) continue;
      if (d.role === "mark" && d.mark >= 0 && !Number.isNaN(seen.att[d.mark * 2])) {
        const mx = seen.att[d.mark * 2];
        const my = seen.att[d.mark * 2 + 1];
        const gx = GOAL_X - mx;
        const gy = -my;
        const gl = Math.max(0.01, hyp(gx, gy));
        const tx = mx + (gx / gl) * 1.4 + (seen.x - mx) * 0.12;
        const ty = my + (gy / gl) * 1.4 + (seen.y - my) * 0.12;
        targets.set(d.index, { x: tx, y: ty, sprint: 0.95 });
      } else if (d.role === "wall") {
        targets.set(d.index, { x: d.ax, y: d.ay, sprint: 0.6 });
      } else {
        const r = d.role === "zone" ? d.radius : 3;
        let tx = d.ax + (seen.x - d.ax) * 0.3;
        let ty = d.ay + (seen.y - d.ay) * 0.3;
        const off = hyp(tx - d.ax, ty - d.ay);
        if (off > r) {
          tx = d.ax + ((tx - d.ax) / off) * r;
          ty = d.ay + ((ty - d.ay) / off) * r;
        }
        targets.set(d.index, { x: tx, y: ty, sprint: 0.8 });
      }
    }
    for (const d of outfield) {
      const t = targets.get(d.index)!;
      const dx = t.x - d.x;
      const dy = t.y - d.y;
      const dist = hyp(dx, dy);
      const want = Math.min(1, dist / 1.2) * t.sprint;
      const sx = dist > 0.01 ? (dx / dist) * want : 0;
      const sy = dist > 0.01 ? (dy / dist) * want : 0;
      moveBody(d, sx, sy, tune.defSpeed);
      const lx = this.ball.x - d.x;
      const ly = this.ball.y - d.y;
      const ll = hyp(lx, ly);
      if (ll > 0.1) {
        d.fx = lx / ll;
        d.fy = ly / ll;
      }
    }
    this.keeper(seen);
  }

  private keeper(seen: Snap): void {
    const gk = this.def.find((d) => d.gk);
    if (!gk) return;
    const tune = this.tune;
    const b = this.ball;
    // shot reaction: after the reaction time, dive at the point on the ball's path nearest the keeper
    const k = b.kick;
    const shot = !b.owner && k && k.kind === "shot" && b.vy < -3;
    if (shot && this.shotSeen < 0) this.shotSeen = this.step;
    if (!shot) this.shotSeen = -1;
    if (shot && (this.step - this.shotSeen) * STEP >= tune.gkReact) {
      if (gk.diveT < 0) {
        // aim at where the ball crosses the keeper's depth (or the goal line if he is on it)
        const t = Math.max(0.02, (gk.y - b.y) / b.vy);
        gk.diveX = clamp(b.x + b.vx * t, GOAL_X - GOAL_HALF - 1, GOAL_X + GOAL_HALF + 1);
        gk.diveY = gk.y;
        gk.diveT = 0;
      }
      gk.diveT += STEP;
      const dx = gk.diveX - gk.x;
      const dy = gk.diveY - gk.y;
      const dd = hyp(dx, dy);
      const v = Math.min(tune.gkDive, dd / STEP);
      if (dd > 0.001) {
        gk.x += (dx / dd) * v * STEP;
        gk.y += (dy / dd) * v * STEP;
      }
      return;
    }
    if (!shot) gk.diveT = -1;
    // positioning: on the line from the goal centre to the ball
    const bx = seen.x;
    const by = seen.y;
    const dist = hyp(bx - GOAL_X, by);
    let r = clamp(0.7 + 0.09 * dist, 0.7, 2.6);
    const carrier = seen.own >= 0 && seen.own < 10;
    if (carrier && by < BOX_D + 1 && Math.abs(bx - GOAL_X) < BOX_HALF) {
      // one on one: close the angle when no defender is between
      const between = this.def.some((d) => !d.gk && d.y < by && hyp(d.x - bx, d.y - by) < 3);
      if (!between) r = clamp(dist - 1.6, r, 5);
    }
    // loose balls into his area (crosses, lobs, balls rolling toward goal): come and collect
    let tx = GOAL_X + ((bx - GOAL_X) / Math.max(0.01, dist)) * r;
    let ty = (by / Math.max(0.01, dist)) * r;
    if (seen.own === -1 && hyp(seen.vx, seen.vy) + Math.abs(seen.vh) > 0.3) {
      for (let kk = 1; kk <= 40; kk++) {
        const p = this.predict(seen, kk * 0.05 + tune.gkReact);
        if (p.y < SIX_D + 1.5 && Math.abs(p.x - GOAL_X) < SIX_HALF + 1 && p.h < 2.6) {
          const need = (hyp(p.x - gk.x, p.y - gk.y) - 0.9) / 5.2;
          if (need <= kk * 0.05) {
            tx = p.x;
            ty = p.y;
            break;
          }
        }
        if (p.y < 0) break;
      }
    }
    ty = Math.max(0.35, ty);
    const dx = tx - gk.x;
    const dy = ty - gk.y;
    const dd = hyp(dx, dy);
    moveBody(gk, dd > 0.01 ? (dx / dd) * Math.min(1, dd / 0.8) : 0, dd > 0.01 ? (dy / dd) * Math.min(1, dd / 0.8) : 0, 5.2);
    gk.fx = 0;
    gk.fy = 1;
  }

  // ------------------------------------------------------------------ ball

  private moveBall(): void {
    const b = this.ball;
    if (b.owner) {
      const o = b.owner.team === "att" ? this.att[b.owner.i] : this.def[b.owner.i];
      const tx = o.x + o.fx * 0.55;
      const ty = o.y + o.fy * 0.55;
      b.vx = (tx - b.x) / STEP;
      b.vy = (ty - b.y) / STEP;
      b.x = tx;
      b.y = ty;
      b.h = 0;
      b.vh = 0;
      b.spin += hyp(o.vx, o.vy) * STEP * 3;
      return;
    }
    const prevY = b.y;
    const prevX = b.x;
    if (b.h > 0 || b.vh > 0) {
      b.vh -= G * STEP;
      b.h += b.vh * STEP;
      if (b.h <= 0) {
        b.h = 0;
        if (b.vh < -1.6) {
          b.vh = -b.vh * BOUNCE;
          b.vx *= 0.82;
          b.vy *= 0.82;
        } else b.vh = 0;
      }
    } else {
      const sp = hyp(b.vx, b.vy);
      if (sp > 0) {
        const ns = Math.max(0, sp - ROLL * STEP);
        b.vx *= ns / sp;
        b.vy *= ns / sp;
      }
    }
    b.x += b.vx * STEP;
    b.y += b.vy * STEP;
    b.spin += hyp(b.vx, b.vy) * STEP * 3;
    if (this.outcome) return;
    if (b.y <= 0 && prevY > 0) {
      // where the ball crossed the goal line this step
      const xc = prevX + ((0 - prevY) / (b.y - prevY)) * (b.x - prevX);
      for (const px of [GOAL_X - GOAL_HALF, GOAL_X + GOAL_HALF]) {
        if (b.h < GOAL_H && Math.abs(xc - px) < 0.22) {
          b.vy = Math.abs(b.vy) * 0.55;
          b.vx = (xc - px) * 8 + b.vx * 0.3;
          b.y = 0.13;
          b.x = xc;
          this.events.push({ type: "post" });
          return;
        }
      }
      const inX = Math.abs(xc - GOAL_X) < GOAL_HALF - 0.11;
      if (inX && b.h < GOAL_H) return this.goal();
      this.finish(inX ? "over" : b.h < GOAL_H + 1 && Math.abs(xc - GOAL_X) < GOAL_HALF + 1 ? "post-out" : "wide");
      return;
    }
    if (b.y <= 0) {
      const inX = Math.abs(b.x - GOAL_X) < GOAL_HALF - 0.11;
      if (inX && b.h < GOAL_H) return this.goal();
      this.finish(inX ? "over" : b.h < GOAL_H + 1 && Math.abs(prevX - GOAL_X) < GOAL_HALF + 1 ? "post-out" : "wide");
      return;
    }
    if (b.x < 0 || b.x > PITCH_W) this.finish("out");
    else if (b.y > PITCH_D) this.finish("lost");
  }

  private goal(): void {
    const k = this.ball.kick;
    const slot = k?.slot ?? -1;
    this.stats.scorer = slot;
    this.stats.header = !!k?.header;
    this.stats.oneTouch = !!k?.oneTouch;
    this.stats.goalStep = this.step;
    this.events.push({ type: "goal", slot });
    this.finish("goal");
  }

  private finish(o: Outcome): void {
    if (this.outcome) return;
    this.outcome = o;
    this.endStep = this.step;
    this.pending = [];
    this.events.push({ type: "end", outcome: o });
  }

  // ------------------------------------------------------------------ contacts

  private contacts(): void {
    const b = this.ball;
    // keeper saves: the ball inside his reach
    const gk = this.def.find((d) => d.gk);
    if (gk && b.owner?.team === "att" && hyp(b.x - gk.x, b.y - gk.y) < 0.7) {
      b.owner = { team: "def", i: gk.index };
      this.events.push({ type: "defball", index: gk.index, how: "claimed" });
      return this.finish("claimed");
    }
    if (gk && !b.owner) {
      const reach = gk.diveT >= 0 ? 0.55 + 0.75 * Math.min(1, gk.diveT / 0.25) : 0.62;
      if (hyp(b.x - gk.x, b.y - gk.y) < reach && b.h < 2.5 && !(b.ignore && b.ignore.slot < 0)) {
        const shot = b.kick?.kind === "shot";
        this.events.push({ type: "save", index: gk.index });
        b.vx *= -0.2;
        b.vy = Math.abs(b.vy) * 0.25;
        b.vh = 1.5;
        this.events.push({ type: "defball", index: gk.index, how: shot ? "saved" : "claimed" });
        return this.finish(shot ? "saved" : "claimed");
      }
    }
    // outfield defenders: interceptions, blocks and tackles
    for (const d of this.def) {
      if (d.gk) continue;
      if (!b.owner) {
        const dist = hyp(b.x - d.x, b.y - d.y);
        const shot = b.kick?.kind === "shot";
        if (dist < (shot ? 0.55 : DEF_REACH) && b.h < (shot ? 1.8 : 1.4)) {
          b.owner = { team: "def", i: d.index };
          this.events.push({ type: "defball", index: d.index, how: shot ? "blocked" : "intercepted" });
          return this.finish(shot ? "blocked" : "intercepted");
        }
      } else if (b.owner.team === "att") {
        const c = this.att[b.owner.i];
        // running the ball into a defender loses it
        if (hyp(b.x - d.x, b.y - d.y) < POKE) {
          b.owner = { team: "def", i: d.index };
          this.events.push({ type: "defball", index: d.index, how: "tackled" });
          return this.finish("tackled");
        }
        const dist = hyp(c.x - d.x, c.y - d.y);
        if (dist < 0.95) d.tackleT += STEP;
        else d.tackleT = Math.max(0, d.tackleT - STEP * 2);
        const need = 0.3 * (0.8 + 0.6 * c.attrs.dribbling) * this.tune.tackle;
        if (d.tackleT >= need) {
          b.owner = { team: "def", i: d.index };
          this.events.push({ type: "defball", index: d.index, how: "tackled" });
          return this.finish("tackled");
        }
      }
    }
    // attackers: first touch on a loose ball
    if (!b.owner && b.h < CONTROL_H && hyp(b.vx, b.vy) < TOUCH_MAX) {
      let best = -1;
      let bd = OWN_REACH;
      for (const a of this.att) {
        if (!a.present) continue;
        if (b.ignore && b.ignore.slot === a.slot && this.step < b.ignore.until) continue;
        const dist = hyp(b.x - a.x, b.y - a.y);
        if (dist < bd) {
          bd = dist;
          best = a.slot;
        }
      }
      if (best >= 0) this.gain(best);
    }
  }

  private gain(slot: number): void {
    const b = this.ball;
    const k = b.kick;
    if (k && k.kind !== "shot" && k.slot !== slot && this.lastPasser === k.slot) this.stats.passes++;
    b.owner = { team: "att", i: slot };
    b.kick = null;
    b.ignore = null;
    this.gainStep[slot] = this.step;
    this.stats.touched.add(slot);
    const a = this.att[slot];
    if (a.live && !this.beforePunch) this.liveTrack!.touches.push(this.step);
    this.events.push({ type: "touch", slot });
    // the ball arrives: pending kicks for this player fire now (first-time passes and shots)
    this.runPending();
  }

  // An echo that was recorded taking the ball must still get it (within 0.4 s).
  private checkParadox(): void {
    for (let i = 0; i < this.expectTouch.length; i++) {
      const list = this.expectTouch[i];
      while (list.length && this.step > list[0] + 24) {
        const s = list.shift()!;
        // missing the ball only matters if the attack was still alive when it was due
        const alive = !this.outcome || this.endStep > s;
        if (this.gainStep[i] < s - 24 && alive) this.paradox(i, "receive");
      }
    }
  }

  private paradox(slot: number, what: "kick" | "receive"): void {
    if (this.paradoxes.some((p) => p.slot === slot && Math.abs(p.step - this.step) < 30)) return;
    this.paradoxes.push({ slot, step: this.step, what });
    this.events.push({ type: "paradox", slot, what });
  }

  /** The ball starts at the feet of the first slot to be recorded, if the ball slot is absent. */
  get ballSlotAbsent(): boolean {
    return "slot" in this.level.ball && !this.att[this.level.ball.slot].present;
  }
}

// ------------------------------------------------------------------ scripted takes

// A scripted player for reference solutions: steer through keyframes, arriving on time.
export function scriptToTrack(level: LevelDef, st: ScriptTrack): Track {
  const n = steps(level);
  const slot = level.slots[st.slot];
  const attrs = attrsFor(slot.num);
  const top = maxSpeed(attrs);
  const t = emptyTrack(st.slot, n);
  const b = { x: slot.x, y: slot.y, vx: 0, vy: 0, fx: 0, fy: -1 };
  let k = 0;
  for (let s = 0; s < n; s++) {
    const now = s * STEP;
    while (k < st.keys.length && (st.keys[k].t <= now || (!st.keys[k].hold && hyp(st.keys[k].x - b.x, st.keys[k].y - b.y) < 0.15 && k < st.keys.length - 1))) k++;
    let sx = 0;
    let sy = 0;
    if (k < st.keys.length) {
      const kf = st.keys[k];
      const dx = kf.x - b.x;
      const dy = kf.y - b.y;
      const d = hyp(dx, dy);
      const left = Math.max(STEP, kf.t - now);
      const want = Math.min(top, d / left) / top;
      if (d > 0.05) {
        sx = (dx / d) * want;
        sy = (dy / d) * want;
      }
    }
    t.moves[s * 2] = Math.round(clamp(sx, -1, 1) * 127);
    t.moves[s * 2 + 1] = Math.round(clamp(sy, -1, 1) * 127);
    moveBody(b, t.moves[s * 2] / 127, t.moves[s * 2 + 1] / 127, top);
  }
  for (const a of st.acts) {
    const th = a.kind === "lob" ? (a.th ?? LOB_H) : a.kind === "shot" ? (a.th ?? 0.3) : 0;
    const c = a.power ?? 0.8;
    const speed = a.kind === "shot" ? (16 + 12 * c) * (0.88 + attrs.shooting * 0.2) : 0;
    t.actions.push({ step: Math.round(a.t / STEP), kind: a.kind, tx: q2(a.tx), ty: q2(a.ty), th: q2(th), tt: 0, speed: q2(speed), done: false });
  }
  t.actions.sort((x, y) => x.step - y.step);
  return t;
}

// Record a full solution the way a player would: one take at a time, in the given order, so that
// the touch and kick metadata (what each echo expects) is filled in exactly as in the game.
export function recordSolution(level: LevelDef, order?: number[]): (Track | null)[] {
  const tracks: (Track | null)[] = level.slots.map(() => null);
  // each solution entry is one take, in order; a slot can be taken again later (a re-record)
  const seq = order ? order.map((i) => level.solution[i]) : level.solution;
  for (const st of seq) {
    const slot = st.slot;
    const scripted = scriptToTrack(level, st);
    const sim = new TakeSim(level, tracks, slot);
    let ai = 0;
    while (!sim.done) {
      const s = sim.step;
      const sx = scripted.moves[s * 2] / 127;
      const sy = scripted.moves[s * 2 + 1] / 127;
      while (ai < scripted.actions.length && scripted.actions[ai].step === s) sim.queue({ ...scripted.actions[ai++], done: false });
      sim.advance(sx, sy);
      if (sim.step >= sim.n) break;
    }
    tracks[slot] = sim.recorded;
  }
  return tracks;
}

export function simulate(level: LevelDef, tracks: (Track | null)[]): TakeSim {
  const sim = new TakeSim(level, tracks, null);
  while (!sim.done) sim.advance();
  return sim;
}

export function starsFor(level: LevelDef, sim: TakeSim): [boolean, boolean, boolean] {
  const goal = sim.outcome === "goal";
  const check = (o: Objective): boolean => {
    if (!goal) return false;
    switch (o.kind) {
      case "time":
        return sim.stats.goalStep * STEP <= (o.value ?? 99);
      case "passes":
        return sim.stats.passes >= (o.value ?? 1);
      case "allTouch":
        return sim.att.every((a) => sim.stats.touched.has(a.slot));
      case "header":
        return sim.stats.header;
      case "oneTouch":
        return sim.stats.oneTouch;
      case "maxSlots":
        return sim.att.filter((a) => a.present).length <= (o.value ?? 5);
      case "scorer":
        return sim.stats.scorer === (o.value ?? 0);
      case "noParadox":
        return sim.paradoxes.length === 0;
    }
  };
  return [goal, check(level.stars[0]), check(level.stars[1])];
}
