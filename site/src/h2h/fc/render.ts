// Broadcast-camera renderer for the FC match: a pinhole camera on the near side of the pitch,
// panning along x with the ball. Ground rows keep a constant depth z, so players and posts stay
// upright and are depth-sorted by z. Heights are drawn with a small arcade exaggeration (V).
import { MASCOT_METRICS, OPPONENTS, PLAYER_METRICS, type OpponentSlug } from "../data";
import {
  BOX_DEPTH,
  BOX_W,
  CIRCLE_R,
  GOAL_DEPTH,
  GOAL_H,
  GOAL_W,
  PEN_SPOT,
  PITCH_L,
  PITCH_W,
  SIX_DEPTH,
  SIX_W,
  type FcEvent,
  type FcEventType,
  type FcPlayer,
  type FcState,
  type Side,
} from "./types";

const V = 1.5; // vertical exaggeration for everything above the grass
const CHAR_H = 1.8 * V; // idle sprite height in draw metres
const BALL_R = 0.3; // drawn ball radius in metres (real 0.11, enlarged for readability)
const LINE_W = 0.13;
const CAM_D = 60; // camera distance in front of the near touchline
const NEAR_POST = PITCH_W / 2 - GOAL_W / 2;
const FAR_POST = PITCH_W / 2 + GOAL_W / 2;
const SRC_GRASS_ROW = 853; // stadium renders: first grass row under the running track
const SRC_W = 1920;
const INK = "#111a33";
const GOLD = "#ffd64a";

type Box = [number, number, number, number];

export type FcAspect = "wide" | "square" | "tall";

export interface FcRenderImages {
  strips: (HTMLImageElement | undefined)[]; // home players by engine index
  stripKeys: string[]; // PLAYER_METRICS keys such as "7-home"
  mascot?: HTMLImageElement;
  stadium?: HTMLImageElement;
}

export interface FcRenderLabels {
  banner: Partial<Record<FcEventType, string>>;
  goal: string;
  homeNames: string[]; // short display names by engine index
  homeNums: number[];
  rivalName: string;
}

interface DepthItem {
  z: number;
  draw: () => void;
}

interface Banner {
  text: string;
  t: number;
  life: number;
  color: string;
}

export class FcRenderer {
  private W = 1600;
  private H = 900;
  private F = 3560;
  private Hc = 25.8;
  private yH = -668;
  private camX = PITCH_L / 2;
  private camReady = false;
  private dpr = 1;
  private aspect: FcAspect = "wide";
  private stride = new Float32Array(10);
  private face = new Int8Array(10).fill(1);
  private banner: Banner | null = null;
  private scorer: { side: Side; index: number } | null = null;
  private lastKicker: Record<Side, number> = { home: 1, away: 1 };
  private controlFlash = 0;
  private lastControlled = -1;
  private time = 0;
  private netKick = { home: 0, away: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly images: FcRenderImages,
    private readonly labels: FcRenderLabels,
    private readonly opponent: OpponentSlug,
  ) {}

  get view(): FcAspect {
    return this.aspect;
  }

  // width is the CSS width to use; portrait phones get the square or tall (4:5) camera.
  resize(cssWidth: number, aspect: FcAspect): { width: number; height: number } {
    const width = Math.max(240, Math.floor(cssWidth));
    this.aspect = aspect;
    const height = Math.round(width * (aspect === "tall" ? 1.25 : aspect === "square" ? 1 : 9 / 16));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.style.aspectRatio = `${width} / ${height}`;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    if (aspect === "tall") this.setCamera(1200, 1500, 4300, 1440, 430);
    else if (aspect === "square") this.setCamera(1200, 1200, 4300, 1150, 350);
    else this.setCamera(1600, 900, 3560, 862, 250);
    this.camReady = false;
    return { width, height };
  }

  private setCamera(W: number, H: number, F: number, yNear: number, yFar: number): void {
    this.W = W;
    this.H = H;
    this.F = F;
    const s0 = F / CAM_D;
    const s1 = F / (CAM_D + PITCH_W);
    this.Hc = (yNear - yFar) / (s0 - s1);
    this.yH = yNear - this.Hc * s0;
  }

  // portrait cameras draw characters and the ball a little larger for small screens
  private get k(): number {
    return this.aspect === "wide" ? 1 : 1.16;
  }

  private s(z: number): number {
    return this.F / (CAM_D + z);
  }

  private X(x: number, z: number): number {
    return this.W / 2 + (x - this.camX) * this.s(z);
  }

  private Y(z: number, h = 0): number {
    return this.yH + (this.Hc - h * V) * this.s(z);
  }

  // Events feed banners, the goal scorer and the net bulge; call once per engine step.
  onEvents(events: FcEvent[], state: FcState): void {
    for (const ev of events) {
      if ((ev.type === "shot" || ev.type === "kick" || ev.type === "header" || ev.type === "pass" || ev.type === "lob" || ev.type === "through") && ev.side && ev.index !== undefined) this.lastKicker[ev.side] = ev.index;
      if (ev.type === "goal" && ev.side) {
        this.scorer = { side: ev.side, index: this.lastKicker[ev.side] };
        this.netKick[ev.side] = 1;
        this.showBanner(this.labels.goal, 2.4, GOLD);
        continue;
      }
      const text = this.labels.banner[ev.type];
      if (!text) continue;
      if (ev.type === "save" || ev.type === "catch") this.showBanner(text, 1.1, "#9ee7ff");
      else if (ev.type === "post") this.showBanner(text, 1.1, "#ffffff");
      else if (ev.type === "halftime" || ev.type === "fulltime") this.showBanner(text, 2.2, GOLD);
      else if (ev.type === "penalty") this.showBanner(text, 1.8, "#ff8a65");
      else if (ev.type === "kickoff" && state.elapsed < 0.1) this.showBanner(text, 1.3, "#ffffff");
      else if (ev.type !== "kickoff") this.showBanner(text, 1.5, "#ffffff");
    }
  }

  private showBanner(text: string, life: number, color: string): void {
    if (this.banner && this.banner.text === this.labels.goal && this.banner.t < this.banner.life && text !== this.labels.goal) return;
    this.banner = { text, t: 0, life, color };
  }

  draw(state: FcState, dt: number): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    this.time += dt;
    this.updateCamera(state, dt);
    ctx.setTransform(this.canvas.width / this.W, 0, 0, this.canvas.height / this.H, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    this.stands(ctx);
    this.ground(ctx);
    this.lines(ctx);
    this.nets(ctx, state);
    this.shadows(ctx, state);

    const items: DepthItem[] = [];
    state.players.forEach((p, i) => items.push({ z: p.z, draw: () => this.player(ctx, p, i, state, dt) }));
    const hold = this.ballHold(state);
    items.push({ z: hold ? hold.z - 0.05 : state.ball.z, draw: () => this.ball(ctx, state, hold) });
    for (const gx of [0, PITCH_L]) {
      items.push({ z: FAR_POST, draw: () => this.post(ctx, gx, FAR_POST) });
      items.push({ z: NEAR_POST, draw: () => this.post(ctx, gx, NEAR_POST) });
      for (let k = 0; k < 3; k++) {
        const z0 = NEAR_POST + (GOAL_W / 3) * k;
        items.push({ z: z0 + GOAL_W / 6, draw: () => this.bar(ctx, gx, z0, z0 + GOAL_W / 3) });
      }
    }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();

    this.markers(ctx, state);
    this.setPieceAim(ctx, state);
    this.radar(ctx, state);
    this.offscreenBall(ctx, state);
    this.goalFx(ctx, state);
    this.bannerFx(ctx, dt);
  }

  private updateCamera(state: FcState, dt: number): void {
    const b = state.ball;
    const hw = (this.W / 2) / this.s(0);
    const lo = hw - 5;
    const hi = PITCH_L - hw + 5;
    let target = b.x + Math.max(-4, Math.min(4, b.vx * 0.22));
    const sp = state.setPiece;
    if (sp && state.phase === "restart") target = sp.type === "corner" || sp.type === "penalty" ? (sp.spotX + (sp.side === "home" ? PITCH_L - 9 : 9)) / 2 : sp.spotX + (sp.aimX - sp.spotX) * 0.3;
    target = Math.max(lo, Math.min(hi, target));
    if (!this.camReady) {
      this.camX = target;
      this.camReady = true;
    } else {
      const k = 1 - Math.exp(-dt * (state.phase === "play" ? 3.2 : 2));
      this.camX += (target - this.camX) * k;
    }
  }

  private stands(ctx: CanvasRenderingContext2D): void {
    const bottom = this.Y(PITCH_W + 3.2);
    const img = this.images.stadium;
    const sky = ctx.createLinearGradient(0, 0, 0, bottom);
    sky.addColorStop(0, "#8fd0ff");
    sky.addColorStop(1, "#d9f0ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.W, bottom + 2);
    if (!img) {
      ctx.fillStyle = "#2a3561";
      ctx.fillRect(0, bottom * 0.25, this.W, bottom * 0.75);
      return;
    }
    const k = (this.W * 1.5) / SRC_W;
    const srcTop = Math.max(0, SRC_GRASS_ROW - bottom / k);
    const drawH = (SRC_GRASS_ROW - srcTop) * k;
    const bandW = SRC_W * k;
    const hw = (this.W / 2) / this.s(0);
    const range = Math.max(1, PITCH_L - 2 * (hw - 5));
    const par = Math.min(this.s(PITCH_W + 8), (bandW - this.W) / range);
    const x0 = this.W / 2 - bandW / 2 - (this.camX - PITCH_L / 2) * par;
    ctx.drawImage(img, 0, srcTop, SRC_W, SRC_GRASS_ROW - srcTop, x0, bottom - drawH, bandW, drawH);
  }

  private quad(ctx: CanvasRenderingContext2D, pts: [number, number, number][]): void {
    ctx.beginPath();
    pts.forEach(([x, z, h], i) => {
      const px = this.X(x, z);
      const py = this.Y(z, h);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  }

  private ground(ctx: CanvasRenderingContext2D): void {
    const top = this.Y(PITCH_W + 3.2);
    ctx.fillStyle = "#3f9442";
    ctx.fillRect(0, top, this.W, this.H - top);
    const zNear = -8;
    const zFar = PITCH_W + 3.2;
    for (let i = -3; i < PITCH_L / 4 + 3; i++) {
      const x0 = i * 4;
      const x1 = x0 + 4;
      if (this.X(x1, zNear) < -50 && this.X(x1, zFar) < -50) continue;
      if (this.X(x0, zNear) > this.W + 50 && this.X(x0, zFar) > this.W + 50) continue;
      const inside = x0 >= 0 && x1 <= PITCH_L;
      ctx.fillStyle = inside ? (i % 2 === 0 ? "#5cb85a" : "#52ad50") : i % 2 === 0 ? "#4c9f4a" : "#469a45";
      this.quad(ctx, [[x0, zNear, 0], [x1, zNear, 0], [x1, zFar, 0], [x0, zFar, 0]]);
      ctx.fill();
    }
    // darker verge beyond the touchlines
    ctx.fillStyle = "rgba(20,60,25,.12)";
    this.quad(ctx, [[-20, PITCH_W + 0.6, 0], [PITCH_L + 20, PITCH_W + 0.6, 0], [PITCH_L + 20, zFar, 0], [-20, zFar, 0]]);
    ctx.fill();
    this.quad(ctx, [[-20, zNear, 0], [PITCH_L + 20, zNear, 0], [PITCH_L + 20, -0.6, 0], [-20, -0.6, 0]]);
    ctx.fill();
  }

  private seg(ctx: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number): void {
    ctx.lineWidth = Math.max(1.3, LINE_W * this.s((z0 + z1) / 2));
    ctx.beginPath();
    ctx.moveTo(this.X(x0, z0), this.Y(z0));
    ctx.lineTo(this.X(x1, z1), this.Y(z1));
    ctx.stroke();
  }

  private arc(ctx: CanvasRenderingContext2D, cx: number, cz: number, r: number, a0: number, a1: number): void {
    const n = 40;
    ctx.lineWidth = Math.max(1.3, LINE_W * this.s(cz));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(this.X(x, z), this.Y(z));
      else ctx.lineTo(this.X(x, z), this.Y(z));
    }
    ctx.stroke();
  }

  private lines(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineCap = "round";
    const L = PITCH_L;
    const W = PITCH_W;
    this.seg(ctx, 0, 0, L, 0);
    this.seg(ctx, 0, W, L, W);
    this.seg(ctx, 0, 0, 0, W);
    this.seg(ctx, L, 0, L, W);
    this.seg(ctx, L / 2, 0, L / 2, W);
    this.arc(ctx, L / 2, W / 2, CIRCLE_R, 0, Math.PI * 2);
    const bz0 = W / 2 - BOX_W / 2;
    const bz1 = W / 2 + BOX_W / 2;
    const sz0 = W / 2 - SIX_W / 2;
    const sz1 = W / 2 + SIX_W / 2;
    for (const [gx, dir] of [[0, 1], [L, -1]] as const) {
      const bx = gx + dir * BOX_DEPTH;
      const sx = gx + dir * SIX_DEPTH;
      this.seg(ctx, gx, bz0, bx, bz0);
      this.seg(ctx, bx, bz0, bx, bz1);
      this.seg(ctx, bx, bz1, gx, bz1);
      this.seg(ctx, gx, sz0, sx, sz0);
      this.seg(ctx, sx, sz0, sx, sz1);
      this.seg(ctx, sx, sz1, gx, sz1);
      const px = gx + dir * PEN_SPOT;
      const lim = Math.acos((BOX_DEPTH - PEN_SPOT) / 6);
      if (dir === 1) this.arc(ctx, px, W / 2, 6, -lim, lim);
      else this.arc(ctx, px, W / 2, 6, Math.PI - lim, Math.PI + lim);
      this.spot(ctx, px, W / 2, 0.2);
      this.arc(ctx, gx, 0, 1, dir === 1 ? 0 : Math.PI / 2, dir === 1 ? Math.PI / 2 : Math.PI);
      this.arc(ctx, gx, W, 1, dir === 1 ? -Math.PI / 2 : Math.PI, dir === 1 ? 0 : Math.PI * 1.5);
    }
    this.spot(ctx, L / 2, W / 2, 0.24);
    ctx.restore();
  }

  private spot(ctx: CanvasRenderingContext2D, x: number, z: number, r: number): void {
    const s = this.s(z);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.beginPath();
    ctx.ellipse(this.X(x, z), this.Y(z), r * s, r * s * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private nets(ctx: CanvasRenderingContext2D, state: FcState): void {
    for (const side of ["home", "away"] as const) this.netKick[side] = Math.max(0, this.netKick[side] - 0.02);
    const drawNet = (gx: number, dir: 1 | -1, bulge: number) => {
      const back = gx + dir * (GOAL_DEPTH + bulge * 0.5);
      const top = GOAL_H * 0.82;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = Math.max(1, 0.04 * this.s(20));
      const panels: [number, number, number][][] = [
        [[back, NEAR_POST, 0], [back, FAR_POST, 0], [back, FAR_POST, top], [back, NEAR_POST, top]],
        [[gx, NEAR_POST, GOAL_H], [gx, FAR_POST, GOAL_H], [back, FAR_POST, top], [back, NEAR_POST, top]],
        [[gx, FAR_POST, 0], [back, FAR_POST, 0], [back, FAR_POST, top], [gx, FAR_POST, GOAL_H]],
        [[gx, NEAR_POST, 0], [back, NEAR_POST, 0], [back, NEAR_POST, top], [gx, NEAR_POST, GOAL_H]],
      ];
      for (const pts of panels) {
        this.quad(ctx, pts);
        ctx.fill();
      }
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const z = NEAR_POST + (GOAL_W * i) / 8;
        ctx.moveTo(this.X(back, z), this.Y(z, 0));
        ctx.lineTo(this.X(back, z), this.Y(z, top));
        ctx.lineTo(this.X(gx, z), this.Y(z, GOAL_H));
      }
      for (let j = 1; j <= 4; j++) {
        const h = (top * j) / 4;
        ctx.moveTo(this.X(back, NEAR_POST), this.Y(NEAR_POST, h));
        ctx.lineTo(this.X(back, FAR_POST), this.Y(FAR_POST, h));
      }
      for (const z of [NEAR_POST, FAR_POST]) {
        for (let j = 1; j <= 3; j++) {
          const f = j / 4;
          ctx.moveTo(this.X(gx + (back - gx) * f, z), this.Y(z, 0));
          ctx.lineTo(this.X(gx + (back - gx) * f, z), this.Y(z, GOAL_H + (top - GOAL_H) * f));
        }
      }
      ctx.stroke();
      ctx.restore();
    };
    const ballIn = state.phase === "goal" ? (state.ball.x > PITCH_L / 2 ? "home" : "away") : null;
    drawNet(0, -1, ballIn === "away" ? this.netKick.away : 0);
    drawNet(PITCH_L, 1, ballIn === "home" ? this.netKick.home : 0);
  }

  private post(ctx: CanvasRenderingContext2D, gx: number, z: number): void {
    const s = this.s(z);
    const x = this.X(gx, z);
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3, 0.2 * s);
    ctx.beginPath();
    ctx.moveTo(x, this.Y(z, 0));
    ctx.lineTo(x, this.Y(z, GOAL_H));
    ctx.stroke();
    ctx.strokeStyle = "#f9fbff";
    ctx.lineWidth = Math.max(2, 0.13 * s);
    ctx.stroke();
    ctx.restore();
  }

  private bar(ctx: CanvasRenderingContext2D, gx: number, z0: number, z1: number): void {
    ctx.save();
    ctx.lineCap = "round";
    const s = this.s((z0 + z1) / 2);
    ctx.beginPath();
    ctx.moveTo(this.X(gx, z0), this.Y(z0, GOAL_H));
    ctx.lineTo(this.X(gx, z1), this.Y(z1, GOAL_H));
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3, 0.2 * s);
    ctx.stroke();
    ctx.strokeStyle = "#f9fbff";
    ctx.lineWidth = Math.max(2, 0.13 * s);
    ctx.stroke();
    ctx.restore();
  }

  private shadows(ctx: CanvasRenderingContext2D, state: FcState): void {
    ctx.save();
    ctx.fillStyle = "#0b1f12";
    for (const p of state.players) {
      const s = this.s(p.z);
      const lying = p.anim === "slide" || p.anim === "fallen" || p.anim === "dive";
      const k = 1 / (1 + p.h * 0.5);
      ctx.globalAlpha = 0.24 * k;
      ctx.beginPath();
      ctx.ellipse(this.X(p.x, p.z), this.Y(p.z), (lying ? 1.2 : 0.62) * s * k, 0.2 * s * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const b = state.ball;
    const s = this.s(b.z);
    const k = 1 / (1 + b.h * 0.35);
    ctx.globalAlpha = 0.3 * k;
    ctx.beginPath();
    ctx.ellipse(this.X(b.x, b.z), this.Y(b.z), BALL_R * 1.15 * s * k, BALL_R * 0.42 * s * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private sheet(p: FcPlayer): { img?: HTMLImageElement; boxes?: Box[]; natural: 1 | -1 } {
    if (p.side === "home") {
      const meta = PLAYER_METRICS.players[this.images.stripKeys[p.index] ?? ""];
      return { img: this.images.strips[p.index], boxes: meta?.boxes, natural: PLAYER_METRICS.facing === "left" ? -1 : 1 };
    }
    return { img: this.images.mascot, boxes: MASCOT_METRICS.clubs[this.opponent]?.boxes, natural: -1 };
  }

  private player(ctx: CanvasRenderingContext2D, p: FcPlayer, i: number, state: FcState, dt: number): void {
    const speed = Math.hypot(p.vx, p.vz);
    this.stride[i] = (this.stride[i] + dt * (0.9 + speed * 0.62)) % 2;
    if (p.fx > 0.25) this.face[i] = 1;
    else if (p.fx < -0.25) this.face[i] = -1;
    const facing = this.face[i];
    const s = this.s(p.z);
    const fx = this.X(p.x, p.z);
    const fy = this.Y(p.z, p.h);
    const { img, boxes, natural } = this.sheet(p);
    const mascot = p.side === "away";
    const taker = state.phase === "restart" && state.setPiece && state.setPiece.side === p.side && state.setPiece.taker === p.index;
    const throwIn = taker && state.setPiece?.type === "throwin";
    let frame = 2;
    let rot = 0;
    let lift = 0;
    let sink = 0;
    switch (p.anim) {
      case "run":
      case "sprint":
        frame = this.stride[i] < 1 ? 0 : 1;
        break;
      case "kick":
      case "tackle":
      case "slide":
        frame = 4;
        if (p.anim === "slide" && !mascot) sink = 0.05;
        break;
      case "header":
        frame = 3;
        lift = Math.max(0, Math.sin(Math.min(1, p.animT / 0.45) * Math.PI)) * 0.45;
        break;
      case "dive":
        frame = 3;
        rot = (mascot ? 0.25 : 0.85) * (p.diveDir === 1 ? -1 : 1) * facing;
        lift = 0.25;
        break;
      case "fallen":
        frame = 3;
        rot = mascot ? 0 : -1.35 * facing;
        sink = mascot ? 0.12 : 0.28;
        break;
      case "celebrate":
        frame = 5;
        lift = Math.abs(Math.sin(this.time * 7 + i)) * 0.35;
        break;
      case "throw":
        frame = 5;
        break;
      case "sad":
        frame = 2;
        rot = 0.07 * facing;
        break;
      default:
        frame = speed > 0.25 ? (this.stride[i] < 1 ? 0 : 1) : 2;
    }
    if (throwIn) frame = 5;
    if (!img || !boxes) {
      this.placeholder(ctx, p, fx, fy, s);
      return;
    }
    const idle = boxes[2] ?? [70, 70, 240, 300];
    let scale = (CHAR_H * this.k * s) / idle[3];
    scale = Math.min(scale, (2.4 * V * this.k * s) / Math.max(1, idle[2]));
    if (mascot) scale *= 0.97;
    const cell = mascot ? MASCOT_METRICS.cell : PLAYER_METRICS.cell;
    const foot = mascot ? MASCOT_METRICS.foot : PLAYER_METRICS.foot;
    const bob = p.anim === "idle" ? Math.sin(this.time * 3 + i * 1.7) * 0.02 : 0;
    ctx.save();
    ctx.translate(fx, fy - (lift + bob) * V * s + sink * s);
    if (rot) ctx.rotate(rot);
    if (p.anim === "sprint") ctx.rotate(0.06 * facing);
    if (facing !== natural) ctx.scale(-1, 1);
    if (p.stunT > 0 && p.anim !== "fallen" && Math.floor(this.time * 12) % 2 === 0) ctx.globalAlpha = 0.72;
    ctx.drawImage(img, frame * cell, 0, cell, cell, -(cell / 2) * scale, -foot * scale, cell * scale, cell * scale);
    ctx.restore();
  }

  private placeholder(ctx: CanvasRenderingContext2D, p: FcPlayer, x: number, y: number, s: number): void {
    ctx.save();
    ctx.fillStyle = p.side === "home" ? "#1b2446" : OPPONENTS[this.opponent].color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - 0.45 * s, y - CHAR_H * s, 0.9 * s, CHAR_H * s, 0.3 * s);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Keeper holding the ball, or a thrower with it above the head: draw it in the hands.
  private ballHold(state: FcState): { x: number; z: number; h: number } | null {
    const sp = state.setPiece;
    if (state.phase === "restart" && sp?.type === "throwin") {
      const p = state.players[(sp.side === "home" ? 0 : 5) + sp.taker];
      return { x: p.x, z: p.z - 0.02, h: (CHAR_H * this.k) / V + 0.05 };
    }
    const o = state.ball.owner;
    if (o && o.index === 0) {
      const p = state.players[(o.side === "home" ? 0 : 5)];
      if (p.anim === "hold" || p.anim === "idle" || p.anim === "run") return { x: p.x + this.face[o.side === "home" ? 0 : 5] * 0.32, z: p.z - 0.05, h: 1.05 };
    }
    return null;
  }

  private ball(ctx: CanvasRenderingContext2D, state: FcState, hold: { x: number; z: number; h: number } | null): void {
    const b = hold ? { ...state.ball, ...hold } : state.ball;
    const s = this.s(b.z);
    const r = BALL_R * this.k * s;
    const x = this.X(b.x, b.z);
    const y = this.Y(b.z, b.h) - r * 0.95;
    const speed = Math.hypot(state.ball.vx, state.ball.vz, state.ball.vh);
    if (!hold && speed > 14 && !state.ball.owner) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#ffffff";
      for (let i = 1; i <= 3; i++) {
        const t = i * 0.012;
        const zx = b.z - state.ball.vz * t;
        ctx.beginPath();
        ctx.arc(this.X(b.x - state.ball.vx * t, zx), this.Y(zx, b.h - state.ball.vh * t) - r * 0.95, r * (1 - i * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.spin * (state.ball.vx >= 0 ? 1 : -1) * 0.5);
    soccerBall(ctx, r);
    ctx.restore();
  }

  private headY(p: FcPlayer): number {
    return this.Y(p.z, p.h) - CHAR_H * this.k * this.s(p.z) * 1.02;
  }

  private markers(ctx: CanvasRenderingContext2D, state: FcState): void {
    if (state.controlled !== this.lastControlled) {
      this.lastControlled = state.controlled;
      this.controlFlash = 1.2;
    }
    this.controlFlash = Math.max(0, this.controlFlash - 1 / 60);
    const inPlay = state.phase === "play" || state.phase === "restart";
    if (state.passTarget !== null && state.ball.owner?.side === "home" && state.phase === "play") {
      const t = state.players[state.passTarget];
      if (t) {
        const s = this.s(t.z);
        ctx.save();
        ctx.setLineDash([0.25 * s, 0.18 * s]);
        ctx.strokeStyle = "rgba(255,255,255,.85)";
        ctx.lineWidth = Math.max(2, 0.07 * s);
        ctx.beginPath();
        ctx.ellipse(this.X(t.x, t.z), this.Y(t.z), 0.72 * s, 0.26 * s, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    const sp = state.setPiece;
    const takerIndex = state.phase === "restart" && sp && sp.side === "home" ? sp.taker : state.controlled;
    const c = state.players[takerIndex];
    if (!c || !inPlay) return;
    const s = this.s(c.z);
    const x = this.X(c.x, c.z);
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.max(2.5, 0.1 * s);
    ctx.beginPath();
    ctx.ellipse(x, this.Y(c.z), 0.78 * s, 0.28 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    const hy = this.headY(c) - 0.15 * s;
    ctx.fillStyle = GOLD;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, 0.06 * s);
    ctx.beginPath();
    ctx.moveTo(x, hy);
    ctx.lineTo(x - 0.26 * s, hy - 0.34 * s);
    ctx.lineTo(x + 0.26 * s, hy - 0.34 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const label = `${this.labels.homeNums[takerIndex] ?? ""} ${this.labels.homeNames[takerIndex] ?? ""}`.trim();
    const fs = Math.max(15, 0.4 * s);
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const ty = hy - 0.42 * s;
    ctx.globalAlpha = 0.55 + Math.min(1, this.controlFlash) * 0.45;
    ctx.lineWidth = fs * 0.28;
    ctx.strokeStyle = INK;
    ctx.strokeText(label, x, ty);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x, ty);
    ctx.globalAlpha = 1;
    if (state.charge > 0 && state.chargeKind) {
      const bw = 1.7 * s;
      const bh = Math.max(7, 0.2 * s);
      const by = ty - fs - bh - 0.1 * s;
      ctx.fillStyle = "rgba(17,26,51,.85)";
      ctx.beginPath();
      ctx.roundRect(x - bw / 2 - 3, by - 3, bw + 6, bh + 6, bh);
      ctx.fill();
      const grad = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
      grad.addColorStop(0, "#6ee7b7");
      grad.addColorStop(0.7, GOLD);
      grad.addColorStop(1, "#ef4444");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x - bw / 2, by, Math.max(bh, bw * state.charge), bh, bh / 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - bw / 2 + bw * 0.85, by - 2);
      ctx.lineTo(x - bw / 2 + bw * 0.85, by + bh + 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private setPieceAim(ctx: CanvasRenderingContext2D, state: FcState): void {
    const sp = state.setPiece;
    if (!sp || state.phase !== "restart" || sp.side !== "home") return;
    const pulse = 0.8 + Math.sin(this.time * 6) * 0.2;
    const aerial = sp.type === "corner" || sp.type === "goalkick" || (sp.type === "freekick" && !sp.direct);
    ctx.save();
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = "rgba(255,255,255,.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    const n = 24;
    const peak = aerial ? Math.min(6, 1.2 + Math.hypot(sp.aimX - sp.spotX, sp.aimZ - sp.spotZ) * 0.14) : 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = sp.spotX + (sp.aimX - sp.spotX) * t;
      const z = sp.spotZ + (sp.aimZ - sp.spotZ) * t;
      const h = peak * 4 * t * (1 - t);
      if (i === 0) ctx.moveTo(this.X(x, z), this.Y(z, h));
      else ctx.lineTo(this.X(x, z), this.Y(z, h));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const s = this.s(sp.aimZ);
    const x = this.X(sp.aimX, sp.aimZ);
    const y = sp.type === "penalty" ? this.Y(sp.aimZ, 0.9) : this.Y(sp.aimZ);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.max(3, 0.09 * s);
    ctx.beginPath();
    if (sp.type === "penalty") ctx.arc(x, y, 0.55 * s * pulse, 0, Math.PI * 2);
    else ctx.ellipse(x, y, 1.1 * s * pulse, 0.4 * s * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 0.5 * s, y);
    ctx.lineTo(x + 0.5 * s, y);
    ctx.moveTo(x, y - (sp.type === "penalty" ? 0.5 : 0.2) * s);
    ctx.lineTo(x, y + (sp.type === "penalty" ? 0.5 : 0.2) * s);
    ctx.stroke();
    ctx.restore();
  }

  private radar(ctx: CanvasRenderingContext2D, state: FcState): void {
    const w = this.aspect === "wide" ? 210 : 250;
    const h = w * (PITCH_W / PITCH_L);
    const x0 = this.W - w - 20;
    const y0 = 18;
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = "rgba(10,40,20,.72)";
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x0 - 6, y0 - 6, w + 12, h + 12, 10);
    ctx.fill();
    ctx.strokeRect(x0, y0, w, h);
    ctx.beginPath();
    ctx.moveTo(x0 + w / 2, y0);
    ctx.lineTo(x0 + w / 2, y0 + h);
    ctx.stroke();
    const bw = (BOX_DEPTH / PITCH_L) * w;
    const bh = (BOX_W / PITCH_W) * h;
    ctx.strokeRect(x0, y0 + (h - bh) / 2, bw, bh);
    ctx.strokeRect(x0 + w - bw, y0 + (h - bh) / 2, bw, bh);
    const hw = (this.W / 2) / this.s(PITCH_W / 2);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    const vx0 = Math.max(0, ((this.camX - hw) / PITCH_L) * w);
    const vx1 = Math.min(w, ((this.camX + hw) / PITCH_L) * w);
    ctx.fillRect(x0 + vx0, y0, vx1 - vx0, h);
    const dot = (px: number, pz: number, r: number, fill: string, stroke = "#ffffff") => {
      ctx.beginPath();
      ctx.arc(x0 + (px / PITCH_L) * w, y0 + h - (pz / PITCH_W) * h, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    };
    const rival = OPPONENTS[this.opponent].color;
    state.players.forEach((p, i) => {
      if (p.side === "home") dot(p.x, p.z, i === state.controlled ? 6.5 : 5, i === state.controlled ? GOLD : "#1b2446", i === state.controlled ? INK : "#ffffff");
      else dot(p.x, p.z, 5, rival, "#ffffff");
    });
    dot(state.ball.x, state.ball.z, 3.6, "#ffffff", INK);
    ctx.restore();
  }

  private offscreenBall(ctx: CanvasRenderingContext2D, state: FcState): void {
    const b = state.ball;
    const y = this.Y(b.z, b.h) - BALL_R * this.s(b.z) * 2;
    if (y > 4) return;
    const x = Math.max(30, Math.min(this.W - 30, this.X(b.x, b.z)));
    ctx.save();
    ctx.fillStyle = GOLD;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.lineTo(x - 17, 42);
    ctx.lineTo(x + 17, 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private goalFx(ctx: CanvasRenderingContext2D, state: FcState): void {
    if (state.phase !== "goal" || !state.lastScorer) return;
    const side = state.lastScorer;
    const t = state.phaseT;
    ctx.save();
    ctx.fillStyle = `rgba(11,16,38,${Math.min(0.28, t * 0.6)})`;
    ctx.fillRect(0, 0, this.W, this.H);
    const color = side === "home" ? GOLD : OPPONENTS[this.opponent].color;
    for (let i = 0; i < 80; i++) {
      const cx = ((i * 137.5) % this.W) + Math.sin(this.time * 2 + i) * 18;
      const cy = ((i * 71 + t * (180 + (i % 7) * 40)) % (this.H + 40)) - 20;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(i + this.time * 3);
      ctx.fillStyle = i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? color : "#1b2446";
      ctx.fillRect(-7, -3, 14, 6);
      ctx.restore();
    }
    const who = this.scorer && this.scorer.side === side ? this.scorer : null;
    const name = side === "home" ? `${this.labels.homeNums[who?.index ?? 1] ?? ""} ${this.labels.homeNames[who?.index ?? 1] ?? ""}`.trim() : this.labels.rivalName;
    const fs = this.aspect === "wide" ? 40 : 50;
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    const tw = ctx.measureText(name).width + 48;
    const y = this.H * (this.aspect === "wide" ? 0.44 : 0.4);
    ctx.fillStyle = side === "home" ? "#1b2446" : color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(this.W / 2 - tw / 2, y, tw, fs * 1.5, fs * 0.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, this.W / 2, y + fs * 0.78);
    ctx.restore();
  }

  private bannerFx(ctx: CanvasRenderingContext2D, dt: number): void {
    const b = this.banner;
    if (!b) return;
    b.t += dt;
    if (b.t > b.life) {
      this.banner = null;
      return;
    }
    const big = b.text === this.labels.goal;
    const inT = Math.min(1, b.t / 0.18);
    const outT = Math.min(1, (b.life - b.t) / 0.25);
    const k = Math.min(inT, outT);
    const wide = this.aspect === "wide";
    const fs = (big ? (wide ? 130 : 150) : wide ? 56 : 66) * (big ? 1 + (1 - inT) * 0.6 + Math.sin(this.time * 11) * 0.03 : 1);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.font = `1000 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const y = big ? this.H * 0.28 : this.H * 0.16;
    if (!big) {
      const tw = ctx.measureText(b.text).width + fs * 1.1;
      ctx.fillStyle = "rgba(17,26,51,.82)";
      ctx.beginPath();
      ctx.roundRect(this.W / 2 - tw / 2, y - fs * 0.72, tw, fs * 1.44, fs * 0.72);
      ctx.fill();
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, this.W / 2, y + fs * 0.04);
    } else {
      ctx.lineWidth = fs * 0.12;
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
      ctx.strokeText(b.text, this.W / 2, y);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, this.W / 2, y);
    }
    ctx.restore();
  }
}

function soccerBall(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.fillStyle = "#f8fafc";
  ctx.strokeStyle = "#1a1a24";
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#111827";
  polygon(ctx, 0, 0, r * 0.36, 5, -Math.PI / 2);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    polygon(ctx, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * 0.2, 5, a);
    ctx.fill();
  }
}

function polygon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + i * Math.PI * 2 / sides;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
