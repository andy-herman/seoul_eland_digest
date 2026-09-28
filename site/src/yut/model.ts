import { AI_TIER, OPPONENTS, OPPONENT_SLUGS, type OpponentSlug } from "../h2h/data";

export type TeamId = 0 | 1;
export type Station =
  | "A" | "r1" | "r2" | "r3" | "r4" | "B" | "t1" | "t2" | "t3" | "t4" | "C" | "l1" | "l2" | "l3" | "l4" | "D" | "b1" | "b2" | "b3" | "b4"
  | "d1" | "d2" | "O" | "d3" | "d4" | "e1" | "e2" | "e3" | "e4";
export type Route = "perimeter" | "bdiag" | "cdiag";
export type ThrowId = "back" | "do" | "gae" | "geol" | "yut" | "mo";
export type Level = "friendly" | "pro" | "random";
export type Mode = "rival" | "pass";

export interface ThrowResult { id: ThrowId; ko: string; roman: string; steps: number; extra: boolean; flat: number; markedFlat: boolean; }
export interface PieceGroup { id: number; team: TeamId; pos: Station; count: number; route: Route; history: Station[]; }
export interface TeamState { off: number; home: number; groups: PieceGroup[]; }
export interface GameState { teams: [TeamState, TeamState]; turn: TeamId; queue: ThrowId[]; mustThrow: boolean; winner: TeamId | null; log: string[]; seed: number; turnNo: number; nextId: number; streak: number; }
export interface MoveOption { team: TeamId; throwId: ThrowId; groupId: number | "new"; from: Station | "bench"; to: Station | "home"; path: Station[]; captures: number; stacks: number; danger: number; shortcut: boolean; }

export const PERIMETER: Station[] = ["A", "r1", "r2", "r3", "r4", "B", "t1", "t2", "t3", "t4", "C", "l1", "l2", "l3", "l4", "D", "b1", "b2", "b3", "b4"];
export const STATIONS: Station[] = [...PERIMETER, "d1", "d2", "O", "d3", "d4", "e1", "e2", "e3", "e4"];
export const B_ROUTE: Station[] = ["B", "d1", "d2", "O", "d3", "d4", "D", "b1", "b2", "b3", "b4", "A"];
export const C_ROUTE: Station[] = ["C", "e1", "e2", "O", "e3", "e4", "A"];
export const O_ROUTE: Station[] = ["O", "e3", "e4", "A"];
export const THROW_INFO: Record<ThrowId, ThrowResult> = {
  back: { id: "back", ko: "빽도", roman: "back-do", steps: -1, extra: false, flat: 1, markedFlat: true },
  do: { id: "do", ko: "도", roman: "do", steps: 1, extra: false, flat: 1, markedFlat: false },
  gae: { id: "gae", ko: "개", roman: "gae", steps: 2, extra: false, flat: 2, markedFlat: false },
  geol: { id: "geol", ko: "걸", roman: "geol", steps: 3, extra: false, flat: 3, markedFlat: false },
  yut: { id: "yut", ko: "윷", roman: "yut", steps: 4, extra: true, flat: 4, markedFlat: false },
  mo: { id: "mo", ko: "모", roman: "mo", steps: 5, extra: true, flat: 0, markedFlat: false },
};

export const BOARD_POS: Record<Station, { x: number; y: number; corner?: boolean; center?: boolean }> = {
  A: { x: 88, y: 86, corner: true }, r1: { x: 88, y: 70 }, r2: { x: 88, y: 56 }, r3: { x: 88, y: 42 }, r4: { x: 88, y: 28 }, B: { x: 88, y: 14, corner: true },
  t1: { x: 70, y: 14 }, t2: { x: 56, y: 14 }, t3: { x: 42, y: 14 }, t4: { x: 28, y: 14 }, C: { x: 12, y: 14, corner: true },
  l1: { x: 12, y: 28 }, l2: { x: 12, y: 42 }, l3: { x: 12, y: 56 }, l4: { x: 12, y: 70 }, D: { x: 12, y: 86, corner: true },
  b1: { x: 28, y: 86 }, b2: { x: 42, y: 86 }, b3: { x: 56, y: 86 }, b4: { x: 70, y: 86 },
  d1: { x: 75, y: 27 }, d2: { x: 63, y: 39 }, O: { x: 50, y: 50, center: true }, d3: { x: 38, y: 62 }, d4: { x: 25, y: 75 },
  e1: { x: 25, y: 27 }, e2: { x: 38, y: 39 }, e3: { x: 63, y: 62 }, e4: { x: 75, y: 75 },
};

export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}
export function seedFromString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function cloneState(s: GameState): GameState { return JSON.parse(JSON.stringify(s)) as GameState; }
export function newGame(seed = 20260928): GameState {
  return { teams: [{ off: 4, home: 0, groups: [] }, { off: 4, home: 0, groups: [] }], turn: 0, queue: [], mustThrow: true, winner: null, log: [], seed, turnNo: 1, nextId: 1, streak: 0 };
}
export function stationNext(pos: Station, route: Route): Station | "home" {
  if (pos === "A") return "home";
  if (pos === "B") return "d1";
  if (pos === "C") return "e1";
  if (pos === "O") return route === "bdiag" ? "d3" : "e3";
  if (route === "bdiag") {
    const i = B_ROUTE.indexOf(pos); if (i >= 0) return B_ROUTE[i + 1] ?? "home";
  }
  if (route === "cdiag") {
    const i = C_ROUTE.indexOf(pos); if (i >= 0) return C_ROUTE[i + 1] ?? "home";
  }
  const i = PERIMETER.indexOf(pos); return i === PERIMETER.length - 1 ? "A" : PERIMETER[i + 1];
}
export function routeForLanding(pos: Station, fromRoute: Route): Route {
  if (pos === "d1" || pos === "d2" || pos === "d3" || pos === "d4") return "bdiag";
  if (pos === "e1" || pos === "e2" || pos === "e3" || pos === "e4") return "cdiag";
  if (pos === "O") return fromRoute;
  return "perimeter";
}

export function drawThrow(rng: () => number): ThrowResult {
  let flat = 0;
  const faces = [rng() < 0.6, rng() < 0.6, rng() < 0.6, rng() < 0.6];
  for (const f of faces) if (f) flat++;
  if (flat === 1 && faces[0]) return THROW_INFO.back;
  if (flat === 1) return THROW_INFO.do;
  if (flat === 2) return THROW_INFO.gae;
  if (flat === 3) return THROW_INFO.geol;
  if (flat === 4) return THROW_INFO.yut;
  return THROW_INFO.mo;
}
export function formulaDistribution(p = 0.6): Record<ThrowId, number> {
  return { back: p * (1 - p) ** 3, do: 3 * p * (1 - p) ** 3, gae: 6 * p ** 2 * (1 - p) ** 2, geol: 4 * p ** 3 * (1 - p), yut: p ** 4, mo: (1 - p) ** 4 };
}

export function previewMove(state: GameState, team: TeamId, throwId: ThrowId, groupId: number | "new", calcDanger = true): MoveOption | null {
  const info = THROW_INFO[throwId];
  const ts = state.teams[team];
  const opp = state.teams[(1 - team) as TeamId];
  let from: Station | "bench";
  let pos: Station;
  let route: Route = "perimeter";
  let history: Station[] = [];
  if (groupId === "new") {
    if (info.steps < 0 || ts.off <= 0) return null;
    from = "bench"; pos = "A"; history = [];
  } else {
    const g = ts.groups.find((x) => x.id === groupId); if (!g) return null;
    from = g.pos; pos = g.pos; route = g.route; history = [...g.history];
  }
  if (info.steps < 0) {
    if (groupId === "new") return null;
    const back = history.length ? history[history.length - 1] : pos === "r1" ? "A" : null;
    if (!back) return null;
    const danger = calcDanger ? dangerAt(state, team, back) : 0;
    return { team, throwId, groupId, from, to: back, path: [back], captures: opp.groups.filter((g) => g.pos === back).reduce((a, g) => a + g.count, 0), stacks: ts.groups.filter((g) => g.pos === back && g.id !== groupId).reduce((a, g) => a + g.count, 0), danger, shortcut: false };
  }
  const path: Station[] = [];
  let cur = pos;
  let curRoute = pos === "O" ? "cdiag" : route;
  let shortcut = cur === "B" || cur === "C" || cur === "O";
  for (let s = 0; s < info.steps; s++) {
    const nx = groupId === "new" && s === 0 ? "r1" : stationNext(cur, curRoute);
    if (nx === "home") return { team, throwId, groupId, from, to: "home", path, captures: 0, stacks: 0, danger: 0, shortcut };
    path.push(nx); curRoute = routeForLanding(nx, curRoute); cur = nx;
  }
  const to = cur;
  const captures = opp.groups.filter((g) => g.pos === to).reduce((a, g) => a + g.count, 0);
  const stacks = ts.groups.filter((g) => g.pos === to && g.id !== groupId).reduce((a, g) => a + g.count, 0);
  return { team, throwId, groupId, from, to, path, captures, stacks, danger: calcDanger ? dangerAt(state, team, to) : 0, shortcut };
}

export function legalMoves(state: GameState, team = state.turn): MoveOption[] {
  const out: MoveOption[] = [];
  for (const t of [...new Set(state.queue)] as ThrowId[]) {
    if (state.teams[team].off > 0) { const m = previewMove(state, team, t, "new"); if (m) out.push(m); }
    for (const g of state.teams[team].groups) { const m = previewMove(state, team, t, g.id); if (m) out.push(m); }
  }
  return out;
}

export function applyThrow(state: GameState, rng: () => number): ThrowResult {
  const tr = drawThrow(rng);
  state.queue.push(tr.id);
  state.mustThrow = tr.extra;
  state.log.unshift(`${tr.ko} ${tr.roman}`);
  return tr;
}

export function applyMove(state: GameState, move: MoveOption): { capture: number; stack: number; home: number; shortcut: boolean } {
  const team = move.team;
  const ts = state.teams[team]; const os = state.teams[(1 - team) as TeamId];
  const qi = state.queue.indexOf(move.throwId); if (qi >= 0) state.queue.splice(qi, 1);
  let group: PieceGroup;
  if (move.groupId === "new") {
    ts.off--;
    const land = move.to === "home" ? "A" : move.to;
    group = { id: state.nextId++, team, pos: land as Station, count: 1, route: routeForLanding(land as Station, "perimeter"), history: ["A"] };
  } else {
    const idx = ts.groups.findIndex((g) => g.id === move.groupId);
    group = ts.groups[idx];
    ts.groups.splice(idx, 1);
  }
  const result = { capture: 0, stack: 0, home: 0, shortcut: move.shortcut };
  if (move.to === "home") {
    ts.home += group.count; result.home = group.count; state.log.unshift(`${group.count > 1 ? group.count : ""} Goal!`.trim());
  } else {
    group.history.push(group.pos);
    if (move.throwId === "back") group.history.pop();
    if (move.throwId === "back") group.history.pop();
    group.pos = move.to;
    group.route = routeForLanding(group.pos, group.route);
    for (let i = os.groups.length - 1; i >= 0; i--) if (os.groups[i].pos === group.pos) { result.capture += os.groups[i].count; os.off += os.groups[i].count; os.groups.splice(i, 1); }
    for (let i = ts.groups.length - 1; i >= 0; i--) if (ts.groups[i].pos === group.pos) { result.stack += ts.groups[i].count; group.count += ts.groups[i].count; ts.groups.splice(i, 1); }
    ts.groups.push(group);
    if (result.capture) { state.mustThrow = true; state.log.unshift("Tackle! 잡기"); }
    if (result.stack) state.log.unshift("One-two! 업기");
    if (result.shortcut) state.log.unshift("Through ball! 지름길");
  }
  if (ts.home >= 4) { state.winner = team; state.log.unshift(team === 0 ? "Leoul wins" : "Rival wins"); }
  if (state.winner === null && !state.queue.length && !state.mustThrow) endTurn(state);
  return result;
}

export function discardIfNoMoves(state: GameState): ThrowId[] {
  const gone: ThrowId[] = [];
  for (let i = state.queue.length - 1; i >= 0; i--) {
    const t = state.queue[i];
    if (!legalMoves({ ...state, queue: [t] } as GameState, state.turn).length) { gone.push(t); state.queue.splice(i, 1); state.log.unshift(`${THROW_INFO[t].ko} cannot be used`); }
  }
  if (!state.queue.length && !state.mustThrow && state.winner === null) endTurn(state);
  return gone;
}
export function endTurn(state: GameState): void { state.turn = (1 - state.turn) as TeamId; state.queue = []; state.mustThrow = true; state.turnNo++; }

export function progressOf(pos: Station, route: Route): number {
  if (route === "bdiag" && B_ROUTE.includes(pos)) return 5 + B_ROUTE.indexOf(pos) * 1.75;
  if (route === "cdiag" && C_ROUTE.includes(pos)) return 10 + C_ROUTE.indexOf(pos) * 1.8;
  const i = PERIMETER.indexOf(pos); return i >= 0 ? i : 10;
}
export function dangerAt(state: GameState, team: TeamId, pos: Station | "home"): number {
  if (pos === "home") return 0;
  const opp = state.teams[(1 - team) as TeamId];
  const dist = new Set<number>();
  for (const g of opp.groups) for (const id of ["do", "gae", "geol", "yut", "mo"] as ThrowId[]) {
    const m = previewMove({ ...state, queue: [id] } as GameState, g.team, id, g.id, false); if (m?.to === pos) dist.add(THROW_INFO[id].steps);
  }
  const probs = formulaDistribution();
  let risk = 0;
  if (dist.has(1)) risk += probs.do;
  if (dist.has(2)) risk += probs.gae;
  if (dist.has(3)) risk += probs.geol;
  if (dist.has(4)) risk += probs.yut;
  if (dist.has(5)) risk += probs.mo;
  return risk;
}

export function evaluate(state: GameState, team: TeamId): number {
  const me = state.teams[team], op = state.teams[(1 - team) as TeamId];
  let score = (me.home - op.home) * 900 + (op.off - me.off) * 30;
  for (const g of me.groups) score += progressOf(g.pos, g.route) * g.count + (g.count - 1) * 35 - dangerAt(state, team, g.pos) * 160 * g.count;
  for (const g of op.groups) score -= progressOf(g.pos, g.route) * g.count + (g.count - 1) * 28;
  if (state.winner === team) score += 10000;
  if (state.winner === ((1 - team) as TeamId)) score -= 10000;
  return score;
}

function orderBonus(move: MoveOption): number {
  return move.captures * 260 + move.stacks * 55 + (move.to === "home" ? 700 : 0) + (move.shortcut ? 35 : 0) - move.danger * 90;
}
export function chooseMove(state: GameState, level: Level, rng: () => number, team = state.turn): MoveOption | null {
  const moves = legalMoves(state, team); if (!moves.length) return null;
  if (level === "random") return moves[Math.floor(rng() * moves.length)];
  const scored = moves.map((m) => {
    const sim = cloneState(state); applyMove(sim, { ...m, team });
    let score = evaluate(sim, team) + orderBonus(m);
    if (level === "pro") {
      const dist = formulaDistribution(); let ev = 0;
      for (const id of Object.keys(dist) as ThrowId[]) {
        const s2 = cloneState(sim); s2.queue = [id]; s2.mustThrow = false;
        const om = chooseMove(s2, "friendly", rng, (1 - team) as TeamId);
        if (om) applyMove(s2, om);
        ev += dist[id] * evaluate(s2, team);
      }
      score = score * 0.6 + ev * 0.4;
    } else score += (rng() - 0.5) * 120;
    return { m, score };
  }).sort((a, b) => b.score - a.score);
  if (level === "friendly" && rng() < 0.28 && scored[1]) return scored[Math.min(scored.length - 1, rng() < 0.35 ? 2 : 1)].m;
  return scored[0].m;
}

export function playAutoGame(seed: number, p0: Level, p1: Level, maxTurns = 900): { winner: TeamId | null; turns: number; trace: string } {
  const rng = makeRng(seed); const s = newGame(seed);
  while (s.winner === null && s.turnNo < maxTurns) {
    while (s.mustThrow && s.winner === null) { const tr = applyThrow(s, rng); if (!tr.extra) s.mustThrow = false; }
    discardIfNoMoves(s);
    while (s.queue.length && s.winner === null) {
      const lv = s.turn === 0 ? p0 : p1;
      const m = chooseMove(s, lv, rng, s.turn);
      if (!m) { s.queue.shift(); continue; }
      applyMove(s, m); if (s.mustThrow) break;
    }
  }
  return { winner: s.winner, turns: s.turnNo, trace: JSON.stringify(s) };
}

export function rivalLevel(slug: OpponentSlug): number { return AI_TIER[slug] ?? 2; }
export { OPPONENTS, OPPONENT_SLUGS, type OpponentSlug };
