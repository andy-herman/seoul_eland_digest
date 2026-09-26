// Draws a DashSim state onto a 2D canvas. The scene is a side view of the
// touchline: sky, floodlights, the Penalty Party crowd (mirror-tiled), the
// Blender ad boards and a striped pitch, all scrolling at different speeds.

import { SPRITES, type Hero, type OpponentSlug, type PlayerPoseName } from "./data";
import { BALL_R, DashSim, PLAYER_X, VIEW_W, type Obstacle, type SimEvent, type SimState } from "./sim";

export const GROUND_MARGIN = 64;
const PITCH_DROP = 80;
const BOARD_H = 52;
const STANDS_H = 190;
const STRIPE_W = 110;

export interface DashImages {
  opponents: Record<OpponentSlug, { tackle: HTMLImageElement; leap: HTMLImageElement }>;
  players: Record<Hero, Record<PlayerPoseName, HTMLImageElement>>;
  cone: HTMLImageElement;
  boards: HTMLImageElement;
  stands: HTMLImageElement;
  ball: HTMLImageElement;
  treat: Record<Hero, HTMLImageElement>;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  age: number;
  color: string;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
}

const RUN_CYCLE: PlayerPoseName[] = ["run1", "run2", "run3", "run2"];

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DashRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  viewW = VIEW_W;
  viewH = 506;
  groundY = 442;
  private standsPair: HTMLCanvasElement | null = null;
  private boardTile: HTMLCanvasElement | null = null;
  private standsTileW = (SPRITES.stands.px[0] * STANDS_H) / SPRITES.stands.px[1];
  private boardTileW = (SPRITES.boards.px[0] * BOARD_H) / SPRITES.boards.px[1];
  private popups: Popup[] = [];
  private puffs: Puff[] = [];
  private shake = 0;
  private flash = 0;
  private readonly stars: { x: number; y: number; r: number; tw: number }[];
  private readonly clouds: { x: number; y: number; s: number }[];
  private readonly rand = mulberry(20260925);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly img: DashImages,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;
    this.stars = Array.from({ length: 46 }, () => ({ x: this.rand() * 900, y: this.rand(), r: 0.7 + this.rand() * 1.5, tw: this.rand() * 6 }));
    this.clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 310 + this.rand() * 120, y: 0.15 + this.rand() * 0.55, s: 0.7 + this.rand() * 0.6 }));
  }

  /** cssW x cssH is the on-screen size; the backing store is scaled by dpr. */
  resize(cssW: number, cssH: number, dpr: number): void {
    const ratio = Math.min(dpr, 2);
    const backingW = Math.max(1, Math.round(Math.min(cssW * ratio, 2200)));
    const backingH = Math.max(1, Math.round((backingW * cssH) / cssW));
    if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
      this.canvas.width = backingW;
      this.canvas.height = backingH;
    }
    // Narrow (phone) stages zoom in so the mascots stay big. The simulation is
    // unchanged; obstacles just come into view a little later.
    this.viewW = cssW >= 600 ? VIEW_W : Math.max(700, VIEW_W - (600 - cssW) * 0.8);
    this.scale = backingW / this.viewW;
    this.viewH = (this.viewW * cssH) / cssW;
    this.groundY = this.viewH - Math.max(GROUND_MARGIN, this.viewH * 0.13);
    this.buildTiles();
  }

  private buildTiles(): void {
    const s = this.scale;
    const w = Math.ceil(this.standsTileW * s);
    const h = Math.ceil(STANDS_H * s);
    const pair = document.createElement("canvas");
    pair.width = w * 2;
    pair.height = h;
    const pc = pair.getContext("2d");
    if (pc) {
      pc.drawImage(this.img.stands, 0, 0, w, h);
      pc.save();
      pc.translate(w * 2, 0);
      pc.scale(-1, 1);
      pc.drawImage(this.img.stands, 0, 0, w, h);
      pc.restore();
    }
    this.standsPair = pair;
    const board = document.createElement("canvas");
    board.width = Math.ceil(this.boardTileW * s);
    board.height = Math.ceil(BOARD_H * s);
    board.getContext("2d")?.drawImage(this.img.boards, 0, 0, board.width, board.height);
    this.boardTile = board;
  }

  onEvent(e: SimEvent, state: SimState): void {
    const g = this.groundY;
    switch (e.type) {
      case "treat":
        this.popups.push({ text: "+25", x: e.x, y: g - e.y - 40, age: 0, color: "#ffe38a" });
        break;
      case "land":
        this.dust(PLAYER_X - 10, g, 5, 1);
        break;
      case "slide":
        this.dust(PLAYER_X + 10, g, 6, 1.4);
        break;
      case "milestone":
        this.popups.push({ text: `${e.meters} m`, x: PLAYER_X + 40, y: g - 170, age: 0, color: "#ffffff" });
        break;
      case "crash":
        this.shake = 0.32;
        this.flash = 1;
        this.dust(PLAYER_X + 20, g, 12, 2.2);
        break;
      default:
        break;
    }
    void state;
  }

  private dust(x: number, y: number, count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      this.puffs.push({
        x: x + (this.rand() - 0.5) * 30,
        y: y - 4,
        vx: -60 - this.rand() * 140 * power,
        vy: -30 - this.rand() * 60 * power,
        age: 0,
        life: 0.35 + this.rand() * 0.3,
        r: 4 + this.rand() * 6,
      });
    }
  }

  draw(state: SimState, dt: number): void {
    const { ctx } = this;
    const s = this.scale;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.shake > 0) {
      const k = this.shake * 18;
      ctx.translate((this.rand() - 0.5) * k, (this.rand() - 0.5) * k);
    }
    const scroll = state.dist;
    const night = state.night;
    const g = this.groundY;
    const pitchTop = g - PITCH_DROP;
    const boardsTop = pitchTop - BOARD_H;
    const standsTop = boardsTop + 22 - STANDS_H;

    this.drawSky(standsTop + 30, night, state.time);
    this.drawClouds(scroll, standsTop, night);
    this.drawFloodlights(scroll, standsTop, night);

    // Crowd, mirror-tiled so every joint is seamless.
    if (this.standsPair) {
      const pairW = this.standsTileW * 2;
      let x = -((scroll * 0.3) % pairW);
      while (x < this.viewW) {
        ctx.drawImage(this.standsPair, x, standsTop, pairW + 0.5, STANDS_H);
        x += pairW;
      }
    }
    if (night > 0) {
      ctx.fillStyle = `rgba(6, 9, 32, ${0.55 * night})`;
      ctx.fillRect(0, standsTop - 20, this.viewW, STANDS_H + 20);
    }

    // Ad boards (LED boards stay bright at night).
    if (this.boardTile) {
      let x = -((scroll * 0.8) % this.boardTileW);
      while (x < this.viewW) {
        ctx.drawImage(this.boardTile, x, boardsTop, this.boardTileW + 0.5, BOARD_H);
        x += this.boardTileW;
      }
    }

    this.drawPitch(scroll, pitchTop, night);
    this.drawLightPools(scroll, pitchTop, night);

    for (const t of state.treats) this.drawTreat(state.hero, t.x, g - t.y, t.age);
    const obstacles = [...state.obstacles].sort((a, b) => Number(a.kind === "leap") - Number(b.kind === "leap"));
    for (const o of obstacles) this.drawObstacleShadow(o, g);
    for (const o of obstacles) if (o.kind !== "leap") this.drawObstacle(o, g, state);
    this.drawPlayer(state, g);
    for (const o of obstacles) if (o.kind === "leap") this.drawObstacle(o, g, state);

    this.drawEffects(dt);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * this.flash})`;
      ctx.fillRect(-20, -20, this.viewW + 40, this.viewH + 40);
    }
  }

  private drawSky(horizon: number, night: number, time: number): void {
    const { ctx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#3d9fe8");
    sky.addColorStop(1, "#b7e5fb");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, this.viewW + 40, horizon + 40);
    if (night > 0) {
      const dark = ctx.createLinearGradient(0, 0, 0, horizon);
      dark.addColorStop(0, "#070b24");
      dark.addColorStop(1, "#23336f");
      ctx.globalAlpha = night;
      ctx.fillStyle = dark;
      ctx.fillRect(-20, -20, this.viewW + 40, horizon + 40);
      ctx.fillStyle = "#fff8dc";
      for (const star of this.stars) {
        ctx.globalAlpha = night * (0.55 + 0.45 * Math.sin(time * 2 + star.tw));
        ctx.beginPath();
        ctx.arc(star.x, star.y * (horizon - 40), star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawClouds(scroll: number, standsTop: number, night: number): void {
    const { ctx } = this;
    const span = 1860;
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 1 - 0.78 * night;
    for (const c of this.clouds) {
      let x = (c.x - scroll * 0.05) % span;
      if (x < -200) x += span;
      const y = 26 + c.y * Math.max(40, standsTop - 90);
      const s = c.s * 28;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.arc(x + s * 1.1, y - s * 0.45, s * 1.25, 0, Math.PI * 2);
      ctx.arc(x + s * 2.3, y, s * 0.95, 0, Math.PI * 2);
      ctx.rect(x, y, s * 2.3, s * 0.95);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloodlights(scroll: number, standsTop: number, night: number): void {
    const { ctx } = this;
    const every = 1250;
    const offset = scroll * 0.2;
    const first = Math.floor((offset - 200) / every);
    for (let i = first; i < first + 3; i++) {
      const x = i * every - offset + 520;
      if (x < -120 || x > this.viewW + 120) continue;
      const headY = standsTop - 118;
      ctx.fillStyle = "#1a1d2b";
      ctx.fillRect(x - 8, headY + 30, 16, 128);
      ctx.fillStyle = "#8d96ad";
      ctx.fillRect(x - 5, headY + 30, 10, 128);
      ctx.fillStyle = "#1a1d2b";
      this.roundRect(x - 44, headY - 12, 88, 52, 12);
      ctx.fill();
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          const lx = x - 26 + c * 26;
          const ly = headY + 2 + r * 24;
          if (night > 0) {
            const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 40);
            glow.addColorStop(0, `rgba(255, 246, 200, ${0.55 * night})`);
            glow.addColorStop(1, "rgba(255, 246, 200, 0)");
            ctx.fillStyle = glow;
            ctx.fillRect(lx - 40, ly - 40, 80, 80);
          }
          ctx.fillStyle = night > 0.5 ? "#fffbe6" : "#f4f6fb";
          ctx.beginPath();
          ctx.arc(lx, ly, 9.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawPitch(scroll: number, pitchTop: number, night: number): void {
    const { ctx } = this;
    ctx.fillStyle = "#6ab45c";
    ctx.fillRect(-20, pitchTop, this.viewW + 40, this.viewH - pitchTop + 20);
    ctx.fillStyle = "#79c267";
    let x = -(scroll % (STRIPE_W * 2));
    while (x < this.viewW) {
      ctx.fillRect(x, pitchTop, STRIPE_W, this.viewH - pitchTop + 20);
      x += STRIPE_W * 2;
    }
    const shade = ctx.createLinearGradient(0, pitchTop, 0, pitchTop + 18);
    shade.addColorStop(0, "rgba(10, 30, 20, 0.22)");
    shade.addColorStop(1, "rgba(10, 30, 20, 0)");
    ctx.fillStyle = shade;
    ctx.fillRect(-20, pitchTop, this.viewW + 40, 18);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillRect(-20, pitchTop + 20, this.viewW + 40, 4);
    if (night > 0) {
      ctx.fillStyle = `rgba(6, 12, 34, ${0.34 * night})`;
      ctx.fillRect(-20, pitchTop, this.viewW + 40, this.viewH - pitchTop + 20);
    }
  }

  private drawLightPools(scroll: number, pitchTop: number, night: number): void {
    if (night <= 0) return;
    const { ctx } = this;
    const every = 1250;
    const offset = scroll * 0.2;
    const first = Math.floor((offset - 200) / every);
    ctx.globalCompositeOperation = "lighter";
    for (let i = first; i < first + 3; i++) {
      const x = i * every - offset + 520;
      const cy = (pitchTop + this.viewH) / 2;
      const pool = ctx.createRadialGradient(x, cy, 10, x, cy, 330);
      pool.addColorStop(0, `rgba(90, 90, 60, ${0.3 * night})`);
      pool.addColorStop(1, "rgba(90, 90, 60, 0)");
      ctx.fillStyle = pool;
      ctx.fillRect(x - 340, pitchTop, 680, this.viewH - pitchTop);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawTreat(hero: Hero, x: number, bottom: number, age: number): void {
    const { ctx } = this;
    const image = this.img.treat[hero];
    const size = 36;
    const bob = Math.sin(age * 5) * 3;
    ctx.fillStyle = "rgba(20, 30, 20, 0.16)";
    ctx.beginPath();
    ctx.ellipse(x, this.groundY + 2, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const glow = ctx.createRadialGradient(x, bottom - size / 2 + bob, 4, x, bottom - size / 2 + bob, 30);
    glow.addColorStop(0, "rgba(255, 240, 160, 0.55)");
    glow.addColorStop(1, "rgba(255, 240, 160, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 30, bottom - size / 2 + bob - 30, 60, 60);
    const w = (size * image.naturalWidth) / Math.max(1, image.naturalHeight);
    ctx.drawImage(image, x - w / 2, bottom - size + bob, w, size);
  }

  private drawObstacleShadow(o: Obstacle, g: number): void {
    const { ctx } = this;
    const lift = o.kind === "leap" ? Math.min(1, o.fly / 200) : 0;
    ctx.fillStyle = `rgba(15, 30, 20, ${0.24 - lift * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(o.x + o.w * 0.5, g + 2, o.w * (0.42 - lift * 0.12), 6 - lift * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawObstacle(o: Obstacle, g: number, state: SimState): void {
    const { ctx } = this;
    if (o.kind === "cone") {
      ctx.drawImage(this.img.cone, o.x, g - o.h + 2, o.w, o.h);
      return;
    }
    const slug = o.slug as OpponentSlug;
    const image = this.img.opponents[slug][o.kind];
    if (o.kind === "leap") {
      const bob = Math.sin(o.age * 6) * 4;
      const cx = o.x + o.w / 2;
      const cy = g - o.fly - o.h / 2 + bob;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.05 + Math.sin(o.age * 3) * 0.04);
      ctx.drawImage(image, -o.w / 2, -o.h / 2, o.w, o.h);
      ctx.restore();
      return;
    }
    // Slide tackle: a little shudder and a spray of grass behind.
    if (!state.over || o !== state.crashedBy) {
      ctx.fillStyle = "rgba(226, 244, 214, 0.55)";
      for (let k = 0; k < 3; k++) {
        const phase = (o.age * 3 + k / 3) % 1;
        ctx.globalAlpha = (1 - phase) * 0.8;
        ctx.beginPath();
        ctx.arc(o.x + o.w * 0.92 + phase * 46 + k * 6, g - 6 - phase * 14, 4 + phase * 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (slug === "daegu-fc") {
      const r = o.h / 2;
      const turn = -(o.age * (state.speed + o.vx)) / r;
      ctx.save();
      ctx.translate(o.x + o.w / 2, g - r);
      ctx.rotate(turn);
      ctx.drawImage(image, -o.w / 2, -o.h / 2, o.w, o.h);
      ctx.restore();
      return;
    }
    const shudder = Math.sin(o.age * 40) * 0.8;
    ctx.drawImage(image, o.x, g - o.h + 3 + shudder, o.w, o.h);
  }

  private drawPlayer(state: SimState, g: number): void {
    const { ctx } = this;
    const p = state.player;
    const hero = state.hero;
    const frames = this.img.players[hero];
    let pose: PlayerPoseName;
    if (p.pose === "fall") pose = "fall";
    else if (p.pose === "jump") pose = "jump";
    else if (p.pose === "slide") pose = "slide";
    else pose = RUN_CYCLE[Math.floor(p.runPhase) % RUN_CYCLE.length];
    const metric = SPRITES.players[hero][pose];
    const image = frames[pose];

    // Shadows for hero and ball.
    const lift = Math.min(1, p.y / 220);
    ctx.fillStyle = `rgba(15, 30, 20, ${0.26 - lift * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(PLAYER_X + 4, g + 2, (metric.w * 0.36) * (1 - lift * 0.4), 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const b = state.ball;
    const ballLift = Math.min(1, b.y / 220);
    ctx.fillStyle = `rgba(15, 30, 20, ${0.22 - ballLift * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(b.x, g + 2, BALL_R * (1 - ballLift * 0.4), 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const squash = p.pose === "run" ? Math.max(0, 1 - p.landTime / 0.12) * 0.08 : 0;
    const sink = p.pose === "slide" ? 7 : p.pose === "fall" ? 4 : 0;
    const w = metric.w * (1 + squash);
    const h = metric.h * (1 - squash);
    const x = PLAYER_X - w / 2;
    const y = g - p.y - h + sink;
    ctx.drawImage(image, x, y, w, h);

    // The ball: frame 0 of the Penalty Party ball sheet, spun in 2D.
    ctx.save();
    ctx.translate(b.x, g - b.y - BALL_R);
    ctx.rotate(b.spin);
    ctx.drawImage(this.img.ball, 0, 0, 256, 256, -BALL_R - 1, -BALL_R - 1, BALL_R * 2 + 2, BALL_R * 2 + 2);
    ctx.restore();
  }

  private drawEffects(dt: number): void {
    const { ctx } = this;
    ctx.fillStyle = "rgba(236, 246, 226, 0.8)";
    for (const d of this.puffs) {
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 160 * dt;
      const k = d.age / d.life;
      if (k >= 1) continue;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (1 + k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.puffs = this.puffs.filter((d) => d.age < d.life);

    ctx.textAlign = "center";
    ctx.font = "900 26px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    for (const p of this.popups) {
      p.age += dt;
      const k = p.age / 0.9;
      if (k >= 1) continue;
      ctx.globalAlpha = 1 - k * k;
      const y = p.y - k * 40;
      ctx.strokeStyle = "#0b1752";
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, y);
    }
    ctx.globalAlpha = 1;
    this.popups = this.popups.filter((p) => p.age < 0.9);
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Test hook: the hitboxes the simulation uses, drawn on top. */
  debugBoxes(state: SimState, sim: DashSim): void {
    const { ctx } = this;
    const g = this.groundY;
    ctx.lineWidth = 2;
    const box = sim.playerBox();
    ctx.strokeStyle = "#00e5ff";
    ctx.strokeRect(box.x0, g - box.y1, box.x1 - box.x0, box.y1 - box.y0);
    ctx.strokeStyle = "#ff3355";
    for (const o of state.obstacles) {
      const b = DashSim.obstacleBox(o);
      ctx.strokeRect(b.x0, g - b.y1, b.x1 - b.x0, b.y1 - b.y0);
    }
  }
}
