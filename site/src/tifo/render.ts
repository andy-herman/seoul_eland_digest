import { PALETTE, SEAT_MAP, TIFO_COLS, TIFO_ROWS, type TifoDesign, type WaveMode } from "./data";
import { SONG_STEP, SONG_T0 } from "../rhythm/charts";

export interface TifoRendererOptions {
  assets: string;
  onPick?: (index: number) => void;
}

type Three = typeof import("three");

export class TifoRenderer {
  private THREE!: Three;
  private renderer!: import("three").WebGLRenderer;
  private scene!: import("three").Scene;
  private camera!: import("three").PerspectiveCamera;
  private cards!: import("three").InstancedMesh;
  private fans!: import("three").InstancedMesh;
  private cardMat!: import("three").MeshBasicMaterial;
  private dummy!: import("three").Object3D;
  private colors!: Float32Array;
  private target: Uint8Array = new Uint8Array(TIFO_COLS * TIFO_ROWS);
  private lowered = true;
  private start = 0;
  private active = false;
  private frame = 0;
  private wave: WaveMode = "left";
  private raycaster!: import("three").Raycaster;
  private pointer!: import("three").Vector2;
  private yaw = 0;
  private pitch = 0;
  private dist = 34;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastPickedAt = 0;
  private disposed = false;
  private usable: number[] = [];
  private cardToSeat: number[] = [];
  private seatToCard = new Map<number, number>();

  constructor(private canvas: HTMLCanvasElement, private opts: TifoRendererOptions) {}

  async init(): Promise<void> {
    this.THREE = await import("three");
    const THREE = this.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#071228");
    this.scene.fog = new THREE.Fog("#071228", 35, 88);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
    this.dummy = new THREE.Object3D();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.scene.add(new THREE.HemisphereLight("#c5d9ff", "#101020", 1.7));
    const light = new THREE.DirectionalLight("#fff5c8", 2.2);
    light.position.set(-12, 20, 10);
    this.scene.add(light);
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
    const concrete = new THREE.MeshStandardMaterial({ color: "#5d6470", roughness: 0.85 });
    const navy = new THREE.MeshStandardMaterial({ color: "#151d3d", roughness: 0.75 });
    const gold = new THREE.MeshStandardMaterial({ color: "#ffc23a", emissive: "#332000", roughness: 0.55 });
    for (let r = 0; r < TIFO_ROWS; r++) {
      const z = -r * 0.78;
      const y = r * 0.18;
      add(new THREE.BoxGeometry(42, 0.16, 0.72), concrete, 0, y - 0.18, z + 0.12);
      add(new THREE.BoxGeometry(42, 0.08, 0.18), navy, 0, y, z - 0.22);
    }
    add(new THREE.BoxGeometry(45, 1.5, 0.35), concrete, 0, -0.8, 1.4);
    for (const [x, text] of [[-12, "SEOUL E-LAND FC"], [12, "레울파크"]] as const) {
      const board = add(new THREE.BoxGeometry(17, 1.1, 0.16), gold, x, -0.35, 1.18);
      board.name = text;
    }
    const aisleMat = new THREE.MeshStandardMaterial({ color: "#828b96", roughness: 0.9 });
    for (const col of [11, 23, 35]) {
      const x = (col - (TIFO_COLS - 1) / 2) * 0.82;
      add(new THREE.BoxGeometry(0.62, 4.2, 16), aisleMat, x, 1.1, -7.2, -0.08);
    }
    const pillar = new THREE.MeshStandardMaterial({ color: "#253047", roughness: 0.65 });
    for (const col of [15.5, 31.5]) {
      const x = (col - (TIFO_COLS - 1) / 2) * 0.82;
      add(new THREE.CylinderGeometry(0.28, 0.34, 7.8, 12), pillar, x, 3.2, -12.2);
    }
    add(new THREE.BoxGeometry(46, 0.35, 5), pillar, 0, 5.2, -10.8, 0.05);
    for (const x of [-20, 20]) {
      const pole = add(new THREE.CylinderGeometry(0.12, 0.12, 9, 10), pillar, x, 3.6, 3.4);
      add(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: "#fff7bd" }), x, 7.9, 3.4);
      const flood = new THREE.PointLight("#fff7bd", 38, 55);
      flood.position.set(x, 7.9, 3.4);
      this.scene.add(flood);
      void pole;
    }
  }

  private buildInstances(): void {
    const THREE = this.THREE;
    this.usable = SEAT_MAP.filter((c) => c.usable).map((c) => c.index);
    this.cardToSeat = [...this.usable];
    this.usable.forEach((idx, i) => this.seatToCard.set(idx, i));
    const n = this.usable.length;
    const fanGeo = new THREE.CapsuleGeometry(0.16, 0.34, 3, 8);
    const fanMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    this.fans = new THREE.InstancedMesh(fanGeo, fanMat, n);
    this.cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.58, 0.42), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), n);
    this.cardMat = this.cards.material as import("three").MeshBasicMaterial;
    this.colors = new Float32Array(n * 3);
    const shirt = ["#1b2446", "#1b2446", "#1b2446", "#ffc23a", "#ffffff"];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const idx = this.usable[i], col = idx % TIFO_COLS, row = Math.floor(idx / TIFO_COLS);
      const x = (col - (TIFO_COLS - 1) / 2) * 0.82;
      const z = -row * 0.78;
      const y = row * 0.18 + 0.48;
      this.dummy.position.set(x, y, z - 0.08);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.fans.setMatrixAt(i, this.dummy.matrix);
      c.set(shirt[(i * 17) % shirt.length]);
      this.fans.setColorAt(i, c);
    }
    this.scene.add(this.fans, this.cards);
  }

  setDesign(design: TifoDesign, frame = 0): void {
    this.wave = design.wave;
    this.frame = Math.min(frame, design.frames.length - 1);
    this.target = design.frames[this.frame];
    this.lowered = true;
    this.active = false;
    this.applyCards(0);
  }

  setFrame(frame: Uint8Array): void {
    this.target = frame;
    this.lowered = false;
    this.applyCards(1);
    this.render();
  }

  play(design: TifoDesign, speed = 1): void {
    this.setDesign(design, 0);
    this.start = performance.now();
    this.active = true;
    this.lowered = false;
    let nextFrame = 1;
    const switchMs = SONG_STEP * 32 * 1000 / speed;
    const tick = () => {
      if (!this.active || this.disposed) return;
      const t = (performance.now() - this.start) * speed / 1000;
      this.applyCards(Math.min(1, t / 1.8));
      if (design.frames.length > 1 && performance.now() - this.start > switchMs * nextFrame) {
        this.frame = nextFrame % design.frames.length;
        this.target = design.frames[this.frame];
        nextFrame++;
      }
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

  private applyCards(progress: number): void {
    const THREE = this.THREE;
    const color = new THREE.Color();
    const now = progress * 2.6;
    for (let i = 0; i < this.cardToSeat.length; i++) {
      const idx = this.cardToSeat[i];
      const col = idx % TIFO_COLS, row = Math.floor(idx / TIFO_COLS);
      const x = (col - (TIFO_COLS - 1) / 2) * 0.82;
      const z = -row * 0.78 - 0.08;
      const y = row * 0.18 + 0.72 + Math.sin(performance.now() * 0.002 + i) * 0.015;
      const delay = (this.flipTiming(idx) - SONG_T0 - SONG_STEP * 12) * 0.45;
      const p = Math.max(0, Math.min(1, (now - delay) / 0.35));
      const eased = p * p * (3 - 2 * p);
      this.dummy.position.set(x, y + eased * 0.34, z + eased * 0.03);
      this.dummy.rotation.set(-Math.PI / 2 + eased * (Math.PI / 2), 0, 0);
      this.dummy.updateMatrix();
      this.cards.setMatrixAt(i, this.dummy.matrix);
      color.set(PALETTE[this.target[idx] ?? 0].hex);
      this.cards.setColorAt(i, color);
    }
    this.cards.instanceMatrix.needsUpdate = true;
    if (this.cards.instanceColor) this.cards.instanceColor.needsUpdate = true;
  }

  private bindInput(): void {
    this.canvas.addEventListener("pointerdown", (e) => { this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.yaw = Math.max(-0.45, Math.min(0.45, this.yaw + dx * 0.004));
      this.pitch = Math.max(-0.18, Math.min(0.22, this.pitch + dy * 0.003));
      this.render();
    });
    this.canvas.addEventListener("pointerup", (e) => {
      if (Math.abs(e.clientX - this.lastX) < 4 && Math.abs(e.clientY - this.lastY) < 4 && this.pick(e)) this.lastPickedAt = performance.now();
      this.dragging = false;
    });
    this.canvas.addEventListener("click", (e) => {
      if (performance.now() - this.lastPickedAt > 120) this.pick(e as PointerEvent);
    });
    this.canvas.addEventListener("wheel", (e) => { e.preventDefault(); this.dist = Math.max(22, Math.min(52, this.dist + e.deltaY * 0.02)); this.render(); }, { passive: false });
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
    let best = -1;
    let bd = 72 * 72;
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

  resize = (): void => {
    if (!this.renderer) return;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 56 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.render();
  };

  render(): void {
    if (this.disposed || !this.renderer) return;
    const portrait = this.camera.aspect < 1;
    const d = portrait ? this.dist + 12 : this.dist;
    this.camera.position.set(Math.sin(this.yaw) * 18, 8.3 + this.pitch * 10, 9 + d * 0.55);
    this.camera.lookAt(0, 1.6 + this.pitch * 4, -7.8);
    this.renderer.render(this.scene, this.camera);
  }

  screenshot(): string {
    this.render();
    return this.canvas.toDataURL("image/png");
  }

  screenOf(index: number): { x: number; y: number } | null {
    if (!this.renderer) return null;
    const THREE = this.THREE;
    const col = index % TIFO_COLS;
    const row = Math.floor(index / TIFO_COLS);
    const v = new THREE.Vector3((col - (TIFO_COLS - 1) / 2) * 0.82, row * 0.18 + 1.08, -row * 0.78 - 0.05);
    v.project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) * 0.5 * r.width, y: r.top + (1 - (v.y + 1) * 0.5) * r.height };
  }

  dispose(): void {
    this.disposed = true;
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
