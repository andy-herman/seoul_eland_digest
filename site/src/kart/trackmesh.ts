// Mascot Kart track meshes, built at runtime from the same samples the physics uses: road, curbs,
// verges, walls, embankments under raised road, bridge decks, start line, boost pads and ground.
import * as THREE from "three";
import { wrap, type Track } from "./track";
import type { Theme } from "./theme";
import { checkerTexture, curbTexture, groundTexture, padTexture, roadTexture, vergeTexture, wallTexture, type WallKind } from "./textures";

type Side = (i: number) => [number, number]; // lateral offset (+ right), height offset

// A strip between two lateral profiles over a run of sample indices.
function ribbon(tr: Track, idx: number[], left: Side, right: Side, vScale: number, uRight: number | ((i: number) => number), swapUV = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  let run = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const s = tr.samples[i];
    if (k > 0) {
      const p = tr.samples[idx[k - 1]];
      run += Math.hypot(s.x - p.x, s.z - p.z);
    }
    for (const [lat, dy] of [left(i), right(i)]) pos.push(s.x - s.tz * lat, s.y + dy, s.z + s.tx * lat);
    const v = run / vScale;
    const u = typeof uRight === "function" ? uRight(i) : uRight;
    if (swapUV) uv.push(v, 0, v, u);
    else uv.push(0, v, u, v);
    if (k < idx.length - 1) {
      const a = 2 * k;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Consecutive runs of samples matching a predicate; a run covering the whole loop is closed.
function runs(tr: Track, pred: (i: number) => boolean): number[][] {
  const n = tr.n;
  const all: number[][] = [];
  let start = -1;
  for (let i = 0; i < n; i++) if (!pred(i)) start = i;
  if (start === -1) {
    const loop = Array.from({ length: n + 1 }, (_, i) => i % n);
    return [loop];
  }
  let cur: number[] = [];
  for (let k = 1; k <= n; k++) {
    const i = wrap(start + k, n);
    if (pred(i)) cur.push(i);
    else if (cur.length) {
      all.push(cur);
      cur = [];
    }
  }
  if (cur.length) all.push(cur);
  // extend each run by one sample on both ends so strips meet their neighbours
  return all.map((r) => (r.length > 1 ? [wrap(r[0] - 1, n), ...r, wrap(r[r.length - 1] + 1, n)] : r)).filter((r) => r.length > 2);
}

export interface TrackVisual {
  group: THREE.Group;
  pads: THREE.Texture;
  groundY: number;
}

export function buildTrackVisual(tr: Track, theme: Theme, aniso: number): TrackVisual {
  const group = new THREE.Group();
  group.name = "track";
  const S = tr.samples;
  const groundY = tr.minY - 0.06;
  const lambert = (map: THREE.Texture | null, color = "#ffffff", extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map, color, ...extra });
  const fix = (t: THREE.Texture) => {
    t.anisotropy = aniso;
    return t;
  };
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return mesh;
  };

  // road
  const roadTex = fix(roadTexture(theme.road, theme.edge));
  const bridgeRoad = fix(roadTexture("wood", theme.edge));
  for (const r of runs(tr, (i) => !S[i].bridge || theme.road !== "asphalt")) add(ribbon(tr, r, (i) => [-S[i].hw, 0.02], (i) => [S[i].hw, 0.02], 10, 1), lambert(roadTex), "road");
  if (theme.road === "asphalt") for (const r of runs(tr, (i) => S[i].bridge)) add(ribbon(tr, r, (i) => [-S[i].hw, 0.02], (i) => [S[i].hw, 0.02], 10, 1), lambert(bridgeRoad), "road-bridge");

  // curbs
  const curb = lambert(fix(curbTexture(theme.curb[0], theme.curb[1])));
  const all = runs(tr, () => true);
  for (const r of all) {
    add(ribbon(tr, r, (i) => [-S[i].hw - 1.1, 0.045], (i) => [-S[i].hw, 0.045], 4, 1), curb, "curb-l");
    add(ribbon(tr, r, (i) => [S[i].hw, 0.045], (i) => [S[i].hw + 1.1, 0.045], 4, 1), curb, "curb-r");
  }

  // verges: grass or sand off the road, a concrete walkway on bridges
  const vergeMat = lambert(fix(vergeTexture(theme.verge)));
  const walkMat = lambert(fix(vergeTexture("concrete")));
  for (const [pred, mat] of [
    [(i: number) => !S[i].bridge, vergeMat],
    [(i: number) => S[i].bridge, walkMat],
  ] as [(i: number) => boolean, THREE.Material][]) {
    for (const r of runs(tr, pred)) {
      add(ribbon(tr, r, (i) => [-(S[i].hw + S[i].verge + 0.6), 0], (i) => [-S[i].hw - 1.1, 0], 8, (i) => (S[i].verge + 0.6) / 8), mat, "verge-l");
      add(ribbon(tr, r, (i) => [S[i].hw + 1.1, 0], (i) => [S[i].hw + S[i].verge + 0.6, 0], 8, (i) => (S[i].verge + 0.6) / 8), mat, "verge-r");
    }
  }

  // walls, one material per style
  const styles = [...new Set(S.map((s) => s.wall))] as WallKind[];
  for (const style of styles) {
    const tex = fix(wallTexture(style, theme.boardColors, theme.boards));
    const transparent = style === "rail" || style === "fence";
    const mat = lambert(tex, "#ffffff", { side: THREE.DoubleSide, transparent, alphaTest: transparent ? 0.4 : 0 });
    const h = theme.wallHeight[style] ?? 1.1;
    for (const r of runs(tr, (i) => S[i].wall === style)) {
      for (const side of [-1, 1]) {
        add(ribbon(tr, r, (i) => [side * (S[i].hw + S[i].verge), -0.3], (i) => [side * (S[i].hw + S[i].verge), h], 8, 1, true), mat, `wall-${style}`);
      }
    }
  }

  // embankments under raised road, deck edges on bridges
  const bank = lambert(null, theme.embankment);
  const deck = lambert(null, "#9aa3ad");
  for (const side of [-1, 1]) {
    for (const r of runs(tr, (i) => !S[i].bridge && S[i].y - groundY > 0.25)) {
      add(
        ribbon(tr, r, (i) => [side * (S[i].hw + S[i].verge + 0.4), 0.02], (i) => [side * (S[i].hw + S[i].verge + 0.4 + 1.7 * (S[i].y - groundY)), groundY - S[i].y], 6, 1),
        new THREE.MeshLambertMaterial({ color: theme.embankment, side: THREE.DoubleSide }),
        "bank",
      );
    }
    for (const r of runs(tr, (i) => S[i].bridge)) {
      add(ribbon(tr, r, (i) => [side * (S[i].hw + S[i].verge + 0.6), 0.02], (i) => [side * (S[i].hw + S[i].verge + 0.6), -1.4], 6, 1), new THREE.MeshLambertMaterial({ color: "#9aa3ad", side: THREE.DoubleSide }), "deck-edge");
    }
  }
  // bridge underside
  for (const r of runs(tr, (i) => S[i].bridge)) add(ribbon(tr, r, (i) => [S[i].hw + S[i].verge + 0.6, -1.4], (i) => [-(S[i].hw + S[i].verge + 0.6), -1.4], 6, 1), deck, "deck-under");
  void bank;

  // start line
  const st = tr.startIndex;
  const startIdx = [wrap(st - 1, tr.n), st, wrap(st + 1, tr.n), wrap(st + 2, tr.n)];
  const chk = checkerTexture();
  add(ribbon(tr, startIdx, (i) => [-S[i].hw, 0.06], (i) => [S[i].hw, 0.06], 0.75, S[st].hw / 1.5), lambert(chk), "start");

  // boost pads
  const padTex = fix(padTexture());
  const padMat = lambert(padTex, "#ffffff", { emissive: new THREE.Color("#ff7a00"), emissiveIntensity: 0.35 });
  for (const [f, off] of tr.def.pads ?? []) {
    const c = wrap(Math.round(f * tr.n), tr.n);
    const idx = [-2, -1, 0, 1, 2, 3].map((d) => wrap(c + Math.round(d / tr.ds), tr.n));
    add(ribbon(tr, idx, () => [off - 1.8, 0.07], () => [off + 1.8, 0.07], 2.5, 1), padMat, "pad");
  }

  // terrain under raised road (hills on Namsan, Suwon, Daegu), then the flat ground plane
  const terrain = buildTerrain(tr, groundY, theme, aniso);
  if (terrain) group.add(terrain);

  // ground plane
  const b = tr.bounds;
  const size = Math.max(b.x1 - b.x0, b.z1 - b.z0) + 1600;
  const gtex = fix(groundTexture(theme.ground));
  gtex.repeat.set(size / 40, size / 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), lambert(gtex));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((b.x0 + b.x1) / 2, groundY, (b.z0 + b.z1) / 2);
  ground.name = "ground";
  group.add(ground);
  ground.updateMatrix();

  for (const m of group.children) m.updateMatrix();
  return { group, pads: padTex, groundY };
}

// A heightfield that rises to just under any raised road and falls away with distance, never above
// another stretch of road and never under a bridge.
function buildTerrain(tr: Track, groundY: number, theme: Theme, aniso: number): THREE.Mesh | null {
  const S = tr.samples;
  const solid = S.filter((s) => !s.bridge && s.y - groundY > 1.2);
  if (!solid.length) return null;
  const step = 8;
  const m = 170;
  const b = tr.bounds;
  const x0 = b.x0 - m;
  const z0 = b.z0 - m;
  const nx = Math.ceil((b.x1 - b.x0 + 2 * m) / step) + 1;
  const nz = Math.ceil((b.z1 - b.z0 + 2 * m) / step) + 1;
  const cell = 40;
  const grid = new Map<string, number[]>();
  S.forEach((s, i) => {
    if (i % 2) return;
    const k = `${Math.floor(s.x / cell)},${Math.floor(s.z / cell)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(i);
  });
  const heights = new Float32Array(nx * nz);
  const reach = 4;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const z = z0 + j * step;
      let h = groundY;
      let cap = Infinity;
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
          for (const si of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
            const s = S[si];
            const d = Math.hypot(s.x - x, s.z - z) - (s.hw + s.verge + 0.8);
            if (d < 3.5) cap = Math.min(cap, s.y - (s.bridge ? 1.8 : 0.35));
            if (s.bridge) continue;
            const top = s.y - 0.35;
            if (top <= groundY) continue;
            if (d <= 0) h = Math.max(h, top);
            else {
              const fall = 28 + (s.y - groundY) * 2.3;
              const f = Math.max(0, 1 - d / fall);
              h = Math.max(h, groundY + (top - groundY) * f * f * (3 - 2 * f));
            }
          }
        }
      }
      heights[j * nx + i] = Math.min(h, cap);
    }
  }
  const geo = new THREE.PlaneGeometry((nx - 1) * step, (nz - 1) * step, nx - 1, nz - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const cxm = x0 + ((nx - 1) * step) / 2;
  const czm = z0 + ((nz - 1) * step) / 2;
  for (let k = 0; k < pos.count; k++) {
    const i = Math.round((pos.getX(k) + ((nx - 1) * step) / 2) / step);
    const j = Math.round((pos.getZ(k) + ((nz - 1) * step) / 2) / step);
    pos.setXYZ(k, pos.getX(k) + cxm, Math.max(groundY + 0.01, heights[j * nx + i]), pos.getZ(k) + czm);
  }
  geo.computeVertexNormals();
  const tex = groundTexture(theme.ground === "water" ? "grass" : theme.ground);
  tex.anisotropy = aniso;
  tex.repeat.set(((nx - 1) * step) / 40, ((nz - 1) * step) / 40);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  mesh.name = "terrain";
  return mesh;
}
