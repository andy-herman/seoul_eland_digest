// Season tracker data and projection model.
//
// Two separate things live here and they must not be confused:
//
//  1. PREDICTIONS  - the round-by-round calls we published in the second
//     round robin preview on 2026-07-12, before any of those matches were
//     played. These never change. They are the thing being graded.
//
//  2. THE MODEL    - a transparent expected-points calculation used to
//     project the rest of the season for every promotion contender. This
//     is recomputed from current form every time results are added, so it
//     moves during the season. It is a projection, not a prediction.
//
// Seoul E-Land's actual results always come from `matches.ts`, which is the
// single source of truth in this repo and mirrors data/fixtures.yaml.

import { fixtures, type MatchFixture } from "./matches";

export type Outcome = "W" | "D" | "L";

/** A published, pre-season-half call from the R18-R34 preview. */
export interface PublishedPrediction {
  round: number;
  opponent: string;
  venue: "home" | "away";
  predicted: Outcome;
}

/**
 * Our published calls for the second round robin, verbatim from
 * "Second Round Robin Preview: The Playoff Run-In" (2026-07-12).
 * Summed: 9 wins, 4 draws, 3 losses = 31 points.
 */
export const SEOUL_PREDICTIONS: PublishedPrediction[] = [
  { round: 18, opponent: "Suwon FC", venue: "away", predicted: "D" },
  { round: 19, opponent: "Cheonan", venue: "home", predicted: "W" },
  { round: 20, opponent: "Busan IPark", venue: "away", predicted: "L" },
  { round: 21, opponent: "Hwaseong FC", venue: "away", predicted: "L" },
  { round: 22, opponent: "Ansan Greeners", venue: "home", predicted: "W" },
  { round: 23, opponent: "Paju Frontier", venue: "home", predicted: "W" },
  { round: 24, opponent: "Seongnam FC", venue: "away", predicted: "D" },
  { round: 25, opponent: "Chungbuk Cheongju", venue: "away", predicted: "L" },
  { round: 26, opponent: "Suwon Bluewings", venue: "home", predicted: "D" },
  { round: 27, opponent: "Daegu", venue: "home", predicted: "W" },
  { round: 28, opponent: "Gimpo Citizen", venue: "away", predicted: "W" },
  { round: 29, opponent: "Gimhae FC", venue: "home", predicted: "W" },
  { round: 31, opponent: "Yongin", venue: "away", predicted: "D" },
  { round: 32, opponent: "Jeonnam Dragons", venue: "home", predicted: "W" },
  { round: 33, opponent: "Chungnam Asan", venue: "home", predicted: "W" },
  { round: 34, opponent: "Gyeongnam", venue: "away", predicted: "W" },
];

/**
 * Seoul E-Land's record at the moment the preview was written, after
 * Round 16 and before the Round 17 bye. The preview projected a final
 * total of 60 points by adding its predicted 31 to this 29.
 */
export const PREVIEW_BASELINE = {
  round: 16,
  played: 16,
  points: 29,
  goalsFor: 28,
  goalsAgainst: 19,
} as const;

export const POINTS_FOR: Record<Outcome, number> = { W: 3, D: 1, L: 0 };

/** Derive the actual outcome of a played Seoul fixture. */
export function outcomeOf(match: MatchFixture): Outcome | undefined {
  const letter = match.result?.trim().charAt(0).toUpperCase();
  return letter === "W" || letter === "D" || letter === "L" ? letter : undefined;
}

export interface TrackedRound {
  round: number;
  date: string;
  opponent: string;
  venue: "home" | "away";
  predicted: Outcome;
  actual?: Outcome;
  score?: string;
  /** Cumulative points if every prediction had come true. */
  predictedCumulative: number;
  /** Cumulative points actually banked, only defined once played. */
  actualCumulative?: number;
  hit?: boolean;
}

/**
 * Join our published predictions to the real results in matches.ts.
 * Both cumulative lines start from the preview baseline of 29 points so
 * the chart compares like with like.
 */
export function buildTrackedRounds(): TrackedRound[] {
  const byRound = new Map(fixtures.map((f) => [f.round, f]));
  let predictedTotal = PREVIEW_BASELINE.points;
  let actualTotal = PREVIEW_BASELINE.points;
  let stillPlayed = true;

  return SEOUL_PREDICTIONS.map((prediction) => {
    const fixture = byRound.get(prediction.round);
    const actual = fixture ? outcomeOf(fixture) : undefined;

    predictedTotal += POINTS_FOR[prediction.predicted];
    if (actual && stillPlayed) {
      actualTotal += POINTS_FOR[actual];
    } else {
      stillPlayed = false;
    }

    return {
      round: prediction.round,
      date: fixture?.date ?? "",
      opponent: prediction.opponent,
      venue: prediction.venue,
      predicted: prediction.predicted,
      actual,
      score: actual ? fixture?.result : undefined,
      predictedCumulative: predictedTotal,
      actualCumulative: actual ? actualTotal : undefined,
      hit: actual ? actual === prediction.predicted : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Rivals and the projection model
// ---------------------------------------------------------------------------

export interface ClubRecord {
  slug: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Show this club in the race table. Untracked clubs still supply a rating. */
  tracked?: boolean;
}

export interface RivalFixture {
  round: number;
  /** Club slug of the home side. */
  home: string;
  /** Club slug of the away side. */
  away: string;
}

export function pointsOf(club: ClubRecord) {
  return club.won * 3 + club.drawn;
}

export function goalDifference(club: ClubRecord) {
  return club.goalsFor - club.goalsAgainst;
}

/**
 * Home advantage expressed in points per game. Derived from the league's
 * own home and away splits rather than assumed, then applied as a rating
 * bump to whichever side is at home.
 */
export const HOME_ADVANTAGE = 0.35;

/**
 * Expected-points model.
 *
 * Each club's rating is simply its points per game so far. The home side
 * gets HOME_ADVANTAGE added. The gap between ratings is mapped to
 * win/draw/loss probabilities with a logistic curve, and the draw share
 * shrinks as the gap widens, which is what actually happens in football.
 *
 * It is deliberately simple so the output can be explained on the page.
 */
export function forecastFixture(homeRating: number, awayRating: number) {
  const gap = homeRating + HOME_ADVANTAGE - awayRating;
  const drawShare = Math.max(0.16, 0.3 - Math.abs(gap) * 0.09);
  const decisive = 1 - drawShare;
  const homeShare = 1 / (1 + Math.exp(-gap * 1.35));
  const homeWin = decisive * homeShare;
  const awayWin = decisive * (1 - homeShare);
  return {
    homeWin,
    draw: drawShare,
    awayWin,
    homeExpectedPoints: homeWin * 3 + drawShare,
    awayExpectedPoints: awayWin * 3 + drawShare,
  };
}

export interface ProjectedClub {
  slug: string;
  name: string;
  played: number;
  points: number;
  goalDifference: number;
  remaining: number;
  /** Points expected from remaining fixtures under the model. */
  expectedRemaining: number;
  /** Points now plus expected remaining. */
  projectedFinal: number;
}

/**
 * Project clubs to the end of the season by running the model over their
 * remaining fixtures.
 *
 * `records` should contain every club in the division so that opponent
 * ratings are real rather than assumed. Only clubs flagged `tracked` are
 * returned, which is how the race table stays to the promotion contenders
 * while still modelling their matches against the rest of the league.
 */
export function projectSeason(
  records: ClubRecord[],
  rivalFixtures: RivalFixture[],
  overrides: Record<string, number> = {},
): ProjectedClub[] {
  const bySlug = new Map(records.map((r) => [r.slug, r]));
  const leagueAverage =
    records.length > 0
      ? records.reduce((sum, r) => sum + pointsOf(r) / Math.max(1, r.played), 0) / records.length
      : 1.3;

  const ratingOf = (slug: string) => {
    if (overrides[slug] !== undefined) return overrides[slug];
    const club = bySlug.get(slug);
    if (!club) return leagueAverage;
    return pointsOf(club) / Math.max(1, club.played);
  };

  const expected = new Map<string, number>();
  const remaining = new Map<string, number>();

  for (const fixture of rivalFixtures) {
    const forecast = forecastFixture(ratingOf(fixture.home), ratingOf(fixture.away));
    expected.set(fixture.home, (expected.get(fixture.home) ?? 0) + forecast.homeExpectedPoints);
    remaining.set(fixture.home, (remaining.get(fixture.home) ?? 0) + 1);
    expected.set(fixture.away, (expected.get(fixture.away) ?? 0) + forecast.awayExpectedPoints);
    remaining.set(fixture.away, (remaining.get(fixture.away) ?? 0) + 1);
  }

  return records
    .filter((club) => club.tracked)
    .map((club) => {
      const expectedRemaining = expected.get(club.slug) ?? 0;
      return {
        slug: club.slug,
        name: club.name,
        played: club.played,
        points: pointsOf(club),
        goalDifference: goalDifference(club),
        remaining: remaining.get(club.slug) ?? 0,
        expectedRemaining,
        projectedFinal: pointsOf(club) + expectedRemaining,
      };
    })
    .sort((a, b) => b.projectedFinal - a.projectedFinal || b.goalDifference - a.goalDifference);
}
