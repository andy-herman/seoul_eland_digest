// Mascot Kart scenery: props from the Blender prop library (props.glb) scattered and placed by the
// track's scenery rules as instanced meshes, the track's landmark models (landmarks/<id>.glb),
// and water areas. Every scattered prop is checked against the track so nothing lands on the road.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { pointAt, wrap, type Track } from "./track";
import type { Theme } from "./theme";

export interface SceneryDef {
  scatter?: { prop: string | string[]; every: number; from?: number; to?: number; side?: "left" | "right" | "both"; dist?: [number, number]; scale?: [number, number]; seed?: number; face?: boolean }[];
  along?: { prop: string; at: number; side: -1 | 1; dist: number; rot?: number; scale?: number }[];
  span?: { prop: string; at: number; scale?: number }[]; // across the road, facing oncoming karts
  chevrons?: { minCurv: number; every: number; prop?: string }; // warning boards on the outside of corners
  place?: { prop: string; x: number; z: number; y?: number; rot?: number; scale?: number }[];
  field?: { prop: string | string[]; x0: number; z0: number; x1: number; z1: number; count: number; scale?: [number, number]; seed?: number }[];
  water?: { y: number; points: [number, number][] }[];
  landmark?: boolean;
}

interface PropPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

const gltfCache = new Map<string, Promise<THREE.Group | null>>();
function loadGlb(url: string): Promise<THREE.Group | null> {
  if (!gltfCache.has(url))
    gltfCache.set(
      url,
      new GLTFLoader()
        .setMeshoptDecoder(MeshoptDecoder)
        .loadAsync(url)
        .then((g) => g.scene)
        .catch(() => null),
    );
  return gltfCache.get(url)!;
}

const ramp = (() => {
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

// Blender materials become toon materials; "Outline" becomes the inverted-hull black; "Glow" stays bright at night.
export function toonify(src: THREE.Material, night: boolean): THREE.Material {
  const s = src as THREE.MeshStandardMaterial;
  const name = s.name ?? "";
  if (name.startsWith("Outline")) return new THREE.MeshBasicMaterial({ color: "#10131c" }); // reversed shell: front faces only
  const glow = name.startsWith("Glow");
  const m = new THREE.MeshToonMaterial({
    color: s.color ?? new THREE.Color("#cccccc"),
    map: s.map ?? null,
    gradientMap: ramp,
    transparent: s.transparent,
    opacity: s.opacity,
    alphaTest: s.alphaTest,
    side: s.side,
  });
  if (glow || (s.emissive && s.emissive.getHex() !== 0)) {
    m.emissive = glow ? (s.color ?? new THREE.Color("#ffffff")).clone() : s.emissive.clone();
    m.emissiveIntensity = glow ? (night ? 1.1 : 0.35) : s.emissiveIntensity;
  }
  m.name = name;
  return m;
}

// Quantised (gltfpack) attributes become plain floats so transforms can be baked into them.
function floatGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const a = src.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    if (!a) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      out[i * a.itemSize] = a.getX(i);
      if (a.itemSize > 1) out[i * a.itemSize + 1] = a.getY(i);
      if (a.itemSize > 2) out[i * a.itemSize + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(Array.from(src.index.array as ArrayLike<number>));
  return g;
}

// Collapse each prop (a top-level object named prop_<name>) into one geometry per material.
function propLibrary(root: THREE.Group, night: boolean): Map<string, PropPart[]> {
  const lib = new Map<string, PropPart[]>();
  root.updateMatrixWorld(true);
  for (const obj of root.children) {
    if (!obj.name.startsWith("prop_")) continue;
    const name = obj.name.slice(5);
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const byMat = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const g = floatGeometry(m.geometry);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute("position").count || 0) * 2), 2));
      const key = mats[0].name + ":" + (mats[0] as THREE.MeshStandardMaterial).color?.getHexString();
      if (!byMat.has(key)) byMat.set(key, { mat: toonify(mats[0], night), geos: [] });
      byMat.get(key)!.geos.push(g.index ? g.toNonIndexed() : g);
    });
    const parts: PropPart[] = [];
    for (const { mat, geos } of byMat.values()) {
      const merged = mergeGeometries(geos, false);
      if (merged) parts.push({ geometry: merged, material: mat });
    }
    lib.set(name, parts);
  }
  return lib;
}

// Simple stand-ins so a track still has scenery before the Blender library exists.
function fallbackLibrary(): Map<string, PropPart[]> {
  const lib = new Map<string, PropPart[]>();
  const toon = (c: string) => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp });
  const tr = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
  lib.set("tree_round", [
    { geometry: tr(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 8), 0, 1.2, 0), material: toon("#8a5a33") },
    { geometry: tr(new THREE.IcosahedronGeometry(2.1, 1), 0, 3.6, 0), material: toon("#4caf50") },
  ]);
  lib.set("tree_pine", [
    { geometry: tr(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 8), 0, 0.8, 0), material: toon("#7a4e28") },
    { geometry: tr(new THREE.ConeGeometry(1.8, 4.6, 8), 0, 3.6, 0), material: toon("#2f8a4a") },
  ]);
  lib.set("tree_cherry", [
    { geometry: tr(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 8), 0, 1.1, 0), material: toon("#6b4430") },
    { geometry: tr(new THREE.IcosahedronGeometry(2.2, 1), 0, 3.5, 0), material: toon("#f7b6cf") },
  ]);
  lib.set("building", [{ geometry: tr(new THREE.BoxGeometry(12, 30, 12), 0, 15, 0), material: toon("#d9dde6") }]);
  lib.set("lamp", [
    { geometry: tr(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), 0, 2.5, 0), material: toon("#4b5563") },
    { geometry: tr(new THREE.SphereGeometry(0.35, 8, 6), 0, 5.1, 0), material: toon("#fff3b0") },
  ]);
  lib.set("bush", [{ geometry: tr(new THREE.IcosahedronGeometry(1.1, 0), 0, 0.8, 0), material: toon("#3f9a45") }]);
  return lib;
}

class Placer {
  private grid = new Map<string, number[]>();
  constructor(private tr: Track) {
    tr.samples.forEach((s, i) => {
      const key = `${Math.floor(s.x / 24)},${Math.floor(s.z / 24)}`;
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key)!.push(i);
    });
  }
  clear(x: number, z: number, r: number): boolean {
    const cx = Math.floor(x / 24);
    const cz = Math.floor(z / 24);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (const i of this.grid.get(`${cx + dx},${cz + dz}`) ?? []) {
          const s = this.tr.samples[i];
          const lim = s.hw + s.verge + 1.6 + r;
          if ((s.x - x) ** 2 + (s.z - z) ** 2 < lim * lim) return false;
        }
      }
    }
    return true;
  }
}

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Props are modelled facing +Z (Blender -Y); this turns one beside the road to face it.
function faceRoad(tx: number, tz: number, side: number): number {
  const theta = Math.atan2(tz, tx);
  return side > 0 ? Math.PI - theta : -theta;
}

export async function addScenery(scene: THREE.Scene, tr: Track, theme: Theme, assets: string): Promise<void> {
  const def = (tr.def.scenery ?? {}) as SceneryDef;
  const [propsRoot, landmark] = await Promise.all([loadGlb(`${assets}props.glb`), def.landmark ? loadGlb(`${assets}landmarks/${tr.def.id}.glb`) : Promise.resolve(null)]);
  const lib = propsRoot ? propLibrary(propsRoot, !!theme.night) : fallbackLibrary();
  const fallback = fallbackLibrary();
  const placer = new Placer(tr);
  const instances = new Map<string, THREE.Matrix4[]>();
  const put = (prop: string, x: number, y: number, z: number, rot: number, scale: number) => {
    const name = lib.has(prop) ? prop : fallback.has(prop) ? prop : null;
    if (!name) return;
    if (!instances.has(name)) instances.set(name, []);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(scale, scale, scale));
    instances.get(name)!.push(m);
  };
  const groundY = tr.minY - 0.06;
  const pick = (p: string | string[], r: () => number) => (Array.isArray(p) ? p[Math.floor(r() * p.length)] : p);
  for (const rule of def.scatter ?? []) {
    const r = rng(rule.seed ?? rule.every * 97 + (Array.isArray(rule.prop) ? rule.prop.length : rule.prop.length));
    const from = (rule.from ?? 0) * tr.length;
    const to = (rule.to ?? 1) * tr.length;
    const sides = rule.side === "left" ? [-1] : rule.side === "right" ? [1] : [-1, 1];
    const [d0, d1] = rule.dist ?? [3, 14];
    const [s0, s1] = rule.scale ?? [0.85, 1.25];
    const span = to >= from ? to - from : to + tr.length - from;
    for (let s = 0; s < span; s += rule.every * (0.7 + r() * 0.6)) {
      const i = wrap(Math.round((from + s) / tr.ds), tr.n);
      for (const side of sides) {
        const sm = tr.samples[i];
        const d = d0 + r() * (d1 - d0);
        const lat = side * (sm.hw + sm.verge + 1.8 + d);
        const p = pointAt(tr, i, lat);
        const scale = s0 + r() * (s1 - s0);
        if (!placer.clear(p.x, p.z, 1.5 * scale)) continue;
        const rot = rule.face ? faceRoad(sm.tx, sm.tz, side) : r() * Math.PI * 2;
        put(pick(rule.prop, r), p.x, groundY, p.z, rot, scale);
      }
    }
  }
  for (const a of def.along ?? []) {
    const i = wrap(Math.round(a.at * tr.n), tr.n);
    const sm = tr.samples[i];
    const p = pointAt(tr, i, a.side * (sm.hw + sm.verge + 1.8 + a.dist));
    put(a.prop, p.x, sm.bridge ? sm.y : groundY, p.z, a.rot ?? faceRoad(sm.tx, sm.tz, a.side), a.scale ?? 1);
  }
  if (def.chevrons) {
    const step = Math.max(1, Math.round(def.chevrons.every / tr.ds));
    for (let i = 0; i < tr.n; i += step) {
      const sm = tr.samples[i];
      if (Math.abs(sm.curv) < def.chevrons.minCurv) continue;
      const side = sm.curv > 0 ? -1 : 1; // outside of the corner
      const p = pointAt(tr, i, side * (sm.hw + sm.verge + 0.9));
      if (placer.clear(p.x, p.z, -0.2)) put(def.chevrons.prop ?? "chevron", p.x, sm.bridge ? sm.y : groundY, p.z, faceRoad(sm.tx, sm.tz, side), 1);
    }
  }
  for (const sp of def.span ?? []) {
    const i = wrap(Math.round(sp.at * tr.n), tr.n);
    const sm = tr.samples[i];
    put(sp.prop, sm.x, sm.y, sm.z, (Math.PI * 3) / 2 - Math.atan2(sm.tz, sm.tx), sp.scale ?? 1);
  }
  for (const f of def.field ?? []) {
    const r = rng(f.seed ?? f.count * 13);
    const [s0, s1] = f.scale ?? [0.85, 1.25];
    for (let n = 0; n < f.count; n++) {
      const x = f.x0 + r() * (f.x1 - f.x0);
      const z = f.z0 + r() * (f.z1 - f.z0);
      const scale = s0 + r() * (s1 - s0);
      if (placer.clear(x, z, 2 * scale)) put(pick(f.prop, r), x, groundY, z, r() * Math.PI * 2, scale);
    }
  }
  for (const p of def.place ?? []) put(p.prop, p.x, p.y ?? groundY, p.z, p.rot ?? 0, p.scale ?? 1);
  for (const [name, mats] of instances) {
    const parts = lib.get(name) ?? fallback.get(name)!;
    for (const part of parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.name = `prop-${name}`;
      scene.add(im);
    }
  }
  if (landmark) {
    const lm = landmark.clone(true);
    lm.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => toonify(x, !!theme.night)) : toonify(m.material, !!theme.night);
    });
    lm.name = "landmarks";
    scene.add(lm);
  }
  for (const w of def.water ?? []) {
    const shape = new THREE.Shape(w.points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: theme.night ? "#1f3f7a" : "#3a9ad9", emissive: new THREE.Color(theme.night ? "#10224a" : "#0b4f86"), emissiveIntensity: 0.35 });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = w.y;
    mesh.name = "water";
    scene.add(mesh);
  }
}
