// Balloon Battle canvas renderer: Crazy Arcade's flat floor with front-facing
// props, painted back to front row by row. Art comes from the Blender and Kling
// atlases (96 px per tile); water streams are drawn procedurally.

import { COLS, ROWS, LINK, TR_CENTER, idx } from "./core";
import type { Game } from "./sim";
import type { Enemy } from "./enemies";
import { RARE_ITEMS, type Dir, type WorldId } from "./data";
import charsMeta from "./atlas/chars.json";
import fxMeta from "./atlas/tiles_fx.json";
import toytown from "./atlas/tiles_toytown.json";
import harbor from "./atlas/tiles_harbor.json";
import forest from "./atlas/tiles_forest.json";
import frost from "./atlas/tiles_frost.json";
import steel from "./atlas/tiles_steel.json";
import stadium from "./atlas/tiles_stadium.json";

interface Spr {
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  kind?: string;
}
type SprMap = Record<string, Spr>;

export const TILE_META: Record<WorldId, SprMap> = {
  toytown: toytown.sprites,
  harbor: harbor.sprites,
  forest: forest.sprites,
  frost: frost.sprites,
  steel: steel.sprites,
  stadium: stadium.sprites,
};
const FX: SprMap = fxMeta.sprites;
const CHARS = charsMeta as unknown as {
  cell: [number, number];
  anchor: [number, number];
  rows: Record<string, { row: number }>;
  boss: Record<string, { row: number }>;
  bossCell: [number, number];
  bossAnchor: [number, number];
};

export interface Images {
  tiles: HTMLImageElement;
  fx: HTMLImageElement;
  chars: HTMLImageElement;
  bosses?: HTMLImageElement;
}

const TOP = 0.8; // tiles of headroom above the board for tall props
const FOOT = 0.3; // characters stand a little below their tile centre
const PPT = 96;
const BELT: Record<Dir, string> = { up: "n", down: "s", right: "e", left: "w" };
const FRAME_OF: Record<Dir, number> = { down: 0, right: 2, left: 2, up: 4 };

export const BOARD_ASPECT = COLS / (ROWS + TOP);

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private T = 48; // device pixels per tile
  private ground: HTMLCanvasElement;
  private scratch: HTMLCanvasElement;
  private groundKey = "";
  private world: WorldId = "toytown";
  private meta: SprMap = TILE_META.toytown;
  shake = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private images: Images,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.ground = document.createElement("canvas");
    this.scratch = document.createElement("canvas");
  }

  setImages(images: Images, world: WorldId): void {
    this.images = images;
    this.world = world;
    this.meta = TILE_META[world];
    this.groundKey = "";
  }

  /** Fit the canvas to a CSS width; returns the CSS height used. */
  resize(cssWidth: number, dpr: number): number {
    const T = Math.max(8, Math.floor((cssWidth * dpr) / COLS));
    const w = T * COLS;
    const h = Math.round(T * (ROWS + TOP));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.groundKey = "";
    }
    this.T = T;
    return h / dpr;
  }

  // ------------------------------------------------------------ sprite helpers

  private tile(name: string, cx: number, cy: number, scale = 1, alpha = 1): void {
    const s = this.meta[name] ?? FX[name];
    if (!s) return;
    const img = this.meta[name] ? this.images.tiles : this.images.fx;
    const k = (this.T / PPT) * scale;
    const a = this.ctx.globalAlpha;
    if (alpha !== 1) this.ctx.globalAlpha = a * alpha;
    this.ctx.drawImage(img, s.x, s.y, s.w, s.h, cx + s.ox * k, cy + s.oy * k, s.w * k, s.h * k);
    this.ctx.globalAlpha = a;
  }

  private fx(name: string, cx: number, cy: number, scale = 1, alpha = 1): void {
    const s = FX[name];
    if (!s) return;
    const k = (this.T / PPT) * scale;
    const a = this.ctx.globalAlpha;
    this.ctx.globalAlpha = a * alpha;
    this.ctx.drawImage(this.images.fx, s.x, s.y, s.w, s.h, cx + s.ox * k, cy + s.oy * k, s.w * k, s.h * k);
    this.ctx.globalAlpha = a;
  }

  private px(x: number): number {
    return x * this.T;
  }

  private py(y: number): number {
    return (y + TOP) * this.T;
  }

  /** Draw one character frame with its feet at (fx, fy) device pixels. */
  private character(slug: string, frame: number, flip: boolean, fx: number, fy: number, scale: number, opts: { alpha?: number; tint?: string; tintAlpha?: number; boss?: boolean } = {}): void {
    const img = opts.boss ? this.images.bosses : this.images.chars;
    if (!img) return;
    const table = opts.boss ? CHARS.boss : CHARS.rows;
    const row = table[slug]?.row;
    if (row === undefined) return;
    const [cw, ch] = opts.boss ? CHARS.bossCell : CHARS.cell;
    const [ax, ay] = opts.boss ? CHARS.bossAnchor : CHARS.anchor;
    const k = (this.T / PPT) * scale * (opts.boss ? 1 : 1);
    const ctx = this.ctx;
    const w = cw * k;
    const h = ch * k;
    let src: CanvasImageSource = img;
    let sx = frame * cw;
    let sy = row * ch;
    if (opts.tint && (opts.tintAlpha ?? 0) > 0) {
      // tint through a scratch canvas (no ctx.filter on older Safari)
      const sc = this.scratch;
      if (sc.width < cw || sc.height < ch) {
        sc.width = Math.max(sc.width, cw);
        sc.height = Math.max(sc.height, ch);
      }
      const g = sc.getContext("2d")!;
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, cw, ch);
      g.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
      g.globalCompositeOperation = "source-atop";
      g.globalAlpha = opts.tintAlpha ?? 0.5;
      g.fillStyle = opts.tint;
      g.fillRect(0, 0, cw, ch);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      src = sc;
      sx = 0;
      sy = 0;
    }
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * (opts.alpha ?? 1);
    if (flip) {
      ctx.save();
      ctx.translate(fx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(src, sx, sy, cw, ch, -ax * k, fy - ay * k, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(src, sx, sy, cw, ch, fx - ax * k, fy - ay * k, w, h);
    }
    ctx.globalAlpha = a;
  }

  private shadow(cx: number, cy: number, w: number, alpha = 0.22): void {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(20, 30, 40, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * this.T * 0.5, w * this.T * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ------------------------------------------------------------ ground layer

  private buildGround(game: Game): void {
    const key = `${game.stage.id}:${this.T}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    const g = this.ground;
    g.width = this.canvas.width;
    g.height = this.canvas.height;
    const ctx = g.getContext("2d")!;
    ctx.fillStyle = game.world.sky;
    ctx.fillRect(0, 0, g.width, g.height);
    const T = this.T;
    const k = T / PPT;
    const img = this.images.tiles;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = game.cells[idx(c, r)];
        const s = this.meta[cell.ground] ?? this.meta[game.world.ground[(r + c) % 2]];
        if (!s) continue;
        ctx.drawImage(img, s.x, s.y, s.w, s.h, c * T, (r + TOP) * T, s.w * k + 0.5, s.h * k + 0.5);
      }
    }
    if (game.world.id === "stadium") this.pitchLines(ctx);
    // flat set pieces (ponds) belong to the floor
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = game.cells[idx(c, r)].piece;
        if (!piece || !piece.sprite.startsWith("pond")) continue;
        const s = this.meta[piece.sprite];
        if (!s) continue;
        const cx = (c + piece.w / 2) * T;
        const cy = (r + piece.h / 2 + TOP) * T;
        ctx.drawImage(img, s.x, s.y, s.w, s.h, cx + s.ox * k, cy + s.oy * k, s.w * k, s.h * k);
      }
    }
    // soft edge where the board meets the backdrop
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = Math.max(1, T * 0.04);
    ctx.strokeRect(0, TOP * T, COLS * T, ROWS * T);
  }

  private pitchLines(ctx: CanvasRenderingContext2D): void {
    const T = this.T;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = Math.max(1.5, T * 0.07);
    const top = TOP * T;
    ctx.strokeRect(T * 0.5, top + T * 0.5, (COLS - 1) * T, (ROWS - 1) * T);
    ctx.beginPath();
    ctx.moveTo(T * 0.5, top + (ROWS / 2) * T);
    ctx.lineTo((COLS - 0.5) * T, top + (ROWS / 2) * T);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc((COLS / 2) * T, top + (ROWS / 2) * T, T * 1.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect((COLS / 2 - 3) * T, top + T * 0.5, 6 * T, 2.3 * T);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.arc((COLS / 2) * T, top + (ROWS / 2) * T, T * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------ frame

  draw(game: Game, now: number): void {
    const ctx = this.ctx;
    const T = this.T;
    this.buildGround(game);
    ctx.save();
    if (this.shake > 0) {
      const m = this.shake * T * 0.08;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      this.shake = Math.max(0, this.shake - 0.05);
    }
    ctx.drawImage(this.ground, 0, 0);
    // animated belts
    const beltFrame = Math.floor(now * 6) % 3;
    for (let i = 0; i < game.cells.length; i++) {
      const cell = game.cells[i];
      if (!cell.belt) continue;
      const c = i % COLS;
      const r = (i - c) / COLS;
      this.tile(`belt_${BELT[cell.belt]}${beltFrame}`, this.px(c + 0.5), this.py(r + 0.5));
    }
    this.drawWarnings(game, now);
    this.drawWater(game, now);
    this.drawSorted(game, now);
    this.drawLobs(game);
    this.drawEffects(game, now);
    if (game.boss && game.boss.state !== "gone") this.drawBossBar(game);
    ctx.restore();
  }

  private drawWarnings(game: Game, now: number): void {
    const ctx = this.ctx;
    const T = this.T;
    const pulse = 0.32 + 0.22 * Math.sin(now * 18);
    for (const w of game.warnings) {
      const k = 1 - w.t / w.total;
      const color = w.color === "mint" ? "72, 220, 190" : w.color === "purple" ? "170, 110, 255" : "255, 70, 70";
      ctx.fillStyle = `rgba(${color}, ${pulse * (0.5 + 0.5 * k)})`;
      ctx.strokeStyle = `rgba(${color}, 0.9)`;
      ctx.lineWidth = Math.max(1, T * 0.04);
      for (const i of w.cells) {
        const c = i % COLS;
        const r = (i - c) / COLS;
        const inset = T * 0.06;
        ctx.fillRect(c * T + inset, (r + TOP) * T + inset, T - inset * 2, T - inset * 2);
        ctx.strokeRect(c * T + inset, (r + TOP) * T + inset, T - inset * 2, T - inset * 2);
      }
    }
  }

  /** Water streams: a pale-blue tube with a white core, joined across tiles. */
  private drawWater(game: Game, now: number): void {
    const ctx = this.ctx;
    const T = this.T;
    const cells: number[] = [];
    for (let i = 0; i < game.flameT.length; i++) if (game.flameT[i] > 0) cells.push(i);
    if (!cells.length) return;
    const passes: [string, number][] = [
      ["rgba(40, 130, 220, 0.95)", 0.66],
      ["rgba(110, 205, 250, 0.98)", 0.52],
      ["rgba(235, 252, 255, 0.98)", 0.24],
    ];
    for (const [color, width] of passes) {
      ctx.fillStyle = color;
      for (const i of cells) {
        const t = game.flameT[i];
        const grow = Math.min(1, (0.5 - t) / 0.07 + 0.35);
        const fade = Math.min(1, t / 0.12);
        const wob = 1 + 0.06 * Math.sin(now * 40 + i);
        const w = width * T * grow * (0.55 + 0.45 * fade) * wob;
        const c = i % COLS;
        const r = (i - c) / COLS;
        const cx = (c + 0.5) * T;
        const cy = (r + 0.5 + TOP) * T;
        const link = game.flameLink[i];
        const centre = (game.flameTravel[i] & TR_CENTER) !== 0;
        ctx.beginPath();
        ctx.arc(cx, cy, (w / 2) * (centre ? 1.18 : 1), 0, Math.PI * 2);
        ctx.fill();
        if (link & LINK.left) ctx.fillRect(cx - T / 2 - 1, cy - w / 2, T / 2 + 1, w);
        if (link & LINK.right) ctx.fillRect(cx, cy - w / 2, T / 2 + 1, w);
        if (link & LINK.up) ctx.fillRect(cx - w / 2, cy - T / 2 - 1, w, T / 2 + 1);
        if (link & LINK.down) ctx.fillRect(cx - w / 2, cy, w, T / 2 + 1);
      }
    }
    // sparkle droplets
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const i of cells) {
      if ((i * 7 + Math.floor(now * 20)) % 5) continue;
      const c = i % COLS;
      const r = (i - c) / COLS;
      ctx.beginPath();
      ctx.arc((c + 0.3 + 0.4 * ((i * 13) % 7) / 7) * T, (r + 0.35 + TOP) * T, T * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSorted(game: Game, now: number): void {
    type D = { key: number; draw: () => void };
    const list: D[] = [];
    const T = this.T;
    // blocks and set pieces
    for (let i = 0; i < game.cells.length; i++) {
      const cell = game.cells[i];
      const c = i % COLS;
      const r = (i - c) / COLS;
      if (cell.piece && !cell.piece.sprite.startsWith("pond")) {
        const p = cell.piece;
        list.push({ key: r + p.h - 0.05, draw: () => this.tile(p.sprite, this.px(c + p.w / 2), this.py(r + p.h / 2)) });
        continue;
      }
      if (!cell.obj) continue;
      const obj = cell.obj;
      if (cell.hide) {
        list.push({ key: r + 1.02, draw: () => this.tile(obj, this.px(c + 0.5), this.py(r + 0.5)) });
        continue;
      }
      const pf = cell.pushFrom;
      list.push({
        key: r + 0.96,
        draw: () => {
          const k = pf ? pf.t / 0.16 : 0;
          this.tile(obj, this.px(c + 0.5 + (pf ? pf.dx * k : 0)), this.py(r + 0.5 + (pf ? pf.dy * k : 0)));
        },
      });
    }
    // items
    for (const it of game.items) {
      if (it.delay > 0) continue;
      list.push({ key: it.r + 0.6, draw: () => this.drawItem(it.kind, it.c, it.r, it.age, now) });
    }
    // balloons
    for (const b of game.balloons) {
      if (b.dead) continue;
      const hidden = game.cells[idx(b.c, b.r)]?.hide;
      list.push({
        key: b.y + 0.42,
        draw: () => {
          const speed = b.fuse < 0.7 ? 20 : 7;
          const f = Math.floor(b.life * speed) % 4;
          const name = b.color === "blue" ? `balloon${f}` : `balloon_${b.color}${f % 2}`;
          const s = b.big ? 1.45 : 1;
          const cx = this.px(b.x);
          const cy = this.py(b.y);
          this.shadow(cx, cy + T * 0.3, 0.7 * s, 0.2);
          this.fx(name, cx, cy + T * 0.08, s, hidden ? 0.25 : 1);
        },
      });
    }
    // enemies
    for (const e of game.enemies) {
      if (e.state === "gone") continue;
      const hidden = game.cells[idx(Math.floor(e.x), Math.floor(e.y))]?.hide && e.state !== "trapped";
      if (hidden) continue;
      list.push({ key: e.y + FOOT, draw: () => this.drawEnemy(e, now) });
    }
    // boss + decoys
    const boss = game.boss;
    if (boss && boss.state !== "gone") {
      list.push({ key: boss.y + 0.9, draw: () => this.drawBoss(game, now) });
      for (const d of boss.decoys) list.push({ key: d.y + 0.9, draw: () => this.drawDecoy(game, d.x, d.y, d.t, now) });
    }
    // player
    const p = game.player;
    list.push({ key: p.y + FOOT + 0.001, draw: () => this.drawPlayer(game, now) });
    list.sort((a, b) => a.key - b.key);
    for (const d of list) d.draw();
  }

  private drawItem(kind: string, c: number, r: number, age: number, now: number): void {
    const T = this.T;
    const cx = this.px(c + 0.5);
    const cy = this.py(r + 0.5);
    const bob = Math.sin(now * 4 + c + r) * T * 0.06;
    const pop = Math.min(1, age / 0.18);
    this.shadow(cx, cy + T * 0.22, 0.46 - bob / T, 0.2);
    const ctx = this.ctx;
    if (RARE_ITEMS.has(kind as never)) {
      ctx.fillStyle = `rgba(255, 240, 160, ${0.35 + 0.2 * Math.sin(now * 8)})`;
      ctx.beginPath();
      ctx.arc(cx, cy - T * 0.12 + bob, T * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    // a soft bubble behind every item, like the arcade pickups
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = Math.max(1, T * 0.035);
    ctx.beginPath();
    ctx.arc(cx, cy - T * 0.12 + bob, T * 0.38 * pop, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    this.fx(`item_${kind}`, cx, cy + T * 0.08 + bob, 0.95 * pop);
  }

  private drawPlayer(game: Game, now: number): void {
    const p = game.player;
    const T = this.T;
    const ctx = this.ctx;
    const cx = this.px(p.x);
    const fy = this.py(p.y + FOOT);
    const hidden = game.cells[idx(Math.floor(p.x), Math.floor(p.y))]?.hide;
    if (p.state === "popped") {
      const k = 1 - p.t / 1.3;
      if (k < 0.6) this.character(p.hero, 0, false, cx, fy - k * T * 1.2, 1 + k * 0.3, { alpha: 1 - k / 0.6 });
      return;
    }
    const walking = p.moving && p.state === "alive";
    const step = walking ? Math.floor(p.anim * (3 + game.stats.speed * 0.5)) % 2 : 0;
    let frame = FRAME_OF[p.dir] + step;
    let flip = p.dir === "left";
    let lift = walking ? Math.abs(Math.sin(p.anim * 12)) * T * 0.04 : Math.sin(now * 3) * T * 0.012;
    if (p.state === "win") {
      frame = 0;
      flip = false;
      lift = Math.abs(Math.sin(p.anim * 7)) * T * 0.35;
    }
    const blink = p.invulnT > 0 && Math.floor(now * 14) % 2 === 0;
    this.shadow(cx, fy - T * 0.02, 0.62, 0.24);
    if (p.shieldT > 0) {
      ctx.strokeStyle = `rgba(255, 215, 90, ${0.6 + 0.3 * Math.sin(now * 12)})`;
      ctx.lineWidth = T * 0.07;
      ctx.beginPath();
      ctx.ellipse(cx, fy - T * 0.6, T * 0.62, T * 0.78, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.state === "trapped") {
      const stage = Math.min(3, Math.floor(4 - p.t));
      const wob = Math.sin(now * (6 + stage * 5)) * (0.03 + stage * 0.02);
      const rise = T * (0.25 + Math.sin(now * 3) * 0.04);
      this.character(p.hero, 0, false, cx, fy - rise, 0.86, { tint: "#8fd0ff", tintAlpha: 0.25 });
      this.fx(p.t < 1 && Math.floor(now * 10) % 2 ? "bubble1" : "bubble0", cx, fy - rise + T * 0.35, 1.02 + wob, 0.95);
      return;
    }
    this.character(p.hero, frame, flip, cx, fy - lift, 1.08, { alpha: hidden ? 0.5 : blink ? 0.45 : 1, tint: p.ginsengT > 0 ? "#ffd23f" : p.curseT > 0 ? "#b58cff" : undefined, tintAlpha: p.ginsengT > 0 || p.curseT > 0 ? 0.25 + 0.15 * Math.sin(now * 10) : 0 });
    if (p.curseT > 0) this.label("?!", cx, fy - T * 1.55, "#ffd400");
    if (p.slowT > 0) this.label("~", cx, fy - T * 1.55, "#7ff0d0");
  }

  private label(text: string, x: number, y: number, color: string): void {
    const ctx = this.ctx;
    ctx.font = `900 ${Math.round(this.T * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = this.T * 0.09;
    ctx.strokeStyle = "rgba(20,24,40,0.9)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private drawEnemy(e: Enemy, now: number): void {
    const T = this.T;
    const cx = this.px(e.x);
    let fy = this.py(e.y + FOOT);
    const b = e.def.behavior;
    if (e.state === "popping") {
      const k = e.t / 0.55;
      this.character(e.slug, 0, false, cx, fy - T * 0.3 - k * T * 0.8, 0.86 + k * 0.4, { alpha: 1 - k });
      return;
    }
    let frame = FRAME_OF[e.dir] + (Math.floor(e.anim * (b === "roller" ? 10 : 5)) % 2);
    const flip = e.dir === "left";
    if (e.state === "trapped") {
      const wob = Math.sin(now * (6 + e.t * 3)) * 0.04;
      const rise = T * (0.25 + Math.sin(now * 3 + e.id) * 0.04);
      this.character(e.slug, 0, false, cx, fy - rise, 0.84, { tint: "#8fd0ff", tintAlpha: 0.22 });
      this.fx(e.t > 3 && Math.floor(now * 10) % 2 ? "bubble1" : "bubble0", cx, fy - rise + T * 0.35, 1.0 + wob, 0.95);
      return;
    }
    let lift = 0;
    if (e.state === "hop" && e.hop) lift = Math.sin(Math.min(1, e.t / 0.45) * Math.PI) * T * 0.9;
    if (e.def.flies) lift += T * (0.22 + Math.sin(now * 4 + e.id) * 0.06);
    if (e.state === "stun") frame = 0;
    this.shadow(cx, fy - T * 0.02, e.def.flies ? 0.5 : 0.6, e.def.flies ? 0.16 : 0.22);
    const telling = e.state === "tell";
    const tint = telling ? "#ffffff" : e.angry || (b === "armored" && e.armorOff) ? "#ff3b3b" : b === "clay" && e.cracked > 0 ? "#a0522d" : undefined;
    const tintAlpha = telling ? 0.35 + 0.3 * Math.sin(now * 30) : tint ? 0.22 + 0.1 * Math.sin(now * 8) : 0;
    if (e.state === "breath") fy -= T * 0.03;
    this.character(e.slug, frame, flip, cx, fy - lift, 1.0, { alpha: e.alpha, tint, tintAlpha });
    if (telling) this.label("!", cx, fy - lift - T * 1.5, "#ff5a5a");
    if (e.state === "stun") this.stars(cx, fy - lift - T * 1.35, now);
  }

  private stars(x: number, y: number, now: number): void {
    const ctx = this.ctx;
    const T = this.T;
    ctx.fillStyle = "#ffd23f";
    for (let i = 0; i < 3; i++) {
      const a = now * 5 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * T * 0.32;
      const sy = y + Math.sin(a) * T * 0.1;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? T * 0.05 : T * 0.11;
        const ang = (k * Math.PI) / 5;
        ctx.lineTo(sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr);
      }
      ctx.fill();
    }
  }

  private drawBoss(game: Game, now: number): void {
    const boss = game.boss!;
    const T = this.T;
    const cx = this.px(boss.x);
    const fy = this.py(boss.y + 0.9);
    const lift = boss.z * T + (boss.def.flies ? T * (0.3 + Math.sin(now * 3) * 0.08) : 0);
    this.shadow(cx, fy - T * 0.05, 1.7 - Math.min(1, boss.z / 3) * 0.8, 0.28);
    const moving = boss.state === "walk" || boss.state === "dash";
    const dir = boss.state === "dash" ? boss.dashDir : boss.dir;
    const frame = boss.state === "dizzy" || boss.state === "intro" ? 0 : FRAME_OF[dir] + (moving ? Math.floor(boss.anim * 4) % 2 : 0);
    const flip = dir === "left" && frame >= 2 && frame < 4;
    const tell = boss.state === "tell";
    const tint = boss.flash > 0 ? "#ffffff" : tell ? "#ff4040" : boss.enraged ? "#ff2020" : undefined;
    const tintAlpha = boss.flash > 0 ? 0.65 : tell ? 0.25 + 0.25 * Math.sin(now * 25) : boss.enraged ? 0.18 : 0;
    const armour = boss.kind === "cheolryong" && !boss.enraged && boss.state !== "dizzy";
    this.character(boss.slug, frame, flip, cx, fy - lift, 1, { boss: true, alpha: boss.alpha, tint: armour && !tint ? "#9aa7b8" : tint, tintAlpha: armour && !tint ? 0.3 : tintAlpha });
    if (boss.state === "dizzy") this.stars(cx, fy - lift - T * 2.9, now);
    if (tell) this.label("!!", cx, fy - lift - T * 3.0, "#ff5a5a");
  }

  private drawDecoy(game: Game, x: number, y: number, t: number, now: number): void {
    const boss = game.boss!;
    const T = this.T;
    const cx = this.px(x);
    const fy = this.py(y + 0.9);
    this.shadow(cx, fy - T * 0.05, 1.5, 0.2);
    this.character(boss.slug, Math.floor(now * 4) % 2, false, cx, fy, 1, { boss: true, alpha: 0.85 + 0.1 * Math.sin(now * 9 + t) });
  }

  private drawLobs(game: Game): void {
    const T = this.T;
    for (const l of game.lobs) {
      const k = Math.min(1, l.t / l.total);
      const x = l.fromX + (l.toC + 0.5 - l.fromX) * k;
      const y = l.fromY + (l.toR + 0.5 - l.fromY) * k;
      const h = Math.sin(k * Math.PI) * (l.kind === "rocket" ? 3.2 : 2.4);
      this.shadow(this.px(x), this.py(y) + T * 0.3, 0.5, 0.2 * k + 0.05);
      if (l.kind === "rocket") this.fx("rocket_small", this.px(x), this.py(y - h), 0.8);
      else this.fx(`balloon_red${Math.floor(l.t * 8) % 2}`, this.px(x), this.py(y - h), l.big ? 1.2 : 0.9);
    }
  }

  private drawEffects(game: Game, now: number): void {
    const ctx = this.ctx;
    const T = this.T;
    for (const e of game.effects) {
      switch (e.kind) {
        case "splash":
        case "pop": {
          const f = Math.min(3, Math.floor((e.t / 0.6) * 4));
          this.fx(`splash${f}`, this.px(e.x), this.py(e.y) + T * 0.1, e.kind === "pop" ? 1.25 : 1);
          if (e.kind === "pop" && e.t < 0.5) this.stars(this.px(e.x), this.py(e.y) - T * 0.8, now);
          break;
        }
        case "debris": {
          const k = e.t / 0.45;
          if (e.sprite) this.tile(e.sprite, this.px(e.x), this.py(e.y) + k * T * 0.2, 1 - k * 0.6, 1 - k);
          ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
          for (let i = 0; i < 5; i++) {
            const a = i * 1.26 + 0.4;
            ctx.beginPath();
            ctx.arc(this.px(e.x) + Math.cos(a) * k * T * 0.7, this.py(e.y) - T * 0.2 + Math.sin(a) * k * T * 0.5 - k * T * 0.3, T * 0.07 * (1 - k), 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case "text": {
          const k = e.t / 1.0;
          ctx.globalAlpha = 1 - k * k;
          this.label(e.text, this.px(e.x), this.py(e.y) - k * T * 0.8, e.color);
          ctx.globalAlpha = 1;
          break;
        }
        case "stars": {
          const k = e.t / 0.7;
          ctx.fillStyle = `rgba(255, 225, 90, ${1 - k})`;
          for (let i = 0; i < 6; i++) {
            const a = i * 1.047 + k;
            ctx.beginPath();
            ctx.arc(this.px(e.x) + Math.cos(a) * k * T * 0.8, this.py(e.y) - T * 0.4 + Math.sin(a) * k * T * 0.6, T * 0.08 * (1 - k * 0.5), 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case "breath": {
          const k = e.t / 0.6;
          for (const i of e.cells) {
            const c = i % COLS;
            const r = (i - c) / COLS;
            ctx.fillStyle = `rgba(140, 255, 215, ${0.55 * (1 - k)})`;
            ctx.beginPath();
            ctx.arc((c + 0.5) * T, (r + 0.4 + TOP) * T, T * (0.3 + 0.2 * Math.sin(now * 20 + i)), 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case "ring": {
          const k = e.t / 0.6;
          ctx.strokeStyle = e.color;
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = T * 0.14 * (1 - k * 0.5);
          ctx.beginPath();
          ctx.ellipse(this.px(e.x), this.py(e.y), e.r * T * k, e.r * T * k * 0.8, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
      }
    }
  }

  private drawBossBar(game: Game): void {
    const boss = game.boss!;
    const ctx = this.ctx;
    const T = this.T;
    const w = COLS * T * 0.5;
    const x = (COLS * T - w) / 2;
    const y = T * 0.18;
    const h = T * 0.34;
    ctx.fillStyle = "rgba(15, 20, 35, 0.72)";
    ctx.beginPath();
    ctx.roundRect(x - T * 0.1, y - T * 0.08, w + T * 0.2, h + T * 0.16, T * 0.2);
    ctx.fill();
    ctx.fillStyle = "#3b4256";
    ctx.fillRect(x, y, w, h);
    const k = boss.hp / boss.maxHp;
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, boss.enraged ? "#ff3b3b" : "#ff8a3d");
    grad.addColorStop(1, boss.enraged ? "#ff7b7b" : "#ffd23f");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w * k, h);
  }
}
