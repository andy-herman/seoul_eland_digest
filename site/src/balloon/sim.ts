// Balloon Battle game state and rules: the player, balloons, water streams,
// items and the stage flow. Enemies and bosses live in enemies.ts / bosses.ts.

import { BOSSES, DV, ENEMIES, HERO_STATS, RARE_ITEMS, WORLDS, speedTps, type Dir, type Hero, type ItemKind, type OpponentSlug, type WorldDef } from "./data";
import { STAGES, specFor, type StageDef } from "./levels";
import {
  COLS,
  ROWS,
  LINK,
  TRAVEL,
  TR_CENTER,
  buildCells,
  idx,
  inside,
  laneMove,
  rng,
  type Balloon,
  type Cell,
  type Effect,
  type FloorItem,
  type GameEvent,
  type Lob,
  type Warning,
} from "./core";
import { makeEnemy, updateEnemies, type Enemy } from "./enemies";
import { makeBoss, updateBoss, type Boss } from "./bosses";

export const FUSE = 3.0;
export const FLAME_TIME = 0.5;
export const TRAP_TIME = 4.0;

export interface Player {
  id: number;
  hero: Hero;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  anim: number;
  state: "alive" | "trapped" | "popped" | "win";
  t: number;
  hearts: number;
  balloons: number;
  range: number;
  speed: number;
  kick: boolean;
  needles: number;
  shields: number;
  shieldT: number;
  invulnT: number;
  ginsengT: number;
  curseT: number;
  slowT: number;
  slide: Dir | null;
  pushT: number;
  spawnC: number;
  spawnR: number;
  lostHearts: number;
}

export interface InputState {
  dir: Dir | null;
  alt: Dir | null; // a second held direction (diagonals help cornering)
  bomb: boolean; // edge-triggered
  item: boolean; // edge-triggered
}

export type Phase = "ready" | "play" | "clear" | "over";

export class Game {
  readonly stage: StageDef;
  readonly world: WorldDef;
  readonly rand: () => number;
  cells: Cell[];
  balloons: Balloon[] = [];
  flameT = new Float32Array(COLS * ROWS);
  flameLink = new Uint8Array(COLS * ROWS);
  flameTravel = new Uint8Array(COLS * ROWS);
  flameId = new Int32Array(COLS * ROWS);
  pendingItem: (ItemKind | undefined)[] = new Array(COLS * ROWS);
  items: FloorItem[] = [];
  enemies: Enemy[] = [];
  boss: Boss | null = null;
  lobs: Lob[] = [];
  warnings: Warning[] = [];
  effects: Effect[] = [];
  events: GameEvent[] = [];
  newCards: OpponentSlug[] = [];
  player: Player;
  input: InputState = { dir: null, alt: null, bomb: false, item: false };
  phase: Phase = "ready";
  phaseT = 0;
  time = 0; // seconds of play
  clock: number;
  hurry = false;
  score = 0;
  combo = 0;
  comboT = 0;
  pops = 0;
  nextId = 1;
  explosionCount = 0;
  danger = new Uint8Array(COLS * ROWS);
  dangerT = 0;
  sprinklerT = 0;
  drainCooldown = 0;
  readonly totalEnemies: number;

  constructor(stageIndex: number, hero: Hero, seed = 1) {
    this.stage = STAGES[stageIndex];
    this.world = WORLDS.find((w) => w.id === this.stage.world)!;
    this.rand = rng(seed * 7919 + stageIndex * 104729);
    this.cells = buildCells(this.stage.map, this.world, (ch) => specFor(this.stage.world, ch), this.rand);
    this.clock = this.stage.time;
    const stats = HERO_STATS[hero];
    const kit = this.stage.kit ?? {};
    let pc = 7;
    let pr = 12;
    const spawns: [number, number][] = [];
    let bossAt: [number, number] | null = null;
    this.stage.map.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        if (ch === "P") [pc, pr] = [c, r];
        if (ch === "e") spawns.push([c, r]);
        if (ch === "B") bossAt = [c, r];
      }),
    );
    this.player = {
      id: this.nextId++,
      hero,
      x: pc + 0.5,
      y: pr + 0.5,
      dir: "up",
      moving: false,
      anim: 0,
      state: "alive",
      t: 0,
      hearts: 3,
      balloons: Math.min(stats.balloons[1], stats.balloons[0] + (kit.balloons ?? 0)),
      range: Math.min(stats.range[1], stats.range[0] + (kit.range ?? 0)),
      speed: Math.min(stats.speed[1], stats.speed[0] + (kit.speed ?? 0)),
      kick: !!kit.kick,
      needles: kit.needles ?? 0,
      shields: 0,
      shieldT: 0,
      invulnT: 0,
      ginsengT: 0,
      curseT: 0,
      slowT: 0,
      slide: null,
      pushT: 0,
      spawnC: pc,
      spawnR: pr,
      lostHearts: 0,
    };
    this.hideItems();
    // enemies go to the spawn slots, farthest from the player first
    spawns.sort((a, b) => Math.abs(b[0] - pc) + Math.abs(b[1] - pr) - (Math.abs(a[0] - pc) + Math.abs(a[1] - pr)));
    const roster: OpponentSlug[] = [];
    for (const [slug, n] of Object.entries(this.stage.enemies) as [OpponentSlug, number][]) for (let i = 0; i < n; i++) roster.push(slug);
    // interleave so each area gets a mix
    roster.sort(() => this.rand() - 0.5);
    roster.forEach((slug, i) => {
      const at = spawns[i % Math.max(1, spawns.length)] ?? this.farTile(pc, pr);
      this.enemies.push(makeEnemy(this, slug, at[0] + 0.5, at[1] + 0.5));
    });
    if (this.stage.boss) {
      const at = bossAt ?? [6, 3];
      this.boss = makeBoss(this, BOSSES[this.stage.boss], at[0] + 1, at[1] + 1);
    }
    this.totalEnemies = this.enemies.length + (this.boss ? 1 : 0);
  }

  get stats(): { balloons: number; range: number; speed: number } {
    const p = this.player;
    const max = HERO_STATS[p.hero];
    if (p.ginsengT > 0) return { balloons: max.balloons[1], range: max.range[1], speed: max.speed[1] };
    return { balloons: p.balloons, range: p.range, speed: p.speed };
  }

  private hideItems(): void {
    const soft: number[] = [];
    this.cells.forEach((cell, i) => cell.kind === "soft" && soft.push(i));
    for (let i = soft.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [soft[i], soft[j]] = [soft[j], soft[i]];
    }
    const wanted: ItemKind[] = [];
    for (const [kind, n] of Object.entries(this.stage.items ?? {}) as [ItemKind, number][]) for (let i = 0; i < n; i++) wanted.push(kind);
    // top up to ~40 % of soft blocks with common stat items
    const target = Math.round(soft.length * 0.4);
    const fill: ItemKind[] = ["balloon", "potion", "cleats", "balloon", "potion", "coin"];
    while (wanted.length < target) wanted.push(fill[wanted.length % fill.length]);
    wanted.slice(0, soft.length).forEach((kind, i) => (this.cells[soft[i]].item = kind));
  }

  private farTile(pc: number, pr: number): [number, number] {
    let best: [number, number] = [0, 0];
    let bd = -1;
    this.cells.forEach((cell, i) => {
      if (cell.kind !== "floor") return;
      const c = i % COLS;
      const r = (i - c) / COLS;
      const d = Math.abs(c - pc) + Math.abs(r - pr);
      if (d > bd) [bd, best] = [d, [c, r]];
    });
    return best;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  cell(c: number, r: number): Cell | undefined {
    return inside(c, r) ? this.cells[idx(c, r)] : undefined;
  }

  balloonAt(c: number, r: number): Balloon | undefined {
    return this.balloons.find((b) => !b.dead && b.c === c && b.r === r);
  }

  itemAt(c: number, r: number): FloorItem | undefined {
    return this.items.find((it) => it.c === c && it.r === r);
  }

  /** Movement blocking for the player (and walkers): blocks, water and balloons. */
  blockedFor(id: number, c: number, r: number, balloonsBlock = true): boolean {
    const cell = this.cell(c, r);
    if (!cell || cell.kind !== "floor") return true;
    if (!balloonsBlock) return false;
    const b = this.balloonAt(c, r);
    return !!b && !b.passFor.has(id);
  }

  addEffect(e: Effect): void {
    this.effects.push(e);
  }

  // ---------------------------------------------------------------- step

  step(dt: number): void {
    this.events.length = 0;
    this.phaseT += dt;
    if (this.phase === "ready") {
      if (this.phaseT === dt) this.emit("ready");
      if (this.phaseT >= 1.6) {
        this.phase = "play";
        this.phaseT = 0;
        this.player.invulnT = 1.5;
        this.emit("go");
      }
      this.updateEffects(dt);
      return;
    }
    if (this.phase === "clear" || this.phase === "over") {
      this.updateEffects(dt);
      this.updateFlames(dt);
      if (this.phase === "clear") this.player.anim += dt;
      return;
    }
    this.time += dt;
    if (this.clock > 0) {
      this.clock = Math.max(0, this.clock - dt);
      if (this.clock === 0 && !this.hurry) {
        this.hurry = true;
        for (const e of this.enemies) e.angry = true;
        this.emit("hurry");
      }
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    this.dangerT -= dt;
    if (this.dangerT <= 0) {
      this.computeDanger();
      this.dangerT = 0.1;
    }
    this.updatePlayer(dt);
    this.updateBalloons(dt);
    this.updateLobs(dt);
    this.updateWarnings(dt);
    this.updateSprinklers(dt);
    this.updateFlames(dt);
    this.updateItems(dt);
    updateEnemies(this, dt);
    if (this.boss) updateBoss(this, dt);
    this.checkEnd();
    this.updateEffects(dt);
    this.input.bomb = false;
    this.input.item = false;
  }

  private checkEnd(): void {
    const bossLeft = this.boss && this.boss.state !== "gone";
    const enemiesLeft = this.enemies.some((e) => e.state !== "gone");
    if (this.boss) {
      if (!bossLeft) this.win();
    } else if (!enemiesLeft) this.win();
  }

  private win(): void {
    if (this.phase !== "play") return;
    this.phase = "clear";
    this.phaseT = 0;
    this.player.state = "win";
    this.player.anim = 0;
    for (const e of this.enemies) if (e.state !== "gone") e.state = "gone";
    this.emit("clear");
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(dt: number): void {
    const p = this.player;
    p.anim += dt;
    for (const k of ["shieldT", "invulnT", "ginsengT", "curseT", "slowT"] as const) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
    if (p.state === "popped") {
      p.t -= dt;
      if (p.t <= 0) this.respawn();
      return;
    }
    let dir = this.input.dir;
    let alt = this.input.alt;
    if (p.curseT > 0) {
      const flip = (d: Dir | null): Dir | null => (d ? ({ up: "down", down: "up", left: "right", right: "left" } as const)[d] : null);
      dir = flip(dir);
      alt = flip(alt);
    }
    const here = this.cell(Math.floor(p.x), Math.floor(p.y));
    if (p.state === "trapped") {
      p.t -= dt;
      if (this.input.item && p.needles > 0) {
        p.needles--;
        p.state = "alive";
        p.invulnT = 1.0;
        this.emit("needle");
        this.addEffect({ kind: "pop", x: p.x, y: p.y, t: 0 });
      } else if (p.t <= 0) {
        this.hurtPlayer();
        return;
      } else if (dir) {
        laneMove(p, dir, 0.9 * dt, (c, r) => this.blockedFor(p.id, c, r));
      }
      return;
    }
    // shield on the item button when not trapped
    if (this.input.item && p.shields > 0 && p.shieldT <= 0) {
      p.shields--;
      p.shieldT = 3;
      this.emit("shield");
    }
    // ice keeps you sliding the way you were going
    if (p.slide) dir = p.slide;
    const speed = speedTps(this.stats.speed) * (p.slowT > 0 ? 0.55 : 1);
    p.moving = false;
    if (dir) {
      const blocked = (c: number, r: number) => this.blockedFor(p.id, c, r);
      let moved = laneMove(p, dir, speed * dt, blocked);
      if (moved < 0.0001 && alt && !p.slide) moved = laneMove(p, alt, speed * dt, blocked);
      p.moving = moved > 0.0001;
      if (!p.moving) this.bump(dir, dt);
      else p.pushT = 0;
      if (p.slide && !p.moving) p.slide = null;
    } else {
      p.pushT = 0;
    }
    // belts carry you
    const on = this.cell(Math.floor(p.x), Math.floor(p.y));
    if (on?.belt && !p.slide) laneMove(p, on.belt, 1.25 * dt, (c, r) => this.blockedFor(p.id, c, r));
    // ice: entering an ice tile starts a slide; leaving one ends it at the next tile centre
    const now = this.cell(Math.floor(p.x), Math.floor(p.y));
    if (now?.ice && p.moving) p.slide = p.dir;
    else if (p.slide && !now?.ice) {
      const cx = Math.floor(p.x) + 0.5;
      const cy = Math.floor(p.y) + 0.5;
      const past = DV[p.slide][0] !== 0 ? (p.x - cx) * DV[p.slide][0] >= 0 : (p.y - cy) * DV[p.slide][1] >= 0;
      if (past) p.slide = null;
    }
    void here;
    this.releasePass(p.id, p.x, p.y);
    if (this.input.bomb) this.placeBalloon();
    // pick up items
    const it = this.itemAt(Math.floor(p.x), Math.floor(p.y));
    if (it && it.delay <= 0) this.pickup(it);
  }

  /** Walking into something: kick balloons or push crates. */
  private bump(dir: Dir, dt: number): void {
    const p = this.player;
    const [dx, dy] = DV[dir];
    const c = Math.floor(p.x);
    const r = Math.floor(p.y);
    const nc = c + dx;
    const nr = r + dy;
    const b = this.balloonAt(nc, nr);
    if (b && p.kick && !b.slide) {
      if (!this.blockedFor(-1, nc + dx, nr + dy)) {
        b.slide = { dir, speed: 7 };
        b.passFor.clear();
        this.emit("kick");
      }
      return;
    }
    const cell = this.cell(nc, nr);
    if (cell?.kind === "soft" && cell.push) {
      p.pushT += dt;
      if (p.pushT > 0.18) {
        p.pushT = 0;
        const dest = this.cell(nc + dx, nr + dy);
        const free = dest && dest.kind === "floor" && !dest.hide && !this.balloonAt(nc + dx, nr + dy) && !this.itemAt(nc + dx, nr + dy) && !this.enemies.some((e) => e.state !== "gone" && Math.floor(e.x) === nc + dx && Math.floor(e.y) === nr + dy);
        if (free && dest) {
          dest.kind = "soft";
          dest.obj = cell.obj;
          dest.push = true;
          dest.item = cell.item;
          dest.pushFrom = { dx: -dx, dy: -dy, t: 0.16 };
          cell.kind = "floor";
          cell.obj = undefined;
          cell.push = false;
          cell.item = undefined;
          this.emit("push");
        }
      }
    }
  }

  private releasePass(id: number, x: number, y: number): void {
    for (const b of this.balloons) {
      if (b.passFor.has(id) && (Math.abs(x - b.x) >= 0.98 || Math.abs(y - b.y) >= 0.98)) b.passFor.delete(id);
    }
  }

  private placeBalloon(): void {
    const p = this.player;
    const c = Math.floor(p.x);
    const r = Math.floor(p.y);
    const mine = this.balloons.filter((b) => !b.dead && b.owner === "player").length;
    if (mine >= this.stats.balloons) return;
    if (this.balloonAt(c, r) || this.cell(c, r)?.kind !== "floor") return;
    const b = this.spawnBalloon(c, r, "player", this.stats.range, FUSE, false, "blue");
    b.passFor.add(p.id);
    for (const e of this.enemies) if (Math.floor(e.x) === c && Math.floor(e.y) === r) b.passFor.add(e.id);
    this.emit("place");
  }

  spawnBalloon(c: number, r: number, owner: "player" | "enemy", range: number, fuse: number, big: boolean, color: Balloon["color"]): Balloon {
    const b: Balloon = { id: this.nextId++, c, r, x: c + 0.5, y: r + 0.5, fuse, life: 0, range, owner, big, color, beltT: 0, passFor: new Set(), dead: false };
    this.balloons.push(b);
    return b;
  }

  private pickup(it: FloorItem): void {
    const p = this.player;
    const max = HERO_STATS[p.hero];
    this.items = this.items.filter((x) => x !== it);
    this.score += 50;
    switch (it.kind) {
      case "balloon":
        p.balloons = Math.min(max.balloons[1], p.balloons + 1);
        break;
      case "potion":
        p.range = Math.min(max.range[1], p.range + 1);
        break;
      case "gold":
        p.range = max.range[1];
        break;
      case "cleats":
        p.speed = Math.min(max.speed[1], p.speed + 1);
        break;
      case "kick":
        p.kick = true;
        break;
      case "needle":
        p.needles = Math.min(3, p.needles + 1);
        break;
      case "shield":
        p.shields = Math.min(2, p.shields + 1);
        break;
      case "ginseng":
        p.ginsengT = 10;
        break;
      case "heart":
        p.hearts = Math.min(5, p.hearts + 1);
        this.emit("heart");
        break;
      case "coin":
        this.score += 450;
        break;
      case "card":
        p.curseT = 8;
        this.emit("curse");
        this.addEffect({ kind: "text", x: p.x, y: p.y - 1, t: 0, text: "!", color: "#ffd400" });
        return;
    }
    this.emit("item");
    this.addEffect({ kind: "stars", x: it.c + 0.5, y: it.r + 0.5, t: 0 });
  }

  /** Water or an enemy got the player. */
  trapPlayer(): void {
    const p = this.player;
    if (p.state !== "alive" || p.invulnT > 0 || p.shieldT > 0 || this.phase !== "play") return;
    p.state = "trapped";
    p.t = TRAP_TIME;
    p.slide = null;
    this.emit("trapped");
  }

  hurtPlayer(): void {
    const p = this.player;
    if (p.state === "popped" || this.phase !== "play") return;
    if (p.state === "alive" && (p.invulnT > 0 || p.shieldT > 0)) return;
    p.state = "popped";
    p.t = 1.3;
    p.hearts--;
    p.lostHearts++;
    p.slide = null;
    this.combo = 0;
    this.addEffect({ kind: "pop", x: p.x, y: p.y, t: 0 });
    this.emit("playerPop");
    this.dropStats();
    if (p.hearts <= 0) {
      this.phase = "over";
      this.phaseT = 0;
      this.emit("over");
    }
  }

  /** Crazy Arcade scatters some of your power-ups when you pop. */
  private dropStats(): void {
    const p = this.player;
    const base = HERO_STATS[p.hero];
    const drops: ItemKind[] = [];
    if (p.balloons > base.balloons[0]) {
      p.balloons--;
      drops.push("balloon");
    }
    if (p.range > base.range[0]) {
      p.range--;
      drops.push("potion");
    }
    if (p.speed > base.speed[0]) {
      p.speed--;
      drops.push("cleats");
    }
    for (const kind of drops) {
      for (let tries = 0; tries < 30; tries++) {
        const c = Math.floor(p.x) + Math.floor(this.rand() * 7) - 3;
        const r = Math.floor(p.y) + Math.floor(this.rand() * 7) - 3;
        const cell = this.cell(c, r);
        if (cell && cell.kind === "floor" && !this.itemAt(c, r) && !this.balloonAt(c, r)) {
          this.items.push({ id: this.nextId++, c, r, kind, delay: 0.6, age: 0 });
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- balloons and water

  private updateBalloons(dt: number): void {
    for (const b of this.balloons) {
      if (b.dead) continue;
      b.life += dt;
      b.fuse -= dt;
      if (b.slide) this.slideBalloon(b, dt);
      else {
        const cell = this.cell(b.c, b.r);
        if (cell?.belt) {
          b.beltT += dt;
          if (b.beltT >= 0.9) {
            b.beltT = 0;
            const [dx, dy] = DV[cell.belt];
            if (!this.blockedFor(-1, b.c + dx, b.r + dy) && !this.occupied(b.c + dx, b.r + dy)) {
              b.c += dx;
              b.r += dy;
              b.x = b.c + 0.5;
              b.y = b.r + 0.5;
              b.passFor.clear();
            }
          }
        }
      }
      if (b.fuse <= 0) this.explode(b);
    }
    this.balloons = this.balloons.filter((b) => !b.dead);
  }

  private occupied(c: number, r: number): boolean {
    const p = this.player;
    if (p.state !== "popped" && Math.floor(p.x) === c && Math.floor(p.y) === r) return true;
    return this.enemies.some((e) => e.state !== "gone" && Math.floor(e.x) === c && Math.floor(e.y) === r);
  }

  private slideBalloon(b: Balloon, dt: number): void {
    const s = b.slide!;
    const [dx, dy] = DV[s.dir];
    let move = s.speed * dt;
    while (move > 0) {
      const cx = b.c + 0.5;
      const cy = b.r + 0.5;
      const toCentre = dx !== 0 ? (cx - b.x) * dx : (cy - b.y) * dy; // > 0 while approaching this tile's centre
      if (toCentre > 0.0001) {
        const step = Math.min(move, toCentre);
        b.x += dx * step;
        b.y += dy * step;
        move -= step;
        continue;
      }
      // at the centre: go on only if the next tile is free
      const nc = b.c + dx;
      const nr = b.r + dy;
      if (this.blockedFor(-1, nc, nr) || this.occupied(nc, nr) || (this.boss && this.boss.covers(nc, nr))) {
        b.slide = undefined;
        b.x = cx;
        b.y = cy;
        return;
      }
      const step = Math.min(move, 1);
      b.x += dx * step;
      b.y += dy * step;
      move -= step;
      if (Math.abs(b.x - cx) >= 0.5 || Math.abs(b.y - cy) >= 0.5) {
        b.c = nc;
        b.r = nr;
      }
    }
  }

  explodeAll(): void {
    for (const b of this.balloons) if (!b.dead) b.fuse = Math.min(b.fuse, 0);
  }

  explode(first: Balloon): void {
    const queue = [first];
    let burst = false;
    while (queue.length) {
      const b = queue.shift()!;
      if (b.dead) continue;
      b.dead = true;
      burst = true;
      const id = ++this.explosionCount;
      const centres: [number, number][] = [[b.c, b.r]];
      if (b.big) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) centres.push([b.c + dx, b.r + dy]);
      for (const [c, r] of centres) if (inside(c, r) && this.cell(c, r)!.kind !== "hard") this.addFlame(c, r, id, TR_CENTER, 0, queue);
      this.addEffect({ kind: "splash", x: b.c + 0.5, y: b.r + 0.5, t: 0 });
      const arms: [Dir, number, number][] = [
        ["up", 0, -1],
        ["down", 0, 1],
        ["left", -1, 0],
        ["right", 1, 0],
      ];
      for (const [dir, dx, dy] of arms) {
        const start = b.big ? 2 : 1;
        const len = b.range + (b.big ? 1 : 0);
        let prevC = b.c + dx * (start - 1);
        let prevR = b.r + dy * (start - 1);
        for (let k = start; k <= len; k++) {
          const c = b.c + dx * k;
          const r = b.r + dy * k;
          if (!inside(c, r)) break;
          const cell = this.cell(c, r)!;
          if (cell.kind === "hard") break;
          const back = LINK[({ up: "down", down: "up", left: "right", right: "left" } as const)[dir]];
          this.flameLink[idx(prevC, prevR)] |= LINK[dir];
          const stop = this.addFlame(c, r, id, TRAVEL[dir], back, queue);
          if (cell.kind === "soft") {
            this.breakBlock(c, r);
            break;
          }
          if (stop) break;
          prevC = c;
          prevR = r;
        }
      }
      if (this.cell(b.c, b.r)?.drain) this.fireDrains(b.c, b.r, id);
    }
    if (burst) this.emit("burst");
  }

  /** Add water to a tile. Returns true when the arm should stop (it hit a balloon). */
  addFlame(c: number, r: number, id: number, travel: number, link: number, queue?: Balloon[]): boolean {
    const i = idx(c, r);
    this.flameT[i] = FLAME_TIME;
    this.flameTravel[i] |= travel;
    this.flameLink[i] |= link;
    this.flameId[i] = id;
    const it = this.itemAt(c, r);
    if (it && it.delay <= 0) this.items = this.items.filter((x) => x !== it);
    const other = this.balloonAt(c, r);
    if (other && queue) {
      queue.push(other);
      return true;
    }
    return false;
  }

  breakBlock(c: number, r: number): void {
    const cell = this.cell(c, r)!;
    if (cell.kind !== "soft") return;
    const i = idx(c, r);
    this.addEffect({ kind: "debris", x: c + 0.5, y: r + 0.5, t: 0, sprite: cell.obj ?? "" });
    cell.kind = "floor";
    cell.push = false;
    this.pendingItem[i] = cell.item;
    cell.item = undefined;
    cell.obj = undefined;
    this.score += 10;
  }

  private fireDrains(c0: number, r0: number, id: number): void {
    if (this.drainCooldown > this.time) return;
    this.drainCooldown = this.time + 0.2;
    this.cells.forEach((cell, i) => {
      if (!cell.drain) return;
      const c = i % COLS;
      const r = (i - c) / COLS;
      if (c === c0 && r === r0) return;
      this.addFlame(c, r, id, TR_CENTER, 0);
      for (const [dx, dy, dir] of [
        [1, 0, "right"],
        [-1, 0, "left"],
        [0, 1, "down"],
        [0, -1, "up"],
      ] as const) {
        const cell2 = this.cell(c + dx, r + dy);
        if (!cell2 || cell2.kind === "hard" || cell2.kind === "water") continue;
        this.flameLink[i] |= LINK[dir];
        this.addFlame(c + dx, r + dy, id, TRAVEL[dir], LINK[({ up: "down", down: "up", left: "right", right: "left" } as const)[dir]]);
        if (cell2.kind === "soft") this.breakBlock(c + dx, r + dy);
        const b = this.balloonAt(c + dx, r + dy);
        if (b) b.fuse = Math.min(b.fuse, 0.05);
      }
    });
  }

  private updateFlames(dt: number): void {
    for (let i = 0; i < this.flameT.length; i++) {
      if (this.flameT[i] <= 0) continue;
      this.flameT[i] -= dt;
      if (this.flameT[i] <= 0) {
        this.flameT[i] = 0;
        this.flameLink[i] = 0;
        this.flameTravel[i] = 0;
        const kind = this.pendingItem[i];
        if (kind) {
          this.pendingItem[i] = undefined;
          const c = i % COLS;
          this.items.push({ id: this.nextId++, c, r: (i - c) / COLS, kind, delay: 0.05, age: 0 });
        }
      }
    }
    if (this.phase !== "play") return;
    const p = this.player;
    if (p.state === "alive" && this.flameT[idx(Math.floor(p.x), Math.floor(p.y))] > 0) this.trapPlayer();
  }

  private updateItems(dt: number): void {
    for (const it of this.items) {
      if (it.delay > 0) it.delay -= dt;
      it.age += dt;
    }
    for (const cell of this.cells) if (cell.pushFrom) {
      cell.pushFrom.t -= dt;
      if (cell.pushFrom.t <= 0) cell.pushFrom = undefined;
    }
  }

  /** Lobbed balloons and rockets fly to a tile, then land. */
  lob(fromX: number, fromY: number, toC: number, toR: number, opts: { big?: boolean; range?: number; kind?: "balloon" | "rocket"; flight?: number; fuse?: number } = {}): void {
    const total = opts.flight ?? 0.9;
    const big = !!opts.big;
    const cells: number[] = [];
    for (let dy = big ? -1 : 0; dy <= (big ? 1 : 0); dy++) for (let dx = big ? -1 : 0; dx <= (big ? 1 : 0); dx++) if (inside(toC + dx, toR + dy)) cells.push(idx(toC + dx, toR + dy));
    this.warnings.push({ cells, t: total + (opts.fuse ?? 0), total: total + (opts.fuse ?? 0), color: "red" });
    this.lobs.push({ fromX, fromY, toC, toR, t: 0, total, big, range: opts.range ?? 1, kind: opts.kind ?? "balloon", fuse: opts.fuse ?? 1.1 });
    this.emit("lob");
  }

  private updateLobs(dt: number): void {
    const keep: Lob[] = [];
    for (const l of this.lobs) {
      l.t += dt;
      if (l.t < l.total) {
        keep.push(l);
        continue;
      }
      let c = l.toC;
      let r = l.toR;
      const cell = this.cell(c, r);
      if (!cell || cell.kind === "hard" || cell.kind === "water") continue;
      if (l.kind === "rocket" || cell.kind === "soft" || this.balloonAt(c, r)) {
        // rockets (and anything landing on a block) splash on impact
        const b = this.spawnBalloon(c, r, "enemy", l.range, 0, l.big, "red");
        if (cell.kind === "soft") b.range = Math.max(1, l.range);
        this.explode(b);
        continue;
      }
      const b = this.spawnBalloon(c, r, "enemy", l.range, l.fuse, l.big, "red");
      if (Math.floor(this.player.x) === c && Math.floor(this.player.y) === r) b.passFor.add(this.player.id);
      for (const e of this.enemies) if (Math.floor(e.x) === c && Math.floor(e.y) === r) b.passFor.add(e.id);
      void r;
    }
    this.lobs = keep;
  }

  /** Telegraphed tiles; `onFire` runs when the warning expires. */
  warn(cells: number[], delay: number, color: Warning["color"], onFire?: () => void): void {
    const w: Warning & { onFire?: () => void } = { cells, t: delay, total: delay, color, onFire };
    this.warnings.push(w);
    this.emit("warn");
  }

  private updateWarnings(dt: number): void {
    const keep: Warning[] = [];
    for (const w of this.warnings as (Warning & { onFire?: () => void })[]) {
      w.t -= dt;
      if (w.t > 0) keep.push(w);
      else w.onFire?.();
    }
    this.warnings = keep;
  }

  /** Water every tile in a list (boss attacks, sprinklers). */
  splashCells(cells: number[], breakSoft: boolean): void {
    const id = ++this.explosionCount;
    for (const i of cells) {
      const c = i % COLS;
      const r = (i - c) / COLS;
      const cell = this.cells[i];
      if (!cell || cell.kind === "hard") continue;
      if (cell.kind === "soft") {
        if (breakSoft) this.breakBlock(c, r);
        else continue;
      }
      this.addFlame(c, r, id, TR_CENTER, 0);
      const b = this.balloonAt(c, r);
      if (b) b.fuse = Math.min(b.fuse, 0.05);
    }
    // join neighbouring splash tiles so the water reads as one sheet
    const set = new Set(cells);
    for (const i of cells) {
      const c = i % COLS;
      if (set.has(i + 1) && c < COLS - 1) this.flameLink[i] |= LINK.right;
      if (set.has(i - 1) && c > 0) this.flameLink[i] |= LINK.left;
      if (set.has(i + COLS)) this.flameLink[i] |= LINK.down;
      if (set.has(i - COLS)) this.flameLink[i] |= LINK.up;
    }
    this.emit("burst");
  }

  /** Stadium sprinklers: every few seconds each one telegraphs, then sprays a cross of 2. */
  private updateSprinklers(dt: number): void {
    this.sprinklerT += dt;
    const period = 7;
    const sprinklers: number[] = [];
    this.cells.forEach((cell, i) => cell.sprinkler && sprinklers.push(i));
    if (!sprinklers.length) return;
    const n = sprinklers.length;
    sprinklers.forEach((i, k) => {
      const phase = (k / n) * period;
      const before = (this.sprinklerT - dt - phase + period * 10) % period;
      const after = (this.sprinklerT - phase + period * 10) % period;
      if (after < before && this.time > 2) {
        const c = i % COLS;
        const r = (i - c) / COLS;
        const cells: number[] = [];
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          for (let s = 1; s <= 2; s++) {
            const cc = c + dx * s;
            const rr = r + dy * s;
            const cell = this.cell(cc, rr);
            if (!cell || cell.kind !== "floor") break;
            cells.push(idx(cc, rr));
          }
        }
        this.warn(cells, 1.0, "purple", () => this.splashCells(cells, false));
      }
    });
  }

  /** Tiles that will be wet soon: live balloons' blast lines, warnings, landing zones, water. */
  private computeDanger(): void {
    const d = this.danger;
    d.fill(0);
    for (let i = 0; i < d.length; i++) if (this.flameT[i] > 0) d[i] = 1;
    for (const w of this.warnings) for (const i of w.cells) d[i] = 1;
    for (const b of this.balloons) {
      if (b.dead) continue;
      d[idx(b.c, b.r)] = 1;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        for (let k = 1; k <= b.range + (b.big ? 1 : 0); k++) {
          const c = b.c + dx * k;
          const r = b.r + dy * k;
          const cell = this.cell(c, r);
          if (!cell || cell.kind === "hard" || cell.kind === "soft") break;
          d[idx(c, r)] = 1;
        }
      }
    }
  }

  /** Enemy popped by the player: points, combo, album card. */
  scorePop(slug: OpponentSlug, x: number, y: number, bonus = 1): void {
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 1.6;
    const pts = Math.min(3200, 200 * 2 ** (this.combo - 1)) * bonus;
    this.score += pts;
    this.pops++;
    this.addEffect({ kind: "text", x, y: y - 0.9, t: 0, text: String(pts), color: this.combo > 1 ? "#ffd23f" : "#ffffff" });
    if (!this.newCards.includes(slug)) this.newCards.push(slug);
    this.emit("pop");
  }

  private updateEffects(dt: number): void {
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < (e.kind === "text" ? 1.0 : e.kind === "debris" ? 0.45 : e.kind === "breath" ? 0.6 : e.kind === "ring" ? 0.6 : 0.7));
  }

  /** Final tally for the results screen. */
  result(): { score: number; time: number; rank: string; lost: number } {
    const p = this.player;
    const par = this.stage.par;
    const t = this.time;
    let rank = "C";
    if (t <= par && p.lostHearts === 0) rank = "SS";
    else if (t <= par && p.lostHearts <= 1) rank = "S";
    else if (t <= par * 1.4 && p.lostHearts <= 1) rank = "A";
    else if (t <= par * 2) rank = "B";
    const timeBonus = Math.max(0, Math.round((this.stage.time - t) * 20));
    const noHit = p.lostHearts === 0 ? 2000 : 0;
    return { score: this.score + timeBonus + noHit, time: t, rank, lost: p.lostHearts };
  }

  private respawn(): void {
    const p = this.player;
    if (p.hearts <= 0) return;
    p.state = "alive";
    p.x = p.spawnC + 0.5;
    p.y = p.spawnR + 0.5;
    p.invulnT = 2.5;
    p.curseT = 0;
    p.slowT = 0;
    p.dir = "down";
  }
}

export { COLS, ROWS, LINK, TRAVEL, TR_CENTER, ENEMIES, RARE_ITEMS };
