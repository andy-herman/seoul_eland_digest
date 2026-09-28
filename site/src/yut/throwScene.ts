import type { ThrowResult } from "./model";

type Three = typeof import("three");

interface StickPose {
  x: number;
  y: number;
  rot: number;
  flat: boolean;
  marked: boolean;
}

export class YutThrowScene {
  onClack: ((power: number) => void) | null = null;
  private raf = 0;
  private three: Three | null = null;
  private renderer: import("three").WebGLRenderer | null = null;
  private scene: import("three").Scene | null = null;
  private camera: import("three").PerspectiveCamera | null = null;
  private sticks: import("three").Group[] = [];
  private resizeHandler = () => this.resize();
  private webgl = false;
  private ctx: CanvasRenderingContext2D | null = null;
  private poses: StickPose[] = [
    { x: 0, y: 0, rot: 0, flat: false, marked: true },
    { x: 0, y: 0.03, rot: 0, flat: false, marked: false },
    { x: 0, y: -0.02, rot: 0, flat: false, marked: false },
    { x: 0, y: 0.04, rot: 0, flat: false, marked: false },
  ];

  constructor(private readonly canvas: HTMLCanvasElement) {
    addEventListener("resize", this.resizeHandler);
    this.resize();
  }

  async warm(): Promise<void> {
    if (this.webgl || this.renderer) return;
    try {
      const three = await import("three");
      const test = this.canvas.getContext("webgl2") ?? this.canvas.getContext("webgl");
      if (!test) throw new Error("WebGL unavailable");
      this.three = three;
      this.initThree(three);
      this.webgl = true;
      this.renderThree();
    } catch {
      this.webgl = false;
      this.ctx = this.canvas.getContext("2d");
      this.draw2d();
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.resizeHandler);
    for (const stick of this.sticks) {
      stick.traverse((obj) => {
        const mesh = obj as import("three").Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as import("three").Material | import("three").Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose?.();
      });
    }
    this.renderer?.dispose();
  }

  resize(): void {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.renderer && this.camera) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(box.width, box.height, false);
      this.camera.aspect = Math.max(0.1, box.width / Math.max(1, box.height));
      this.camera.updateProjectionMatrix();
      this.renderThree();
    } else {
      this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.ctx) this.draw2d();
    }
  }

  async animate(outcome: ThrowResult): Promise<void> {
    await this.warm();
    cancelAnimationFrame(this.raf);
    const start = performance.now();
    let clacked = false;
    const final = this.faces(outcome);
    return new Promise((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / 1160);
        const ease = 1 - (1 - t) ** 3;
        this.poses = final.map((flat, i) => ({
          x: Math.sin(t * 9 + i) * 0.28 * (1 - ease),
          y: Math.sin(Math.PI * t) * (1.05 + i * 0.08) + Math.sin(t * 18 + i) * 0.05 * (1 - t),
          rot: Math.sin(t * 10 + i) * 0.75 * (1 - ease),
          flat,
          marked: i === 0,
        }));
        if (this.webgl) this.renderThree(ease);
        else this.draw2d();
        if (!clacked && t > 0.74) {
          clacked = true;
          this.onClack?.(outcome.extra ? 1.35 : 1);
        }
        if (t < 1) this.raf = requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
  }

  private initThree(THREE: Three): void {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 8.6, 0.65);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff3d7, 0x4a2b10, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2.5, 5, 2);
    this.scene.add(key);

    const mat = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.22, 0.08, 72), new THREE.MeshToonMaterial({ color: 0xb98b54 }));
    mat.rotation.x = Math.PI / 2;
    mat.scale.set(1.35, 0.9, 1);
    this.scene.add(mat);

    this.sticks = [0, 1, 2, 3].map((i) => this.makeStick(THREE, i));
    this.resize();
  }

  private makeStick(THREE: Three, i: number): import("three").Group {
    const g = new THREE.Group();
    const bark = new THREE.MeshToonMaterial({ color: i === 0 ? 0x8b552c : 0x73431f });
    const flat = new THREE.MeshToonMaterial({ color: 0xf6d69f });
    const mark = new THREE.MeshBasicMaterial({ color: 0xcc1f2f });
    const eland = new THREE.MeshBasicMaterial({ color: 0x1b2446 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 2.65, 8, 14), bark);
    body.scale.set(1.25, 0.58, 1);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    const face = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.03, 0.27), flat);
    face.position.y = -0.087;
    g.add(face);
    if (i === 0) {
      for (const r of [Math.PI / 4, -Math.PI / 4]) {
        const x = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.036, 0.05), mark);
        x.position.y = -0.112;
        x.rotation.y = r;
        g.add(x);
      }
    } else {
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.034, 0.05), eland);
      badge.position.set(-1.18, -0.112, 0);
      g.add(badge);
    }
    this.scene!.add(g);
    return g;
  }

  private renderThree(ease = 1): void {
    if (!this.three || !this.renderer || !this.scene || !this.camera) return;
    for (let i = 0; i < this.sticks.length; i++) {
      const pose = this.poses[i];
      const stick = this.sticks[i];
      stick.position.set(pose.x, 0.18 + pose.y, (i - 1.5) * 0.98);
      stick.rotation.set((pose.flat ? Math.PI : 0) * ease + (1 - ease) * (5.5 + i), pose.rot * 0.2, pose.rot);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private draw2d(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (!this.ctx) return;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#4b2f15");
    grad.addColorStop(1, "#b78852");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h * 0.58);
    ctx.scale(Math.min(w / 5.8, h / 3.4), Math.min(w / 5.8, h / 3.4));
    ctx.fillStyle = "rgba(255, 238, 184, .22)";
    ctx.beginPath();
    ctx.ellipse(0, 0.2, 2.65, 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < this.poses.length; i++) this.drawStick2d(ctx, this.poses[i], i);
    ctx.restore();
  }

  private drawStick2d(ctx: CanvasRenderingContext2D, pose: StickPose, lane: number): void {
    ctx.save();
    ctx.translate(pose.x, (lane - 1.5) * 0.48 - pose.y * 0.7);
    ctx.rotate(pose.rot);
    ctx.fillStyle = pose.flat ? "#f6d69f" : "#73431f";
    ctx.strokeStyle = "#2b1607";
    ctx.lineWidth = 0.04;
    this.roundRect(ctx, -1.45, -0.12, 2.9, 0.24, 0.12);
    ctx.fill();
    ctx.stroke();
    if (pose.marked) {
      ctx.strokeStyle = "#cc1f2f";
      ctx.lineWidth = 0.045;
      ctx.beginPath();
      ctx.moveTo(-0.35, -0.08);
      ctx.lineTo(0.35, 0.08);
      ctx.moveTo(0.35, -0.08);
      ctx.lineTo(-0.35, 0.08);
      ctx.stroke();
    } else if (pose.flat) {
      ctx.fillStyle = "#1b2446";
      ctx.fillRect(-1.12, -0.025, 0.22, 0.05);
    }
    ctx.restore();
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private faces(outcome: ThrowResult): boolean[] {
    if (outcome.id === "back") return [true, false, false, false];
    if (outcome.id === "do") return [false, true, false, false];
    if (outcome.id === "gae") return [true, false, true, false];
    if (outcome.id === "geol") return [true, true, true, false];
    if (outcome.id === "yut") return [true, true, true, true];
    return [false, false, false, false];
  }
}
