// Balloon Battle bosses: giant 2 x 2 versions of six mascots, each with
// telegraphed Monster-Mode-style patterns (lane dashes, splash landings, cannon
// balloons, roars, teleports and decoys, rockets, feather storms) and dizzy
// windows where streams do double damage. Only water streams hurt a boss.

import { DV, type BossDef, type BossKind, type Dir, type OpponentSlug } from "./data";
import { COLS, ROWS, idx, inside } from "./core";
import { spawnMinion } from "./enemies";
import type { Game } from "./sim";

export type BossState = "intro" | "walk" | "tell" | "dash" | "air" | "dizzy" | "fade" | "appear" | "dying" | "gone";

export interface Decoy {
  x: number;
  y: number;
  dir: Dir;
  t: number;
  alive: boolean;
}

export interface Boss {
  def: BossDef;
  kind: BossKind;
  slug: OpponentSlug;
  x: number;
  y: number;
  z: number; // jump height (tiles)
  hp: number;
  maxHp: number;
  state: BossState;
  t: number;
  cd: number;
  step: number;
  dir: Dir;
  next: string;
  dashDir: Dir;
  target: [number, number];
  hitIds: Set<number>;
  flash: number;
  alpha: number;
  enraged: boolean;
  decoys: Decoy[];
  anim: number;
  covers(c: number, r: number): boolean;
}

const CYCLES: Record<BossKind, string[]> = {
  swoony: ["dash", "splash", "dash", "splash"],
  gunhami: ["cannon", "cannon", "crew"],
  chaba: ["charge", "roar", "charge", "call"],
  mars: ["blink", "beam", "decoys", "blink", "beam"],
  cheolryong: ["rockets", "shock", "rockets"],
  aguileon: ["storm", "swoop", "storm", "rally"],
};

const RALLY: OpponentSlug[] = ["gimpo-fc", "seongnam-fc", "busan-ipark", "gimhae-fc", "cheonan-city", "chungnam-asan", "paju-frontier", "yongin-fc", "daegu-fc"];

export function makeBoss(game: Game, def: BossDef, x: number, y: number): Boss {
  const boss: Boss = {
    def,
    kind: def.kind,
    slug: def.slug,
    x,
    y,
    z: 0,
    hp: def.hp,
    maxHp: def.hp,
    state: "intro",
    t: 0,
    cd: 2.2,
    step: 0,
    dir: "down",
    next: "",
    dashDir: "down",
    target: [0, 0],
    hitIds: new Set(),
    flash: 0,
    alpha: 1,
    enraged: false,
    decoys: [],
    anim: 0,
    covers(c: number, r: number) {
      return this.state !== "gone" && c + 1 > this.x - 1 && c < this.x + 1 && r + 1 > this.y - 1 && r < this.y + 1;
    },
  };
  void game;
  return boss;
}

function footprint(x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = Math.floor(y - 1 + 1e-6); r <= Math.floor(y + 1 - 1e-6); r++) for (let c = Math.floor(x - 1 + 1e-6); c <= Math.floor(x + 1 - 1e-6); c++) out.push([c, r]);
  return out;
}

function blocked(game: Game, boss: Boss, x: number, y: number, smash: boolean): boolean {
  if (x < 1 || y < 1 || x > COLS - 1 || y > ROWS - 1) return true;
  if (boss.def.flies) return false;
  for (const [c, r] of footprint(x, y)) {
    const cell = game.cell(c, r);
    if (!cell || cell.kind === "hard" || cell.kind === "water") return true;
    if (cell.kind === "soft") {
      if (smash) game.breakBlock(c, r);
      else return true;
    }
  }
  return false;
}

function moveBoss(game: Game, boss: Boss, dx: number, dy: number, smash = false): boolean {
  const nx = boss.x + dx;
  const ny = boss.y + dy;
  if (blocked(game, boss, nx, ny, smash)) return false;
  boss.x = nx;
  boss.y = ny;
  return true;
}

function towardPlayer(game: Game, boss: Boss): Dir {
  const dx = game.player.x - boss.x;
  const dy = game.player.y - boss.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

/** The 2-wide lane from the boss to the board edge in `dir`. */
function laneCells(game: Game, boss: Boss, dir: Dir, throughAll: boolean): number[] {
  const cells: number[] = [];
  const [dx, dy] = DV[dir];
  const base = footprint(boss.x, boss.y);
  for (let k = 1; k < 16; k++) {
    let any = false;
    for (const [c0, r0] of base) {
      const c = c0 + dx * k;
      const r = r0 + dy * k;
      if (!inside(c, r)) continue;
      const cell = game.cell(c, r)!;
      if (!throughAll && (cell.kind === "hard" || cell.kind === "water")) continue;
      cells.push(idx(c, r));
      any = true;
    }
    if (!any) break;
  }
  return [...new Set(cells)];
}

function discCells(game: Game, cx: number, cy: number, radius: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const d = Math.hypot(c + 0.5 - cx, r + 0.5 - cy);
      if (d <= radius && game.cell(c, r)?.kind !== "hard") out.push(idx(c, r));
    }
  return out;
}

function plusCells(game: Game, c0: number, r0: number, arm: number, square = false): number[] {
  const out: number[] = [];
  const add = (c: number, r: number) => inside(c, r) && game.cell(c, r)!.kind !== "hard" && out.push(idx(c, r));
  if (square) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(c0 + dx, r0 + dy);
  else add(c0, r0);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    for (let k = square ? 2 : 1; k <= arm; k++) {
      const c = c0 + dx * k;
      const r = r0 + dy * k;
      if (!inside(c, r) || game.cell(c, r)!.kind === "hard") break;
      add(c, r);
    }
  }
  return [...new Set(out)];
}

function randomNear(game: Game, c0: number, r0: number, radius: number): [number, number] {
  for (let tries = 0; tries < 30; tries++) {
    const c = c0 + Math.round((game.rand() * 2 - 1) * radius);
    const r = r0 + Math.round((game.rand() * 2 - 1) * radius);
    const cell = game.cell(c, r);
    if (cell && cell.kind !== "hard" && cell.kind !== "water") return [c, r];
  }
  return [c0, r0];
}

function minionCount(game: Game): number {
  return game.enemies.filter((e) => e.minion && e.state !== "gone" && e.state !== "popping").length;
}

function vulnerable(boss: Boss): boolean {
  if (["intro", "air", "fade", "appear", "dying", "gone"].includes(boss.state)) return false;
  if (boss.kind === "cheolryong" && !boss.enraged && boss.state !== "dizzy") return false; // armoured until the vent opens
  return true;
}

export function updateBoss(game: Game, dt: number): void {
  const boss = game.boss!;
  if (boss.state === "gone") return;
  boss.t += dt;
  boss.anim += dt;
  if (boss.flash > 0) boss.flash -= dt;
  const p = game.player;
  if (boss.state === "dying") {
    boss.alpha = Math.max(0, 1 - boss.t / 1.4);
    if (boss.t >= 1.4) boss.state = "gone";
    return;
  }
  // damage from water on any tile under the boss
  const hitTiles = footprint(boss.x, boss.y);
  for (const [c, r] of hitTiles) {
    if (!inside(c, r)) continue;
    const i = idx(c, r);
    if (game.flameT[i] <= 0 || boss.hitIds.has(game.flameId[i])) continue;
    boss.hitIds.add(game.flameId[i]);
    if (!vulnerable(boss)) {
      if (boss.state !== "air" && boss.state !== "fade") {
        game.emit("clang");
        game.addEffect({ kind: "stars", x: boss.x, y: boss.y - 1.2, t: 0 });
      }
      continue;
    }
    const dmg = boss.state === "dizzy" ? 2 : 1;
    boss.hp = Math.max(0, boss.hp - dmg);
    boss.flash = 0.3;
    game.score += 100 * dmg;
    game.addEffect({ kind: "text", x: boss.x, y: boss.y - 1.8, t: 0, text: `-${dmg}`, color: "#ff6b6b" });
    game.emit("bossHit");
    if (!boss.enraged && boss.hp <= boss.maxHp * (boss.kind === "cheolryong" ? 0.5 : 0.33)) {
      boss.enraged = true;
      game.addEffect({ kind: "ring", x: boss.x, y: boss.y, t: 0, r: 2.5, color: "#ff4d4d" });
    }
    if (boss.hp <= 0) {
      boss.state = "dying";
      boss.t = 0;
      boss.z = 0;
      game.warnings = [];
      for (const e of game.enemies) if (e.state !== "gone" && e.state !== "popping") {
        e.state = "popping";
        e.t = 0;
        game.addEffect({ kind: "pop", x: e.x, y: e.y, t: 0, slug: e.slug });
      }
      game.scorePop(boss.slug, boss.x, boss.y - 0.5, 5);
      game.emit("bossDown");
      return;
    }
    break;
  }
  updateDecoys(game, boss, dt);
  // contact hurts
  if (boss.state !== "air" && boss.state !== "fade" && Math.abs(p.x - boss.x) < 1.25 && Math.abs(p.y - boss.y) < 1.25 && (p.state === "alive" || p.state === "trapped")) game.hurtPlayer();
  const fast = boss.enraged ? 0.7 : 1;
  switch (boss.state) {
    case "intro":
      if (boss.t >= 1.4) {
        boss.state = "walk";
        boss.t = 0;
        game.emit("roar");
      }
      return;
    case "walk": {
      boss.cd -= dt;
      const speed = boss.def.speed * (boss.enraged ? 1.3 : 1);
      const dir = towardPlayer(game, boss);
      const [dx, dy] = DV[dir];
      const far = Math.abs(p.x - boss.x) + Math.abs(p.y - boss.y) > 1.6;
      if (far && !moveBoss(game, boss, dx * speed * dt, dy * speed * dt)) {
        // slide along the other axis
        const alt: Dir = dx !== 0 ? (p.y > boss.y ? "down" : "up") : p.x > boss.x ? "right" : "left";
        moveBoss(game, boss, DV[alt][0] * speed * dt, DV[alt][1] * speed * dt);
      }
      boss.dir = dir;
      if (boss.cd <= 0) startAttack(game, boss);
      return;
    }
    case "tell":
      if (boss.t >= tellTime(boss)) fireAttack(game, boss);
      return;
    case "dash": {
      const speed = boss.kind === "swoony" ? 7 : 8;
      const [dx, dy] = DV[boss.dashDir];
      const moved = moveBoss(game, boss, dx * speed * dt, dy * speed * dt, true);
      if (!moved) {
        boss.state = "dizzy";
        boss.t = 0;
        game.emit("bossDizzy");
        game.addEffect({ kind: "stars", x: boss.x, y: boss.y - 1.5, t: 0 });
      }
      return;
    }
    case "air": {
      // Giant Swoony leaps and comes down where you were standing
      const total = 1.35;
      const k = boss.t / total;
      boss.z = Math.sin(Math.min(1, k) * Math.PI) * 3;
      if (boss.t < 0.8) {
        const tx = Math.min(COLS - 1, Math.max(1, p.x));
        const ty = Math.min(ROWS - 1, Math.max(1, p.y));
        boss.x += (tx - boss.x) * Math.min(1, dt * 3);
        boss.y += (ty - boss.y) * Math.min(1, dt * 3);
      } else if (boss.next === "splash") {
        boss.next = "";
        const c = Math.floor(boss.x);
        const r = Math.floor(boss.y);
        boss.target = [c, r];
        game.warn(plusCells(game, c, r, 3, true), total - 0.8, "red");
      }
      if (boss.t >= total) {
        boss.z = 0;
        // land on open ground
        if (blocked(game, boss, boss.x, boss.y, false)) {
          boss.x = Math.round(boss.x);
          boss.y = Math.round(boss.y);
        }
        game.splashCells(plusCells(game, boss.target[0], boss.target[1], 3, true), true);
        boss.state = "dizzy";
        boss.t = 0;
        game.emit("bossDizzy");
      }
      return;
    }
    case "dizzy":
      if (boss.t >= (boss.kind === "cheolryong" ? 2.4 : boss.kind === "chaba" ? 2.4 : 1.9)) {
        boss.state = "walk";
        boss.t = 0;
        boss.cd = (2.4 + game.rand()) * fast;
      }
      return;
    case "fade":
      boss.alpha = Math.max(0, 1 - boss.t / 0.6);
      if (boss.t >= 0.6) {
        blink(game, boss);
        boss.state = "appear";
        boss.t = 0;
      }
      return;
    case "appear":
      boss.alpha = Math.min(1, boss.t / 0.45);
      if (boss.t >= 0.45) {
        boss.state = "walk";
        boss.t = 0;
        boss.cd = 1.2 * fast;
      }
      return;
    default:
      return;
  }
}

function tellTime(boss: Boss): number {
  switch (boss.next) {
    case "dash":
      return 1.0;
    case "charge":
    case "swoop":
      return 0.8;
    case "roar":
    case "shock":
      return 0.8;
    case "beam":
      return 1.1;
    default:
      return 0.6;
  }
}

function startAttack(game: Game, boss: Boss): void {
  const cycle = CYCLES[boss.kind];
  let move = cycle[boss.step % cycle.length];
  boss.step++;
  if ((move === "crew" || move === "call" || move === "rally") && minionCount(game) >= (boss.kind === "aguileon" ? 4 : 3)) move = cycle[0];
  boss.next = move;
  boss.t = 0;
  const p = game.player;
  if (move === "splash") {
    boss.state = "air";
    game.emit("dash");
    return;
  }
  if (move === "blink" || move === "decoys") {
    if (move === "blink") {
      boss.state = "fade";
      game.emit("teleport");
      return;
    }
  }
  boss.state = "tell";
  if (move === "dash" || move === "charge" || move === "swoop") {
    boss.dashDir = towardPlayer(game, boss);
    game.warn(laneCells(game, boss, boss.dashDir, move === "swoop"), tellTime(boss), "red");
  } else if (move === "roar" || move === "shock") {
    game.warn(discCells(game, boss.x, boss.y, 3.2), tellTime(boss), move === "shock" ? "purple" : "red");
  } else if (move === "beam") {
    const r = Math.floor(p.y);
    const cells: number[] = [];
    for (let c = 0; c < COLS; c++) if (game.cell(c, r)!.kind !== "hard") cells.push(idx(c, r));
    boss.target = [0, r];
    game.warn(cells, tellTime(boss), "mint");
  }
}

function fireAttack(game: Game, boss: Boss): void {
  const p = game.player;
  const pc = Math.floor(p.x);
  const pr = Math.floor(p.y);
  const move = boss.next;
  boss.t = 0;
  switch (move) {
    case "dash":
    case "charge":
    case "swoop":
      boss.state = "dash";
      game.emit(move === "charge" ? "roar" : "dash");
      return;
    case "cannon": {
      game.lob(boss.x, boss.y - 1, pc, pr, { big: true, range: 1, flight: 1.0, fuse: 0.9 });
      for (let k = 0; k < (boss.enraged ? 4 : 2); k++) {
        const [c, r] = randomNear(game, pc, pr, 3);
        game.lob(boss.x, boss.y - 1, c, r, { big: true, range: 1, flight: 1.0 + 0.15 * (k + 1), fuse: 0.9 });
      }
      boss.state = "dizzy";
      game.emit("bossDizzy");
      return;
    }
    case "crew":
      spawnMinion(game, "busan-ipark", boss.x, boss.y);
      spawnMinion(game, "busan-ipark", boss.x, boss.y);
      game.emit("summon");
      boss.state = "walk";
      boss.cd = 2;
      return;
    case "call":
      spawnMinion(game, "cheonan-city", boss.x, boss.y);
      spawnMinion(game, "cheonan-city", boss.x, boss.y);
      game.emit("summon");
      boss.state = "walk";
      boss.cd = 2;
      return;
    case "rally":
      for (let k = 0; k < 2; k++) spawnMinion(game, RALLY[Math.floor(game.rand() * RALLY.length)], boss.x, boss.y);
      game.emit("summon");
      boss.state = "walk";
      boss.cd = 2;
      return;
    case "roar": {
      game.emit("roar");
      game.addEffect({ kind: "ring", x: boss.x, y: boss.y, t: 0, r: 3.2, color: "#ffb347" });
      if (Math.hypot(p.x - boss.x, p.y - boss.y) <= 3.4 && p.state === "alive" && p.shieldT <= 0) {
        p.curseT = 3;
        game.emit("curse");
      }
      // the roar shoves nearby balloons one tile away
      for (const b of game.balloons) {
        if (b.dead || Math.hypot(b.x - boss.x, b.y - boss.y) > 4.2) continue;
        const d: Dir = Math.abs(b.x - boss.x) >= Math.abs(b.y - boss.y) ? (b.x > boss.x ? "right" : "left") : b.y > boss.y ? "down" : "up";
        const nc = b.c + DV[d][0];
        const nr = b.r + DV[d][1];
        if (!game.blockedFor(-1, nc, nr) && !game.itemAt(nc, nr)) {
          b.c = nc;
          b.r = nr;
          b.x = nc + 0.5;
          b.y = nr + 0.5;
          b.passFor.clear();
        }
      }
      boss.state = "walk";
      boss.cd = 2.2;
      return;
    }
    case "shock":
      game.addEffect({ kind: "ring", x: boss.x, y: boss.y, t: 0, r: 3.2, color: "#b58cff" });
      if (Math.hypot(p.x - boss.x, p.y - boss.y) <= 3.4 && p.state === "alive" && p.shieldT <= 0) {
        p.curseT = 5;
        p.slowT = 2;
        game.emit("curse");
      }
      boss.state = "dizzy";
      game.emit("bossDizzy");
      return;
    case "beam": {
      const r = boss.target[1];
      const cells: number[] = [];
      for (let c = 0; c < COLS; c++) if (game.cell(c, r)!.kind !== "hard") cells.push(idx(c, r));
      game.splashCells(cells, false);
      boss.state = "dizzy";
      game.emit("bossDizzy");
      return;
    }
    case "decoys":
      for (let k = 0; k < 2; k++) {
        const [c, r] = randomNear(game, Math.floor(boss.x), Math.floor(boss.y), 5);
        boss.decoys.push({ x: Math.min(COLS - 1, Math.max(1, c + 0.5)), y: Math.min(ROWS - 1, Math.max(1, r + 0.5)), dir: "down", t: 0, alive: true });
      }
      game.emit("summon");
      boss.state = "walk";
      boss.cd = 2.5;
      return;
    case "rockets": {
      const n = boss.enraged ? 6 : 4;
      for (let k = 0; k < n; k++) {
        const [c, r] = k === 0 ? [pc, pr] : randomNear(game, pc, pr, 3);
        game.lob(boss.x, boss.y - 1.2, c, r, { big: true, range: 0, kind: "rocket", flight: 1.1 + k * 0.12, fuse: 0 });
      }
      boss.state = "dizzy";
      game.emit("bossDizzy");
      return;
    }
    case "storm": {
      const n = boss.enraged ? 12 : 8;
      const all: number[] = [];
      for (let k = 0; k < n; k++) {
        const [c, r] = k === 0 ? [pc, pr] : randomNear(game, pc, pr, 4);
        all.push(...plusCells(game, c, r, 1));
      }
      const cells = [...new Set(all)];
      game.warn(cells, 1.1, "red", () => game.splashCells(cells, true));
      boss.state = "walk";
      boss.cd = 1.6;
      return;
    }
    default:
      boss.state = "walk";
      boss.cd = 1.5;
  }
}

function blink(game: Game, boss: Boss): void {
  const p = game.player;
  for (let tries = 0; tries < 60; tries++) {
    const x = 1 + Math.floor(game.rand() * (COLS - 1));
    const y = 1 + Math.floor(game.rand() * (ROWS - 1));
    if (Math.abs(x - p.x) + Math.abs(y - p.y) < 5) continue;
    if (blocked(game, boss, x, y, false)) continue;
    boss.x = x;
    boss.y = y;
    return;
  }
}

function updateDecoys(game: Game, boss: Boss, dt: number): void {
  if (!boss.decoys.length) return;
  const p = game.player;
  for (const d of boss.decoys) {
    if (!d.alive) continue;
    d.t += dt;
    if (d.t > 10) {
      d.alive = false;
      game.addEffect({ kind: "pop", x: d.x, y: d.y, t: 0 });
      continue;
    }
    // wander
    const [dx, dy] = DV[d.dir];
    const speed = 1.2;
    const nx = d.x + dx * speed * dt;
    const ny = d.y + dy * speed * dt;
    if (nx < 1 || ny < 1 || nx > COLS - 1 || ny > ROWS - 1 || footprint(nx, ny).some(([c, r]) => game.cell(c, r)?.kind !== "floor") || game.rand() < 0.01) {
      d.dir = (["up", "down", "left", "right"] as Dir[])[Math.floor(game.rand() * 4)];
    } else {
      d.x = nx;
      d.y = ny;
    }
    for (const [c, r] of footprint(d.x, d.y)) {
      if (inside(c, r) && game.flameT[idx(c, r)] > 0) {
        d.alive = false;
        game.addEffect({ kind: "pop", x: d.x, y: d.y, t: 0 });
        game.score += 100;
        break;
      }
    }
    if (d.alive && Math.abs(p.x - d.x) < 1.2 && Math.abs(p.y - d.y) < 1.2) game.hurtPlayer();
  }
  boss.decoys = boss.decoys.filter((d) => d.alive);
}
