import * as THREE from "three";
import { type ThrowResult } from "./model";

export class YutThrowScene {
  private renderer: THREE.WebGLRenderer; private scene = new THREE.Scene(); private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100); private sticks: THREE.Group[] = []; private raf = 0; private start = 0; onClack: ((n: number) => void) | null = null;
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.camera.position.set(0, 4.2, 7.5); this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a330f, 2.1));
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.08, 48), new THREE.MeshToonMaterial({ color: 0xb98b54 })); mat.scale.z = 0.7; mat.rotation.x = Math.PI / 2; this.scene.add(mat);
    for (let i = 0; i < 4; i++) this.sticks.push(this.makeStick(i));
    this.resize(); addEventListener("resize", () => this.resize()); this.drawIdle();
  }
  private makeStick(i: number): THREE.Group {
    const g = new THREE.Group(); const wood = new THREE.MeshToonMaterial({ color: i === 0 ? 0xd8a05f : 0xc58b48 }); const dark = new THREE.MeshBasicMaterial({ color: 0x2a1608 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.18, 6, 12), wood); body.scale.set(1.25, 0.55, 1); body.rotation.z = Math.PI / 2; g.add(body);
    const flat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.018, 0.18), new THREE.MeshBasicMaterial({ color: 0xf0cf9b })); flat.position.y = -0.075; g.add(flat);
    if (i === 0) { for (const r of [Math.PI / 4, -Math.PI / 4]) { const x = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.022, 0.035), dark); x.position.y = -0.09; x.rotation.y = r; g.add(x); } }
    g.position.x = (i - 1.5) * 0.56; g.position.y = 0.15; g.rotation.set(0.2, 0.1 * i, -0.15 + i * 0.1); this.scene.add(g); return g;
  }
  resize(): void { const r = this.canvas.getBoundingClientRect(); const w = Math.max(1, r.width), h = Math.max(1, r.height); this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  animate(outcome: ThrowResult): Promise<void> {
    this.resize();
    this.start = performance.now(); cancelAnimationFrame(this.raf); let clacked = false;
    return new Promise((resolve) => {
      const tick = () => { const t = Math.min(1, (performance.now() - this.start) / 1150); const ease = 1 - (1 - t) ** 3; const flats = this.faces(outcome); this.sticks.forEach((s, i) => { s.position.y = 0.15 + Math.sin(Math.PI * t) * (1.5 + i * 0.08) + Math.max(0, Math.sin(t * 24 + i) * 0.04 * (1 - t)); s.position.x = (i - 1.5) * 0.56 + Math.sin(t * 7 + i) * 0.18 * (1 - t); const target = flats[i] ? Math.PI : 0; s.rotation.x = (1 - ease) * (7 + i * 1.7) + ease * target; s.rotation.z = -0.25 + i * 0.16 + Math.sin(t * 11 + i) * 0.5 * (1 - t); }); this.renderer.render(this.scene, this.camera); if (!clacked && t > 0.72) { clacked = true; this.onClack?.(outcome.extra ? 1.4 : 1); } if (t < 1) this.raf = requestAnimationFrame(tick); else resolve(); };
      tick();
    });
  }
  private faces(o: ThrowResult): boolean[] { if (o.id === "back") return [true, false, false, false]; if (o.id === "do") return [false, true, false, false]; if (o.id === "gae") return [true, false, true, false]; if (o.id === "geol") return [true, true, true, false]; if (o.id === "yut") return [true, true, true, true]; return [false, false, false, false]; }
  private drawIdle(): void { this.renderer.render(this.scene, this.camera); }
}
