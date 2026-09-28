// Clap for Seoul renderer: the supporters' end in Canvas 2D. The crowd bobs on the beat, Leoul
// calls the chants, a lane shows the claps and shouts coming up, a strip at the top tracks the
// match, and the room meter shows how loud you are.
import { CHANTS, type ChantId, type Cue } from "./chants";
import type { Judgment } from "./match";
import { SONG_STEP, SONG_T0 } from "../rhythm/charts";

export interface ClapView {
  now: number; // song seconds as heard
  score: [number, number];
  minute: number;
  momentum: number;
  chance: "home" | "away" | null;
  cue: Cue | null; // the chant on screen (current, or the next one being called)
  chantName: string;
  chantHow: string;
  callText: string; // "Next" or a countdown
  level: number; // 0..1 room loudness
  shouting: boolean;
  rivalName: string;
  homeName: string;
  mic: boolean;
  reserve: number; // fraction of the height at the bottom kept clear for the on-screen pads (portrait)
  safe: { t: number; r: number; b: number; l: number }; // safe-area insets, CSS px
}

// Where everything goes, in device pixels. Tall (portrait phone): scoreboard on top, the capo and his
// chant bubble above the lane, the lane above the pads. Wide: the lane runs between the two pads.
interface Layout {
  tall: boolean;
  u: number;
  top: number;
  boardX: number;
  boardW: number;
  laneX0: number;
  laneX1: number;
  laneY: number;
  laneH: number;
  hitX: number;
  capoX: number;
  capoBottom: number;
  capoH: number;
  bubX: number;
  bubY: number;
  bubW: number;
  bubH: number;
  len: { right: number; bottom: number; h: number } | null;
  meterX: number;
  meterY: number;
  meterH: number;
  bannerY: number;
}

interface Pop {
  text: string;
  color: string;
  life: number;
  y: number;
}
interface Banner {
  text: string;
  color: string;
  life: number;
  big: boolean;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  r: number;
}

const J_COLOR: Record<Judgment, string> = { perfect: "#ffe27a", great: "#7fd7ff", good: "#8ff0a4", miss: "#c7cbe0" };
const INK = "#0b1238";
const GOLD = "#ffc23a";
const LOOKAHEAD = 2.2; // seconds of lane visible ahead of the hit line

export class ClapRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private readonly img = new Map<string, HTMLImageElement>();
  private pops: Pop[] = [];
  private banners: Banner[] = [];
  private bits: Bit[] = [];
  private flash = 0;
  private rival: HTMLImageElement | null = null;
  private rivalColor = "#c8102e";
  private last = performance.now();
  private hitFlash = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly base: { rhythm: string; play: string; mascots: string },
  ) {
    this.ctx = canvas.getContext("2d")!;
    for (const k of ["stand-wide-bg", "stand-wide-a", "stand-wide-b", "stand-tall-bg", "stand-tall-a", "stand-tall-b", "note-gold", "note-sky"]) this.load(k, `${base.rhythm}${k}.webp`);
    this.load("leoul", `${base.play}leoul-wave.webp`);
    this.load("leoul2", `${base.play}leoul-celebrate.webp`);
    this.load("lenyang", `${base.play}lenyang-jump.webp`);
  }

  private load(key: string, src: string): HTMLImageElement {
    const im = new Image();
    im.decoding = "async";
    im.src = src;
    this.img.set(key, im);
    return im;
  }
  private ok(key: string): HTMLImageElement | null {
    const im = this.img.get(key);
    return im && im.complete && im.naturalWidth ? im : null;
  }

  setRival(slug: string, color: string): void {
    this.rival = this.load(`rival-${slug}`, `${this.base.mascots}${slug}.webp`);
    this.rivalColor = color;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(r.width * this.dpr));
    this.h = Math.max(1, Math.round(r.height * this.dpr));
    if (this.canvas.width !== this.w || this.canvas.height !== this.h) {
      this.canvas.width = this.w;
      this.canvas.height = this.h;
    }
  }

  judge(j: Judgment): void {
    for (const p of this.pops) p.life = Math.min(p.life, 0.15); // the newest judgment takes over
    this.pops.push({ text: j, color: J_COLOR[j], life: 0.7, y: 0 });
    if (j !== "miss") this.hitFlash = 1;
    if (this.pops.length > 4) this.pops.shift();
  }

  banner(text: string, color = "#ffffff", big = false): void {
    this.banners = [{ text, color, life: big ? 2.6 : 2, big }];
  }

  goal(home: boolean): void {
    this.flash = home ? 1 : 0.4;
    if (!home) return;
    for (let i = 0; i < 120; i++) {
      this.bits.push({
        x: Math.random(),
        y: -0.05 - Math.random() * 0.3,
        vx: (Math.random() - 0.5) * 0.15,
        vy: 0.15 + Math.random() * 0.35,
        life: 2.5 + Math.random(),
        color: [GOLD, "#ffffff", "#58c6ff", "#1b2446"][i % 4],
        r: 3 + Math.random() * 4,
      });
    }
  }

  private cover(im: HTMLImageElement, dy = 0, tall = false): void {
    let s = Math.max(this.w / im.naturalWidth, this.h / im.naturalHeight);
    let y: number;
    if (tall) {
      // on a phone held upright, zoom into the crowd (rows 44 to 69% of the tall art) and lift it
      // so it starts under the scoreboard instead of leaving half the screen as night sky
      s *= Math.max(1.2, Math.min(1.8, 1.25 + (this.h / this.w - 1.1) * 0.9));
      y = this.h * 0.2 - im.naturalHeight * 0.445 * s;
      y = Math.min(0, Math.max(this.h - im.naturalHeight * s, y));
    } else y = (this.h - im.naturalHeight * s) * 0.4;
    const w = im.naturalWidth * s;
    this.ctx.drawImage(im, (this.w - w) / 2, y + dy, w, im.naturalHeight * s);
  }

  private layout(v: ClapView): Layout {
    const W = this.w;
    const H = this.h;
    const d = this.dpr;
    const u = Math.min(W, H) / 100;
    const tall = H > W * 1.1;
    const top = v.safe.t * d;
    const bottom = v.safe.b * d;
    const left = v.safe.l * d;
    const right = v.safe.r * d;
    const leoul = this.ok("leoul");
    const aspect = leoul ? leoul.naturalWidth / leoul.naturalHeight : 0.73;
    const meterX = W - right - u * 4.6;
    if (tall) {
      const laneH = u * 11;
      const laneY = Math.min(H - bottom - u * 3, H * (1 - v.reserve)) - laneH - u * 2;
      const laneX0 = left + W * 0.04;
      const laneX1 = W - right - W * 0.04;
      const capoBottom = laneY - u * 10;
      const capoH = Math.max(u * 20, Math.min(H * 0.2, capoBottom - (top + u * 30)));
      const capoX = left + W * 0.03;
      const bubX = capoX + capoH * aspect * 0.92;
      const bubH = u * 13;
      const bubY = capoBottom - capoH * 0.8;
      // Lenyang drums in the stand above the chant bubble, clear of the room meter on the right
      const lenBottom = bubY - u * 1.5;
      const lenH = Math.min(capoH * 0.9, lenBottom - (top + u * 30));
      return {
        tall, u, top,
        boardX: left + u * 2,
        boardW: W - left - right - u * 18,
        laneX0, laneX1, laneY, laneH,
        hitX: laneX0 + (laneX1 - laneX0) * 0.16,
        capoX, capoBottom, capoH,
        bubX, bubY, bubW: W - right - u * 3 - bubX, bubH,
        len: lenH > u * 14 ? { right: W - right - u * 11, bottom: lenBottom, h: lenH } : null,
        meterX, meterY: top + u * 26, meterH: H * 0.18,
        bannerY: (top + u * 20 + (capoBottom - capoH)) / 2,
      };
    }
    const laneH = u * 10;
    const laneY = H - bottom - laneH - Math.max(H * 0.05, u * 3);
    const laneX0 = Math.max(left + u * 2, W * 0.2);
    const laneX1 = Math.min(W - right - u * 2, W * 0.8);
    const capoBottom = laneY - u * 9;
    const capoH = Math.max(u * 20, Math.min(H * 0.36, capoBottom - (top + u * 22)));
    const capoX = Math.max(left + u * 2, W * 0.15);
    const bubX = capoX + capoH * aspect * 0.92;
    const bubY = capoBottom - capoH * 0.82;
    const bw = Math.min(W * 0.94, u * 92);
    return {
      tall, u, top,
      boardX: (W - bw) / 2,
      boardW: bw,
      laneX0, laneX1, laneY, laneH,
      hitX: laneX0 + (laneX1 - laneX0) * 0.16,
      capoX, capoBottom, capoH,
      bubX, bubY, bubW: Math.min(W * 0.34, u * 60), bubH: u * 12,
      len: { right: W * 0.82, bottom: capoBottom, h: Math.min(H * 0.3, capoH * 0.85) },
      meterX, meterY: top + H * 0.24, meterH: H * 0.3,
      bannerY: (top + u * 20 + bubY) / 2,
    };
  }

  draw(v: ClapView, text: Record<Judgment, string>, lang: { room: string; tap: string }): void {
    const g = this.ctx;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const W = this.w;
    const H = this.h;
    const L = this.layout(v);
    const u = L.u; // layout unit
    const tall = L.tall;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);

    // --- the stand, bobbing on the beat (harder when the team is pushing)
    const beat = (v.now - SONG_T0) / (SONG_STEP * 4);
    const ph = beat - Math.floor(beat);
    const push = 0.5 + Math.max(0, v.momentum) * 0.8 + v.level * 0.6;
    const bob = Math.pow(1 - ph, 3) * u * 0.9 * push;
    const kind = tall ? "tall" : "wide";
    const bg = this.ok(`stand-${kind}-bg`);
    if (bg) this.cover(bg, 0, tall);
    else {
      g.fillStyle = "#101a4a";
      g.fillRect(0, 0, W, H);
    }
    const a = this.ok(`stand-${kind}-a`);
    const b = this.ok(`stand-${kind}-b`);
    if (a) this.cover(a, Math.floor(beat) % 2 ? -bob : 0, tall);
    if (b) this.cover(b, Math.floor(beat) % 2 ? 0 : -bob, tall);
    // darken toward the bottom so the lane reads
    const shade = g.createLinearGradient(0, H * 0.35, 0, H);
    shade.addColorStop(0, "rgba(6,10,36,0)");
    shade.addColorStop(1, "rgba(6,10,36,.72)");
    g.fillStyle = shade;
    g.fillRect(0, 0, W, H);

    // --- scoreboard and the match strip
    this.scoreboard(v, L);
    this.strip(v, L, now);

    // --- Leoul calls the chants, Lenyang drums
    const leoul = this.ok(v.chance === "home" || this.flash > 0.5 ? "leoul2" : "leoul");
    if (leoul) {
      const w = (L.capoH * leoul.naturalWidth) / leoul.naturalHeight;
      g.drawImage(leoul, L.capoX, L.capoBottom - L.capoH - bob * 0.6, w, L.capoH);
    }
    const len = this.ok("lenyang");
    if (len && L.len) {
      const w = (L.len.h * len.naturalWidth) / len.naturalHeight;
      g.drawImage(len, L.len.right - w, L.len.bottom - L.len.h - bob, w, L.len.h);
    }
    this.bubble(v, L);

    // --- the chant lane
    this.lane(v, L, text);

    // --- room meter
    this.meter(v, L, v.mic ? lang.room : lang.tap);

    // --- banners, confetti, flash
    for (const bn of this.banners) {
      bn.life -= dt;
      const al = Math.min(1, bn.life / 0.35, (2.6 - bn.life) / 0.15 + 0.2);
      g.globalAlpha = Math.max(0, al);
      const size = (bn.big ? 9 : 4.6) * u * (tall ? 0.9 : 1);
      g.font = `900 ${size}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = size * 0.2;
      g.strokeStyle = INK;
      this.fitText(bn.text, W / 2, L.bannerY, W * 0.9, size, bn.color);
      g.globalAlpha = 1;
    }
    this.banners = this.banners.filter((x) => x.life > 0);
    for (const p of this.bits) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.1 * dt;
      g.fillStyle = p.color;
      g.globalAlpha = Math.max(0, Math.min(1, p.life));
      g.fillRect(p.x * W, p.y * H, p.r * this.dpr, p.r * this.dpr * 0.6);
    }
    g.globalAlpha = 1;
    this.bits = this.bits.filter((p) => p.life > 0 && p.y < 1.1);
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 1.4);
      g.fillStyle = `rgba(255,232,150,${this.flash * 0.35})`;
      g.fillRect(0, 0, W, H);
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
  }

  private fitText(t: string, x: number, y: number, maxW: number, size: number, fill: string): void {
    const g = this.ctx;
    const w = g.measureText(t).width;
    if (w > maxW) {
      const s = (size * maxW) / w;
      g.font = `900 ${s}px system-ui, sans-serif`;
      g.lineWidth = s * 0.2;
    }
    g.strokeText(t, x, y);
    g.fillStyle = fill;
    g.fillText(t, x, y);
  }

  private pill(x: number, y: number, w: number, h: number): void {
    const g = this.ctx;
    const r = Math.min(h / 2, w / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  private scoreboard(v: ClapView, L: Layout): void {
    const g = this.ctx;
    const u = L.u;
    const bw = L.boardW;
    const bh = u * 9;
    const x = L.boardX;
    const y = L.top + u * 2;
    const cx = x + bw / 2;
    g.fillStyle = "rgba(11,18,56,.88)";
    this.pill(x, y, bw, bh);
    g.fill();
    g.strokeStyle = GOLD;
    g.lineWidth = u * 0.5;
    g.stroke();
    g.textBaseline = "middle";
    g.font = `900 ${u * 3.4}px system-ui, sans-serif`;
    g.fillStyle = "#fff";
    g.textAlign = "left";
    g.fillText(v.homeName, x + bh * 0.55, y + bh / 2, bw * 0.34);
    g.textAlign = "right";
    g.fillText(v.rivalName, x + bw - bh * 1.35, y + bh / 2, bw * 0.3);
    if (this.rival && this.rival.complete && this.rival.naturalWidth) {
      g.save();
      g.beginPath();
      g.arc(x + bw - bh * 0.62, y + bh / 2, bh * 0.4, 0, Math.PI * 2);
      g.fillStyle = this.rivalColor;
      g.fill();
      g.clip();
      g.drawImage(this.rival, x + bw - bh * 1.02, y + bh * 0.08, bh * 0.8, bh * 0.8);
      g.restore();
    }
    g.textAlign = "center";
    g.font = `900 ${u * 5}px system-ui, sans-serif`;
    g.fillStyle = GOLD;
    g.fillText(`${v.score[0]} - ${v.score[1]}`, cx, y + bh / 2);
    g.font = `800 ${u * 2.2}px system-ui, sans-serif`;
    g.fillStyle = "#bfe9ff";
    g.fillText(`${v.minute}'`, cx, y + bh + u * 1.8);
  }

  private strip(v: ClapView, L: Layout, now: number): void {
    const g = this.ctx;
    const W = this.w;
    const u = L.u;
    const sw = Math.min(W * 0.8, u * 70);
    const sh = u * 4.6;
    const x = (W - sw) / 2;
    const y = L.top + u * 15;
    g.fillStyle = "rgba(47,138,76,.92)";
    this.pill(x, y, sw, sh);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,.8)";
    g.lineWidth = u * 0.3;
    g.stroke();
    g.beginPath();
    g.moveTo(W / 2, y);
    g.lineTo(W / 2, y + sh);
    g.stroke();
    g.beginPath();
    g.arc(W / 2, y + sh / 2, sh * 0.32, 0, Math.PI * 2);
    g.stroke();
    // goals: ours attack to the right
    for (const side of [-1, 1]) {
      g.fillStyle = side > 0 ? this.rivalColor : "#1b2446";
      g.fillRect(W / 2 + (side * sw) / 2 - (side > 0 ? u * 1.2 : 0), y + sh * 0.25, u * 1.2, sh * 0.5);
    }
    // danger glow
    if (v.chance) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 120);
      const gx = v.chance === "home" ? x + sw - sw * 0.18 : x;
      g.fillStyle = v.chance === "home" ? `rgba(255,194,58,${0.25 + pulse * 0.3})` : `rgba(255,77,94,${0.25 + pulse * 0.3})`;
      g.fillRect(gx, y, sw * 0.18, sh);
    }
    const bx = W / 2 + v.momentum * (sw / 2 - sh * 0.6);
    g.fillStyle = "#fff";
    g.strokeStyle = INK;
    g.lineWidth = u * 0.35;
    g.beginPath();
    g.arc(bx, y + sh / 2, sh * 0.34, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(bx, y + sh / 2, sh * 0.12, 0, Math.PI * 2);
    g.fill();
  }

  private bubble(v: ClapView, L: Layout): void {
    const g = this.ctx;
    const u = L.u;
    const bw = L.bubW;
    const bh = L.bubH;
    const x = L.bubX;
    const y = L.bubY;
    g.fillStyle = "rgba(251,247,239,.96)";
    this.pill(x, y, bw, bh);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = u * 0.5;
    g.stroke();
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillStyle = "#d98a00";
    g.font = `900 ${u * 2}px system-ui, sans-serif`;
    g.fillText(v.callText, x + bh * 0.35, y + bh * 0.24, bw - bh * 0.6);
    g.fillStyle = INK;
    g.font = `900 ${u * 4}px "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
    g.fillText(v.chantName, x + bh * 0.35, y + bh * 0.54, bw - bh * 0.6);
    g.font = `700 ${u * 2}px system-ui, sans-serif`;
    g.fillStyle = "#3a3f58";
    g.fillText(v.chantHow, x + bh * 0.35, y + bh * 0.82, bw - bh * 0.6);
  }

  private lane(v: ClapView, L: Layout, text: Record<Judgment, string>): void {
    const g = this.ctx;
    const u = L.u;
    const lh = L.laneH;
    const y = L.laneY;
    const x0 = L.laneX0;
    const x1 = L.laneX1;
    const hitX = L.hitX;
    const pxPerSec = (x1 - hitX) / LOOKAHEAD;
    g.fillStyle = "rgba(11,18,56,.78)";
    this.pill(x0, y, x1 - x0, lh);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,.35)";
    g.lineWidth = u * 0.3;
    g.stroke();
    g.save();
    this.pill(x0, y, x1 - x0, lh);
    g.clip();
    // beat ticks
    const beatLen = SONG_STEP * 4;
    const firstBeat = Math.ceil((v.now - 0.5 - SONG_T0) / beatLen);
    for (let k = firstBeat; ; k++) {
      const t = SONG_T0 + k * beatLen;
      const X = hitX + (t - v.now) * pxPerSec;
      if (X > x1) break;
      if (X < x0) continue;
      const bar = ((k % 4) + 4) % 4 === 0;
      g.strokeStyle = bar ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.14)";
      g.lineWidth = bar ? u * 0.35 : u * 0.2;
      g.beginPath();
      g.moveTo(X, y + lh * 0.18);
      g.lineTo(X, y + lh * 0.82);
      g.stroke();
    }
    if (v.cue) {
      const def = CHANTS[v.cue.chant as ChantId];
      const cy = y + lh / 2;
      if (def.roll) {
        const X0 = hitX + (v.cue.t0 - v.now) * pxPerSec;
        const X1 = hitX + (v.cue.t1 - v.now) * pxPerSec;
        const grad = g.createLinearGradient(X0, 0, X1, 0);
        grad.addColorStop(0, "rgba(255,194,58,.95)");
        grad.addColorStop(1, "rgba(255,120,60,.95)");
        g.fillStyle = grad;
        this.pill(X0, cy - lh * 0.28, Math.max(lh * 0.56, X1 - X0), lh * 0.56);
        g.fill();
        g.fillStyle = INK;
        g.font = `900 ${u * 2.6}px system-ui, sans-serif`;
        g.textAlign = "left";
        g.fillText("👏👏👏👏👏👏", Math.max(X0 + lh * 0.3, hitX + lh * 0.3), cy);
      }
      for (const s of v.cue.shouts) {
        const X0 = hitX + (s.t0 - v.now) * pxPerSec;
        const X1 = hitX + (s.t1 - v.now) * pxPerSec;
        if (X1 < x0) continue;
        g.fillStyle = "rgba(143,216,255,.95)";
        this.pill(X0 - lh * 0.28, cy - lh * 0.3, Math.max(lh * 0.6, X1 - X0 + lh * 0.28), lh * 0.6);
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = u * 0.35;
        g.stroke();
        g.fillStyle = INK;
        g.font = `900 ${u * 2.6}px "Apple SD Gothic Neo", system-ui, sans-serif`;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillText(v.cue.chant === "eland" ? "이랜드!" : "서울!", X0 - lh * 0.1, cy);
      }
      const note = this.ok("note-gold");
      for (const c of v.cue.claps) {
        const X = hitX + (c - v.now) * pxPerSec;
        if (X < x0 - lh || X > x1 + lh) continue;
        const r = lh * 0.36;
        if (note) g.drawImage(note, X - r, cy - r, r * 2, r * 2);
        else {
          g.fillStyle = GOLD;
          g.beginPath();
          g.arc(X, cy, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.restore();
    // hit marker
    g.strokeStyle = this.hitFlash > 0 ? `rgba(255,236,160,${0.6 + this.hitFlash * 0.4})` : "#ffffff";
    g.lineWidth = u * (0.5 + this.hitFlash * 0.5);
    g.beginPath();
    g.arc(hitX, y + lh / 2, lh * 0.42 + this.hitFlash * u, 0, Math.PI * 2);
    g.stroke();
    if (v.shouting) {
      g.fillStyle = "rgba(143,216,255,.45)";
      g.beginPath();
      g.arc(hitX, y + lh / 2, lh * 0.42, 0, Math.PI * 2);
      g.fill();
    }
    // judgment pops above the hit marker
    const dt = 1 / 60;
    this.pops.forEach((p, i) => {
      p.life -= dt;
      p.y += dt * u * 8;
      g.globalAlpha = Math.max(0, Math.min(1, p.life / 0.3));
      g.font = `900 ${u * 3.2}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.lineWidth = u * 0.6;
      g.strokeStyle = INK;
      const ty = y - u * 2.5 - p.y - i * 0.2;
      const label = text[p.text as Judgment] ?? p.text;
      g.strokeText(label, hitX, ty);
      g.fillStyle = p.color;
      g.fillText(label, hitX, ty);
    });
    g.globalAlpha = 1;
    this.pops = this.pops.filter((p) => p.life > 0);
  }

  private meter(v: ClapView, L: Layout, label: string): void {
    const g = this.ctx;
    const u = L.u;
    const mw = u * 2.4;
    const mh = L.meterH;
    const x = L.meterX;
    const y = L.meterY;
    g.fillStyle = "rgba(11,18,56,.75)";
    this.pill(x, y, mw, mh);
    g.fill();
    const lv = Math.max(0, Math.min(1, v.level));
    const fh = (mh - u) * lv;
    const grad = g.createLinearGradient(0, y + mh, 0, y);
    grad.addColorStop(0, "#8ff0a4");
    grad.addColorStop(0.6, GOLD);
    grad.addColorStop(1, "#ff6b6b");
    g.fillStyle = grad;
    this.pill(x + u * 0.5, y + mh - u * 0.5 - fh, mw - u, Math.max(0.1, fh));
    g.fill();
    g.save();
    g.translate(x + mw / 2, y + mh + u * 2.4);
    g.fillStyle = "#fff";
    g.font = `900 ${u * 1.7}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.fillText(label.toUpperCase(), 0, 0);
    g.restore();
  }
}
