// Promotion-race rivals: current records and remaining fixtures.
//
// This is the one block to update after each round. Seoul E-Land's own row
// must stay consistent with data/fixtures.yaml and matches.ts; the rest come
// from the K League table.
//
// RIVAL_FIXTURES lists every remaining fixture between and involving the
// tracked clubs, by round, using the slugs below. The projection model in
// seasonTracker.ts walks this list to produce expected points.

import type { ClubRecord, RivalFixture } from "./seasonTracker";

/** Human-readable date the standings snapshot is current through. */
export const STANDINGS_AS_OF = "Round 20 (2026-08-02)";

export const CLUB_RECORDS: ClubRecord[] = [];

export const RIVAL_FIXTURES: RivalFixture[] = [];
