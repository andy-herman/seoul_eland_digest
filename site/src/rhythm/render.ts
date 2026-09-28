// Seoul Song Rhythm renderer (Canvas 2D). A four-lane highway in perspective over the Blender render
// of the Mokdong supporters' end; the two fan layers bounce in turn on the beat. Notes are Blender
// pucks, the receptors are Blender drums; Leoul and Lenyang cheer beside the highway.
import { DEFAULT_SONG, type RhythmSong, type Section } from "./songs";
import { type Judgment, LANES, type Note, type RhythmEngine } from "./engine";

const LANE_COLOR = ["#ffc23a", "#58c6ff", "#58c6ff", "#ffc23a"];
const JUDGE_COLOR: Record<Judgment, string> = { perfect: "#ffe27a", great: "#7fd7ff", good: "#8ff0a4", miss: "#c7cbe0" };
const PERSP = 0.85; // top of the highway is 1 / (1 + PERSP) of the bottom width

type Img = HTMLImageElement | null;
export interface RhythmAssets {
  base: string; // /play/rhythm/
  play: string; // /play/
}
type Pose = "ready" | "cheer" | "big" | "sad";
interface Burst {
  lane: number;
  t: number;
  j: Judgment;
}
interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  va: number;
  c: string;
}

export interface Labels {
  judgments: Record<Judgment, string>;
  combo: string;
  fever: string;
  early: string;
  late: string;
  keys: string[]; // per lane, empty on touch
}

export class RhythmRenderer {
  readonly g: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  dpr = 1;
  wide = true;
  private sets: Record<"wide" | "tall", { bg: Img; a: Img; b: Img }> = { wide: { bg: null, a: null, b: null }, tall: { bg: null, a: null, b: null } };
  private note: Img[] = [null, null];
  private drum: Img[] = [null, null];
  private mascots: Record<"leoul" | "lenyang", Record<Pose, Img>> = {
    leoul: { ready: null, cheer: null, big: null, sad: null },
    lenyang: { ready: null, cheer: null, big: null, sad: null },
  };
  // geometry (device px)
  cx = 0;
  hitY = 0;
  topY = 0;
  vy = 0;
  bottomW = 0;
  visible = 1.6; // seconds of notes on screen
  pressed = [false, false, false, false];
  private pressT = [-9, -9, -9, -9];
  private bursts: Burst[] = [];
  private judge: { j: Judgment; t: number; offset: number } | null = null;
  private comboT = -9;
  private confetti: Confetti[] = [];
  private pose: { leoul: Pose; lenyang: Pose; until: number } = { leoul: "ready", lenyang: "ready", until: 0 };
  private flash = 0;
  labels: Labels | null = null;

  /** The song being played: its beat grid drives the stand, the beat lines and the sections. */
  song: RhythmSong = DEFAULT_SONG;
  private get beat(): number {
    return this.song.step * 4;
  }

  constructor(readonly canvas: HTMLCanvasElement, assets: RhythmAssets) {
    this.g = canvas.getContext("2d", { alpha: false })!;
    const load = (src: string): Promise<HTMLImageElement> =>
      new Promise((res, rej) => {
        const im = new Image();
        im.decoding = "async";
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = src;
      });
    const B = assets.base;
    this.ready = Promise.all([
      load(B + "note-gold.webp").then((i) => (this.note[0] = i)),
      load(B + "note-sky.webp").then((i) => (this.note[1] = i)),
      load(B + "drum-gold.webp").then((i) => (this.drum[0] = i)),
      load(B + "drum-sky.webp").then((i) => (this.drum[1] = i)),
      ...(["ready", "cheer", "big", "sad"] as Pose[]).flatMap((p) => [
        load(assets.play + { ready: "leoul-ready", cheer: "leoul-wave", big: "leoul-celebrate", sad: "leoul-sad" }[p] + ".webp").then((i) => (this.mascots.leoul[p] = i)),
        load(assets.play + { ready: "lenyang-ready", cheer: "lenyang-starry", big: "lenyang-jump", sad: "lenyang-sad" }[p] + ".webp").then((i) => (this.mascots.lenyang[p] = i)),
      ]),
    ]).then(() => undefined);
    this.base = B;
  }
  readonly ready: Promise<void>;
  private base: string;
  private loadingSet: Record<string, boolean> = {};

  // The stand layers for the current shape load on demand (only one set is fetched on a phone).
  private ensureSet(which: "wide" | "tall"): void {
    if (this.loadingSet[which]) return;
    this.loadingSet[which] = true;
    for (const part of ["bg", "a", "b"] as const) {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => (this.sets[which][part] = im);
      im.src = `${this.base}stand-${which}-${part}.webp`;
    }
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const big = r.width * r.height > 1.4e6;
    this.dpr = Math.min(window.devicePixelRatio || 1, big ? 1.5 : 2);
    this.W = Math.max(2, Math.round(r.width * this.dpr));
    this.H = Math.max(2, Math.round(r.height * this.dpr));
    if (this.canvas.width !== this.W || this.canvas.height !== this.H) {
      this.canvas.width = this.W;
      this.canvas.height = this.H;
    }
    this.wide = this.W >= this.H * 1.05;
    this.ensureSet(this.wide ? "wide" : "tall");
    const { W, H } = this;
    this.cx = W / 2;
    if (this.wide) {
      this.bottomW = Math.min(W * 0.46, H * 0.98);
      this.hitY = H * 0.855;
      this.topY = H * 0.06;
    } else {
      this.bottomW = W * 0.97;
      this.hitY = H * 0.83;
      this.topY = H * 0.17;
    }
    const s1 = 1 / (1 + PERSP);
    this.vy = (this.topY - this.hitY * s1) / (1 - s1);
  }

  // Screen position of a point `x` (fraction of the bottom width, -0.5..0.5) at depth z (0 = hit line).
  private proj(x: number, z: number): { x: number; y: number; s: number } {
    const s = 1 / (1 + PERSP * z);
    return { x: this.cx + x * this.bottomW * s, y: this.vy + (this.hitY - this.vy) * s, s };
  }
  private laneX(l: number): number {
    return (l + 0.5) / LANES - 0.5;
  }

  /** Lane under a canvas point (CSS px), for touch. Points beside the highway go to the nearest lane. */
  laneAt(xCss: number, yCss: number): number {
    const x = xCss * this.dpr;
    const y = Math.min(this.hitY, Math.max(this.topY, yCss * this.dpr));
    const s = (y - this.vy) / (this.hitY - this.vy);
    const w = this.bottomW * Math.max(0.2, s);
    const f = (x - (this.cx - w / 2)) / w;
    return Math.max(0, Math.min(LANES - 1, Math.floor(f * LANES)));
  }

  onPress(lane: number, now: number): void {
    this.pressT[lane] = now;
  }

  onJudge(lane: number, j: Judgment, offset: number, now: number, part: string): void {
    if (part !== "tail" || j === "miss") this.judge = { j, t: now, offset };
    if (j !== "miss") {
      this.bursts.push({ lane, t: now, j });
      if (this.bursts.length > 24) this.bursts.shift();
      this.comboT = now;
    } else if (now > this.pose.until - 0.8) {
      this.pose = { leoul: "sad", lenyang: "sad", until: now + 1.1 };
    }
  }

  onCombo(combo: number, now: number): void {
    if (combo > 0 && combo % 25 === 0) this.pose = { leoul: "big", lenyang: "big", until: now + this.beat * 2 };
  }

  onFever(on: boolean, now: number): void {
    this.flash = on ? 1 : 0;
    if (on) this.pose = { leoul: "big", lenyang: "big", until: now + this.beat * 2 };
  }

  private sectionAt(now: number): "quiet" | "verse" | "chorus" {
    const k = (now - this.song.t0) / this.song.step;
    let s: Section = "quiet";
    for (const [kk, name] of this.song.sections) if (k >= kk) s = name;
    return s;
  }

  draw(e: RhythmEngine | null, now: number, dt: number, playing: boolean): void {
    const g = this.g;
    const { W, H } = this;
    const fever = !!e && e.inFever(now);
    const beatF = (now - this.song.t0) / this.beat;
    const phase = beatF - Math.floor(beatF);
    const sec = playing ? this.sectionAt(now) : "verse";
    const energy = !playing || now < 0 ? 0.35 : sec === "chorus" ? 1 : sec === "verse" ? 0.65 : 0.3;

    // stand: cover-fit, the two fan groups bounce in turn
    const set = this.sets[this.wide ? "wide" : "tall"];
    g.fillStyle = "#070b24";
    g.fillRect(0, 0, W, H);
    if (set.bg) {
      const im = set.bg;
      const sc = Math.max(W / im.width, H / im.height) * 1.02;
      const iw = im.width * sc;
      const ih = im.height * sc;
      const ox = (W - iw) / 2;
      const oy = this.wide ? (H - ih) * 0.4 : (H - ih) * 0.3;
      g.drawImage(im, ox, oy, iw, ih);
      const amp = H * (fever ? 0.016 : 0.009) * energy;
      const bounce = (p: number) => -amp * Math.pow(Math.max(0, Math.sin(Math.PI * p)), 2);
      if (set.b) g.drawImage(set.b, ox, oy + bounce((phase + 0.5) % 1), iw, ih);
      if (set.a) g.drawImage(set.a, ox, oy + bounce(phase), iw, ih);
    }
    // night wash so the highway reads, warmer and brighter on the beat in fever
    const wash = g.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, "rgba(6,10,36,0.5)");
    wash.addColorStop(0.16, "rgba(6,10,36,0.3)");
    wash.addColorStop(0.55, "rgba(6,10,36,0.45)");
    wash.addColorStop(1, "rgba(6,10,36,0.82)");
    g.fillStyle = wash;
    g.fillRect(0, 0, W, H);
    if (fever) {
      g.fillStyle = `rgba(255,194,58,${0.06 + 0.08 * Math.pow(1 - phase, 3)})`;
      g.fillRect(0, 0, W, H);
    }

    this.drawHighway(now, phase, fever);
    if (e) this.drawNotes(e, now);
    this.drawDrums(now);
    this.drawBursts(now);
    this.drawMascots(now, phase, playing, fever);
    if (e) this.drawJudge(e, now, fever);
    this.drawConfetti(dt, fever);
  }

  private drawHighway(now: number, phase: number, fever: boolean): void {
    const g = this.g;
    const zTop = 1;
    const zBot = -0.12;
    const L = this.proj(-0.5, zBot);
    const R = this.proj(0.5, zBot);
    const TL = this.proj(-0.5, zTop);
    const TR = this.proj(0.5, zTop);
    // body
    const body = g.createLinearGradient(0, TL.y, 0, L.y);
    body.addColorStop(0, "rgba(10,16,52,0.55)");
    body.addColorStop(1, "rgba(10,16,52,0.88)");
    g.beginPath();
    g.moveTo(TL.x, TL.y);
    g.lineTo(TR.x, TR.y);
    g.lineTo(R.x, R.y);
    g.lineTo(L.x, L.y);
    g.closePath();
    g.fillStyle = body;
    g.fill();
    // lane beams while pressed
    for (let l = 0; l < LANES; l++) {
      const since = now - this.pressT[l];
      const on = this.pressed[l] ? 1 : Math.max(0, 1 - since / 0.18);
      if (on <= 0.01) continue;
      const x0 = l / LANES - 0.5;
      const x1 = (l + 1) / LANES - 0.5;
      const a = this.proj(x0, 0.6);
      const b = this.proj(x1, 0.6);
      const c = this.proj(x1, 0);
      const d = this.proj(x0, 0);
      const grad = g.createLinearGradient(0, a.y, 0, c.y);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, hexA(LANE_COLOR[l], 0.34 * on));
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(c.x, c.y);
      g.lineTo(d.x, d.y);
      g.closePath();
      g.fillStyle = grad;
      g.fill();
    }
    // beat and bar lines
    const firstBeat = Math.ceil((now - this.song.t0) / this.beat);
    for (let b = firstBeat; b < firstBeat + 12; b++) {
      const t = this.song.t0 + b * this.beat;
      const z = (t - now) / this.visible;
      if (z > 1 || z < 0) continue;
      const a = this.proj(-0.5, z);
      const c = this.proj(0.5, z);
      const bar = ((b - 3) % 4 + 4) % 4 === 0;
      g.strokeStyle = bar ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.1)";
      g.lineWidth = (bar ? 2.2 : 1.2) * this.dpr * a.s;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(c.x, c.y);
      g.stroke();
    }
    // lane dividers
    for (let l = 0; l <= LANES; l++) {
      const x = l / LANES - 0.5;
      const a = this.proj(x, zTop);
      const b = this.proj(x, zBot);
      g.strokeStyle = l === 0 || l === LANES ? (fever ? "rgba(255,210,90,0.95)" : "rgba(255,255,255,0.55)") : "rgba(255,255,255,0.14)";
      g.lineWidth = (l === 0 || l === LANES ? 3 : 1.5) * this.dpr;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    if (fever) {
      // glowing rails
      g.save();
      g.shadowColor = "#ffc23a";
      g.shadowBlur = 24 * this.dpr * (0.5 + 0.5 * Math.pow(1 - phase, 2));
      g.strokeStyle = "rgba(255,210,90,0.9)";
      g.lineWidth = 4 * this.dpr;
      for (const x of [-0.5, 0.5]) {
        const a = this.proj(x, zTop);
        const b = this.proj(x, zBot);
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      g.restore();
    }
    // hit line
    const hl = this.proj(-0.5, 0);
    const hr = this.proj(0.5, 0);
    g.strokeStyle = "rgba(255,255,255,0.75)";
    g.lineWidth = 3 * this.dpr;
    g.beginPath();
    g.moveTo(hl.x, hl.y);
    g.lineTo(hr.x, hr.y);
    g.stroke();
  }

  private drawNotes(e: RhythmEngine, now: number): void {
    const g = this.g;
    const laneW = this.bottomW / LANES;
    const list: Note[] = [];
    for (const n of e.notes) {
      if (n.state === "done") continue;
      const zh = (n.t - now) / this.visible;
      const zt = (n.end - now) / this.visible;
      if (zh > 1.02 && n.state !== "holding") {
        if (zh > 3) break;
        continue;
      }
      if (zt < -0.15 && n.state !== "holding") continue;
      list.push(n);
    }
    // holds first (bodies under the heads), far to near
    for (const n of list) {
      if (!n.hold) continue;
      const held = n.state === "holding";
      const zh = held ? 0 : (n.t - now) / this.visible;
      const zt = Math.min(1, (n.end - now) / this.visible);
      if (zt <= zh) continue;
      const w = 0.62 / LANES;
      const xc = this.laneX(n.lane);
      const a = this.proj(xc - w / 2, zt);
      const b = this.proj(xc + w / 2, zt);
      const c = this.proj(xc + w / 2, Math.max(-0.1, zh));
      const d = this.proj(xc - w / 2, Math.max(-0.1, zh));
      const grad = g.createLinearGradient(0, a.y, 0, d.y);
      grad.addColorStop(0, hexA(LANE_COLOR[n.lane], held ? 0.55 : 0.32));
      grad.addColorStop(1, hexA(LANE_COLOR[n.lane], held ? 0.95 : 0.62));
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(c.x, c.y);
      g.lineTo(d.x, d.y);
      g.closePath();
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = held ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)";
      g.lineWidth = 2 * this.dpr;
      g.stroke();
      // tail cap
      const cap = this.proj(xc, zt);
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.beginPath();
      g.ellipse(cap.x, cap.y, (w / 2) * this.bottomW * cap.s, 5 * this.dpr * cap.s, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (n.state === "holding") continue;
      const z = (n.t - now) / this.visible;
      const p = this.proj(this.laneX(n.lane), z);
      const im = this.note[n.lane === 0 || n.lane === 3 ? 0 : 1];
      const w = laneW * 0.84 * p.s;
      if (im) {
        const h = (w * im.height) / im.width;
        g.drawImage(im, p.x - w / 2, p.y - h * 0.55, w, h);
      } else {
        g.fillStyle = LANE_COLOR[n.lane];
        g.beginPath();
        g.ellipse(p.x, p.y, w / 2, w / 3, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private drawDrums(now: number): void {
    const g = this.g;
    const laneW = this.bottomW / LANES;
    for (let l = 0; l < LANES; l++) {
      const p = this.proj(this.laneX(l), 0);
      const im = this.drum[l === 0 || l === 3 ? 0 : 1];
      const since = now - this.pressT[l];
      const squash = this.pressed[l] ? 0.9 : 1 - 0.1 * Math.max(0, 1 - since / 0.12);
      const w = laneW * 0.96;
      if (im) {
        const h = ((w * im.height) / im.width) * squash;
        g.drawImage(im, p.x - w / 2, p.y - h * 0.42, w, h);
      }
      if (this.pressed[l] || since < 0.15) {
        g.save();
        g.globalCompositeOperation = "lighter";
        const r = w * 0.46;
        const grad = g.createRadialGradient(p.x, p.y - w * 0.05, r * 0.2, p.x, p.y - w * 0.05, r);
        grad.addColorStop(0, hexA(LANE_COLOR[l], 0.55));
        grad.addColorStop(1, hexA(LANE_COLOR[l], 0));
        g.fillStyle = grad;
        g.beginPath();
        g.arc(p.x, p.y - w * 0.05, r, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      const key = this.labels?.keys[l];
      if (key) {
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.font = `900 ${Math.round(laneW * 0.16)}px system-ui, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "top";
        g.fillText(key, p.x, p.y + w * 0.5);
      }
    }
  }

  private drawBursts(now: number): void {
    const g = this.g;
    const laneW = this.bottomW / LANES;
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const b of this.bursts) {
      const age = now - b.t;
      if (age < 0 || age > 0.4) continue;
      const k = age / 0.4;
      const p = this.proj(this.laneX(b.lane), 0);
      const r = laneW * (0.3 + 0.55 * k);
      g.strokeStyle = hexA(b.j === "perfect" ? "#fff3b0" : LANE_COLOR[b.lane], (1 - k) * 0.9);
      g.lineWidth = laneW * 0.07 * (1 - k);
      g.beginPath();
      g.ellipse(p.x, p.y - laneW * 0.05, r, r * 0.55, 0, 0, Math.PI * 2);
      g.stroke();
      // sparks
      const n = b.j === "perfect" ? 10 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + b.lane;
        const d = laneW * (0.2 + 0.7 * k);
        g.fillStyle = hexA(i % 2 ? "#ffffff" : LANE_COLOR[b.lane], 1 - k);
        g.beginPath();
        g.arc(p.x + Math.cos(a) * d, p.y - laneW * 0.05 + Math.sin(a) * d * 0.55 - k * laneW * 0.3, laneW * 0.035 * (1 - k * 0.6), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  private drawJudge(e: RhythmEngine, now: number, fever: boolean): void {
    const g = this.g;
    const laneW = this.bottomW / LANES;
    const L = this.labels;
    const midY = this.hitY - (this.hitY - this.topY) * (this.wide ? 0.34 : 0.3);
    if (this.judge && L) {
      const age = now - this.judge.t;
      if (age >= 0 && age < 0.6) {
        const pop = age < 0.08 ? 0.75 + (age / 0.08) * 0.35 : 1.1 - Math.min(0.1, (age - 0.08) * 0.5);
        const a = age < 0.45 ? 1 : 1 - (age - 0.45) / 0.15;
        const j = this.judge.j;
        const size = Math.min(laneW * 0.58, this.H * 0.07) * pop;
        g.save();
        g.globalAlpha = a;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `900 ${Math.round(size)}px system-ui, "Apple SD Gothic Neo", sans-serif`;
        g.lineWidth = size * 0.16;
        g.strokeStyle = "#0b1238";
        const text = L.judgments[j].toUpperCase();
        g.strokeText(text, this.cx, midY);
        g.fillStyle = JUDGE_COLOR[j];
        g.fillText(text, this.cx, midY);
        if ((j === "great" || j === "good") && Math.abs(this.judge.offset) > 0.045) {
          g.font = `800 ${Math.round(size * 0.38)}px system-ui, sans-serif`;
          g.lineWidth = size * 0.08;
          const el = this.judge.offset < 0 ? L.early : L.late;
          g.strokeText(el.toUpperCase(), this.cx, midY + size * 0.72);
          g.fillStyle = this.judge.offset < 0 ? "#8fd3ff" : "#ffb38a";
          g.fillText(el.toUpperCase(), this.cx, midY + size * 0.72);
        }
        g.restore();
      }
    }
    if (e.combo >= 5 && L) {
      const age = now - this.comboT;
      const pop = age < 0.1 ? 1 + 0.18 * (1 - age / 0.1) : 1;
      const size = Math.min(laneW * 0.75, this.H * 0.09) * pop;
      const y = midY - size * 1.25;
      g.save();
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.globalAlpha = 0.9;
      g.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
      g.lineWidth = size * 0.12;
      g.strokeStyle = "#0b1238";
      g.strokeText(String(e.combo), this.cx, y);
      g.fillStyle = fever ? "#ffd04a" : "#ffffff";
      g.fillText(String(e.combo), this.cx, y);
      g.font = `800 ${Math.round(size * 0.3)}px system-ui, sans-serif`;
      g.lineWidth = size * 0.06;
      const lab = fever ? `${L.fever.toUpperCase()} ×2` : L.combo.toUpperCase();
      g.strokeText(lab, this.cx, y - size * 0.72);
      g.fillStyle = fever ? "#ffd04a" : "rgba(255,255,255,0.85)";
      g.fillText(lab, this.cx, y - size * 0.72);
      g.restore();
    }
  }

  private drawMascots(now: number, phase: number, playing: boolean, fever: boolean): void {
    const g = this.g;
    if (now > this.pose.until) {
      const cheering = fever || (playing && this.sectionAt(now) === "chorus");
      const alt = Math.floor((now - this.song.t0) / this.beat) % 2 === 0;
      this.pose = cheering
        ? { leoul: alt ? "big" : "cheer", lenyang: alt ? "cheer" : "big", until: now }
        : { leoul: "ready", lenyang: "ready", until: now };
    }
    const bob = Math.pow(Math.max(0, Math.sin(Math.PI * phase)), 2);
    const draw = (who: "leoul" | "lenyang", side: -1 | 1) => {
      const im = this.mascots[who][this.pose[who]] ?? this.mascots[who].ready;
      if (!im) return;
      let h: number;
      let x: number;
      let yb: number;
      if (this.wide) {
        h = this.H * 0.36;
        const edge = this.cx + side * (this.bottomW / 2 + this.H * 0.03);
        x = side < 0 ? edge - (h * im.width) / im.height : edge;
        yb = this.H * 0.97;
      } else {
        h = this.H * 0.12;
        x = side < 0 ? this.W * 0.03 : this.W * 0.97 - (h * im.width) / im.height;
        yb = this.topY + h * 1.05;
      }
      const w = (h * im.width) / im.height;
      const lift = h * 0.05 * bob * (playing ? 1 : 0.4);
      const sq = 1 - 0.035 * bob;
      g.drawImage(im, x, yb - h * sq - lift, w, h * sq);
    };
    draw("leoul", -1);
    draw("lenyang", 1);
  }

  private drawConfetti(dt: number, fever: boolean): void {
    const g = this.g;
    if (fever && this.confetti.length < 140) {
      for (let i = 0; i < 3; i++)
        this.confetti.push({
          x: Math.random() * this.W,
          y: -10,
          vx: (Math.random() - 0.5) * 60 * this.dpr,
          vy: (120 + Math.random() * 140) * this.dpr,
          r: (4 + Math.random() * 5) * this.dpr,
          a: Math.random() * 6,
          va: (Math.random() - 0.5) * 10,
          c: ["#ffc23a", "#58c6ff", "#ffffff", "#1d2a66", "#ff6b6b"][Math.floor(Math.random() * 5)],
        });
    }
    for (const c of this.confetti) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.a += c.va * dt;
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.a);
      g.fillStyle = c.c;
      g.fillRect(-c.r, -c.r * 0.45, c.r * 2, c.r * 0.9);
      g.restore();
    }
    this.confetti = this.confetti.filter((c) => c.y < this.H + 20);
  }

  reset(): void {
    this.bursts = [];
    this.judge = null;
    this.confetti = [];
    this.pressed = [false, false, false, false];
    this.pressT = [-9, -9, -9, -9];
    this.pose = { leoul: "ready", lenyang: "ready", until: 0 };
  }
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
