// Take Five renderer: a top-down tactics board in Canvas 2D. The goal is at the top. Echo takes
// show their routes and kick markers, the live player gets the aiming reticle, and the ball has a
// shadow so lobs and headers read clearly.
import { GOAL_HALF, GOAL_X, BOX_D, BOX_HALF, PEN_SPOT, PITCH_D, PITCH_W, SIX_D, SIX_HALF, STEP, type ActKind, type Outcome, type SimEvent, type TakeSim, type Track } from "./engine";

export interface AttView {
  x: number;
  y: number;
  fx: number;
  fy: number;
  kickT: number;
  present: boolean;
  live: boolean;
}
export interface DefView {
  x: number;
  y: number;
  fx: number;
  fy: number;
  gk: boolean;
  diveT: number;
  diveX: number;
  diveY: number;
  tackleT: number;
}
export interface FrameView {
  step: number;
  bx: number;
  by: number;
  bh: number;
  owner: number; // attacker slot holding the ball, -1 otherwise
  att: AttView[];
  def: DefView[];
}

const ATT_F = 6;
const DEF_F = 8;

/** A whole simulated attack stored step by step, so the board can scrub and play it back. */
export class Recording {
  readonly n: number;
  readonly na: number;
  readonly nd: number;
  readonly buf: Float32Array;
  readonly events: SimEvent[][];
  outcome: Outcome | null = null;
  endStep = -1;
  private readonly stride: number;
  constructor(n: number, na: number, nd: number) {
    this.n = n;
    this.na = na;
    this.nd = nd;
    this.stride = 4 + na * ATT_F + nd * DEF_F;
    this.buf = new Float32Array((n + 1) * this.stride);
    this.events = Array.from({ length: n + 1 }, () => []);
  }
  capture(sim: TakeSim): void {
    const s = Math.min(sim.step, this.n);
    const o = s * this.stride;
    const b = this.buf;
    b[o] = sim.ball.x;
    b[o + 1] = sim.ball.y;
    b[o + 2] = sim.ball.h;
    b[o + 3] = sim.ball.owner?.team === "att" ? sim.ball.owner.i : -1;
    let k = o + 4;
    for (const a of sim.att) {
      b[k] = a.x;
      b[k + 1] = a.y;
      b[k + 2] = a.fx;
      b[k + 3] = a.fy;
      b[k + 4] = a.kickT;
      b[k + 5] = (a.present ? 1 : 0) + (a.live ? 2 : 0);
      k += ATT_F;
    }
    for (const d of sim.def) {
      b[k] = d.x;
      b[k + 1] = d.y;
      b[k + 2] = d.fx;
      b[k + 3] = d.fy;
      b[k + 4] = d.diveT;
      b[k + 5] = d.diveX;
      b[k + 6] = d.diveY;
      b[k + 7] = d.tackleT;
      k += DEF_F;
    }
    if (sim.events.length) this.events[s] = [...sim.events];
    if (sim.outcome && this.endStep < 0) {
      this.outcome = sim.outcome;
      this.endStep = sim.endStep;
    }
  }
  /** Last step that was captured (the sim stops 70 steps after the attack ends). */
  last = 0;
  frame(step: number, gk: boolean[]): FrameView {
    const s = Math.max(0, Math.min(step, this.last));
    const o = s * this.stride;
    const b = this.buf;
    const att: AttView[] = [];
    const def: DefView[] = [];
    let k = o + 4;
    for (let i = 0; i < this.na; i++, k += ATT_F) att.push({ x: b[k], y: b[k + 1], fx: b[k + 2], fy: b[k + 3], kickT: b[k + 4], present: (b[k + 5] & 1) === 1, live: (b[k + 5] & 2) === 2 });
    for (let i = 0; i < this.nd; i++, k += DEF_F) def.push({ x: b[k], y: b[k + 1], fx: b[k + 2], fy: b[k + 3], gk: gk[i], diveT: b[k + 4], diveX: b[k + 5], diveY: b[k + 6], tackleT: b[k + 7] });
    return { step: s, bx: b[o], by: b[o + 1], bh: b[o + 2], owner: b[o + 3], att, def };
  }
}

export function viewOf(sim: TakeSim): FrameView {
  return {
    step: sim.step,
    bx: sim.ball.x,
    by: sim.ball.y,
    bh: sim.ball.h,
    owner: sim.ball.owner?.team === "att" ? sim.ball.owner.i : -1,
    att: sim.att.map((a) => ({ x: a.x, y: a.y, fx: a.fx, fy: a.fy, kickT: a.kickT, present: a.present, live: a.live })),
    def: sim.def.map((d) => ({ x: d.x, y: d.y, fx: d.fx, fy: d.fy, gk: d.gk, diveT: d.diveT, diveX: d.diveX, diveY: d.diveY, tackleT: d.tackleT })),
  };
}

export interface Aim {
  kind: ActKind;
  charge: number;
  x: number;
  y: number;
  h: number;
  snap: number;
}

export interface DrawState {
  frame: FrameView;
  paths: (Float32Array | null)[]; // echo routes, 2 floats per step
  tracks: (Track | null)[];
  selected: number;
  live: number | null;
  aim: Aim | null;
  paradoxes: { slot: number; step: number; what: "kick" | "receive" }[];
  showRoutes: boolean;
  dim: boolean; // darken the board (menus and countdowns over it)
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  big: boolean;
}

const KIT = "#1b2446";
const GOLD = "#ffc23a";
const KIND_COLOR: Record<ActKind, string> = { pass: "#ffffff", lob: "#8fd8ff", shot: "#ffc23a" };

export class BoardRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private pitch: HTMLCanvasElement | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private scale = 10;
  private ox = 0;
  private oy = 0;
  private readonly heads = new Map<string, HTMLImageElement>();
  private attHeads: (HTMLImageElement | null)[] = [];
  private defHead: HTMLImageElement | null = null;
  private defColor = "#c8102e";
  private nums: number[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private shake = 0;
  private flash = 0;
  private netRipple = 0;
  private netX = GOAL_X;
  private last = performance.now();
  // the world rectangle kept in view: a little room above the goal line for the goal itself
  private readonly view = { x0: -1.2, x1: PITCH_W + 1.2, y0: -3.4, y1: PITCH_D + 0.8 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: { heads: string; mascots: string },
  ) {
    this.ctx = canvas.getContext("2d")!;
  }

  private img(src: string): HTMLImageElement {
    let im = this.heads.get(src);
    if (!im) {
      im = new Image();
      im.decoding = "async";
      im.src = src;
      this.heads.set(src, im);
    }
    return im;
  }

  setCast(nums: number[], opponent: string, color: string): void {
    this.nums = nums;
    this.attHeads = nums.map((n) => this.img(`${this.assets.heads}${n}.webp`));
    this.defHead = this.img(`${this.assets.mascots}${opponent}.webp`);
    this.defColor = color;
    this.particles = [];
    this.floaters = [];
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (w === this.w && h === this.h && dpr === this.dpr && this.pitch) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = w;
    this.canvas.height = h;
    const vw = this.view.x1 - this.view.x0;
    const vh = this.view.y1 - this.view.y0;
    this.scale = Math.min(w / vw, h / vh);
    this.ox = (w - vw * this.scale) / 2 - this.view.x0 * this.scale;
    // spare height goes mostly below the board (more grass), a little above (the stand)
    this.oy = (h - vh * this.scale) * 0.18 - this.view.y0 * this.scale;
    this.pitch = this.paintPitch();
  }

  /** Screen (CSS pixel) position to world coordinates, for tapping players. */
  toWorld(cx: number, cy: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const px = (cx - r.left) * this.dpr;
    const py = (cy - r.top) * this.dpr;
    return { x: (px - this.ox) / this.scale, y: (py - this.oy) / this.scale };
  }

  get tokenR(): number {
    return Math.max(0.95 * this.scale, 13 * this.dpr);
  }

  private sx(x: number): number {
    return this.ox + x * this.scale;
  }
  private sy(y: number): number {
    return this.oy + y * this.scale;
  }

  private paintPitch(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext("2d")!;
    const s = this.scale;
    // surround: grass all the way to the canvas edges, with a dark stand behind the goal
    g.fillStyle = "#246f3d";
    g.fillRect(0, 0, this.w, this.h);
    const top = this.sy(-2.9);
    const stand = g.createLinearGradient(0, 0, 0, Math.max(1, top));
    stand.addColorStop(0, "#0b1238");
    stand.addColorStop(1, "#1b2446");
    g.fillStyle = stand;
    g.fillRect(0, 0, this.w, Math.max(0, top));
    // advertising boards along the top of the grass
    g.fillStyle = "#ffc23a";
    g.fillRect(0, top - Math.max(2, 0.18 * s), this.w, Math.max(2, 0.18 * s));
    // mown stripes, continuing past the edges of the board
    const first = Math.floor((-2.9 + 1) / 3) - 1;
    const last = Math.ceil(((this.h - this.oy) / s + 1) / 3) + 1;
    for (let i = first; i <= last; i++) {
      const ya = Math.max(top, this.sy(-1 + i * 3));
      const yb = this.sy(-1 + (i + 1) * 3);
      if (yb <= top) continue;
      g.fillStyle = ((i % 2) + 2) % 2 ? "#2f8a4c" : "#2a7f45";
      g.fillRect(0, ya, this.w, yb - ya + 1);
    }
    // chalk lines
    g.strokeStyle = "rgba(255,255,255,.9)";
    g.lineWidth = Math.max(1.5, 0.14 * s);
    g.lineJoin = "round";
    const line = (pts: [number, number][]) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(this.sx(x), this.sy(y)) : g.moveTo(this.sx(x), this.sy(y))));
      g.stroke();
    };
    line([[0, PITCH_D + 0.5], [0, 0], [PITCH_W, 0], [PITCH_W, PITCH_D + 0.5]]);
    line([[GOAL_X - BOX_HALF, 0], [GOAL_X - BOX_HALF, BOX_D], [GOAL_X + BOX_HALF, BOX_D], [GOAL_X + BOX_HALF, 0]]);
    line([[GOAL_X - SIX_HALF, 0], [GOAL_X - SIX_HALF, SIX_D], [GOAL_X + SIX_HALF, SIX_D], [GOAL_X + SIX_HALF, 0]]);
    g.fillStyle = "rgba(255,255,255,.9)";
    g.beginPath();
    g.arc(this.sx(GOAL_X), this.sy(PEN_SPOT), Math.max(2, 0.2 * s), 0, Math.PI * 2);
    g.fill();
    // the D
    const dy = BOX_D - PEN_SPOT;
    const a = Math.acos(dy / 7.5);
    g.beginPath();
    g.arc(this.sx(GOAL_X), this.sy(PEN_SPOT), 7.5 * s, Math.PI / 2 - a, Math.PI / 2 + a);
    g.stroke();
    // corner arcs
    g.beginPath();
    g.arc(this.sx(0), this.sy(0), 1 * s, 0, Math.PI / 2);
    g.stroke();
    g.beginPath();
    g.arc(this.sx(PITCH_W), this.sy(0), 1 * s, Math.PI / 2, Math.PI);
    g.stroke();
    // centre circle peeking in at the bottom (halfway is just past the edge of the board)
    g.beginPath();
    g.arc(this.sx(GOAL_X), this.sy(PITCH_D + 2.5), 9.15 * s, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
    // goal: net box above the line
    const gx0 = this.sx(GOAL_X - GOAL_HALF);
    const gx1 = this.sx(GOAL_X + GOAL_HALF);
    const gy0 = this.sy(-2.1);
    const gy1 = this.sy(0);
    g.fillStyle = "rgba(255,255,255,.12)";
    g.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    g.strokeStyle = "rgba(255,255,255,.35)";
    g.lineWidth = Math.max(1, 0.05 * s);
    for (let x = GOAL_X - GOAL_HALF; x <= GOAL_X + GOAL_HALF + 0.01; x += 0.5) {
      g.beginPath();
      g.moveTo(this.sx(x), gy0);
      g.lineTo(this.sx(x), gy1);
      g.stroke();
    }
    for (let y = -2.1; y <= 0.01; y += 0.5) {
      g.beginPath();
      g.moveTo(gx0, this.sy(y));
      g.lineTo(gx1, this.sy(y));
      g.stroke();
    }
    g.strokeStyle = "#ffffff";
    g.lineWidth = Math.max(2.5, 0.24 * s);
    g.beginPath();
    g.moveTo(gx0, gy1);
    g.lineTo(gx0, gy0);
    g.lineTo(gx1, gy0);
    g.lineTo(gx1, gy1);
    g.stroke();
    // soft vignette
    const vg = g.createRadialGradient(this.w / 2, this.h * 0.45, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h * 0.5, Math.max(this.w, this.h) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.28)");
    g.fillStyle = vg;
    g.fillRect(0, 0, this.w, this.h);
    return c;
  }

  /** Spawn effects for a step's events. */
  onEvents(events: SimEvent[], f: FrameView, outcomeText: (o: Outcome) => string): void {
    for (const e of events) {
      if (e.type === "kick") this.puff(f.bx, f.by, e.kind === "shot" ? 10 : 5, "rgba(255,255,255,.8)");
      else if (e.type === "goal") {
        this.netRipple = 1;
        this.netX = f.bx;
        this.flash = 1;
        this.shake = 0.5;
        for (let i = 0; i < 70; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 3 + Math.random() * 9;
          this.particles.push({ x: f.bx, y: 0.2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp + 4, life: 1.6, max: 1.6, color: [GOLD, "#ffffff", "#58c6ff", "#ff6b6b"][i % 4], size: 0.25 + Math.random() * 0.25 });
        }
        this.floaters.push({ x: GOAL_X, y: 7, text: outcomeText("goal"), life: 2.2, color: GOLD, big: true });
      } else if (e.type === "save") {
        this.shake = 0.25;
        this.floaters.push({ x: f.bx, y: Math.max(2.5, f.by + 1.5), text: outcomeText("saved"), life: 1.8, color: "#ffffff", big: false });
      } else if (e.type === "post") {
        this.shake = 0.3;
        this.puff(f.bx, f.by, 8, "rgba(255,255,255,.9)");
      } else if (e.type === "defball") {
        if (e.how !== "saved") {
          this.puff(f.bx, f.by, 8, "rgba(255,120,120,.9)");
          this.floaters.push({ x: f.bx, y: f.by - 1.4, text: outcomeText(e.how), life: 1.8, color: "#ffb3b3", big: false });
        }
      } else if (e.type === "end" && e.outcome !== "goal") {
        const shown = this.floaters.some((x) => x.life > 1.2);
        if (!shown) this.floaters.push({ x: Math.min(PITCH_W - 6, Math.max(6, f.bx)), y: Math.max(3, f.by - 1.4), text: outcomeText(e.outcome), life: 1.8, color: "#ffffff", big: false });
      }
    }
  }

  clearFx(): void {
    this.particles = [];
    this.floaters = [];
    this.netRipple = 0;
    this.flash = 0;
    this.shake = 0;
  }

  private puff(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      this.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.45, max: 0.45, color, size: 0.18 + Math.random() * 0.12 });
    }
  }

  draw(st: DrawState): void {
    if (!this.pitch) this.resize();
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const g = this.ctx;
    const s = this.scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const m = this.shake * 0.35 * s;
      g.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    g.drawImage(this.pitch!, 0, 0);
    const f = st.frame;
    const R = this.tokenR;

    // net ripple after a goal
    if (this.netRipple > 0) {
      this.netRipple = Math.max(0, this.netRipple - dt * 0.8);
      g.save();
      g.globalAlpha = this.netRipple;
      g.fillStyle = "rgba(255,230,140,.35)";
      const cx = this.sx(Math.max(GOAL_X - GOAL_HALF, Math.min(GOAL_X + GOAL_HALF, this.netX)));
      g.beginPath();
      g.ellipse(cx, this.sy(-1.1), (1 + (1 - this.netRipple) * 3) * s, 1 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // echo routes and kick markers
    if (st.showRoutes) {
      for (let i = 0; i < st.paths.length; i++) {
        const p = st.paths[i];
        if (!p || st.live === i) continue;
        const selected = st.selected === i;
        const n = p.length / 2 - 1;
        const cur = Math.min(f.step, n);
        g.lineCap = "round";
        g.lineJoin = "round";
        // walked part
        g.strokeStyle = selected ? "rgba(255,226,120,.55)" : "rgba(255,255,255,.28)";
        g.lineWidth = Math.max(1.5, 0.16 * s);
        g.setLineDash([]);
        g.beginPath();
        for (let k = 0; k <= cur; k += 3) {
          const X = this.sx(p[k * 2]);
          const Y = this.sy(p[k * 2 + 1]);
          k ? g.lineTo(X, Y) : g.moveTo(X, Y);
        }
        g.stroke();
        // to come
        g.strokeStyle = selected ? "rgba(255,226,120,.95)" : "rgba(255,255,255,.7)";
        g.setLineDash([0.5 * s, 0.45 * s]);
        g.beginPath();
        for (let k = cur; k <= n; k += 3) {
          const X = this.sx(p[k * 2]);
          const Y = this.sy(p[k * 2 + 1]);
          k === cur ? g.moveTo(X, Y) : g.lineTo(X, Y);
        }
        g.stroke();
        g.setLineDash([]);
        const tr = st.tracks[i];
        if (tr) {
          for (const a of tr.actions) {
            const k = Math.min(a.step, n);
            const X = this.sx(p[k * 2]);
            const Y = this.sy(p[k * 2 + 1]);
            const future = a.step >= f.step;
            g.globalAlpha = future ? 1 : 0.35;
            // aim line to the target
            if (future && a.kind !== "shot") {
              g.strokeStyle = a.kind === "lob" ? "rgba(143,216,255,.55)" : "rgba(255,255,255,.45)";
              g.lineWidth = Math.max(1, 0.08 * s);
              g.setLineDash([0.25 * s, 0.35 * s]);
              g.beginPath();
              g.moveTo(X, Y);
              if (a.kind === "lob") g.quadraticCurveTo((X + this.sx(a.tx)) / 2, (Y + this.sy(a.ty)) / 2 - 2.5 * s, this.sx(a.tx), this.sy(a.ty));
              else g.lineTo(this.sx(a.tx), this.sy(a.ty));
              g.stroke();
              g.setLineDash([]);
              g.beginPath();
              g.arc(this.sx(a.tx), this.sy(a.ty), 0.3 * s, 0, Math.PI * 2);
              g.stroke();
            }
            g.fillStyle = KIND_COLOR[a.kind];
            g.strokeStyle = KIT;
            g.lineWidth = Math.max(1.5, 0.12 * s);
            g.beginPath();
            if (a.kind === "shot") this.star(X, Y, 0.55 * s);
            else g.arc(X, Y, 0.38 * s, 0, Math.PI * 2);
            g.fill();
            g.stroke();
            // countdown to the kick
            const left = (a.step - f.step) * STEP;
            if (future && left < 2.5) {
              g.fillStyle = "#fff";
              g.font = `900 ${Math.max(10 * this.dpr, 0.75 * s)}px system-ui, sans-serif`;
              g.textAlign = "center";
              g.textBaseline = "bottom";
              g.strokeStyle = "rgba(11,18,56,.85)";
              g.lineWidth = Math.max(2, 0.18 * s);
              const txt = left.toFixed(1);
              g.strokeText(txt, X, Y - 0.55 * s);
              g.fillText(txt, X, Y - 0.55 * s);
            }
            g.globalAlpha = 1;
          }
        }
      }
    }

    // paradox markers
    for (const px of st.paradoxes) {
      const p = st.paths[px.slot];
      const k = p ? Math.min(px.step, p.length / 2 - 1) : 0;
      const X = p ? this.sx(p[k * 2]) : this.sx(f.att[px.slot]?.x ?? 0);
      const Y = p ? this.sy(p[k * 2 + 1]) : this.sy(f.att[px.slot]?.y ?? 0);
      const pulse = 0.85 + 0.15 * Math.sin(now / 160);
      g.fillStyle = "#ff4d5e";
      g.strokeStyle = "#fff";
      g.lineWidth = Math.max(1.5, 0.12 * s);
      g.beginPath();
      const r = 0.75 * s * pulse;
      g.moveTo(X, Y - r - 0.9 * s);
      g.lineTo(X + r, Y + r * 0.7 - 0.9 * s);
      g.lineTo(X - r, Y + r * 0.7 - 0.9 * s);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#fff";
      g.font = `900 ${0.9 * s}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("!", X, Y - 0.78 * s);
    }

    // aim reticle for the live player
    if (st.aim && st.live !== null) {
      const a = st.aim;
      const L = f.att[st.live];
      const col = KIND_COLOR[a.kind];
      g.save();
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = Math.max(2, 0.14 * s);
      if (a.kind === "shot") {
        const X = this.sx(a.x);
        const Y = this.sy(0);
        g.setLineDash([0.4 * s, 0.3 * s]);
        g.beginPath();
        g.moveTo(this.sx(f.bx), this.sy(f.by));
        g.lineTo(X, Y);
        g.stroke();
        g.setLineDash([]);
        const hh = a.h < 0.6 ? 0.25 : a.h < 1.5 ? 0.9 : 1.6;
        g.beginPath();
        g.arc(X, this.sy(-hh), 0.45 * s, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(X - 0.8 * s, this.sy(-hh));
        g.lineTo(X + 0.8 * s, this.sy(-hh));
        g.moveTo(X, this.sy(-hh) - 0.8 * s);
        g.lineTo(X, this.sy(-hh) + 0.8 * s);
        g.stroke();
      } else {
        const X = this.sx(a.x);
        const Y = this.sy(a.y);
        g.setLineDash([0.4 * s, 0.3 * s]);
        g.beginPath();
        g.moveTo(this.sx(f.bx), this.sy(f.by));
        if (a.kind === "lob") g.quadraticCurveTo((this.sx(f.bx) + X) / 2, (this.sy(f.by) + Y) / 2 - 3 * s, X, Y);
        else g.lineTo(X, Y);
        g.stroke();
        g.setLineDash([]);
        const pulse = 1 + 0.08 * Math.sin(now / 90);
        g.beginPath();
        g.arc(X, Y, 0.9 * s * pulse, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(X, Y, 0.18 * s, 0, Math.PI * 2);
        g.fill();
        if (a.snap >= 0 && f.att[a.snap]) {
          const T = f.att[a.snap];
          g.strokeStyle = GOLD;
          g.lineWidth = Math.max(2, 0.18 * s);
          g.beginPath();
          g.arc(this.sx(T.x), this.sy(T.y), R + 0.35 * s, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // charge ring around the live player
      if (L) {
        g.strokeStyle = col;
        g.lineWidth = Math.max(3, 0.28 * s);
        g.beginPath();
        g.arc(this.sx(L.x), this.sy(L.y), R + 0.5 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.04, a.charge));
        g.stroke();
      }
      g.restore();
    }

    // shadows first so every token sits above every shadow
    const tokens: { kind: "att" | "def"; i: number; y: number }[] = [];
    f.att.forEach((a, i) => tokens.push({ kind: "att", i, y: a.y }));
    f.def.forEach((d, i) => tokens.push({ kind: "def", i, y: d.y }));
    g.fillStyle = "rgba(0,0,0,.28)";
    for (const t of tokens) {
      const p = t.kind === "att" ? f.att[t.i] : f.def[t.i];
      g.beginPath();
      g.ellipse(this.sx(p.x) + 0.18 * s, this.sy(p.y) + 0.3 * s, R * 0.95, R * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    tokens.sort((a, b) => a.y - b.y);
    for (const t of tokens) {
      if (t.kind === "def") this.drawDefender(f.def[t.i], R, now);
      else this.drawAttacker(f, t.i, R, st, now);
    }

    // ball: at a dribbler's feet it sits on the rim of his token so the face stays visible
    const bs = 1 + f.bh * 0.12;
    let bx = this.sx(f.bx);
    let by = this.sy(f.by);
    if (f.owner >= 0 && f.att[f.owner] && f.bh < 0.3) {
      const o = f.att[f.owner];
      const m = Math.hypot(o.fx, o.fy) || 1;
      bx = this.sx(o.x) + (o.fx / m) * R * 1.32;
      by = this.sy(o.y) + (o.fy / m) * R * 1.32;
    }
    g.fillStyle = "rgba(0,0,0,.35)";
    g.beginPath();
    g.ellipse(bx + f.bh * 0.25 * s, by + f.bh * 0.12 * s, 0.34 * s, 0.22 * s, 0, 0, Math.PI * 2);
    g.fill();
    const ballR = Math.max(5 * this.dpr, 0.4 * s) * bs;
    const lift = f.bh * 0.62 * s;
    g.fillStyle = "#ffffff";
    g.strokeStyle = "#111";
    g.lineWidth = Math.max(1, 0.07 * s);
    g.beginPath();
    g.arc(bx, by - lift, ballR, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#1b1b1b";
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const an = -Math.PI / 2 + (k * Math.PI * 2) / 5 + f.step * 0.08 * (f.owner >= 0 ? 0 : 1);
      const X = bx + Math.cos(an) * ballR * 0.42;
      const Y = by - lift + Math.sin(an) * ballR * 0.42;
      k ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.closePath();
    g.fill();

    // particles and floating words
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.fillRect(this.sx(p.x), this.sy(p.y), p.size * s, p.size * s);
    }
    g.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const fl of this.floaters) {
      fl.life -= dt;
      const a = Math.min(1, fl.life / 0.4);
      g.globalAlpha = Math.max(0, a);
      const size = fl.big ? Math.max(28 * this.dpr, 3.2 * s) : Math.max(13 * this.dpr, 1.2 * s);
      g.font = `900 ${size}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.strokeStyle = "#0b1238";
      g.lineWidth = size * 0.18;
      const Y = this.sy(fl.y) - (1 - Math.min(1, fl.life)) * s;
      const X = Math.min(this.w - size * 3, Math.max(size * 3, this.sx(fl.x)));
      g.strokeText(fl.text, fl.big ? this.sx(fl.x) : X, Y);
      g.fillStyle = fl.color;
      g.fillText(fl.text, fl.big ? this.sx(fl.x) : X, Y);
    }
    g.globalAlpha = 1;
    this.floaters = this.floaters.filter((x) => x.life > 0);

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2.5);
      g.fillStyle = `rgba(255,236,160,${this.flash * 0.35})`;
      g.fillRect(-20, -20, this.w + 40, this.h + 40);
    }
    if (st.dim) {
      g.fillStyle = "rgba(6,10,30,.45)";
      g.fillRect(-20, -20, this.w + 40, this.h + 40);
    }
  }

  private star(x: number, y: number, r: number): void {
    const g = this.ctx;
    for (let k = 0; k < 10; k++) {
      const an = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.45 : r;
      const X = x + Math.cos(an) * rr;
      const Y = y + Math.sin(an) * rr;
      k ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.closePath();
  }

  private drawAttacker(f: FrameView, i: number, R: number, st: DrawState, now: number): void {
    const g = this.ctx;
    const a = f.att[i];
    const X = this.sx(a.x);
    const Y = this.sy(a.y);
    const s = this.scale;
    const live = st.live === i;
    const echo = !live && !!st.paths[i];
    const selected = st.selected === i && st.live === null;
    g.save();
    if (!live && !echo) g.globalAlpha = 0.55;
    // facing wedge
    const ang = Math.atan2(a.fy, a.fx);
    g.fillStyle = live ? "#ff4d5e" : GOLD;
    g.beginPath();
    g.moveTo(X + Math.cos(ang) * (R + 0.45 * s), Y + Math.sin(ang) * (R + 0.45 * s));
    g.lineTo(X + Math.cos(ang + 0.5) * R, Y + Math.sin(ang + 0.5) * R);
    g.lineTo(X + Math.cos(ang - 0.5) * R, Y + Math.sin(ang - 0.5) * R);
    g.closePath();
    g.fill();
    // kick squash
    const k = a.kickT < 10 ? 1 + (10 - a.kickT) * 0.012 : 1;
    g.fillStyle = KIT;
    g.beginPath();
    g.arc(X, Y, R * k, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = Math.max(2, 0.16 * s);
    g.strokeStyle = live ? "#ff4d5e" : selected ? "#ffffff" : GOLD;
    g.stroke();
    const im = this.attHeads[i];
    if (im && im.complete && im.naturalWidth) {
      const hw = R * 2.05;
      const hh = hw * (im.naturalHeight / im.naturalWidth);
      g.drawImage(im, X - hw / 2, Y - hh * 0.6, hw, hh);
    }
    // number badge
    const num = String(this.nums[i] ?? "");
    const bw = Math.max(R * 0.95, num.length * R * 0.42 + R * 0.35);
    g.fillStyle = live ? "#ff4d5e" : GOLD;
    g.strokeStyle = KIT;
    g.lineWidth = Math.max(1, 0.08 * s);
    this.pill(X - bw / 2, Y + R * 0.55, bw, R * 0.62);
    g.fill();
    g.stroke();
    g.fillStyle = KIT;
    g.font = `900 ${R * 0.52}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(num, X, Y + R * 0.87);
    if (live) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 140);
      g.strokeStyle = `rgba(255,77,94,${0.35 + pulse * 0.5})`;
      g.lineWidth = Math.max(2, 0.12 * s);
      g.beginPath();
      g.arc(X, Y, R + (0.3 + pulse * 0.25) * s, 0, Math.PI * 2);
      g.stroke();
    } else if (selected) {
      g.setLineDash([0.35 * s, 0.25 * s]);
      g.strokeStyle = "#fff";
      g.lineWidth = Math.max(1.5, 0.1 * s);
      g.beginPath();
      g.arc(X, Y, R + 0.4 * s, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  }

  private drawDefender(d: DefView, R: number, now: number): void {
    const g = this.ctx;
    const s = this.scale;
    let X = this.sx(d.x);
    let Y = this.sy(d.y);
    g.save();
    let rx = R;
    let ry = R;
    let rot = 0;
    if (d.gk && d.diveT >= 0) {
      // a keeper's dive stretches him toward the ball
      const dx = d.diveX - d.x;
      const dy = d.diveY - d.y;
      rot = Math.atan2(dy, dx);
      const st = Math.min(1, d.diveT / 0.25);
      rx = R * (1 + 0.55 * st);
      ry = R * (1 - 0.18 * st);
      X += Math.cos(rot) * 0.3 * s * st;
      Y += Math.sin(rot) * 0.3 * s * st;
    }
    if (d.tackleT > 0) {
      g.strokeStyle = "rgba(255,255,255,.5)";
      g.lineWidth = Math.max(2, 0.25 * s);
      g.beginPath();
      g.moveTo(X - d.fx * 1.6 * s, Y - d.fy * 1.6 * s);
      g.lineTo(X, Y);
      g.stroke();
    }
    g.fillStyle = d.gk ? "#2b2f3a" : this.defColor;
    g.beginPath();
    g.ellipse(X, Y, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = Math.max(2, 0.16 * s);
    g.strokeStyle = d.gk ? "#c6ff3d" : "#ffffff";
    g.stroke();
    const im = this.defHead;
    if (im && im.complete && im.naturalWidth) {
      const hw = R * 2.05;
      const hh = hw * (im.naturalHeight / im.naturalWidth);
      g.drawImage(im, X - hw / 2, Y - hh * 0.62, hw, hh);
    }
    if (d.gk) {
      // gloves
      g.fillStyle = "#c6ff3d";
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(X + side * R * 1.05, Y + R * 0.2, R * 0.28, 0, Math.PI * 2);
        g.fill();
      }
    }
    void now;
    g.restore();
  }

  private pill(x: number, y: number, w: number, h: number): void {
    const g = this.ctx;
    const r = h / 2;
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(x + r, y + h);
    g.arc(x + r, y + r, r, Math.PI / 2, (Math.PI * 3) / 2);
    g.closePath();
  }

  /** Which attacker token (if any) is under a screen point. */
  hit(cx: number, cy: number, f: FrameView): number {
    const w = this.toWorld(cx, cy);
    const R = this.tokenR / this.scale + 0.4;
    let best = -1;
    let bd = Infinity;
    f.att.forEach((a, i) => {
      const d = Math.hypot(a.x - w.x, a.y - w.y);
      if (d < R && d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
}
