// Balloon Battle enemies: the 16 K League 2 mascots, one Crazy-Arcade-style
// gimmick each (wanderers, dashers, thieves, shield knights, clay that cracks,
// balloon lobbers, hoppers, flyers, chargers, teleporters, breathers, armour,
// rollers, hunters and swoopers). Water traps them in a bubble; the player
// touches the bubble to pop it, or it breaks free angry after 4 seconds.

import { DIRS, DV, ENEMIES, OPPOSITE, type Dir, type EnemyDef, type OpponentSlug } from "./data";
import { COLS, TRAVEL, TR_CENTER, atCentre, bfsStep, idx, inside, laneMove, snap } from "./core";
import type { Game } from "./sim";

export type EnemyState = "spawn" | "walk" | "tell" | "dash" | "stun" | "hop" | "fade" | "appear" | "breath" | "trapped" | "popping" | "gone";

export interface Enemy {
  id: number;
  slug: OpponentSlug;
  def: EnemyDef;
  x: number;
  y: number;
  dir: Dir;
  state: EnemyState;
  t: number; // time in state
  cd: number; // attack cooldown
  angry: boolean;
  anim: number;
  lastTile: number;
  cracked: number; // clay: seconds left before it re-glazes
  armorOff: boolean;
  hop?: { fromX: number; fromY: number; toX: number; toY: number };
  dashDir?: Dir;
  dashLeft: number;
  minion: boolean;
  alpha: number;
  lastHit: number; // id of the last explosion that reached it
}

export function makeEnemy(game: Game, slug: OpponentSlug, x: number, y: number, minion = false): Enemy {
  return {
    id: game.nextId++,
    slug,
    def: ENEMIES[slug],
    x,
    y,
    dir: DIRS[Math.floor(game.rand() * 4)],
    state: "spawn",
    t: 0,
    cd: 2 + game.rand() * 3,
    angry: false,
    anim: game.rand() * 10,
    lastTile: -1,
    cracked: 0,
    armorOff: false,
    dashLeft: 0,
    minion,
    alpha: 1,
    lastHit: -1,
  };
}

function speedOf(e: Enemy): number {
  let s = e.def.speed;
  if (e.angry) s *= 1.35;
  if (e.def.behavior === "armored" && e.armorOff) s *= 1.6;
  if (e.def.behavior === "clay" && e.cracked > 0) s *= 0.8;
  return s;
}

/** Can this enemy walk into a tile? */
function blockedFor(game: Game, e: Enemy, c: number, r: number): boolean {
  const cell = game.cell(c, r);
  if (!cell) return true;
  const flies = e.def.flies;
  if (flies === "all") return false;
  if (cell.kind === "hard" || cell.kind === "water") return true;
  if (cell.kind === "soft") return flies !== "soft";
  if (flies === "soft" || e.def.behavior === "floater") return false; // floats over balloons
  const b = game.balloonAt(c, r);
  if (b && !b.passFor.has(e.id)) return true;
  if (game.boss && game.boss.covers(c, r) && game.boss.state !== "gone") return true;
  return false;
}

function playerTile(game: Game): [number, number] {
  return [Math.floor(game.player.x), Math.floor(game.player.y)];
}

function playerVisible(game: Game): boolean {
  const p = game.player;
  if (p.state === "popped") return false;
  const cell = game.cell(Math.floor(p.x), Math.floor(p.y));
  return !cell?.hide; // bushes and tall grass hide you
}

/** Straight line of sight from the enemy's tile to the player's, within `max` tiles. */
function lineOfSight(game: Game, e: Enemy, max: number): Dir | null {
  if (!playerVisible(game)) return null;
  const c = Math.floor(e.x);
  const r = Math.floor(e.y);
  const [pc, pr] = playerTile(game);
  if (c !== pc && r !== pr) return null;
  const dist = Math.abs(pc - c) + Math.abs(pr - r);
  if (dist === 0 || dist > max) return null;
  const dir: Dir = pc > c ? "right" : pc < c ? "left" : pr > r ? "down" : "up";
  const [dx, dy] = DV[dir];
  for (let k = 1; k < dist; k++) if (blockedFor(game, e, c + dx * k, r + dy * k)) return null;
  return dir;
}

function chooseDir(game: Game, e: Enemy, prefer?: Dir | null): Dir | null {
  const c = Math.floor(e.x);
  const r = Math.floor(e.y);
  const free = DIRS.filter((d) => !blockedFor(game, e, c + DV[d][0], r + DV[d][1]));
  if (!free.length) return null;
  let options = free;
  if (e.def.smart) {
    const safe = free.filter((d) => !game.danger[idx(c + DV[d][0], r + DV[d][1])]);
    if (safe.length) options = safe;
  }
  if (prefer && options.includes(prefer)) return prefer;
  const noBack = options.filter((d) => d !== OPPOSITE[e.dir]);
  const pool = noBack.length ? noBack : options;
  if (pool.includes(e.dir) && game.rand() < 0.62) return e.dir;
  return pool[Math.floor(game.rand() * pool.length)];
}

function stepToward(game: Game, e: Enemy, goal: (c: number, r: number) => boolean, max: number): Dir | null {
  const res = bfsStep(Math.floor(e.x), Math.floor(e.y), (c, r) => !blockedFor(game, e, c, r), goal, max, game.rand);
  return res?.dir ?? null;
}

/** Called at tile centres: pick where to go next. */
function decide(game: Game, e: Enemy): void {
  const b = e.def.behavior;
  const [pc, pr] = playerTile(game);
  const c = Math.floor(e.x);
  const r = Math.floor(e.y);
  let prefer: Dir | null = null;
  // smart mascots first step out of blast zones
  if (e.def.smart && game.danger[idx(c, r)]) {
    const out = bfsStep(c, r, (cc, rr) => !blockedFor(game, e, cc, rr), (cc, rr) => !game.danger[idx(cc, rr)], 8);
    if (out) {
      e.dir = out.dir;
      return;
    }
  }
  const near = Math.abs(pc - c) + Math.abs(pr - r);
  const sees = playerVisible(game);
  if ((b === "hunter" && near <= 10) || (b === "flyer" && near <= 8) || (b === "armored" && near <= 7)) {
    if (sees && game.rand() < (b === "hunter" ? 0.9 : 0.75)) prefer = stepToward(game, e, (cc, rr) => cc === pc && rr === pr, 24);
  } else if (b === "thief") {
    const it = game.items.find((i) => i.delay <= 0);
    if (it) prefer = stepToward(game, e, (cc, rr) => !!game.itemAt(cc, rr) && game.itemAt(cc, rr)!.delay <= 0, 12);
  } else if (b === "swooper") {
    if (game.rand() < 0.6) prefer = Math.abs(pc - c) > Math.abs(pr - r) ? (pc > c ? "right" : "left") : pr > r ? "down" : "up";
  }
  if (b === "knight" || b === "roller" || b === "floater") {
    // straight-line walkers only turn when something is in the way
    const ahead = !blockedFor(game, e, c + DV[e.dir][0], r + DV[e.dir][1]);
    if (ahead && !(b === "floater" && game.rand() < 0.22)) return;
    if (b === "floater" && !blockedFor(game, e, c + DV[OPPOSITE[e.dir]][0], r + DV[OPPOSITE[e.dir]][1]) && game.rand() < 0.5) {
      e.dir = OPPOSITE[e.dir];
      return;
    }
  }
  if (b === "hopper" && game.rand() < 0.5) prefer = DIRS[Math.floor(game.rand() * 4)];
  const d = chooseDir(game, e, prefer);
  if (d) e.dir = d;
}

function tryHop(game: Game, e: Enemy): boolean {
  const c = Math.floor(e.x);
  const r = Math.floor(e.y);
  const [dx, dy] = DV[e.dir];
  const mid = game.cell(c + dx, r + dy);
  const land = game.cell(c + 2 * dx, r + 2 * dy);
  if (!mid || !land) return false;
  const midJumpable = mid.kind === "soft" || !!game.balloonAt(c + dx, r + dy);
  if (!midJumpable || land.kind !== "floor" || game.balloonAt(c + 2 * dx, r + 2 * dy)) return false;
  snap(e);
  e.hop = { fromX: e.x, fromY: e.y, toX: e.x + 2 * dx, toY: e.y + 2 * dy };
  e.state = "hop";
  e.t = 0;
  return true;
}

/** Water reached this enemy's tile. */
function hitByWater(game: Game, e: Enemy): void {
  const i = idx(Math.floor(e.x), Math.floor(e.y));
  const travel = game.flameTravel[i];
  const b = e.def.behavior;
  if (b === "knight" && !(travel & TR_CENTER)) {
    // the shield blocks water coming straight at his face
    const facing = TRAVEL[OPPOSITE[e.dir]];
    if ((travel & ~facing) === 0) {
      game.emit("clang");
      game.addEffect({ kind: "stars", x: e.x, y: e.y - 0.6, t: 0 });
      return;
    }
  }
  if (b === "clay" && e.cracked <= 0) {
    e.cracked = 5;
    e.state = "stun";
    e.t = 0;
    game.emit("clang");
    game.addEffect({ kind: "debris", x: e.x, y: e.y, t: 0, sprite: "" });
    return;
  }
  if (b === "armored" && !e.armorOff) {
    e.armorOff = true;
    e.state = "stun";
    e.t = 0;
    game.emit("clang");
    game.addEffect({ kind: "stars", x: e.x, y: e.y - 0.6, t: 0 });
    return;
  }
  e.state = "trapped";
  e.t = 0;
  e.hop = undefined;
  snap(e);
  game.emit("enemyTrapped");
}

export function updateEnemies(game: Game, dt: number): void {
  const p = game.player;
  for (const e of game.enemies) {
    if (e.state === "gone") continue;
    e.anim += dt;
    e.t += dt;
    if (e.cd > 0) e.cd -= dt;
    if (e.cracked > 0 && e.state !== "trapped") e.cracked -= dt;
    switch (e.state) {
      case "spawn":
        e.alpha = Math.min(1, e.t / 0.6);
        if (e.t >= 0.6) {
          e.state = "walk";
          e.t = 0;
        }
        continue;
      case "popping":
        if (e.t >= 0.55) e.state = "gone";
        continue;
      case "trapped": {
        if (e.t >= 4) {
          e.state = "walk";
          e.t = 0;
          e.angry = true;
          game.addEffect({ kind: "pop", x: e.x, y: e.y, t: 0 });
          continue;
        }
        // the player pops trapped mascots by touching them
        if ((p.state === "alive" || p.state === "trapped") && Math.abs(p.x - e.x) < 0.75 && Math.abs(p.y - e.y) < 0.75 && game.phase === "play") {
          e.state = "popping";
          e.t = 0;
          game.addEffect({ kind: "pop", x: e.x, y: e.y, t: 0, slug: e.slug });
          game.scorePop(e.slug, e.x, e.y);
        }
        continue;
      }
      default:
        break;
    }
    // water
    const wi = idx(Math.floor(e.x), Math.floor(e.y));
    if (e.state !== "hop" && e.state !== "fade" && e.state !== "appear" && game.flameT[wi] > 0 && game.flameId[wi] !== e.lastHit) {
      const flying = e.def.flies === "all" && game.cell(Math.floor(e.x), Math.floor(e.y))?.kind !== "floor";
      if (!flying) {
        e.lastHit = game.flameId[wi];
        hitByWater(game, e);
        if ((e.state as EnemyState) === "trapped") continue;
      }
    }
    act(game, e, dt);
    // touching the player
    const reach = e.state === "dash" ? 0.8 : 0.66;
    if (e.state !== "fade" && e.state !== "hop" && Math.abs(p.x - e.x) < reach && Math.abs(p.y - e.y) < reach) {
      if (p.state === "alive") game.hurtPlayer();
      else if (p.state === "trapped") game.hurtPlayer();
    }
  }
}

function act(game: Game, e: Enemy, dt: number): void {
  const b = e.def.behavior;
  const speed = speedOf(e);
  switch (e.state) {
    case "stun":
      if (e.t >= (b === "charger" ? 1.0 : b === "roller" ? 0.8 : 0.6)) {
        e.state = "walk";
        e.t = 0;
      }
      return;
    case "tell":
      if (e.t >= (b === "charger" ? 0.6 : b === "lobber" ? 0.6 : 0.45)) {
        if (b === "lobber") {
          const [pc, pr] = playerTile(game);
          game.lob(e.x, e.y - 0.5, pc, pr, { range: 1, fuse: 1.25, flight: 0.85 });
          e.state = "walk";
          e.cd = 5 + game.rand() * 2;
        } else if (b === "breather") {
          e.state = "breath";
          breathe(game, e);
        } else {
          e.state = "dash";
          e.dashLeft = b === "swooper" ? 6 : 14;
          game.emit(b === "charger" ? "roar" : "dash");
        }
        e.t = 0;
      }
      return;
    case "breath":
      if (e.t >= 0.6) {
        e.state = "walk";
        e.t = 0;
        e.cd = 4;
      }
      return;
    case "dash": {
      const dashSpeed = b === "charger" ? 6.5 : b === "swooper" ? 6 : 5.5;
      const d = e.dashDir ?? e.dir;
      const moved = laneMove(e, d, dashSpeed * dt, (c, r) => blockedFor(game, e, c, r) || (b === "swooper" && !inside(c, r)));
      e.dashLeft -= moved;
      if (moved < 0.0001 || e.dashLeft <= 0) {
        e.state = b === "swooper" ? "walk" : "stun";
        e.t = 0;
        e.cd = b === "charger" ? 3.5 : 3;
        if (b !== "swooper") snap(e);
      }
      return;
    }
    case "hop": {
      const h = e.hop!;
      const k = Math.min(1, e.t / 0.45);
      e.x = h.fromX + (h.toX - h.fromX) * k;
      e.y = h.fromY + (h.toY - h.fromY) * k;
      if (k >= 1) {
        e.hop = undefined;
        e.state = "walk";
        e.t = 0;
        e.lastTile = -1;
      }
      return;
    }
    case "fade":
      e.alpha = Math.max(0, 1 - e.t / 0.5);
      if (e.t >= 0.5) teleport(game, e);
      return;
    case "appear":
      e.alpha = Math.min(1, e.t / 0.4);
      if (e.t >= 0.4) {
        e.state = "walk";
        e.t = 0;
        e.cd = 4.5;
      }
      return;
    default:
      break;
  }
  // walking
  const tile = idx(Math.floor(e.x), Math.floor(e.y));
  const eps = Math.max(0.02, speed * dt);
  if (atCentre(e, eps) && tile !== e.lastTile) {
    e.lastTile = tile;
    snap(e);
    if (special(game, e)) return;
    decide(game, e);
  }
  const moved = laneMove(e, e.dir, speed * dt, (c, r) => blockedFor(game, e, c, r), 0.3);
  if (moved < 0.0001) {
    if ((b === "hopper" && game.rand() < 0.35 && tryHop(game, e)) || (b === "roller" && game.rand() < 0.02)) return;
    e.lastTile = -1; // re-decide next frame
    snap(e);
    if (b === "roller" && e.cd <= 0) {
      e.state = "stun";
      e.t = 0;
      e.cd = 4;
      return;
    }
    const d = chooseDir(game, e);
    if (d) e.dir = d;
  }
  // thieves grab items they walk over
  if (b === "thief") {
    const it = game.itemAt(Math.floor(e.x), Math.floor(e.y));
    if (it && it.delay <= 0) {
      game.items = game.items.filter((x) => x !== it);
      game.addEffect({ kind: "text", x: e.x, y: e.y - 1, t: 0, text: "♪", color: "#9fe3ff" });
    }
  }
}

/** Mascot-specific moves, checked at tile centres. Returns true when one started. */
function special(game: Game, e: Enemy): boolean {
  const b = e.def.behavior;
  if (e.cd > 0) return false;
  const p = game.player;
  if (p.state !== "alive" && p.state !== "trapped") return false;
  if (b === "dasher" || b === "charger") {
    const d = lineOfSight(game, e, b === "charger" ? 7 : 6);
    if (d) {
      e.dir = d;
      e.dashDir = d;
      e.state = "tell";
      e.t = 0;
      return true;
    }
  } else if (b === "swooper") {
    const [pc, pr] = playerTile(game);
    const c = Math.floor(e.x);
    const r = Math.floor(e.y);
    if ((pc === c || pr === r) && Math.abs(pc - c) + Math.abs(pr - r) <= 6 && playerVisible(game)) {
      const d: Dir = pc > c ? "right" : pc < c ? "left" : pr > r ? "down" : "up";
      e.dir = d;
      e.dashDir = d;
      e.state = "tell";
      e.t = 0;
      return true;
    }
  } else if (b === "lobber") {
    const [pc, pr] = playerTile(game);
    if (Math.abs(pc - Math.floor(e.x)) + Math.abs(pr - Math.floor(e.y)) <= 6 && playerVisible(game)) {
      e.state = "tell";
      e.t = 0;
      return true;
    }
  } else if (b === "breather") {
    const d = lineOfSight(game, e, 3);
    if (d) {
      e.dir = d;
      e.state = "tell";
      e.t = 0;
      return true;
    }
  } else if (b === "teleporter") {
    e.state = "fade";
    e.t = 0;
    game.emit("teleport");
    return true;
  }
  return false;
}

function breathe(game: Game, e: Enemy): void {
  const c = Math.floor(e.x);
  const r = Math.floor(e.y);
  const [dx, dy] = DV[e.dir];
  const cells: number[] = [];
  for (let k = 1; k <= 3; k++) {
    const cell = game.cell(c + dx * k, r + dy * k);
    if (!cell || cell.kind !== "floor") break;
    cells.push(idx(c + dx * k, r + dy * k));
  }
  game.addEffect({ kind: "breath", cells, t: 0 });
  game.emit("breath");
  const p = game.player;
  const pi = idx(Math.floor(p.x), Math.floor(p.y));
  if (cells.includes(pi) && p.state === "alive" && p.shieldT <= 0) p.slowT = 3;
}

function teleport(game: Game, e: Enemy): void {
  const p = game.player;
  const spots: number[] = [];
  game.cells.forEach((cell, i) => {
    if (cell.kind !== "floor") return;
    const c = i % COLS;
    const r = (i - c) / COLS;
    if (Math.abs(c - p.x + 0.5) + Math.abs(r - p.y + 0.5) < 3 || game.danger[i] || game.balloonAt(c, r)) return;
    spots.push(i);
  });
  if (spots.length) {
    const i = spots[Math.floor(game.rand() * spots.length)];
    const c = i % COLS;
    e.x = c + 0.5;
    e.y = (i - c) / COLS + 0.5;
  }
  e.state = "appear";
  e.t = 0;
  e.lastTile = -1;
}

export function spawnMinion(game: Game, slug: OpponentSlug, nearX: number, nearY: number): boolean {
  for (let tries = 0; tries < 40; tries++) {
    const c = Math.floor(nearX) + Math.floor(game.rand() * 7) - 3;
    const r = Math.floor(nearY) + Math.floor(game.rand() * 7) - 3;
    const cell = game.cell(c, r);
    if (!cell || cell.kind !== "floor" || game.balloonAt(c, r) || (game.boss && game.boss.covers(c, r))) continue;
    if (Math.abs(c + 0.5 - game.player.x) + Math.abs(r + 0.5 - game.player.y) < 3) continue;
    game.enemies.push(makeEnemy(game, slug, c + 0.5, r + 0.5, true));
    return true;
  }
  return false;
}
