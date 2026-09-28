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
  private dummy!: import("three").Object3D;
  private target: Uint8Array = new Uint8Array(TIFO_COLS * TIFO_ROWS);
  private lowered = true;
  private start = 0;
  private active = false;
  private frame = 0;
  private wave: WaveMode = "left";
  private raycaster!: import("three").Raycaster;
  private pointer!: import("three").Vector2;
  private yaw = 0;
  private pitch = -0.05;
  private dist = 62;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastPickedAt = 0;
  private disposed = false;
  private usable: number[] = [];
  private cardToSeat: number[] = [];
  private seatToCard = new Map<number, number>();

  constructor(private canvas: HTMLCanvasElement, private opts: TifoRendererOptions) {}

  private sx(col: number): number {
    return (col - (TIFO_COLS - 1) / 2) * 0.82;
  }

  private sz(row: number): number {
    return -row * 0.6;
  }

  private sy(row: number): number {
    return row * 0.42;
  }

  async init(): Promise<void> {
    this.THREE = await import("three");
    const THREE = this.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a1730");
    this.scene.fog = new THREE.Fog("#0a1730", 80, 150);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
    this.dummy = new THREE.Object3D();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.scene.add(new THREE.HemisphereLight("#d8e7ff", "#26304a", 2.2));
    for (const [x, z] of [[-22, 7], [22, 7], [-18, -18], [18, -18]] as const) {
      const light = new THREE.DirectionalLight("#fff2bf", 1.7);
      light.position.set(x, 22, z);
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
    const concrete = new THREE.MeshStandardMaterial({ color: "#66707c", roughness: 0.78 });
    const navy = new THREE.MeshStandardMaterial({ color: "#17234c", roughness: 0.7 });
    const gold = new THREE.MeshStandardMaterial({ color: "#ffc23a", emissive: "#392500", roughness: 0.5 });
    const pitch = new THREE.MeshStandardMaterial({ color: "#2b7544", roughness: 0.9 });
    add(new THREE.BoxGeometry(58, 0.08, 7), pitch, 0, -0.55, 4.8);
    for (let r = 0; r < TIFO_ROWS; r++) {
      const z = this.sz(r);
      const y = this.sy(r);
      add(new THREE.BoxGeometry(42, 0.16, 0.54), concrete, 0, y - 0.32, z - 0.18);
      add(new THREE.BoxGeometry(41.2, 0.08, 0.16), navy, 0, y - 0.14, z - 0.36);
    }
    add(new THREE.BoxGeometry(44.5, 1.5, 0.35), concrete, 0, -0.8, 1.4);
    for (const [x, text] of [[-12, "SEOUL E-LAND FC"], [12, "레울파크"]] as const) {
      add(new THREE.BoxGeometry(17, 1.1, 0.16), gold, x, -0.35, 1.18);
      const board = add(new THREE.PlaneGeometry(16.3, 0.88), new THREE.MeshBasicMaterial({ map: this.boardTexture(text), toneMapped: false }), x, -0.33, 1.085);
      board.rotation.x = 0;
    }
    const pillar = new THREE.MeshStandardMaterial({ color: "#253047", roughness: 0.65 });
    for (const x of [this.sx(-2), this.sx(TIFO_COLS + 1)]) add(new THREE.BoxGeometry(1.4, 4.4, 12.6), concrete, x, 2.6, -5.2, -0.08);
    add(new THREE.BoxGeometry(46, 0.35, 4.2), pillar, 0, this.sy(TIFO_ROWS - 1) + 1.45, this.sz(TIFO_ROWS - 1) - 2.6, 0.05);
    for (const x of [-20, 20]) {
      const pole =       add(new THREE.CylinderGeometry(0.12, 0.12, 9, 10), pillar, x, 3.6, 5.4);
      add(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: "#fff7bd" }), x, 7.9, 5.4);
      const flood = new THREE.PointLight("#fff7bd", 70, 72);
      flood.position.set(x, 7.9, 5.4);
      this.scene.add(flood);
      void pole;
    }
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
    g.font = text.includes("레") ? "900 64px Apple SD Gothic Neo, Arial, sans-serif" : "900 54px Arial Rounded MT Bold, Arial, sans-serif";
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
    const fanGeo = new THREE.CapsuleGeometry(0.16, 0.42, 3, 8);
    const fanMat = new THREE.MeshStandardMaterial({ roughness: 0.72 });
    this.fans = new THREE.InstancedMesh(fanGeo, fanMat, n);
    this.cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.82, 0.62), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false, fog: false }), n);
    const shirt = ["#1b2446", "#1b2446", "#1b2446", "#ffc23a", "#ffffff"];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const idx = this.usable[i], col = idx % TIFO_COLS, row = Math.floor(idx / TIFO_COLS);
      const x = this.sx(col);
      const z = this.sz(row);
      const y = this.sy(row) + 0.3;
      this.dummy.position.set(x, y, z - 0.18);
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
      const t = (performance.now() - this.start) * speed / 1000 - 1.85;
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
    const now = Math.max(0, progress) * 2.6;
    for (let i = 0; i < this.cardToSeat.length; i++) {
      const idx = this.cardToSeat[i];
      const col = idx % TIFO_COLS, row = Math.floor(idx / TIFO_COLS);
      const x = this.sx(col);
      const y = this.sy(row) + 0.62 + Math.sin(performance.now() * 0.002 + i) * 0.012;
      const delay = (this.flipTiming(idx) - SONG_T0 - SONG_STEP * 12) * 0.45;
      const p = Math.max(0, Math.min(1, (now - delay) / 0.35));
      const eased = p * p * (3 - 2 * p);
      const z = this.sz(row) - 0.2 + eased * (0.58 - this.sz(row));
      this.dummy.position.set(x, y + eased * 0.18, z);
      this.dummy.rotation.set(-Math.PI / 2 + eased * (Math.PI / 2), 0, 0);
      this.dummy.updateMatrix();
      this.cards.setMatrixAt(i, this.dummy.matrix);
      color.set(PALETTE[this.target[idx] ?? 0].hex);
      this.cards.setColorAt(i, color);
    }
    this.cards.instanceMatrix.needsUpdate = true;
    if (this.cards.instanceColor) this.cards.instanceColor.needsUpdate = true;
    this.cards.computeBoundingSphere();
    this.cards.computeBoundingBox();
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
    this.canvas.addEventListener("wheel", (e) => { e.preventDefault(); this.dist = Math.max(24, Math.min(90, this.dist + e.deltaY * 0.02)); this.render(); }, { passive: false });
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
    this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.render();
  };

  render(): void {
    if (this.disposed || !this.renderer) return;
    if (!this.dragging) {
      this.yaw *= 0.92;
      this.pitch *= 0.92;
    }
    const targetWidth = this.camera.aspect < 1 ? 0.95 : 0.92;
    const worldWidth = (TIFO_COLS - 1) * 0.82 + 0.76;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distance = worldWidth / (2 * targetWidth * Math.tan(hFov / 2));
    const centerY = this.sy((TIFO_ROWS - 1) / 2) + 0.86;
    const centerZ = 0.58;
    const elevation = this.camera.aspect < 1 ? 0.16 : 0.24;
    this.camera.position.set(Math.sin(this.yaw) * 8, centerY + distance * elevation + this.pitch * 4, centerZ + distance + this.dist * 0.04);
    this.camera.lookAt(0, centerY + this.pitch * 2, centerZ);
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
    const v = new THREE.Vector3(this.sx(col), this.sy(row) + 0.8, 0.58);
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
    const hit = this.raycaster.intersectObject(this.cards)[0];
    return hit?.instanceId === cardIndex;
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
