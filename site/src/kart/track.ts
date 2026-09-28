// Mascot Kart track model, shared by the simulation, the AI and the renderer.
// A track is a closed centripetal Catmull-Rom spline through control points (x, z, y, half width),
// resampled every ~1 m. Karts find their sample by a local search around the last one, so a track
// may cross over itself on a bridge. Racing line and speed profile are precomputed for the AI.
import type { TrackDef, TrackSample } from "./types";

export interface Track {
  def: TrackDef;
  n: number;
  ds: number; // metres between samples
  length: number;
  samples: TrackSample[];
  line: Float32Array; // AI racing line: lateral offset per sample (+ right)
  lineCurv: Float32Array; // curvature of the racing line
  vmax: Float32Array; // AI target speed per sample
  laps: number;
  startIndex: number;
  minY: number;
  maxY: number;
  bounds: { x0: number; z0: number; x1: number; z1: number };
}

const TAU = Math.PI * 2;

export const wrap = (i: number, n: number) => ((i % n) + n) % n;
export const angleDiff = (a: number, b: number) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

// Centripetal Catmull-Rom (Barry-Goldman) on 4D points; knots from the 2D distance.
function catmull(p0: number[], p1: number[], p2: number[], p3: number[], t: number): number[] {
  const k = (a: number[], b: number[]) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0;
  const t1 = t0 + k(p0, p1);
  const t2 = t1 + k(p1, p2);
  const t3 = t2 + k(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: number[], b: number[], ta: number, tb: number) => a.map((v, i) => ((tb - u) * v + (u - ta) * b[i]) / (tb - ta));
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

function inRange(f: number, from: number, to: number): boolean {
  return from <= to ? f >= from && f < to : f >= from || f < to;
}

export function buildTrack(def: TrackDef): Track {
  const P = def.points;
  const m = P.length;
  // dense polyline
  const dense: number[][] = [];
  const SUB = 40;
  for (let i = 0; i < m; i++) {
    const p0 = P[wrap(i - 1, m)];
    const p1 = P[i];
    const p2 = P[wrap(i + 1, m)];
    const p3 = P[wrap(i + 2, m)];
    for (let j = 0; j < SUB; j++) dense.push(catmull(p0, p1, p2, p3, j / SUB));
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[dense.length];
  const n = Math.max(64, Math.round(length));
  const ds = length / n;
  const raw: number[][] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    while (cum[j + 1] < s) j++;
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    const t = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    raw.push(a.map((v, k) => v + (b[k] - v) * t));
  }
  // elevation humps (smooth cosine bumps; at speed they launch karts)
  const ys = raw.map((r) => r[2]);
  for (const [f, len, h] of def.bumps ?? []) {
    const s0 = f * length;
    for (let i = 0; i < n; i++) {
      let d = i * ds - s0;
      if (d > length / 2) d -= length;
      if (d < -length / 2) d += length;
      if (Math.abs(d) < len / 2) ys[i] += h * 0.5 * (1 + Math.cos((Math.PI * d) / (len / 2)));
    }
  }
  const samples: TrackSample[] = [];
  for (let i = 0; i < n; i++) {
    const a = raw[wrap(i - 1, n)];
    const b = raw[wrap(i + 1, n)];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const f = i / n;
    let verge = def.verge ?? 5;
    let wall = def.wall ?? "tires";
    let surface = def.surface ?? "asphalt";
    let bridge = false;
    for (const sec of def.sections ?? []) {
      if (!inRange(f, sec.from, sec.to)) continue;
      if (sec.verge !== undefined) verge = sec.verge;
      if (sec.wall) wall = sec.wall;
      if (sec.surface) surface = sec.surface;
      if (sec.bridge) bridge = true;
    }
    samples.push({
      x: raw[i][0],
      z: raw[i][1],
      y: ys[i],
      tx: (b[0] - a[0]) / tl,
      tz: (b[1] - a[1]) / tl,
      hw: raw[i][3],
      verge,
      curv: 0,
      slope: (ys[wrap(i + 1, n)] - ys[wrap(i - 1, n)]) / (2 * ds),
      s: i * ds,
      bridge,
      wall,
      surface,
    });
  }
  for (let i = 0; i < n; i++) {
    const a = samples[wrap(i - 2, n)];
    const b = samples[wrap(i + 2, n)];
    // positive when the heading angle increases, which is a right turn in this game's convention
    samples[i].curv = angleDiffTangent(a, b) / (4 * ds);
  }
  const { line, lineCurv } = racingLine(samples, ds);
  const vmax = speedProfile(lineCurv, ds);
  let minY = Infinity;
  let maxY = -Infinity;
  const bounds = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const s of samples) {
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y);
    const r = s.hw + s.verge + 2;
    bounds.x0 = Math.min(bounds.x0, s.x - r);
    bounds.x1 = Math.max(bounds.x1, s.x + r);
    bounds.z0 = Math.min(bounds.z0, s.z - r);
    bounds.z1 = Math.max(bounds.z1, s.z + r);
  }
  return {
    def,
    n,
    ds,
    length,
    samples,
    line,
    lineCurv,
    vmax,
    laps: def.laps,
    startIndex: wrap(Math.round((def.start ?? 0) * n), n),
    minY,
    maxY,
    bounds,
  };
}

function angleDiffTangent(a: TrackSample, b: TrackSample): number {
  return angleDiff(Math.atan2(b.tz, b.tx), Math.atan2(a.tz, a.tx));
}

// Shortest path inside the road with a margin (multi-scale elastic band); it hugs the apexes.
function racingLine(samples: TrackSample[], ds: number): { line: Float32Array; lineCurv: Float32Array } {
  const n = samples.length;
  const o = new Float32Array(n);
  const px = (i: number) => samples[i].x - samples[i].tz * o[i];
  const pz = (i: number) => samples[i].z + samples[i].tx * o[i];
  for (const k of [32, 16, 8, 4, 2, 1]) {
    const iters = k >= 8 ? 40 : 80;
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < n; i++) {
        const a = wrap(i - k, n);
        const b = wrap(i + k, n);
        const mx = (px(a) + px(b)) / 2;
        const mz = (pz(a) + pz(b)) / 2;
        const s = samples[i];
        const target = (mx - s.x) * -s.tz + (mz - s.z) * s.tx;
        const lim = Math.max(0, s.hw - 1.7);
        o[i] = Math.max(-lim, Math.min(lim, o[i] + 0.55 * (target - o[i])));
      }
    }
  }
  const lineCurv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = wrap(i - 3, n);
    const b = wrap(i + 3, n);
    const h1 = Math.atan2(pz(i) - pz(a), px(i) - px(a));
    const h2 = Math.atan2(pz(b) - pz(i), px(b) - px(i));
    lineCurv[i] = angleDiff(h2, h1) / (3 * ds);
  }
  return { line: o, lineCurv };
}

// Target speed from the racing line's curvature, with braking and acceleration passes.
function speedProfile(curv: Float32Array, ds: number): Float32Array {
  const n = curv.length;
  const v = new Float32Array(n);
  const ALAT = 34; // m/s^2 cornering with a drift
  for (let i = 0; i < n; i++) {
    let k = 0;
    for (let d = -2; d <= 2; d++) k = Math.max(k, Math.abs(curv[wrap(i + d, n)]));
    v[i] = Math.min(40, Math.sqrt(ALAT / Math.max(1e-4, k)));
  }
  const BRAKE = 16;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const nx = v[wrap(i + 1, n)];
      v[i] = Math.min(v[i], Math.sqrt(nx * nx + 2 * BRAKE * ds));
    }
  }
  return v;
}

// Nearest sample to (x, z) by a local search from a hint index.
export function nearestLocal(tr: Track, x: number, z: number, hint: number, radius = 8): number {
  let best = hint;
  let bd = Infinity;
  for (let d = -radius; d <= radius; d++) {
    const i = wrap(hint + d, tr.n);
    const s = tr.samples[i];
    const dd = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  if (best !== hint && Math.abs(wrap(best - hint + tr.n / 2, tr.n) - tr.n / 2) >= radius - 1) return nearestLocal(tr, x, z, best, radius);
  return best;
}

// Global nearest, optionally preferring samples close to a height (for overpasses).
export function nearestGlobal(tr: Track, x: number, z: number, y?: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < tr.n; i++) {
    const s = tr.samples[i];
    let dd = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (y !== undefined) dd += (s.y - y) ** 2 * 4;
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  return best;
}

// Lateral offset (+ right) and along-track position of (x, z) relative to sample i.
export function frame(tr: Track, i: number, x: number, z: number): { lat: number; along: number } {
  const s = tr.samples[i];
  const dx = x - s.x;
  const dz = z - s.z;
  return { lat: dx * -s.tz + dz * s.tx, along: dx * s.tx + dz * s.tz };
}

// Ground height at (x, z) near sample i (linear along the track).
export function groundY(tr: Track, i: number, along: number): number {
  const s = tr.samples[i];
  const j = along >= 0 ? wrap(i + 1, tr.n) : wrap(i - 1, tr.n);
  const t = Math.min(1, Math.abs(along) / tr.ds);
  return s.y + (tr.samples[j].y - s.y) * t;
}

// Road gradient (dy per metre along the track) under a point, interpolated between the centred sample
// slopes so it changes smoothly: the joints between 1 m samples must not read as crests.
export function slopeAt(tr: Track, i: number, along: number): number {
  const s = tr.samples[i];
  const j = along >= 0 ? wrap(i + 1, tr.n) : wrap(i - 1, tr.n);
  const t = Math.min(1, Math.abs(along) / tr.ds);
  return s.slope + (tr.samples[j].slope - s.slope) * t;
}

// World point at sample i shifted laterally by lat (+ right).
export function pointAt(tr: Track, i: number, lat: number): { x: number; z: number; y: number } {
  const s = tr.samples[wrap(i, tr.n)];
  return { x: s.x - s.tz * lat, z: s.z + s.tx * lat, y: s.y };
}

export function headingAt(tr: Track, i: number): number {
  const s = tr.samples[wrap(i, tr.n)];
  return Math.atan2(s.tz, s.tx);
}

// Signed index distance from a to b along the loop, in samples (-n/2 .. n/2).
export function indexDelta(tr: Track, a: number, b: number): number {
  let d = b - a;
  if (d > tr.n / 2) d -= tr.n;
  if (d < -tr.n / 2) d += tr.n;
  return d;
}

// Grid slots behind the start line, pole first: two karts per row, rows 6.5 m apart, staggered.
export function gridSlot(tr: Track, slot: number): { i: number; lat: number } {
  const row = Math.floor(slot / 2);
  const col = slot % 2;
  const back = 5 + row * 6.5 + col * 2.5;
  const i = wrap(tr.startIndex - Math.round(back / tr.ds), tr.n);
  const w = Math.min(tr.samples[i].hw - 2.2, 4);
  return { i, lat: col === 0 ? -w * 0.62 : w * 0.62 };
}
