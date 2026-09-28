import { PALETTE, SEAT_MAP, TIFO_CELLS, TIFO_COLS, TIFO_ROWS, USABLE_SET, blankFrame } from "./data";

export function nearestPalette(r: number, g: number, b: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const h = PALETTE[i].hex;
    const pr = parseInt(h.slice(1, 3), 16);
    const pg = parseInt(h.slice(3, 5), 16);
    const pb = parseInt(h.slice(5, 7), 16);
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function quantizeImageData(data: Uint8ClampedArray, width: number, height: number, dither = false): Uint8Array {
  const out = blankFrame(0);
  const err = new Float32Array(width * height * 3);
  for (let y = 0; y < TIFO_ROWS; y++) {
    for (let x = 0; x < TIFO_COLS; x++) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) * width / TIFO_COLS));
      const sy = Math.min(height - 1, Math.floor((y + 0.5) * height / TIFO_ROWS));
      const si = (sy * width + sx) * 4;
      const ei = (sy * width + sx) * 3;
      const r = Math.max(0, Math.min(255, data[si] + err[ei]));
      const g = Math.max(0, Math.min(255, data[si + 1] + err[ei + 1]));
      const b = Math.max(0, Math.min(255, data[si + 2] + err[ei + 2]));
      const p = nearestPalette(r, g, b);
      out[y * TIFO_COLS + x] = p;
      if (dither) {
        const h = PALETTE[p].hex;
        const dr = r - parseInt(h.slice(1, 3), 16);
        const dg = g - parseInt(h.slice(3, 5), 16);
        const db = b - parseInt(h.slice(5, 7), 16);
        for (const [dx, dy, f] of [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]] as const) {
          const nx = sx + dx, ny = sy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = (ny * width + nx) * 3;
          err[ni] += dr * f; err[ni + 1] += dg * f; err[ni + 2] += db * f;
        }
      }
    }
  }
  for (const c of SEAT_MAP) if (!c.usable) out[c.index] = 0;
  return out;
}

export function floodFill(frame: Uint8Array, start: number, color: number): Uint8Array {
  const out = new Uint8Array(frame);
  if (!USABLE_SET.has(start)) return out;
  const target = out[start];
  if (target === color) return out;
  const q = [start];
  const seen = new Uint8Array(TIFO_CELLS);
  seen[start] = 1;
  while (q.length) {
    const i = q.shift()!;
    if (!USABLE_SET.has(i) || out[i] !== target) continue;
    out[i] = color;
    const x = i % TIFO_COLS;
    const ns = [i - TIFO_COLS, i + TIFO_COLS, x > 0 ? i - 1 : -1, x < TIFO_COLS - 1 ? i + 1 : -1];
    for (const n of ns) if (n >= 0 && n < TIFO_CELLS && !seen[n]) { seen[n] = 1; q.push(n); }
  }
  return out;
}

export function drawLine(frame: Uint8Array, a: number, b: number, color: number, size = 1): Uint8Array {
  const out = new Uint8Array(frame);
  let x0 = a % TIFO_COLS, y0 = Math.floor(a / TIFO_COLS);
  const x1 = b % TIFO_COLS, y1 = Math.floor(b / TIFO_COLS);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    paint(out, x0, y0, color, size);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

export function drawRect(frame: Uint8Array, a: number, b: number, color: number, fill: boolean): Uint8Array {
  const out = new Uint8Array(frame);
  const x0 = Math.min(a % TIFO_COLS, b % TIFO_COLS), x1 = Math.max(a % TIFO_COLS, b % TIFO_COLS);
  const y0 = Math.min(Math.floor(a / TIFO_COLS), Math.floor(b / TIFO_COLS)), y1 = Math.max(Math.floor(a / TIFO_COLS), Math.floor(b / TIFO_COLS));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (fill || y === y0 || y === y1 || x === x0 || x === x1) paint(out, x, y, color, 1);
  return out;
}

export function paint(frame: Uint8Array, col: number, row: number, color: number, size = 1, mirror = false): void {
  for (let dy = -size + 1; dy < size; dy++) for (let dx = -size + 1; dx < size; dx++) {
    const x = col + dx, y = row + dy;
    const idx = y * TIFO_COLS + x;
    if (x >= 0 && x < TIFO_COLS && y >= 0 && y < TIFO_ROWS && USABLE_SET.has(idx)) frame[idx] = color;
    if (mirror) {
      const mx = TIFO_COLS - 1 - x;
      const mi = y * TIFO_COLS + mx;
      if (mx >= 0 && mx < TIFO_COLS && y >= 0 && y < TIFO_ROWS && USABLE_SET.has(mi)) frame[mi] = color;
    }
  }
}

export function stampText(text: string, color: number, x = 2, y = 1): Uint8Array {
  const f = blankFrame(0);
  if (typeof document === "undefined") return f;
  const c = document.createElement("canvas");
  c.width = TIFO_COLS; c.height = TIFO_ROWS;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff";
  ctx.font = `900 ${text.length > 5 ? 11 : 16}px Arial Rounded MT Bold, Arial, Apple SD Gothic Neo, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let i = 0; i < TIFO_CELLS; i++) if (img[i * 4] > 30 && USABLE_SET.has(i)) f[i] = color;
  return f;
}
