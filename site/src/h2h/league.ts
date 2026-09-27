import { OPPONENTS, OPPONENT_SLUGS, RIVAL_STRENGTH, SEOUL_TEAM, rng, seedFromString, type OpponentSlug, type SquadPlayer } from "./data";

export interface TeamRow {
  id: string;
  name: string;
  shortName: string;
  color: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export interface UserResult {
  round: number;
  opponent: OpponentSlug;
  home: boolean;
  gf: number;
  ga: number;
}

export interface Fixture {
  round: number;
  opponent: OpponentSlug;
  home: boolean;
  result?: { gf: number; ga: number };
}

export interface SeasonState {
  seed: number;
  playerNum: number;
  round: number;
  fixtures: Fixture[];
  rows: TeamRow[];
  userResults: UserResult[];
}

export function newSeason(player: SquadPlayer, seed = seedFromString(`h2h-${Date.now()}-${player.num}`)): SeasonState {
  const fixtures = OPPONENT_SLUGS.map((opponent, i) => ({ round: i, opponent, home: i % 2 === 0 }));
  return {
    seed,
    playerNum: player.num,
    round: 0,
    fixtures,
    rows: makeRows(),
    userResults: [],
  };
}

export function makeRows(): TeamRow[] {
  return [
    emptyRow(SEOUL_TEAM.id, SEOUL_TEAM.name, "Seoul E-Land", SEOUL_TEAM.color),
    ...OPPONENT_SLUGS.map((slug) => emptyRow(slug, OPPONENTS[slug].club, OPPONENTS[slug].name, OPPONENTS[slug].color)),
  ];
}

function emptyRow(id: string, name: string, shortName: string, color: string): TeamRow {
  return { id, name, shortName, color, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

export function applyRound(state: SeasonState, gf: number, ga: number): SeasonState {
  const fx = state.fixtures[state.round];
  if (!fx) return state;
  const copy: SeasonState = JSON.parse(JSON.stringify(state));
  const current = copy.fixtures[copy.round];
  current.result = { gf, ga };
  copy.userResults.push({ round: copy.round, opponent: current.opponent, home: current.home, gf, ga });
  record(copy.rows, SEOUL_TEAM.id, current.opponent, gf, ga);
  for (const [home, away] of rivalRound(copy.round)) {
    const [a, b] = simulateRivalFixture(home, away, copy.seed + copy.round * 4099 + seedFromString(home));
    record(copy.rows, home, away, a, b);
  }
  copy.round += 1;
  copy.rows = sortRows(copy.rows);
  return copy;
}

export function sortRows(rows: TeamRow[]): TeamRow[] {
  return [...rows].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
}

function record(rows: TeamRow[], home: string, away: string, hg: number, ag: number): void {
  const h = rows.find((r) => r.id === home);
  const a = rows.find((r) => r.id === away);
  if (!h || !a) throw new Error(`Missing table row for ${home} or ${away}`);
  h.p += 1;
  a.p += 1;
  h.gf += hg;
  h.ga += ag;
  a.gf += ag;
  a.ga += hg;
  h.gd = h.gf - h.ga;
  a.gd = a.gf - a.ga;
  if (hg > ag) {
    h.w += 1;
    a.l += 1;
    h.pts += 3;
  } else if (hg < ag) {
    a.w += 1;
    h.l += 1;
    a.pts += 3;
  } else {
    h.d += 1;
    a.d += 1;
    h.pts += 1;
    a.pts += 1;
  }
}

function rivalRound(round: number): [OpponentSlug, OpponentSlug][] {
  const clubs = [...OPPONENT_SLUGS];
  const shift = round % clubs.length;
  const rotated = [...clubs.slice(shift), ...clubs.slice(0, shift)];
  const out: [OpponentSlug, OpponentSlug][] = [];
  for (let i = 0; i < rotated.length / 2; i++) out.push([rotated[i], rotated[rotated.length - 1 - i]]);
  return out;
}

export function simulateRivalFixture(home: OpponentSlug, away: OpponentSlug, seed: number): [number, number] {
  const rand = rng(seed);
  const h = RIVAL_STRENGTH[home] + 4;
  const a = RIVAL_STRENGTH[away];
  const hg = Math.max(0, Math.round(goalSample(rand, 1.05 + (h - a) / 45)));
  const ag = Math.max(0, Math.round(goalSample(rand, 0.95 + (a - h) / 50)));
  return [Math.min(6, hg), Math.min(6, ag)];
}

function goalSample(rand: () => number, mean: number): number {
  let goals = 0;
  const target = Math.max(0.25, mean);
  for (let i = 0; i < 6; i++) if (rand() < target / (3.3 + i * 1.4)) goals += 1;
  return goals;
}

export function validateTable(state: SeasonState): { ok: true } {
  if (state.rows.length !== 17) throw new Error(`Expected 17 teams, got ${state.rows.length}`);
  if (state.fixtures.length !== 16) throw new Error(`Expected 16 fixtures, got ${state.fixtures.length}`);
  for (const row of state.rows) {
    if (row.gd !== row.gf - row.ga) throw new Error(`Bad goal difference for ${row.id}`);
    if (row.pts !== row.w * 3 + row.d) throw new Error(`Bad points for ${row.id}`);
    if (row.p !== row.w + row.d + row.l) throw new Error(`Bad played total for ${row.id}`);
  }
  return { ok: true };
}
