// Balloon Battle simulation core: shared types, seeded RNG, the grid, the
// Crazy-Arcade-style lane mover with corner assist, danger maps and BFS.

import { DV, DIRS, type Dir, type ItemKind, type OpponentSlug, type WorldDef } from "./data";
import { COLS, ROWS, type CellKind } from "./levels";

export { COLS, ROWS };

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Cell {
  kind: CellKind;
  ground: string;
  obj?: string;
  hide: boolean;
  ice: boolean;
  belt?: Dir;
  drain: boolean;
  push: boolean;
  sprinkler: boolean;
  item?: ItemKind; // hidden inside a soft block
  piece?: { sprite: string; w: number; h: number }; // anchor cell of a multi-tile set piece
  pushFrom?: { dx: number; dy: number; t: number }; // crate slide animation
}

export interface Balloon {
  id: number;
  c: number;
  r: number;
  x: number;
  y: number;
  fuse: number;
  life: number; // seconds since placed (animation)
  range: number;
  owner: "player" | "enemy";
  big: boolean; // 3 x 3 splash (boss cannon balloons)
  color: "blue" | "red" | "mint";
  slide?: { dir: Dir; speed: number };
  beltT: number;
  passFor: Set<number>; // entity ids still overlapping it
  dead: boolean;
}

export interface FloorItem {
  id: number;
  c: number;
  r: number;
  kind: ItemKind;
  delay: number; // > 0: not visible yet (waiting for the stream to end)
  age: number;
}

export interface Mover {
  id: number;
  x: number;
  y: number;
  dir: Dir;
}

export const TR_CENTER = 16;
export const TRAVEL: Record<Dir, number> = { right: 1, left: 2, down: 4, up: 8 };
export const LINK: Record<Dir, number> = { up: 1, down: 2, left: 4, right: 8 };

export type Effect =
  | { kind: "pop"; x: number; y: number; t: number; slug?: string }
  | { kind: "splash"; x: number; y: number; t: number }
  | { kind: "debris"; x: number; y: number; t: number; sprite: string }
  | { kind: "text"; x: number; y: number; t: number; text: string; color: string }
  | { kind: "stars"; x: number; y: number; t: number }
  | { kind: "breath"; cells: number[]; t: number }
  | { kind: "ring"; x: number; y: number; t: number; r: number; color: string };

export type GameEvent =
  | "place"
  | "burst"
  | "trapped"
  | "enemyTrapped"
  | "pop"
  | "playerPop"
  | "needle"
  | "shield"
  | "item"
  | "curse"
  | "kick"
  | "push"
  | "clang"
  | "bossHit"
  | "bossDizzy"
  | "bossDown"
  | "warn"
  | "hurry"
  | "clear"
  | "over"
  | "ready"
  | "go"
  | "lob"
  | "roar"
  | "teleport"
  | "summon"
  | "breath"
  | "dash"
  | "heart";

export interface Warning {
  cells: number[];
  t: number; // seconds until it fires
  total: number;
  color: "red" | "mint" | "purple";
}

export interface Lob {
  fromX: number;
  fromY: number;
  toC: number;
  toR: number;
  t: number;
  total: number;
  big: boolean;
  range: number;
  kind: "balloon" | "rocket";
  fuse: number;
}

export function idx(c: number, r: number): number {
  return r * COLS + c;
}

export function inside(c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < COLS && r < ROWS;
}

export function tileOf(v: number): number {
  return Math.floor(v);
}

export function buildCells(map: string[], world: WorldDef, specFor: (ch: string) => import("./levels").CellSpec, rand: () => number): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = map[r][c];
      const spec = specFor(ch);
      const g = world.ground[(r + c) % 2];
      let obj: string | undefined;
      const pickFrom = spec.obj ?? (spec.kind === "soft" ? world.soft : spec.kind === "hard" && ch !== "%" ? world.hard : undefined);
      if (Array.isArray(pickFrom)) obj = pickFrom[Math.floor(rand() * pickFrom.length)];
      else obj = pickFrom;
      cells.push({
        kind: spec.kind,
        ground: spec.ground ?? g,
        obj: spec.piece ? undefined : obj,
        hide: !!spec.hide,
        ice: !!spec.ice,
        belt: spec.belt,
        drain: !!spec.drain,
        push: !!spec.push,
        sprinkler: !!spec.sprinkler,
      });
    }
  }
  // multi-tile set pieces: the anchor cell draws the sprite, the footprint takes its kind
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const spec = specFor(map[r][c]);
      if (!spec.piece) continue;
      const { w, h, kind, sprite } = spec.piece;
      cells[idx(c, r)].piece = { sprite, w, h };
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          if (!inside(c + dx, r + dy)) continue;
          const cell = cells[idx(c + dx, r + dy)];
          cell.kind = kind;
          cell.obj = undefined;
        }
      }
    }
  }
  return cells;
}

/**
 * Move along a lane with Crazy Arcade corner assist. Returns the distance
 * actually travelled. `blocked(c, r)` says whether this mover may not enter a tile.
 */
export function laneMove(m: Mover, dir: Dir, dist: number, blocked: (c: number, r: number) => boolean, assist = 0.46): number {
  const [dx, dy] = DV[dir];
  const horizontal = dx !== 0;
  const along = horizontal ? m.x : m.y;
  const cross = horizontal ? m.y : m.x;
  const lane = Math.floor(cross);
  const centre = lane + 0.5;
  const off = cross - centre;
  const cur = Math.floor(along);
  const aheadBlocked = horizontal ? blocked(cur + dx, lane) : blocked(lane, cur + dy);
  let remaining = dist;
  let moved = 0;
  m.dir = dir;

  // Off the lane centre: either slide round a corner or straighten up first.
  if (Math.abs(off) > 0.0005) {
    let targetLane = lane;
    if (aheadBlocked && Math.abs(off) > 0.08) {
      const other = lane + Math.sign(off);
      const otherFree = horizontal ? !blocked(cur + dx, other) && !blocked(cur, other) : !blocked(other, cur + dy) && !blocked(other, cur);
      if (otherFree && Math.abs(off) <= assist) targetLane = other;
    }
    const target = targetLane + 0.5;
    const need = target - cross;
    const step = Math.min(Math.abs(need), remaining);
    if (horizontal) m.y += Math.sign(need) * step;
    else m.x += Math.sign(need) * step;
    remaining -= step;
    moved += step;
    if (Math.abs(target - (horizontal ? m.y : m.x)) > 0.0005) return moved; // still straightening
    if (targetLane !== lane) return moved; // rounded the corner; next frame goes along the new lane
  }
  if (remaining <= 0) return moved;

  // Along the lane: stop at the tile centre when the next tile is blocked.
  const pos = horizontal ? m.x : m.y;
  const tile = Math.floor(pos);
  const sign = horizontal ? dx : dy;
  const nextBlocked = horizontal ? blocked(tile + sign, Math.floor(m.y)) : blocked(Math.floor(m.x), tile + sign);
  let next = pos + sign * remaining;
  if (nextBlocked) {
    const stop = tile + 0.5;
    if (sign > 0) next = pos >= stop ? pos : Math.min(next, stop);
    else next = pos <= stop ? pos : Math.max(next, stop);
  }
  const gained = Math.abs(next - pos);
  if (horizontal) m.x = next;
  else m.y = next;
  return moved + gained;
}

/** At (or just past) a tile centre? Used to time AI decisions. */
export function atCentre(m: Mover, eps: number): boolean {
  return Math.abs(m.x - (Math.floor(m.x) + 0.5)) <= eps && Math.abs(m.y - (Math.floor(m.y) + 0.5)) <= eps;
}

export function snap(m: Mover): void {
  m.x = Math.floor(m.x) + 0.5;
  m.y = Math.floor(m.y) + 0.5;
}

/** BFS from a start tile; returns the first step toward the nearest goal, or null. */
export function bfsStep(
  sc: number,
  sr: number,
  passable: (c: number, r: number) => boolean,
  isGoal: (c: number, r: number) => boolean,
  maxDist = 40,
  rand?: () => number,
): { dir: Dir; dist: number; c: number; r: number } | null {
  if (isGoal(sc, sr)) return null;
  const prev = new Int16Array(COLS * ROWS).fill(-1);
  const dist = new Int16Array(COLS * ROWS).fill(-1);
  const start = idx(sc, sr);
  dist[start] = 0;
  const q = [start];
  const order = [...DIRS];
  if (rand) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const c = cur % COLS;
    const r = (cur - c) / COLS;
    if (dist[cur] >= maxDist) continue;
    for (const d of order) {
      const [dx, dy] = DV[d];
      const nc = c + dx;
      const nr = r + dy;
      if (!inside(nc, nr)) continue;
      const ni = idx(nc, nr);
      if (dist[ni] >= 0 || !passable(nc, nr)) continue;
      dist[ni] = dist[cur] + 1;
      prev[ni] = cur;
      if (isGoal(nc, nr)) {
        let step = ni;
        while (prev[step] !== start) step = prev[step];
        const stc = step % COLS;
        const str = (step - stc) / COLS;
        const dir: Dir = stc > sc ? "right" : stc < sc ? "left" : str > sr ? "down" : "up";
        return { dir, dist: dist[ni], c: nc, r: nr };
      }
      q.push(ni);
    }
  }
  return null;
}

export type Slug = OpponentSlug;
