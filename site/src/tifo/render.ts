import { PALETTE, SEAT_MAP, TIFO_COLS, TIFO_ROWS, type TifoDesign, type WaveMode } from "./data";
import { SONG_STEP, SONG_T0 } from "../rhythm/charts";

export interface TifoRendererOptions {
  assets: string;
  onPick?: (index: number) => void;
  /** Fractions of the canvas height at the top and bottom covered by page overlays (Card Check's bars). */
  reserveTop?: () => number;
  reserveBottom?: () => number;
}

type Three = typeof import("three");

// The Mokdong north stand for the show and Card Check. Every seat holds one card; on the cue the cards
// flip up in their own rows in a wave, and between frames each card turns over to its next colour.
// The seat pitch matches what one row adds on screen (rise and depth seen from a slightly raised long
// lens across the pitch), so a card is square on screen and the stand shows the grid as drawn.
const PX = 0.5; // seat width (column pitch)
const RISE = 0.42; // each row is this much higher ...
const DEPTH = 0.6; // ... and this much further back: a 35 degree rake
const CARD_W = 0.49;
const CARD_H = 0.5; // cards just cover their cell, so the seats behind do not speckle the picture
const CARD_Y = 0.8; // a raised card's centre above its row's step
const CARD_Z = 0.04; // in front of the fan holding it
const FOV = 16; // a long lens, as seen from the opposite stand, so every row looks the same
const TILT = 0.14; // the camera looks down this much (radians); with it a row adds as much as a seat is wide
const STAND_W = TIFO_COLS * PX;
const BACK = "#d7dce8"; // the back of a card, seen while it turns
const RAISE_AT = 1.4; // seconds after the show starts: Leoul has counted 하나, 둘, 셋
const RAISE_FOR = 0.34;
const TURN_FOR = 0.26;
const FRAME_SEC = SONG_STEP * 32; // eight beats of the club song per frame

export class TifoRenderer {
  private THREE!: Three;
  private renderer!: import("three").WebGLRenderer;
  private scene!: import("three").Scene;
  private camera!: import("three").PerspectiveCamera;
  private cards!: import("three").InstancedMesh;
  private fans!: import("three").InstancedMesh;
  private dummy!: import("three").Object3D;
  private colors: import("three").Color[] = [];
  private back!: import("three").Color;
  private target: Uint8Array = new Uint8Array(TIFO_COLS * TIFO_ROWS);
  private previous: Uint8Array = new Uint8Array(TIFO_COLS * TIFO_ROWS);
  private start = 0;
  private speed = 1;
  private turnAt = -1; // show time the current frame started turning over (s), -1 before any change
  private active = false;
  private raisedAll = false; // Card Check and still frames: every card up, no animation
  private frame = 0;
  private wave: WaveMode = "left";
  private raycaster!: import("three").Raycaster;
  private pointer!: import("three").Vector2;
  private yaw = 0;
  private pitch = 0;
  private zoom = 1;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastPickedAt = 0;
  private disposed = false;
  private usable: number[] = [];
  private cardToSeat: number[] = [];
  private seatToCard = new Map<number, number>();
  private offsets: number[] = []; // per card: its place in the wave, s
  private focusCols = TIFO_COLS; // Card Check frames only the part of the stand a level uses
  private focusRows = TIFO_ROWS;

  constructor(private canvas: HTMLCanvasElement, private opts: TifoRendererOptions) {}

  private sx(col: number): number {
    return (col - (TIFO_COLS - 1) / 2) * PX;
  }

  private sz(row: number): number {
    return -row * DEPTH;
  }

  private sy(row: number): number {
    return row * RISE;
  }

  /** The stand row a card index sits in. Grid row 0 is the top of the picture, so it is the back row. */
  private standRow(index: number): number {
    return TIFO_ROWS - 1 - Math.floor(index / TIFO_COLS);
  }

  async init(): Promise<void> {
    this.THREE = await import("three");
    const THREE = this.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a1730");
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 600);
    this.dummy = new THREE.Object3D();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.colors = PALETTE.map((c) => new THREE.Color(c.hex));
    this.back = new THREE.Color(BACK);
    this.scene.add(new THREE.HemisphereLight("#d8e7ff", "#26304a", 2.1));
    for (const [x, z] of [[-18, 20], [18, 20], [0, 30]] as const) {
      const light = new THREE.DirectionalLight("#fff2bf", 1.4);
      light.position.set(x, 26, z);
      this.scene.add(light);
    }
    this.buildShell();
    this.buildInstances();
    this.bindInput();
    this.resize();
    addEventListener("resize", this.resize);
  }

  private buildShell(): void {
    const THREE = this.THREE;
    const add = (geo: import("three").BufferGeometry, mat: import("three").Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz); this.scene.add(m); return m;
    };
    const concrete = new THREE.MeshStandardMaterial({ color: "#6d7784", roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: "#1d2645", roughness: 0.75 });
    const seat = new THREE.MeshStandardMaterial({ color: "#1b2a66", roughness: 0.6 });
    const grass = new THREE.MeshStandardMaterial({ color: "#2f8a4c", roughness: 0.95 });
    const stripe = new THREE.MeshStandardMaterial({ color: "#3a9a58", roughness: 0.95 });
    const chalk = new THREE.MeshBasicMaterial({ color: "#f2f6ff" });
    const lamp = new THREE.MeshBasicMaterial({ color: "#fff7cf" });
    const top = this.sy(TIFO_ROWS - 1);
    const back = this.sz(TIFO_ROWS - 1);
    // the pitch in front: mown stripes and the goal line
    add(new THREE.BoxGeometry(STAND_W + 30, 0.1, 16), grass, 0, -0.9, 9.6);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(STAND_W + 30, 0.02, 2), stripe, 0, -0.84, 3.6 + i * 4);
    add(new THREE.BoxGeometry(STAND_W + 30, 0.03, 0.14), chalk, 0, -0.82, 2.35);
    // terraces: a step and a row of navy seat backs for every row
    for (let r = 0; r < TIFO_ROWS; r++) {
      add(new THREE.BoxGeometry(STAND_W + 1.2, 0.2, DEPTH + 0.02), concrete, 0, this.sy(r) - 0.3, this.sz(r) - 0.2);
      add(new THREE.BoxGeometry(STAND_W + 0.4, 0.34, 0.08), seat, 0, this.sy(r) - 0.05, this.sz(r) - 0.46);
    }
    // front wall with the advertising boards
    add(new THREE.BoxGeometry(STAND_W + 3, 1.6, 0.4), concrete, 0, -0.55, 1.2);
    for (const [x, text] of [[-STAND_W / 4, "SEOUL E-LAND FC"], [STAND_W / 4, "레울파크"]] as const) {
      add(new THREE.PlaneGeometry(STAND_W / 2 - 0.6, 1.05), new THREE.MeshBasicMaterial({ map: this.boardTexture(text), toneMapped: false }), x, -0.45, 1.41);
    }
    // raked side walls with the stairs, outside the card block
    const slope = Math.atan2(RISE, DEPTH);
    const len = Math.hypot(top, back) + 2.4;
    for (const side of [-1, 1]) {
      const x = side * (STAND_W / 2 + 0.95);
      add(new THREE.BoxGeometry(1.3, 0.9, len), concrete, x, top / 2 - 0.1, back / 2 - 0.2, slope);
      add(new THREE.BoxGeometry(0.5, 2.2, len), dark, side * (STAND_W / 2 + 1.85), top / 2 + 0.5, back / 2 - 0.2, slope);
    }
    // back wall and roof, above and behind the top row
    add(new THREE.BoxGeometry(STAND_W + 5, 3.2, 0.4), dark, 0, top + 1.8, back - 1.0);
    add(new THREE.BoxGeometry(STAND_W + 6, 0.4, 8), dark, 0, top + 3.6, back - 1.6, -0.1);
    add(new THREE.BoxGeometry(STAND_W + 6, 0.35, 0.3), lamp, 0, top + 3.2, back + 2.3, -0.1);
    for (let i = -5; i <= 5; i++) add(new THREE.SphereGeometry(0.36, 12, 8), lamp, i * (STAND_W + 4) / 10, top + 2.95, back + 2.35);
    const flood = new THREE.PointLight("#fff4c8", 260, 70);
    flood.position.set(0, top + 3, back + 4);
    this.scene.add(flood);
  }

  private boardTexture(text: string): import("three").CanvasTexture {
    const THREE = this.THREE;
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, c.width, 0);
    grad.addColorStop(0, "#09183a");
    grad.addColorStop(0.5, "#1b2446");
    grad.addColorStop(1, "#09183a");
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#ffc23a";
    g.lineWidth = 8;
    g.strokeRect(8, 8, c.width - 16, c.height - 16);
    g.fillStyle = "#ffc23a";
    g.font = text.includes("레") ? "900 70px Apple SD Gothic Neo, Malgun Gothic, sans-serif" : "900 60px Arial Rounded MT Bold, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, c.width / 2, c.height / 2 + 3);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private buildInstances(): void {
    const THREE = this.THREE;
    this.usable = SEAT_MAP.filter((c) => c.usable).map((c) => c.index);
    this.cardToSeat = [...this.usable];
    this.usable.forEach((idx, i) => this.seatToCard.set(idx, i));
    const n = this.usable.length;
    const fanGeo = new THREE.CapsuleGeometry(0.16, 0.36, 3, 8);
    const fanMat = new THREE.MeshStandardMaterial({ roughness: 0.72 });
    this.fans = new THREE.InstancedMesh(fanGeo, fanMat, n);
    this.cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), n);
    // the supporters' end in the home shirt, with some white and gold scarves and away shirts
    const shirt = ["#1b2446", "#1b2446", "#1b2446", "#223a8c", "#1b2446", "#223a8c", "#1b2446", "#ffffff", "#ffc23a"];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const idx = this.usable[i], col = idx % TIFO_COLS, row = this.standRow(idx);
      this.dummy.position.set(this.sx(col), this.sy(row) + 0.32, this.sz(row) - 0.2);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.fans.setMatrixAt(i, this.dummy.matrix);
      c.set(shirt[(i * 17 + row * 3) % shirt.length]);
      this.fans.setColorAt(i, c);
    }
    this.scene.add(this.fans, this.cards);
  }

  /** Each card's delay in the wave (s), from the beat-grid flip timing, starting at 0. */
  private waveOffsets(): void {
    const times = this.cardToSeat.map((idx) => this.flipTiming(idx));
    const first = Math.min(...times);
    this.offsets = times.map((x) => x - first);
  }

  setDesign(design: TifoDesign, frame = 0): void {
    this.wave = design.wave;
    this.frame = Math.min(frame, design.frames.length - 1);
    this.target = design.frames[this.frame];
    this.previous = this.target;
    this.turnAt = -1;
    this.active = false;
    this.raisedAll = false;
    this.waveOffsets();
    this.applyCards(0);
  }

  /** Frame a centred block of cols x rows cards (plus a small margin) instead of the whole stand. */
  focus(cols: number, rows: number): void {
    this.focusCols = Math.min(TIFO_COLS, cols + 4);
    this.focusRows = Math.min(TIFO_ROWS, rows + 2);
    this.render();
  }

  /** Card Check and QA: show one frame with every card up, straight away. */
  setFrame(frame: Uint8Array): void {
    this.target = frame;
    this.previous = frame;
    this.turnAt = -1;
    this.raisedAll = true;
    if (!this.offsets.length) this.waveOffsets();
    this.applyCards(Infinity);
    this.render();
  }

  play(design: TifoDesign, speed = 1): void {
    this.setDesign(design, 0);
    this.speed = speed;
    this.start = performance.now();
    this.active = true;
    let nextFrame = 1;
    const tick = () => {
      if (!this.active || this.disposed) return;
      const t = ((performance.now() - this.start) / 1000) * this.speed;
      // after the first wave has gone up, the stand turns to the next frame every eight beats
      if (design.frames.length > 1 && t >= RAISE_AT + FRAME_SEC * nextFrame) {
        this.previous = this.target;
        this.frame = nextFrame % design.frames.length;
        this.target = design.frames[this.frame];
        this.turnAt = RAISE_AT + FRAME_SEC * nextFrame;
        nextFrame++;
      }
      this.applyCards(t);
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  flipTiming(index: number, wave: WaveMode = this.wave): number {
    const col = index % TIFO_COLS;
    const row = Math.floor(index / TIFO_COLS);
    const unit = SONG_STEP * 0.5;
    const base = SONG_T0 + SONG_STEP * 12;
    const k = wave === "center" ? Math.abs(col - (TIFO_COLS - 1) / 2) : wave === "bottom" ? TIFO_ROWS - 1 - row : col;
    return base + Math.round(k * 0.42) * unit;
  }

  /** Place every card for show time t (s): lowered, rising in the wave, up, or turning over. */
  private applyCards(t: number): void {
    const now = performance.now() * 0.002;
    for (let i = 0; i < this.cardToSeat.length; i++) {
      const idx = this.cardToSeat[i];
      const col = idx % TIFO_COLS, row = this.standRow(idx);
      const off = this.offsets[i] ?? 0;
      const up = this.raisedAll ? 1 : Math.max(0, Math.min(1, (t - RAISE_AT - off) / RAISE_FOR));
      const e = up * up * (3 - 2 * up);
      // turning over to the next frame: the card squashes to its edge, then opens on the new colour
      let squash = 1;
      let showNew = true;
      if (this.turnAt >= 0 && !this.raisedAll) {
        const u = (t - this.turnAt - off) / TURN_FOR;
        if (u < 0) showNew = false;
        else if (u < 1) {
          squash = Math.max(0.04, Math.abs(Math.cos(Math.PI * u)));
          showNew = u >= 0.5;
        }
      }
      const bob = e >= 1 && !this.raisedAll ? Math.sin(now + i * 0.7) * 0.01 : 0;
      this.dummy.position.set(this.sx(col), this.sy(row) + 0.42 + e * (CARD_Y - 0.42) + bob, this.sz(row) + 0.06 + e * (CARD_Z - 0.06));
      // from flat on the fan's lap (facing up) to upright, leaning back toward the camera
      this.dummy.rotation.set(-Math.PI / 2 + e * (Math.PI / 2 - TILT), 0, 0);
      this.dummy.scale.set(1, squash, 1);
      this.dummy.updateMatrix();
      this.cards.setMatrixAt(i, this.dummy.matrix);
      const colour = e < 0.5 ? this.back : this.colors[(showNew ? this.target[idx] : this.previous[idx]) ?? 0];
      this.cards.setColorAt(i, colour);
    }
    this.cards.instanceMatrix.needsUpdate = true;
    if (this.cards.instanceColor) this.cards.instanceColor.needsUpdate = true;
    this.cards.computeBoundingSphere();
    this.cards.computeBoundingBox();
  }

  private bindInput(): void {
    this.canvas.addEventListener("pointerdown", (e) => { this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY; this.downX = e.clientX; this.downY = e.clientY; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.yaw = Math.max(-0.35, Math.min(0.35, this.yaw + dx * 0.003));
      this.pitch = Math.max(-0.1, Math.min(0.25, this.pitch + dy * 0.002));
      this.render();
    });
    const up = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (Math.abs(e.clientX - this.downX) < 6 && Math.abs(e.clientY - this.downY) < 6 && this.pick(e)) this.lastPickedAt = performance.now();
      this.settle();
    };
    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", () => { this.dragging = false; this.settle(); });
    this.canvas.addEventListener("click", (e) => {
      if (performance.now() - this.lastPickedAt > 120) this.pick(e as PointerEvent);
    });
    this.canvas.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom = Math.max(0.45, Math.min(1.25, this.zoom * Math.exp(e.deltaY * 0.001))); this.render(); }, { passive: false });
  }
  private downX = 0;
  private downY = 0;

  /** Spring back to the default view after a drag (the show loop does this every frame anyway). */
  private settle(): void {
    if (this.active) return;
    const step = () => {
      if (this.dragging || this.disposed) return;
      this.render();
      if (Math.abs(this.yaw) + Math.abs(this.pitch) > 0.002) requestAnimationFrame(step);
      else { this.yaw = 0; this.pitch = 0; this.render(); }
    };
    requestAnimationFrame(step);
  }

  private pick(e: PointerEvent): boolean {
    if (!this.opts.onPick) return false;
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.cards)[0];
    if (hit?.instanceId != null) {
      this.opts.onPick(this.cardToSeat[hit.instanceId]);
      return true;
    }
    // between cards: take the nearest card within about one card of the finger
    const cell = this.cellPixels();
    let best = -1;
    let bd = Math.max(18, cell * 1.2) ** 2;
    for (const idx of this.cardToSeat) {
      const p = this.screenOf(idx);
      if (!p) continue;
      const d = (p.x - e.clientX) ** 2 + (p.y - e.clientY) ** 2;
      if (d < bd) { bd = d; best = idx; }
    }
    if (best >= 0) {
      this.opts.onPick(best);
      return true;
    }
    return false;
  }

  /** How many CSS pixels one card spans on screen right now (for tap tolerance and QA). */
  cellPixels(): number {
    const a = this.screenOf(9 * TIFO_COLS + 23);
    const b = this.screenOf(9 * TIFO_COLS + 24);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 10;
  }

  resize = (): void => {
    if (!this.renderer) return;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.camera.aspect = w / h;
    this.camera.fov = FOV;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.render();
  };

  /**
   * Default view: the whole card block, as wide as fits the canvas and at most 58% of the height left
   * below any overlay, with its middle at `yc` (a fraction of the canvas height from the top).
   */
  private framing(): { distance: number; cy: number; cz: number; yc: number } {
    const vHalf = Math.tan(((this.camera.fov * Math.PI) / 180) / 2);
    const hHalf = vHalf * this.camera.aspect;
    const width = (this.focusCols - 1) * PX + CARD_W;
    const height = (this.focusRows - 1) * (RISE * Math.cos(TILT) + DEPTH * Math.sin(TILT)) + CARD_H;
    const reserve = this.opts.reserveTop?.() ?? 0;
    const below = this.opts.reserveBottom?.() ?? 0;
    const avail = Math.max(0.3, 1 - reserve - below);
    const fitW = this.camera.aspect < 1 ? 0.94 : 0.86;
    // the show leaves room for the roof and the pitch; Card Check gives the cards the space between its bars
    const fitH = reserve > 0 || below > 0 ? 0.9 : 0.58;
    const distance = Math.max(width / (2 * fitW * hHalf), height / (2 * fitH * avail * vHalf));
    const mid = (TIFO_ROWS - 1) / 2;
    // the show sits a little above the middle, so the buttons at the bottom cover only the pitch
    const yc = reserve > 0 || below > 0 ? reserve + avail * 0.5 : 0.45;
    return { distance, cy: this.sy(mid) + CARD_Y, cz: this.sz(mid) + CARD_Z, yc };
  }

  render(): void {
    if (this.disposed || !this.renderer) return;
    if (!this.dragging) {
      this.yaw *= 0.9;
      this.pitch *= 0.9;
    }
    const { distance, cy, cz, yc } = this.framing();
    const d = distance * this.zoom;
    const tilt = TILT + this.pitch;
    const lift = (0.5 - yc) * 2 * d * Math.tan(((this.camera.fov * Math.PI) / 180) / 2);
    this.camera.position.set(Math.sin(this.yaw) * d * Math.cos(tilt), cy - lift + Math.sin(tilt) * d, cz + Math.cos(this.yaw) * Math.cos(tilt) * d);
    this.camera.lookAt(0, cy - lift, cz);
    this.camera.far = d + 80;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  screenshot(): string {
    this.render();
    return this.canvas.toDataURL("image/png");
  }

  /** Where a raised card's centre is on the page (CSS pixels). */
  screenOf(index: number): { x: number; y: number } | null {
    if (!this.renderer) return null;
    const THREE = this.THREE;
    const col = index % TIFO_COLS;
    const row = this.standRow(index);
    const v = new THREE.Vector3(this.sx(col), this.sy(row) + CARD_Y, this.sz(row) + CARD_Z);
    v.project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) * 0.5 * r.width, y: r.top + (1 - (v.y + 1) * 0.5) * r.height };
  }

  rayFirst(index: number): boolean {
    const p = this.screenOf(index);
    const cardIndex = this.seatToCard.get(index);
    if (!p || cardIndex == null) return false;
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((p.x - r.left) / r.width) * 2 - 1, -((p.y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([this.cards, this.fans, ...this.scene.children.filter((o) => o !== this.cards && o !== this.fans)], false)[0];
    return hit?.object === this.cards && hit.instanceId === cardIndex;
  }

  dispose(): void {
    this.disposed = true;
    this.active = false;
    removeEventListener("resize", this.resize);
    this.scene?.traverse((o) => {
      const m = o as import("three").Mesh;
      m.geometry?.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats as import("three").Material[]) mat.dispose();
    });
    this.renderer?.dispose();
  }
}
