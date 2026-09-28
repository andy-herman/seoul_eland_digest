// Share links: a finished attack is only its inputs (stick positions and kicks per take), so a link
// can carry it and a friend's browser replays it exactly. Binary, then deflate, then base64url.
import type { Action, ActKind, Track } from "./engine";

const KINDS: ActKind[] = ["pass", "lob", "shot"];
const VERSION = 1;

class Writer {
  private buf: number[] = [];
  u8(v: number): void {
    this.buf.push(v & 255);
  }
  i8(v: number): void {
    this.u8(v < 0 ? v + 256 : v);
  }
  u16(v: number): void {
    this.u8(v);
    this.u8(v >> 8);
  }
  u32(v: number): void {
    this.u16(v & 0xffff);
    this.u16(v >>> 16);
  }
  str(s: string): void {
    const b = new TextEncoder().encode(s);
    this.u8(b.length);
    for (const x of b) this.u8(x);
  }
  bytes(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

class Reader {
  private i = 0;
  constructor(private readonly b: Uint8Array) {}
  u8(): number {
    if (this.i >= this.b.length) throw new Error("short");
    return this.b[this.i++];
  }
  i8(): number {
    const v = this.u8();
    return v > 127 ? v - 256 : v;
  }
  u16(): number {
    return this.u8() | (this.u8() << 8);
  }
  u32(): number {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  str(): string {
    const n = this.u8();
    const out = new Uint8Array(n);
    for (let k = 0; k < n; k++) out[k] = this.u8();
    return new TextDecoder().decode(out);
  }
}

export function packTracks(levelId: string, tracks: (Track | null)[], steps: number): Uint8Array {
  const w = new Writer();
  w.u8(VERSION);
  w.str(levelId);
  w.u16(steps);
  w.u8(tracks.length);
  for (const t of tracks) {
    if (!t) {
      w.u8(0);
      continue;
    }
    w.u8(1);
    // moves: runs of identical stick pairs
    let s = 0;
    const runs: [number, number, number][] = [];
    while (s < steps) {
      const x = t.moves[s * 2];
      const y = t.moves[s * 2 + 1];
      let n = 1;
      while (s + n < steps && n < 65535 && t.moves[(s + n) * 2] === x && t.moves[(s + n) * 2 + 1] === y) n++;
      runs.push([n, x, y]);
      s += n;
    }
    w.u16(runs.length);
    for (const [n, x, y] of runs) {
      w.u16(n);
      w.i8(x);
      w.i8(y);
    }
    w.u8(t.actions.length);
    for (const a of t.actions) {
      w.u16(a.step);
      w.u8(KINDS.indexOf(a.kind) | (a.done ? 4 : 0));
      w.u16(Math.round(a.tx * 100));
      w.u16(Math.round(a.ty * 100));
      w.u16(Math.round(a.th * 100));
      w.u16(Math.round(a.speed * 100));
    }
    w.u8(Math.min(255, t.touches.length));
    for (const x of t.touches.slice(0, 255)) w.u16(x);
  }
  return w.bytes();
}

export function unpackTracks(bytes: Uint8Array): { levelId: string; steps: number; tracks: (Track | null)[] } {
  const r = new Reader(bytes);
  if (r.u8() !== VERSION) throw new Error("version");
  const levelId = r.str();
  const steps = r.u16();
  const count = r.u8();
  const tracks: (Track | null)[] = [];
  for (let i = 0; i < count; i++) {
    if (!r.u8()) {
      tracks.push(null);
      continue;
    }
    const moves = new Int8Array(steps * 2);
    const nr = r.u16();
    let s = 0;
    for (let k = 0; k < nr; k++) {
      const n = r.u16();
      const x = r.i8();
      const y = r.i8();
      for (let j = 0; j < n && s < steps; j++, s++) {
        moves[s * 2] = x;
        moves[s * 2 + 1] = y;
      }
    }
    const na = r.u8();
    const actions: Action[] = [];
    for (let k = 0; k < na; k++) {
      const step = r.u16();
      const kb = r.u8();
      const tx = r.u16() / 100;
      const ty = r.u16() / 100;
      const th = r.u16() / 100;
      const speed = r.u16() / 100;
      actions.push({ step, kind: KINDS[kb & 3], tx, ty, th, tt: 0, speed, done: !!(kb & 4) });
    }
    const nt = r.u8();
    const touches: number[] = [];
    for (let k = 0; k < nt; k++) touches.push(r.u16());
    tracks.push({ slot: i, moves, actions, touches });
  }
  return { levelId, steps, tracks };
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

/** "z" + deflated payload when the browser can compress, otherwise "r" + raw. */
export async function encodeShare(levelId: string, tracks: (Track | null)[], steps: number): Promise<string> {
  const raw = packTracks(levelId, tracks, steps);
  if (typeof CompressionStream !== "undefined") {
    try {
      return "z" + toB64Url(await pipe(raw, new CompressionStream("deflate-raw")));
    } catch {
      /* fall through */
    }
  }
  return "r" + toB64Url(raw);
}

export async function decodeShare(code: string): Promise<{ levelId: string; steps: number; tracks: (Track | null)[] }> {
  const body = fromB64Url(code.slice(1));
  const raw = code[0] === "z" ? await pipe(body, new DecompressionStream("deflate-raw")) : body;
  return unpackTracks(raw);
}

/** Synchronous save format for localStorage (no compression). */
export function saveString(levelId: string, tracks: (Track | null)[], steps: number): string {
  return toB64Url(packTracks(levelId, tracks, steps));
}

export function loadString(s: string): { levelId: string; steps: number; tracks: (Track | null)[] } {
  return unpackTracks(fromB64Url(s));
}
