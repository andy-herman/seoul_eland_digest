import { CARD_LEVELS, GALLERY, TIFO_CELLS, TIFO_COLS, TIFO_ROWS, USABLE, USABLE_SET, type CardCheckLevel, type TifoDesign } from "./data";

export type ErrorKind = "wrong" | "blank" | "swap";
export interface CheckError {
  index: number;
  other?: number;
  frame: number;
  kind: ErrorKind;
  target: number;
  shown: number;
  fixed: boolean;
}
export interface CheckState {
  level: CardCheckLevel;
  target: TifoDesign;
  shown: Uint8Array[];
  errors: CheckError[];
  wrongTaps: number;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}

function cropUsable(level: CardCheckLevel): number[] {
  const x0 = Math.floor((TIFO_COLS - level.cols) / 2);
  const y0 = Math.floor((TIFO_ROWS - level.rows) / 2);
  const out: number[] = [];
  for (let y = y0; y < y0 + level.rows; y++) for (let x = x0; x < x0 + level.cols; x++) {
    if (level.chapter === 3 && (x < 4 || x > TIFO_COLS - 5 || y < 1 || y > TIFO_ROWS - 3)) continue;
    const i = y * TIFO_COLS + x;
    if (USABLE_SET.has(i)) out.push(i);
  }
  return out;
}

function targetFor(level: CardCheckLevel): TifoDesign {
  const base = GALLERY.find((g) => g.id === level.design) ?? GALLERY[0];
  let frames = base.frames.map((f) => new Uint8Array(f));
  if (level.twoFrame && frames.length < 2) {
    const b = new Uint8Array(frames[0]);
    for (const i of USABLE) if (b[i] === 0) b[i] = 1; else if (b[i] === 1) b[i] = 2;
    frames = [frames[0], b];
  }
  return { ...base, id: `${base.id}-${level.id}`, title: base.title, wave: base.wave, frames };
}

function wrongColor(target: number, subtle: boolean, r: () => number): number {
  if (subtle) {
    if (target === 0) return 5;
    if (target === 5) return 0;
    if (target === 2) return 3;
    if (target === 3) return 2;
  }
  let c = Math.floor(r() * 8);
  if (c === target) c = (c + 1) & 7;
  return c;
}

export function makeCheck(levelId: string): CheckState {
  const level = CARD_LEVELS.find((l) => l.id === levelId) ?? CARD_LEVELS[0];
  const r = rng(level.seed);
  const target = targetFor(level);
  const shown = target.frames.map((f) => new Uint8Array(f));
  const allowed = cropUsable(level).sort(() => r() - 0.5);
  const used = new Set<number>();
  const errors: CheckError[] = [];
  const frame = level.twoFrame ? 1 : 0;
  for (const index of allowed) {
    if (errors.length >= level.errors) break;
    if (used.has(index)) continue;
    const targetColor = target.frames[frame][index];
    const roll = r();
    if (roll < 0.18) {
      shown[frame][index] = 0;
      if (shown[frame][index] === targetColor) shown[frame][index] = wrongColor(targetColor, level.subtle === true, r);
      errors.push({ index, frame, kind: "blank", target: targetColor, shown: shown[frame][index], fixed: false });
      used.add(index);
    } else if (roll < 0.35 && errors.length <= level.errors - 2) {
      const col = index % TIFO_COLS;
      const neigh = [index - 1, index + 1, index - TIFO_COLS, index + TIFO_COLS].filter((n) => n >= 0 && n < TIFO_CELLS && USABLE_SET.has(n) && !used.has(n) && Math.abs((n % TIFO_COLS) - col) <= 1 && target.frames[frame][n] !== targetColor);
      if (!neigh.length) continue;
      const other = neigh[Math.floor(r() * neigh.length)];
      shown[frame][index] = target.frames[frame][other];
      shown[frame][other] = targetColor;
      errors.push({ index, other, frame, kind: "swap", target: targetColor, shown: shown[frame][index], fixed: false });
      errors.push({ index: other, other: index, frame, kind: "swap", target: target.frames[frame][other], shown: shown[frame][other], fixed: false });
      used.add(index); used.add(other);
    } else {
      shown[frame][index] = wrongColor(targetColor, level.subtle === true, r);
      errors.push({ index, frame, kind: "wrong", target: targetColor, shown: shown[frame][index], fixed: false });
      used.add(index);
    }
  }
  if (errors.length > level.errors) errors.length = level.errors;
  return { level, target, shown, errors, wrongTaps: 0 };
}

export function tapCard(state: CheckState, index: number, frame = 0): boolean {
  const err = state.errors.find((e) => !e.fixed && e.index === index && (e.frame === frame || state.level.twoFrame));
  if (!err) {
    state.wrongTaps++;
    return false;
  }
  const f = err.frame;
  state.shown[f][err.index] = state.target.frames[f][err.index];
  err.fixed = true;
  if (err.other != null) {
    const pair = state.errors.find((e) => !e.fixed && e.index === err.other && e.other === err.index && e.frame === f);
    if (pair) {
      state.shown[f][pair.index] = state.target.frames[f][pair.index];
      pair.fixed = true;
    }
  }
  return true;
}

export function allFixed(state: CheckState): boolean {
  return state.errors.every((e) => e.fixed);
}

export function starsFor(state: CheckState, secondsLeft: number): number {
  if (!allFixed(state)) return 0;
  return 1 + (state.wrongTaps === 0 ? 1 : 0) + (secondsLeft >= Math.max(0, state.level.seconds - state.level.target) ? 1 : 0);
}
