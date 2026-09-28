// "Rewrite the Result": one level for every Seoul E-Land league match already played this season,
// built from the real fixture list the Digest publishes (src/data/matches.ts). The final score and
// the opponent are real; the attack is one of the campaign moves, re-dressed in the opponent's
// mascots at their strength, mirrored or not, and kept only if its reference solution still scores.
import { fixtures, type MatchFixture } from "../data/matches";
import { AI_TIER, type OpponentSlug } from "../h2h/data";
import { PITCH_W, recordSolution, simulate, starsFor, type LevelDef, type Tier } from "./engine";
import { LEVELS } from "./levels";

export const FIXTURE_SLUG: Record<string, OpponentSlug> = {
  "Ansan Greeners": "ansan-greeners",
  "Busan IPark": "busan-ipark",
  Cheonan: "cheonan-city",
  "Chungbuk Cheongju": "chungbuk-cheongju",
  "Chungnam Asan": "chungnam-asan",
  Daegu: "daegu-fc",
  "Gimhae FC": "gimhae-fc",
  "Gimpo Citizen": "gimpo-fc",
  Gyeongnam: "gyeongnam-fc",
  "Hwaseong FC": "hwaseong-fc",
  "Jeonnam Dragons": "jeonnam-dragons",
  "Paju Frontier": "paju-frontier",
  "Seongnam FC": "seongnam-fc",
  "Suwon Bluewings": "suwon-samsung-bluewings",
  "Suwon FC": "suwon-fc",
  Yongin: "yongin-fc",
};

export type RewriteGoal = "equalise" | "win" | "pullBack" | "encore";

export interface RewriteLevel extends LevelDef {
  round: number;
  date: string;
  venue: "home" | "away" | "neutral";
  opponentName: string;
  stadium: string;
  ours: number;
  theirs: number;
  result: "W" | "D" | "L";
  goal: RewriteGoal;
  template: string;
  mirrored: boolean;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mirrorLevel(level: LevelDef): LevelDef {
  const mx = (x: number) => PITCH_W - x;
  return {
    ...level,
    slots: level.slots.map((s) => ({ ...s, x: mx(s.x) })),
    defenders: level.defenders.map((d) => ({ ...d, x: mx(d.x) })),
    ball: "slot" in level.ball ? level.ball : { x: mx(level.ball.x), y: level.ball.y },
    solution: level.solution.map((st) => ({
      ...st,
      keys: st.keys.map((k) => ({ ...k, x: mx(k.x) })),
      acts: st.acts.map((a) => ({ ...a, tx: mx(a.tx) })),
    })),
  };
}

/** A level passes when its reference solution, recorded take by take, scores with every star. */
export function verify(level: LevelDef): boolean {
  const sim = simulate(level, recordSolution(level));
  return starsFor(level, sim).every(Boolean);
}

export function parseResult(f: MatchFixture): { result: "W" | "D" | "L"; ours: number; theirs: number } | null {
  const m = /^([WDL]) (\d+)-(\d+)$/.exec(f.result.trim());
  if (!m) return null;
  return { result: m[1] as "W" | "D" | "L", ours: Number(m[2]), theirs: Number(m[3]) };
}

const TEMPLATES = LEVELS.filter((l) => l.n >= 3);

export function buildRewrite(f: MatchFixture): RewriteLevel | null {
  const r = parseResult(f);
  const slug = FIXTURE_SLUG[f.opponent];
  if (!r || !slug) return null;
  const goal: RewriteGoal = r.result === "W" ? "encore" : r.result === "D" ? "win" : r.theirs - r.ours === 1 ? "equalise" : "pullBack";
  const want = AI_TIER[slug] as Tier;
  const seed = hash(`${f.round}-${f.opponent}`);
  const order = TEMPLATES.map((l, i) => ({ l, k: hash(`${seed}-${i}`) })).sort((a, b) => a.k - b.k);
  // prefer the real opponent strength; fall back one tier at a time if no move survives it
  for (let tier = want; tier >= 1; tier--) {
    for (const { l } of order) {
      for (const mirrored of seed % 2 ? [true, false] : [false, true]) {
        const base: LevelDef = mirrored ? mirrorLevel(l) : l;
        const level: LevelDef = { ...base, id: `r${f.round}`, opponent: slug, tier: tier as Tier };
        if (!verify(level)) continue;
        return {
          ...level,
          round: f.round,
          date: f.date,
          venue: f.venue,
          opponentName: f.opponent,
          stadium: f.stadium,
          ours: r.ours,
          theirs: r.theirs,
          result: r.result,
          goal,
          template: l.id,
          mirrored,
        };
      }
    }
  }
  return null;
}

/** Every played league match, newest first. */
export function rewriteLevels(list: readonly MatchFixture[] = fixtures): RewriteLevel[] {
  return list
    .filter((f) => parseResult(f))
    .sort((a, b) => b.round - a.round)
    .map(buildRewrite)
    .filter((l): l is RewriteLevel => !!l);
}
