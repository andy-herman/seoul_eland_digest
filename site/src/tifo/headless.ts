import { allFixed, makeCheck, tapCard } from "./check";
import { decodeDesign, encodeDesign } from "./codec";
import { CARD_LEVELS, GALLERY, PALETTE, TIFO_CELLS, USABLE_SET, type TifoDesign } from "./data";
import { floodFill, nearestPalette, quantizeImageData } from "./editor";
import { TifoRenderer } from "./render";

function assert(ok: unknown, msg: string, violations: string[]): void {
  if (!ok) violations.push(msg);
}
function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(1664525, s) + 1013904223) >>> 0) / 0x100000000;
}
function randomDesign(seed: number, frames = 4): TifoDesign {
  const r = rand(seed);
  const fs = Array.from({ length: frames }, () => {
    const f = new Uint8Array(TIFO_CELLS);
    for (let i = 0; i < TIFO_CELLS; i++) f[i] = USABLE_SET.has(i) ? Math.floor(r() * 8) : 0;
    return f;
  });
  return { id: `r${seed}`, title: `Random ${seed}`, wave: "left", frames: fs };
}
function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function refFill(frame: Uint8Array, start: number, color: number): Uint8Array {
  const out = new Uint8Array(frame);
  const target = out[start];
  const q = [start], seen = new Set<number>([start]);
  while (q.length) {
    const i = q.shift()!;
    if (!USABLE_SET.has(i) || out[i] !== target) continue;
    out[i] = color;
    const x = i % 48;
    for (const n of [i - 48, i + 48, x ? i - 1 : -1, x < 47 ? i + 1 : -1]) if (n >= 0 && n < TIFO_CELLS && !seen.has(n)) { seen.add(n); q.push(n); }
  }
  return out;
}

async function main(): Promise<void> {
  const violations: string[] = [];
  let roundTrips = 0;
  let maxShare = 0;
  for (const d of [...GALLERY, ...Array.from({ length: 8 }, (_, i) => randomDesign(200 + i, 1 + (i % 4)))]) {
    const code = await encodeDesign(d);
    maxShare = Math.max(maxShare, code.length);
    const back = await decodeDesign(code);
    assert(back.frames.length === d.frames.length, `${d.id}: frame count changed`, violations);
    d.frames.forEach((f, i) => assert(same(f, back.frames[i]), `${d.id}: frame ${i} changed`, violations));
    roundTrips++;
  }
  const full = randomDesign(999, 4);
  const fullCode = await encodeDesign(full);
  maxShare = Math.max(maxShare, fullCode.length);
  assert(fullCode.length < 2500, `full 4-frame share too long: ${fullCode.length}`, violations);

  const samples = new Uint8ClampedArray(PALETTE.length * 4);
  for (let i = 0; i < PALETTE.length; i++) {
    samples[i * 4] = parseInt(PALETTE[i].hex.slice(1, 3), 16);
    samples[i * 4 + 1] = parseInt(PALETTE[i].hex.slice(3, 5), 16);
    samples[i * 4 + 2] = parseInt(PALETTE[i].hex.slice(5, 7), 16);
    samples[i * 4 + 3] = 255;
    assert(nearestPalette(samples[i * 4], samples[i * 4 + 1], samples[i * 4 + 2]) === i, `palette ${i} did not map to itself`, violations);
  }
  const q1 = quantizeImageData(samples, PALETTE.length, 1, true);
  const q2 = quantizeImageData(samples, PALETTE.length, 1, true);
  assert(same(q1, q2), "quantizer is not deterministic", violations);

  for (let s = 0; s < 40; s++) {
    const d = randomDesign(3000 + s, 1).frames[0];
    const idx = [...USABLE_SET][s % USABLE_SET.size] as number;
    const a = floodFill(d, idx, (s + 1) & 7);
    const b = refFill(d, idx, (s + 1) & 7);
    assert(same(a, b), `flood fill mismatch ${s}`, violations);
  }

  for (const level of CARD_LEVELS) {
    const a = makeCheck(level.id);
    const b = makeCheck(level.id);
    assert(a.errors.length === level.errors, `${level.id}: expected ${level.errors} errors, got ${a.errors.length}`, violations);
    assert(JSON.stringify(a.errors) === JSON.stringify(b.errors), `${level.id}: nondeterministic errors`, violations);
    for (const e of a.errors) {
      assert(USABLE_SET.has(e.index), `${level.id}: error on unavailable seat ${e.index}`, violations);
      assert(a.shown[e.frame][e.index] !== a.target.frames[e.frame][e.index], `${level.id}: error matches target ${e.index}`, violations);
    }
    for (const e of [...a.errors]) tapCard(a, e.index, e.frame);
    assert(allFixed(a), `${level.id}: not all fixed`, violations);
    a.target.frames.forEach((f, i) => assert(same(f, a.shown[i]), `${level.id}: fixed frame ${i} does not match target`, violations));
  }

  const fakeCanvas = { width: 1, height: 1 } as unknown as HTMLCanvasElement;
  const proto = TifoRenderer.prototype as unknown as { flipTiming(index: number, wave: "left" | "center" | "bottom"): number };
  const timings = [0, 12, 24, 48 * 18].map((idx) => proto.flipTiming.call({ wave: "left" }, idx, "left"));
  for (const x of timings) {
    const k = Math.round((x - 0.1204) / 0.107141);
    assert(Math.abs(x - (0.1204 + k * 0.107141)) < 0.054, `timing off beat grid ${x}`, violations);
  }
  void fakeCanvas;

  console.log(JSON.stringify({ violations: violations.length, roundTrips, gallery: GALLERY.length, levels: CARD_LEVELS.length, maxShareLength: maxShare, fullShareLength: fullCode.length }, null, 2));
  if (violations.length) {
    for (const v of violations) console.error(v);
    process.exit(1);
  }
}

void main();
