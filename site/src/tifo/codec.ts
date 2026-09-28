import { TIFO_CELLS, TIFO_MAX_FRAMES, type TifoDesign, type WaveMode } from "./data";

const VERSION = 1;
const WAVES: WaveMode[] = ["left", "center", "bottom"];

class Writer {
  b: number[] = [];
  u8(v: number) { this.b.push(v & 255); }
  u16(v: number) { this.u8(v); this.u8(v >> 8); }
  str(s: string) { const e = new TextEncoder().encode(s.slice(0, 80)); this.u8(e.length); for (const x of e) this.u8(x); }
  bytes() { return new Uint8Array(this.b); }
}
class Reader {
  i = 0;
  constructor(private b: Uint8Array) {}
  u8() { if (this.i >= this.b.length) throw new Error("short"); return this.b[this.i++]; }
  u16() { return this.u8() | (this.u8() << 8); }
  str() { const n = this.u8(); const b = this.b.slice(this.i, this.i + n); this.i += n; return new TextDecoder().decode(b); }
}

function toB64Url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
async function pipe(b: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([b as unknown as BlobPart]).stream().pipeThrough(t);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function packDesign(d: TifoDesign): Uint8Array {
  const w = new Writer();
  w.u8(VERSION);
  w.str(d.title);
  w.u8(WAVES.indexOf(d.wave));
  w.u8(Math.min(TIFO_MAX_FRAMES, d.frames.length));
  for (const frame of d.frames.slice(0, TIFO_MAX_FRAMES)) {
    w.u16(frame.length);
    const rle: number[] = [];
    let i = 0;
    while (i < frame.length) {
      const color = frame[i] & 7;
      let n = 1;
      while (i + n < frame.length && n < 255 && (frame[i + n] & 7) === color) n++;
      rle.push(n, color);
      i += n;
    }
    const packed: number[] = [];
    let bit = 0, cur = 0;
    for (const v of frame) {
      cur |= (v & 7) << bit;
      bit += 3;
      while (bit >= 8) {
        packed.push(cur & 255);
        cur >>= 8;
        bit -= 8;
      }
    }
    if (bit) packed.push(cur & 255);
    const body = rle.length + 1 < packed.length ? [1, ...rle] : [0, ...packed];
    w.u16(body.length);
    for (const x of body) w.u8(x);
  }
  return w.bytes();
}

export function unpackDesign(bytes: Uint8Array): TifoDesign {
  const r = new Reader(bytes);
  if (r.u8() !== VERSION) throw new Error("version");
  const title = r.str() || "Shared tifo";
  const wave = WAVES[r.u8()] ?? "left";
  const count = Math.max(1, Math.min(TIFO_MAX_FRAMES, r.u8()));
  const frames: Uint8Array[] = [];
  for (let k = 0; k < count; k++) {
    const len = r.u16();
    const f = new Uint8Array(len || TIFO_CELLS);
    const bodyLen = r.u16();
    const mode = r.u8();
    if (mode === 1) {
      let i = 0;
      for (let used = 1; used < bodyLen && i < f.length; used += 2) {
        const n = r.u8();
        const c = r.u8() & 7;
        f.fill(c, i, Math.min(f.length, i + n));
        i += n;
      }
    } else {
      let out = 0, bit = 0, cur = 0;
      for (let used = 1; used < bodyLen; used++) {
        cur |= r.u8() << bit;
        bit += 8;
        while (bit >= 3 && out < f.length) {
          f[out++] = cur & 7;
          cur >>= 3;
          bit -= 3;
        }
      }
    }
    frames.push(f.length === TIFO_CELLS ? f : f.slice(0, TIFO_CELLS));
  }
  return { id: "shared", title, wave, frames };
}

export async function encodeDesign(d: TifoDesign): Promise<string> {
  const raw = packDesign(d);
  if (typeof CompressionStream !== "undefined") {
    try {
      return "z" + toB64Url(await pipe(raw, new CompressionStream("deflate-raw")));
    } catch {
      /* raw fallback */
    }
  }
  return "r" + toB64Url(raw);
}
export async function decodeDesign(code: string): Promise<TifoDesign> {
  const body = fromB64Url(code.slice(1));
  const raw = code[0] === "z" && typeof DecompressionStream !== "undefined" ? await pipe(body, new DecompressionStream("deflate-raw")) : body;
  return unpackDesign(raw);
}

export function saveDesignString(d: TifoDesign): string {
  return toB64Url(packDesign(d));
}
export function loadDesignString(s: string): TifoDesign {
  return unpackDesign(fromB64Url(s));
}
