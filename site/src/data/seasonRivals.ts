// K League 2 records and remaining fixtures for the promotion projection.
//
// ---------------------------------------------------------------------------
// HOW TO UPDATE AFTER EACH ROUND
//   1. Update the played/won/drawn/lost/goalsFor/goalsAgainst numbers in
//      CLUB_RECORDS from the league table.
//   2. Delete the fixtures that have now been played from REMAINING_FIXTURES.
//   3. Bump STANDINGS_AS_OF.
// Seoul E-Land's own row must match data/fixtures.yaml. Everything else comes
// from the published table.
// ---------------------------------------------------------------------------
//
// All 17 clubs are listed so that opponent strength in the model is a real
// rating rather than an assumption. Only clubs flagged `tracked: true` appear
// in the race table.
//
// REMAINING_FIXTURES holds every remaining fixture involving a tracked club,
// listed exactly once. Matches between two tracked clubs appear a single time.
// Bye rounds are simply absent: Suwon Samsung R27, Daegu R28, Seoul E-Land R30,
// Busan R31, Hwaseong R33. Suwon FC have used both byes and play every round.
//
// Sources: TheFishy K League 2 table and Transfermarkt club schedules,
// cross-checked against data/fixtures.yaml for every Seoul E-Land fixture.

import type { ClubRecord, RivalFixture } from "./seasonTracker";

export const STANDINGS_AS_OF = "Round 32, Saturday (2026-11-07)";

export const CLUB_RECORDS: ClubRecord[] = [
  // Promotion contenders, shown in the race table.
  { slug: "suwon-samsung", name: "Suwon Samsung Bluewings", played: 29, won: 19, drawn: 6, lost: 4, goalsFor: 50, goalsAgainst: 25, tracked: true },
  { slug: "seoul-e-land", name: "Seoul E-Land", played: 30, won: 17, drawn: 6, lost: 7, goalsFor: 57, goalsAgainst: 38, tracked: true },
  { slug: "suwon-fc", name: "Suwon FC", played: 30, won: 17, drawn: 9, lost: 4, goalsFor: 57, goalsAgainst: 31, tracked: true },
  { slug: "daegu", name: "Daegu FC", played: 30, won: 16, drawn: 8, lost: 6, goalsFor: 58, goalsAgainst: 40, tracked: true },
  { slug: "hwaseong", name: "Hwaseong FC", played: 31, won: 13, drawn: 9, lost: 9, goalsFor: 45, goalsAgainst: 33, tracked: true },
  { slug: "busan-ipark", name: "Busan IPark", played: 29, won: 14, drawn: 6, lost: 9, goalsFor: 47, goalsAgainst: 37, tracked: true },

  // Rest of the division. Ratings only; not shown in the race table.
  { slug: "chungnam-asan", name: "Chungnam Asan", played: 29, won: 11, drawn: 9, lost: 9, goalsFor: 41, goalsAgainst: 33 },
  { slug: "gimpo", name: "Gimpo FC", played: 30, won: 9, drawn: 12, lost: 9, goalsFor: 39, goalsAgainst: 41 },
  { slug: "gyeongnam", name: "Gyeongnam FC", played: 30, won: 9, drawn: 11, lost: 10, goalsFor: 33, goalsAgainst: 37 },
  { slug: "seongnam", name: "Seongnam FC", played: 30, won: 7, drawn: 11, lost: 12, goalsFor: 32, goalsAgainst: 40 },
  { slug: "yongin", name: "Yongin FC", played: 29, won: 7, drawn: 12, lost: 10, goalsFor: 38, goalsAgainst: 43 },
  { slug: "paju", name: "Paju Frontier", played: 29, won: 9, drawn: 7, lost: 13, goalsFor: 29, goalsAgainst: 35 },
  { slug: "cheongju", name: "Chungbuk Cheongju", played: 30, won: 6, drawn: 14, lost: 10, goalsFor: 36, goalsAgainst: 49 },
  { slug: "cheonan", name: "Cheonan City", played: 29, won: 6, drawn: 12, lost: 11, goalsFor: 37, goalsAgainst: 41 },
  { slug: "ansan", name: "Ansan Greeners", played: 31, won: 7, drawn: 5, lost: 19, goalsFor: 35, goalsAgainst: 59 },
  { slug: "jeonnam", name: "Jeonnam Dragons", played: 30, won: 5, drawn: 10, lost: 15, goalsFor: 37, goalsAgainst: 55 },
  { slug: "gimhae", name: "Gimhae FC", played: 30, won: 3, drawn: 9, lost: 18, goalsFor: 27, goalsAgainst: 61 },
];

export const RIVAL_FIXTURES: RivalFixture[] = [
  // --- Round 32 ---
  { round: 32, home: "suwon-samsung", away: "yongin" },
  { round: 32, home: "cheonan", away: "busan-ipark" },
  // --- Round 33 (Hwaseong bye) ---
  { round: 33, home: "seoul-e-land", away: "chungnam-asan" },
  { round: 33, home: "suwon-samsung", away: "gyeongnam" },
  { round: 33, home: "busan-ipark", away: "cheongju" },
  { round: 33, home: "gimpo", away: "suwon-fc" },
  { round: 33, home: "daegu", away: "gimhae" },
  // --- Round 34 ---
  { round: 34, home: "gyeongnam", away: "seoul-e-land" },
  { round: 34, home: "jeonnam", away: "suwon-samsung" },
  { round: 34, home: "chungnam-asan", away: "busan-ipark" },
  { round: 34, home: "gimpo", away: "hwaseong" },
  { round: 34, home: "suwon-fc", away: "cheongju" },
  { round: 34, home: "cheonan", away: "daegu" },
];
