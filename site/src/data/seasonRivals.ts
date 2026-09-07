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

export const STANDINGS_AS_OF = "Round 25 (2026-09-06)";

export const CLUB_RECORDS: ClubRecord[] = [
  // Promotion contenders, shown in the race table.
  { slug: "suwon-samsung", name: "Suwon Samsung Bluewings", played: 24, won: 15, drawn: 5, lost: 4, goalsFor: 38, goalsAgainst: 20, tracked: true },
  { slug: "seoul-e-land", name: "Seoul E-Land", played: 24, won: 13, drawn: 6, lost: 5, goalsFor: 43, goalsAgainst: 28, tracked: true },
  { slug: "suwon-fc", name: "Suwon FC", played: 23, won: 12, drawn: 8, lost: 3, goalsFor: 46, goalsAgainst: 28, tracked: true },
  { slug: "daegu", name: "Daegu FC", played: 24, won: 12, drawn: 7, lost: 5, goalsFor: 44, goalsAgainst: 32, tracked: true },
  { slug: "hwaseong", name: "Hwaseong FC", played: 24, won: 11, drawn: 7, lost: 6, goalsFor: 37, goalsAgainst: 25, tracked: true },
  { slug: "busan-ipark", name: "Busan IPark", played: 24, won: 11, drawn: 5, lost: 8, goalsFor: 39, goalsAgainst: 33, tracked: true },

  // Rest of the division. Ratings only; not shown in the race table.
  { slug: "chungnam-asan", name: "Chungnam Asan", played: 23, won: 8, drawn: 7, lost: 8, goalsFor: 31, goalsAgainst: 29 },
  { slug: "gimpo", name: "Gimpo FC", played: 23, won: 7, drawn: 10, lost: 6, goalsFor: 28, goalsAgainst: 28 },
  { slug: "gyeongnam", name: "Gyeongnam FC", played: 23, won: 7, drawn: 9, lost: 7, goalsFor: 30, goalsAgainst: 30 },
  { slug: "seongnam", name: "Seongnam FC", played: 23, won: 7, drawn: 9, lost: 7, goalsFor: 26, goalsAgainst: 27 },
  { slug: "yongin", name: "Yongin FC", played: 23, won: 5, drawn: 11, lost: 7, goalsFor: 30, goalsAgainst: 32 },
  { slug: "paju", name: "Paju Frontier", played: 24, won: 7, drawn: 5, lost: 12, goalsFor: 22, goalsAgainst: 28 },
  { slug: "cheongju", name: "Chungbuk Cheongju", played: 24, won: 3, drawn: 14, lost: 7, goalsFor: 27, goalsAgainst: 39 },
  { slug: "cheonan", name: "Cheonan City", played: 24, won: 4, drawn: 10, lost: 10, goalsFor: 28, goalsAgainst: 33 },
  { slug: "ansan", name: "Ansan Greeners", played: 24, won: 6, drawn: 4, lost: 14, goalsFor: 25, goalsAgainst: 44 },
  { slug: "jeonnam", name: "Jeonnam Dragons", played: 23, won: 4, drawn: 8, lost: 11, goalsFor: 26, goalsAgainst: 38 },
  { slug: "gimhae", name: "Gimhae FC", played: 23, won: 2, drawn: 7, lost: 14, goalsFor: 19, goalsAgainst: 45 },
];

export const RIVAL_FIXTURES: RivalFixture[] = [
  // --- Round 26 ---
  { round: 26, home: "seoul-e-land", away: "suwon-samsung" },
  { round: 26, home: "busan-ipark", away: "gimhae" },
  { round: 26, home: "ansan", away: "hwaseong" },
  { round: 26, home: "suwon-fc", away: "cheonan" },
  { round: 26, home: "daegu", away: "yongin" },
  // --- Round 27 (Suwon Samsung bye) ---
  { round: 27, home: "seoul-e-land", away: "daegu" },
  { round: 27, home: "gimpo", away: "busan-ipark" },
  { round: 27, home: "seongnam", away: "hwaseong" },
  { round: 27, home: "jeonnam", away: "suwon-fc" },
  // --- Round 28 (Daegu bye) ---
  { round: 28, home: "suwon-fc", away: "hwaseong" },
  { round: 28, home: "gimpo", away: "seoul-e-land" },
  { round: 28, home: "suwon-samsung", away: "ansan" },
  { round: 28, home: "paju", away: "busan-ipark" },
  // --- Round 29 ---
  { round: 29, home: "suwon-samsung", away: "hwaseong" },
  { round: 29, home: "seoul-e-land", away: "gimhae" },
  { round: 29, home: "busan-ipark", away: "jeonnam" },
  { round: 29, home: "seongnam", away: "suwon-fc" },
  { round: 29, home: "daegu", away: "cheongju" },
  // --- Round 30 (Seoul E-Land bye) ---
  { round: 30, home: "seongnam", away: "suwon-samsung" },
  { round: 30, home: "busan-ipark", away: "gyeongnam" },
  { round: 30, home: "paju", away: "hwaseong" },
  { round: 30, home: "suwon-fc", away: "chungnam-asan" },
  { round: 30, home: "jeonnam", away: "daegu" },
  // --- Round 31 (Busan bye) ---
  { round: 31, home: "daegu", away: "suwon-samsung" },
  { round: 31, home: "yongin", away: "seoul-e-land" },
  { round: 31, home: "gyeongnam", away: "hwaseong" },
  { round: 31, home: "suwon-fc", away: "ansan" },
  // --- Round 32 ---
  { round: 32, home: "seoul-e-land", away: "jeonnam" },
  { round: 32, home: "suwon-samsung", away: "yongin" },
  { round: 32, home: "cheonan", away: "busan-ipark" },
  { round: 32, home: "gimhae", away: "hwaseong" },
  { round: 32, home: "suwon-fc", away: "gyeongnam" },
  { round: 32, home: "seongnam", away: "daegu" },
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
