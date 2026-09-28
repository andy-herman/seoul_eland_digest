// Mascot Kart three.js renderer: runtime track meshes, toon karts (Blender GLB when present, a
// procedural stand-in otherwise), billboard mascot drivers that pick a back/side/front frame from
// the camera angle, chase camera, boost flames, drift sparks, items, projectiles and effects.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { racerColor } from "./data";
import type { Race } from "./sim";
import { angleDiff } from "./track";
import type { Theme } from "./theme";
import { buildTrackVisual } from "./trackmesh";
import { flameTexture, itemBoxTexture, shadowTexture, skylineTexture, skyTexture, sparkTexture } from "./textures";
import { addScenery } from "./scenery";
import type { Kart, Projectile } from "./types";

interface KartVis {
  root: THREE.Group; // world position + heading
  tilt: THREE.Group; // lean, pitch, spin
  body: THREE.Group;
  wheels: THREE.Object3D[];
  front: THREE.Object3D[];
  driver: THREE.Mesh;
  driverTex: THREE.Texture | null;
  shadow: THREE.Mesh;
  flames: THREE.Mesh[];
  bubble: THREE.Mesh;
  shield: THREE.Mesh;
  stars: THREE.Group;
  wheelSpin: number;
  lean: number;
  pitch: number;
  squash: number;
  frame: number;
  mirrored: boolean;
}

interface Pose {
  x: number;
  y: number;
  z: number;
  theta: number;
  phi: number;
}

const toonRamp = (() => {
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

export const toon = (color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp, ...extra });

const lerpAngle = (a: number, b: number, t: number) => a + angleDiff(b, a) * t;

function shade(hex: string, f: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * f)));
}

// Stand-in kart built from primitives, facing +Z, wheels on the ground at y = 0.
function placeholderKart(color: string): THREE.Group {
  const g = new THREE.Group();
  const body = toon(color);
  const trim = toon(shade(color, 1.45));
  const dark = toon("#23262d");
  const metal = toon("#c7ccd4");
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, name = "") => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.name = name;
    g.add(m);
    return m;
  };
  add(new RoundedBoxGeometry(1.45, 0.42, 2.1, 3, 0.18), body, 0, 0.42, 0, "Body");
  add(new RoundedBoxGeometry(1.1, 0.3, 0.7, 3, 0.12), trim, 0, 0.36, 1.05, "Trim");
  add(new RoundedBoxGeometry(0.95, 0.62, 0.18, 2, 0.08), dark, 0, 0.82, -0.42);
  add(new RoundedBoxGeometry(1.0, 0.34, 0.45, 2, 0.1), metal, 0, 0.5, -0.95);
  for (const x of [-0.26, 0.26]) {
    const ex = add(new THREE.CylinderGeometry(0.1, 0.12, 0.42, 10), metal, x, 0.52, -1.18);
    ex.rotation.x = Math.PI / 2;
  }
  const wing = add(new RoundedBoxGeometry(1.55, 0.07, 0.38, 2, 0.03), trim, 0, 1.02, -1.02, "Trim");
  void wing;
  for (const x of [-0.5, 0.5]) add(new THREE.BoxGeometry(0.06, 0.34, 0.08), dark, x, 0.84, -1.0);
  const wheel = (x: number, z: number, r: number, name: string) => {
    const w = new THREE.Group();
    w.position.set(x, r, z);
    w.name = name;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.32, 16), dark);
    tire.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.34, 10), metal);
    rim.rotation.z = Math.PI / 2;
    w.add(tire, rim);
    g.add(w);
  };
  wheel(-0.78, 0.72, 0.29, "wheel_fl");
  wheel(0.78, 0.72, 0.29, "wheel_fr");
  wheel(-0.8, -0.72, 0.34, "wheel_rl");
  wheel(0.8, -0.72, 0.34, "wheel_rr");
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 20), dark);
  sw.position.set(0, 0.78, 0.32);
  sw.rotation.x = -0.9;
  sw.name = "steer";
  g.add(sw);
  return g;
}

function soccerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#1b1b1b";
  for (const [x, y] of [[32, 32], [96, 32], [64, 80], [16, 100], [112, 100], [64, 8]]) {
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13);
    }
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface RendererOptions {
  pixelRatioMax: number;
  portrait: boolean;
}

export class KartRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 2600);
  private vis: KartVis[] = [];
  private prev: Pose[] = [];
  private race: Race | null = null;
  private sky: THREE.Mesh | null = null;
  private boxMesh: THREE.InstancedMesh | null = null;
  private padTex: THREE.Texture | null = null;
  private proj = new Map<number, THREE.Object3D>();
  private projAssets: Record<string, () => THREE.Object3D> = {};
  private sparks: THREE.Points | null = null;
  private sparkData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = [];
  private camYaw = 0;
  private camFov = 62;
  private camInit = false;
  private camInit2 = false;
  private camY = 0;
  private time = 0;
  focus = 0; // kart index the camera follows
  portrait = false;
  groundY = 0;
  private kartModel: THREE.Group | null = null;
  private flameTex = flameTexture();
  private flameBlue = flameTexture(true);
  private ghost: { root: THREE.Group; driver: THREE.Mesh; tex: THREE.Texture | null } | null = null;
  private maxRatio = 2;
  private shadowTex = shadowTexture();

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.maxRatio = Math.min(window.devicePixelRatio || 1, opts.pixelRatioMax);
    this.renderer.setPixelRatio(this.maxRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.portrait = opts.portrait;
  }

  async loadKartModel(url: string): Promise<void> {
    try {
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
      this.kartModel = gltf.scene;
    } catch {
      this.kartModel = null;
    }
  }

  // Build the scene for a race: theme, track, scenery, karts, items.
  async setup(race: Race, theme: Theme, assets: string, drivers: Record<string, HTMLImageElement | null>): Promise<void> {
    this.race = race;
    const scene = this.scene;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats as THREE.MeshBasicMaterial[]) {
        if (mat.map && mat.map !== this.flameTex && mat.map !== this.flameBlue && mat.map !== this.shadowTex) mat.map.dispose();
        mat.dispose();
      }
    });
    scene.clear();
    this.ghost = null;
    this.vis = [];
    this.proj.clear();
    scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    scene.background = new THREE.Color(theme.skyHorizon);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(2400, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(theme.skyTop, theme.skyHorizon, theme.skyBottom), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sky.renderOrder = -10;
    this.sky = sky;
    scene.add(sky);
    if (theme.night) scene.add(this.stars());
    const skyTex = skylineTexture({ ...theme.skyline, night: theme.night, seed: theme.id.length * 17 + 3 });
    skyTex.repeat.set(3, 1);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1900, 1900, 420, 48, 1, true), new THREE.MeshBasicMaterial({ map: skyTex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    ring.position.y = 150;
    ring.renderOrder = -9;
    ring.name = "skyline";
    scene.add(ring);
    scene.add(new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity));
    const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
    sun.position.set(...theme.sun.dir);
    scene.add(sun);
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const tv = buildTrackVisual(race.track, theme, aniso);
    this.groundY = tv.groundY;
    this.padTex = tv.pads;
    scene.add(tv.group);
    await addScenery(scene, race.track, theme, assets);
    // item boxes
    if (race.state.boxes.length) {
      const mat = new THREE.MeshLambertMaterial({ map: itemBoxTexture(), transparent: true, opacity: 0.92, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.25 });
      this.boxMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(1.3, 1.3, 1.3, 2, 0.16), mat, race.state.boxes.length);
      this.boxMesh.frustumCulled = false;
      scene.add(this.boxMesh);
    } else this.boxMesh = null;
    // karts
    for (const k of race.state.karts) this.vis.push(this.makeKart(k, drivers[k.id] ?? null));
    this.prev = race.state.karts.map((k) => ({ x: k.x, y: k.y, z: k.z, theta: k.theta, phi: k.phi }));
    // sparks
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(240 * 3), 3));
    this.sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.28, map: sparkTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#ffe28a" }));
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
    this.sparkData = [];
    this.projAssets = this.makeProjectiles();
    this.camInit = false;
    this.camInit2 = false;
  }

  private stars(): THREE.Points {
    const pos: number[] = [];
    for (let i = 0; i < 600; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.12 + Math.random() * 0.9;
      pos.push(Math.cos(a) * Math.cos(e) * 2000, Math.sin(e) * 2000, Math.sin(a) * Math.cos(e) * 2000);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, color: "#ffffff", fog: false, transparent: true, opacity: 0.8 }));
    p.name = "stars";
    return p;
  }

  private makeKart(k: Kart, driverImg: HTMLImageElement | null): KartVis {
    const color = racerColor(k.id);
    const root = new THREE.Group();
    const tilt = new THREE.Group();
    root.add(tilt);
    let body: THREE.Group;
    if (this.kartModel) {
      body = this.kartModel.clone(true);
      body.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = m.material as THREE.MeshStandardMaterial;
        const name = src.name ?? "";
        if (name === "Outline") m.material = new THREE.MeshBasicMaterial({ color: "#10131c" }); // reversed shell
        else if (name === "Body") m.material = toon(color);
        else if (name === "Trim") m.material = toon(shade(color, 1.5));
        else m.material = toon(src.color ?? "#cccccc", { map: src.map ?? null });
      });
    } else body = placeholderKart(color);
    tilt.add(body);
    const wheels: THREE.Object3D[] = [];
    const front: THREE.Object3D[] = [];
    body.traverse((o) => {
      if (o.name.startsWith("wheel_")) {
        wheels.push(o);
        if (o.name.startsWith("wheel_f")) front.push(o);
      }
    });
    // driver billboard: a cut-out quad; the kart body in front of it hides the crop line
    let driverTex: THREE.Texture | null = null;
    if (driverImg) {
      driverTex = new THREE.Texture(driverImg);
      driverTex.colorSpace = THREE.SRGBColorSpace;
      driverTex.repeat.set(1 / 3, 1);
      driverTex.needsUpdate = true;
    }
    const driver = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: driverTex, color: driverTex ? "#ffffff" : color, alphaTest: 0.45, side: THREE.DoubleSide }),
    );
    driver.position.set(0, 0.6 + 0.75, -0.12);
    tilt.add(driver);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.0), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(shadow);
    const flames: THREE.Mesh[] = [];
    for (const x of [-0.26, 0.26]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.0), new THREE.MeshBasicMaterial({ map: this.flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      f.position.set(x, 0.52, -1.55);
      f.rotation.x = Math.PI / 2;
      f.visible = false;
      tilt.add(f);
      flames.push(f);
    }
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 16), new THREE.MeshLambertMaterial({ color: "#7fd3ff", transparent: true, opacity: 0.42, emissive: new THREE.Color("#1a6fb0"), emissiveIntensity: 0.5, depthWrite: false }));
    bubble.position.y = 0.9;
    bubble.visible = false;
    root.add(bubble);
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    shield.position.y = 0.85;
    shield.visible = false;
    root.add(shield);
    const stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), toon("#ffd64a", { emissive: new THREE.Color("#ffb300"), emissiveIntensity: 0.5 }));
      stars.add(s);
    }
    stars.position.y = 2.25;
    stars.visible = false;
    root.add(stars);
    this.scene.add(root);
    return { root, tilt, body, wheels, front, driver, driverTex, shadow, flames, bubble, shield, stars, wheelSpin: 0, lean: 0, pitch: 0, squash: 0, frame: -1, mirrored: false };
  }

  private makeProjectiles(): Record<string, () => THREE.Object3D> {
    const ballTex = soccerTexture();
    return {
      ball: () => new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), toon("#ffffff", { map: ballTex })),
      balloon: () => {
        const g = new THREE.Group();
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshLambertMaterial({ color: "#4fc3ff", transparent: true, opacity: 0.85, emissive: new THREE.Color("#1976d2"), emissiveIntensity: 0.3 }));
        const knot = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 8), toon("#1976d2"));
        knot.position.y = -0.66;
        g.add(m, knot);
        return g;
      },
      banana: () => {
        const g = new THREE.Group();
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.11, 8, 18, Math.PI * 1.1), toon("#ffd21f"));
        m.rotation.z = Math.PI * 0.45;
        m.position.y = 0.32;
        g.add(m);
        return g;
      },
      puddle: () => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#5ec8ff", transparent: true, opacity: 0.55, emissive: new THREE.Color("#1a74c0"), emissiveIntensity: 0.3, depthWrite: false }));
        m.scale.y = 0.32;
        return m;
      },
      redcard: () => {
        const g = new THREE.Group();
        const card = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.25), new THREE.MeshBasicMaterial({ color: "#e11d2e", side: THREE.DoubleSide }));
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 1.37), new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide }));
        edge.position.z = -0.01;
        g.add(edge, card);
        g.scale.setScalar(1.6);
        return g;
      },
    };
  }

  // Call before each simulation step so frames can be interpolated between steps.
  snapshot(): void {
    if (!this.race) return;
    const K = this.race.state.karts;
    for (let i = 0; i < K.length; i++) {
      const p = this.prev[i];
      if (!p) return;
      p.x = K[i].x;
      p.y = K[i].y;
      p.z = K[i].z;
      p.theta = K[i].theta;
      p.phi = K[i].phi;
    }
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render(alpha: number, dt: number): void {
    const race = this.race;
    if (!race) return;
    this.time += dt;
    const st = race.state;
    const K = st.karts;
    for (let i = 0; i < K.length; i++) this.updateKart(i, K[i], alpha, dt);
    this.updateCamera(alpha, dt);
    for (let i = 0; i < K.length; i++) {
      this.updateDriver(i, K[i]);
      const v = this.vis[i];
      v.root.visible = i === this.focus || v.root.position.distanceToSquared(this.camera.position) > 9;
    }
    // item boxes
    if (this.boxMesh) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      st.boxes.forEach((b, i) => {
        const pop = b.respawnT > 0 ? Math.max(0, 1 - b.respawnT / 0.4) * 0 : 1;
        const grow = b.respawnT > 0 ? 0 : 1;
        e.set(0.5, this.time * 1.6 + i, 0.35);
        q.setFromEuler(e);
        const s = grow * pop;
        m.compose(new THREE.Vector3(b.x, b.y + 1.15 + Math.sin(this.time * 3 + i) * 0.15, b.z), q, new THREE.Vector3(s, s, s));
        this.boxMesh!.setMatrixAt(i, m);
      });
      this.boxMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.padTex) this.padTex.offset.y = -(this.time * 1.6) % 1;
    this.updateProjectiles(st.projectiles, dt);
    this.updateSparks(dt);
    if (this.sky) this.sky.position.copy(this.camera.position);
    const stars = this.scene.getObjectByName("stars");
    if (stars) stars.position.copy(this.camera.position);
    const ring = this.scene.getObjectByName("skyline");
    if (ring) ring.position.set(this.camera.position.x, this.groundY + 150, this.camera.position.z);
    this.renderer.render(this.scene, this.camera);
  }

  private pose(i: number, k: Kart, alpha: number): Pose {
    const p = this.prev[i];
    return { x: p.x + (k.x - p.x) * alpha, y: p.y + (k.y - p.y) * alpha, z: p.z + (k.z - p.z) * alpha, theta: lerpAngle(p.theta, k.theta, alpha), phi: lerpAngle(p.phi, k.phi, alpha) };
  }

  private updateKart(i: number, k: Kart, alpha: number, dt: number): void {
    const v = this.vis[i];
    const p = this.pose(i, k, alpha);
    v.root.position.set(p.x, p.y, p.z);
    let yaw = Math.PI / 2 - p.theta;
    if (k.status === "spin" || k.status === "tumble") yaw -= k.spinAngle;
    v.root.rotation.y = yaw;
    // lean into turns and drifts, pitch with the slope, squash on landing
    const leanTarget = Math.max(-0.22, Math.min(0.22, -k.yawRate * 0.07 - (k.drifting ? k.driftDir * 0.08 : 0)));
    v.lean += (leanTarget - v.lean) * Math.min(1, dt * 10);
    const s = this.race!.track.samples[k.si];
    const pitchTarget = k.grounded ? -Math.atan(s.slope) * 0.9 : Math.max(-0.35, Math.min(0.35, -k.vy * 0.03));
    v.pitch += (pitchTarget - v.pitch) * Math.min(1, dt * 8);
    v.tilt.rotation.set(v.pitch, 0, v.lean, "YXZ");
    if (k.status === "tumble") v.tilt.rotation.x += Math.sin(k.spinAngle * 0.5) * 0.6;
    v.squash = Math.max(0, v.squash - dt * 4);
    v.tilt.scale.set(1 + v.squash * 0.12, 1 - v.squash * 0.2, 1 + v.squash * 0.12);
    v.tilt.position.y = k.status === "trapped" ? 1.0 + Math.sin(this.time * 4) * 0.12 : 0;
    // wheels
    v.wheelSpin += (k.speed * dt) / 0.32;
    for (const w of v.wheels) w.rotation.x = v.wheelSpin;
    for (const w of v.front) w.rotation.y = -k.steerSmooth * 0.45;
    // flames while boosting
    const boosting = k.boostT > 0 && k.boostKind !== "magnet";
    const blue = k.boostKind === "instant" || k.boostKind === "draft";
    for (const f of v.flames) {
      f.visible = boosting;
      if (boosting) {
        const mat = f.material as THREE.MeshBasicMaterial;
        const want = blue ? this.flameBlue : this.flameTex;
        if (mat.map !== want) {
          mat.map = want;
          mat.needsUpdate = true;
        }
        const fl = 0.8 + Math.random() * 0.5;
        f.scale.set(fl, fl * (k.boostKind === "nitro" || k.boostKind === "item" ? 1.5 : 1), 1);
      }
    }
    v.bubble.visible = k.status === "trapped";
    v.shield.visible = k.shieldT > 0;
    if (v.shield.visible) v.shield.scale.setScalar(1 + Math.sin(this.time * 8) * 0.03);
    v.stars.visible = k.status === "spin" || k.status === "tumble";
    if (v.stars.visible) {
      v.stars.rotation.y = this.time * 5;
      v.stars.children.forEach((c, n) => c.position.set(Math.cos((n / 3) * Math.PI * 2) * 0.7, Math.sin(this.time * 6 + n) * 0.1, Math.sin((n / 3) * Math.PI * 2) * 0.7));
    }
    // shadow on the ground under the kart
    v.shadow.position.set(p.x, s.y + 0.08, p.z);
    v.shadow.rotation.z = p.theta - Math.PI / 2;
    const air = Math.max(0, p.y - s.y);
    const sh = Math.max(0.35, 1 - air * 0.18);
    v.shadow.scale.set(sh, sh, 1);
    // drift sparks from the rear wheels
    if (k.drifting && k.grounded && Math.random() < 0.9) {
      const c = Math.cos(p.theta);
      const sn = Math.sin(p.theta);
      for (const side of [-1, 1]) {
        const bx = p.x - c * 0.8 - sn * side * 0.8;
        const bz = p.z - sn * 0.8 + c * side * 0.8;
        this.sparkData.push({ x: bx, y: p.y + 0.1, z: bz, vx: (Math.random() - 0.5) * 3 - c * 2, vy: 1 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 3 - sn * 2, life: 0.25 + Math.random() * 0.2 });
      }
    }
  }

  private updateDriver(i: number, k: Kart): void {
    const v = this.vis[i];
    const cam = this.camera.position;
    const wp = new THREE.Vector3();
    v.driver.getWorldPosition(wp);
    // cylindrical billboard in world space, undoing the kart's own heading and tilt
    const worldYaw = Math.atan2(cam.x - wp.x, cam.z - wp.z);
    v.driver.rotation.set(0, worldYaw - v.root.rotation.y, 0);
    v.driver.rotation.z = -v.lean * 0.5;
    if (!v.driverTex) return;
    // camera direction relative to the kart's heading: 0 = in front, PI = behind
    const rel = angleDiff(Math.atan2(cam.z - wp.z, cam.x - wp.x), k.theta - (k.status === "spin" || k.status === "tumble" ? k.spinAngle : 0));
    const a = Math.abs(rel);
    const frame = a > (Math.PI * 3) / 4 ? 0 : a < Math.PI / 4 ? 2 : 1;
    const mirrored = frame === 1 && rel < 0;
    if (frame !== v.frame || mirrored !== v.mirrored) {
      v.frame = frame;
      v.mirrored = mirrored;
      v.driverTex.repeat.x = mirrored ? -1 / 3 : 1 / 3;
      v.driverTex.offset.x = mirrored ? (frame + 1) / 3 : frame / 3;
    }
  }

  private updateCamera(alpha: number, dt: number): void {
    const race = this.race!;
    const k = race.state.karts[this.focus];
    const p = this.pose(this.focus, k, alpha);
    const drift = k.drifting ? 0.45 : 0.15;
    const target = lerpAngle(p.theta, p.phi, drift);
    if (!this.camInit) {
      this.camYaw = target;
      this.camInit = true;
    }
    this.camYaw = lerpAngle(this.camYaw, target, 1 - Math.exp(-(k.status === "none" ? 5.5 : 1.5) * dt));
    // countdown: swing from in front of the kart round to the chase position
    const st = race.state;
    const intro = st.phase === "countdown" ? Math.max(0, Math.min(1, (-st.time - 0.9) / 2.5)) : 0;
    const swing = intro * intro * (3 - 2 * intro) * Math.PI;
    const yaw = this.camYaw + swing;
    const back = this.portrait ? 6.6 : 5.4;
    const height = this.portrait ? 3.0 : 2.3;
    // position locked to the kart (no distance lag at speed); only the heading and height are smoothed
    const ground = race.track.samples[k.si].y;
    const yTarget = Math.max(p.y, ground) + height;
    this.camY = this.camInit2 ? this.camY + (yTarget - this.camY) * (1 - Math.exp(-7 * dt)) : yTarget;
    this.camInit2 = true;
    const cam = this.camera.position;
    const dist = back + intro * 1.5;
    cam.set(p.x - Math.cos(yaw) * dist, Math.max(this.camY - intro * 0.8, ground + 1.1), p.z - Math.sin(yaw) * dist);
    const lookAhead = 4.5 * (1 - intro);
    const look = new THREE.Vector3(p.x + Math.cos(this.camYaw) * lookAhead, p.y + (this.portrait ? 1.35 : 1.15), p.z + Math.sin(this.camYaw) * lookAhead);
    this.camera.lookAt(look);
    const fovTarget = (this.portrait ? 70 : 62) + (k.boostT > 0 ? 9 : 0) + Math.max(0, Math.abs(k.speed) - 20) * 0.25;
    this.camFov += (fovTarget - this.camFov) * Math.min(1, dt * 5);
    if (Math.abs(this.camera.fov - this.camFov) > 0.05) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
  }

  // A see-through copy of the player's kart for time trial ghosts.
  addGhost(driverImg: HTMLImageElement | null, color: string): void {
    const root = new THREE.Group();
    const body = this.kartModel ? this.kartModel.clone(true) : placeholderKart(color);
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ color: "#dbeafe", transparent: true, opacity: 0.35, depthWrite: false });
    });
    root.add(body);
    let tex: THREE.Texture | null = null;
    if (driverImg) {
      tex = new THREE.Texture(driverImg);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(1 / 3, 1);
      tex.needsUpdate = true;
    }
    const driver = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.45, depthWrite: false }));
    driver.position.set(0, 1.35, -0.12);
    root.add(driver);
    root.visible = false;
    this.scene.add(root);
    this.ghost = { root, driver, tex };
  }

  ghostPose(f: number[] | null): void {
    const g = this.ghost;
    if (!g) return;
    g.root.visible = !!f;
    if (!f) return;
    g.root.position.set(f[0], f[1], f[2]);
    g.root.rotation.y = Math.PI / 2 - f[3];
    const cam = this.camera.position;
    g.driver.rotation.y = Math.atan2(cam.x - f[0], cam.z - f[2]) - g.root.rotation.y;
  }

  lowerQuality(): void {
    const cur = this.renderer.getPixelRatio();
    if (cur <= 1) return;
    this.renderer.setPixelRatio(Math.max(1, cur - 0.25));
    const size = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setSize(size.x, size.y, false);
  }

  landed(i: number, power: number): void {
    const v = this.vis[i];
    if (v) v.squash = Math.min(1, power / 12);
  }

  private updateProjectiles(list: Projectile[], dt: number): void {
    const seen = new Set<number>();
    for (const p of list) {
      if (!p.alive) continue;
      seen.add(p.id);
      let o = this.proj.get(p.id);
      const key = p.kind;
      if (o && o.userData.kind !== key) {
        this.scene.remove(o);
        o = undefined;
      }
      if (!o) {
        o = this.projAssets[key]();
        o.userData.kind = key;
        this.scene.add(o);
        this.proj.set(p.id, o);
      }
      o.position.set(p.x, p.y, p.z);
      if (key === "ball") o.rotation.x += dt * 12;
      if (key === "redcard") o.rotation.y += dt * 9;
      if (key === "banana") o.rotation.y = p.id;
      if (key === "puddle") o.scale.set(1, 0.32 + Math.sin(this.time * 5) * 0.03, 1);
    }
    for (const [id, o] of this.proj) {
      if (!seen.has(id)) {
        this.scene.remove(o);
        this.proj.delete(id);
      }
    }
  }

  private updateSparks(dt: number): void {
    if (!this.sparks) return;
    const d = this.sparkData;
    for (const s of d) {
      s.life -= dt;
      s.vy -= 9 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
    }
    this.sparkData = d.filter((s) => s.life > 0).slice(-240);
    const pos = this.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 240; i++) {
      const s = this.sparkData[i];
      if (s) pos.setXYZ(i, s.x, s.y, s.z);
      else pos.setXYZ(i, 0, -999, 0);
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
