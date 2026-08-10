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

export const STANDINGS_AS_OF = "Round 21 (2026-08-08)";

export const CLUB_RECORDS: ClubRecord[] = [
  // Promotion contenders, shown in the race table.
  { slug: "suwon-samsung", name: "Suwon Samsung Bluewings", played: 20, won: 12, drawn: 4, lost: 4, goalsFor: 29, goalsAgainst: 17, tracked: true },
  { slug: "seoul-e-land", name: "Seoul E-Land", played: 20, won: 11, drawn: 4, lost: 5, goalsFor: 36, goalsAgainst: 25, tracked: true },
  { slug: "suwon-fc", name: "Suwon FC", played: 19, won: 10, drawn: 6, lost: 3, goalsFor: 39, goalsAgainst: 24, tracked: true },
  { slug: "busan-ipark", name: "Busan IPark", played: 20, won: 11, drawn: 3, lost: 6, goalsFor: 37, goalsAgainst: 29, tracked: true },
  { slug: "daegu", name: "Daegu FC", played: 20, won: 10, drawn: 5, lost: 5, goalsFor: 39, goalsAgainst: 30, tracked: true },
  { slug: "hwaseong", name: "Hwaseong FC", played: 20, won: 10, drawn: 5, lost: 5, goalsFor: 34, goalsAgainst: 22, tracked: true },

  // Rest of the division. Ratings only; not shown in the race table.
  { slug: "gimpo", name: "Gimpo FC", played: 20, won: 7, drawn: 9, lost: 4, goalsFor: 25, goalsAgainst: 21 },
  { slug: "chungnam-asan", name: "Chungnam Asan", played: 20, won: 7, drawn: 7, lost: 6, goalsFor: 29, goalsAgainst: 24 },
  { slug: "gyeongnam", name: "Gyeongnam FC", played: 20, won: 6, drawn: 7, lost: 7, goalsFor: 27, goalsAgainst: 28 },
  { slug: "seongnam", name: "Seongnam FC", played: 19, won: 5, drawn: 8, lost: 6, goalsFor: 20, goalsAgainst: 22 },
  { slug: "yongin", name: "Yongin FC", played: 20, won: 4, drawn: 10, lost: 6, goalsFor: 25, goalsAgainst: 29 },
  { slug: "paju", name: "Paju Frontier", played: 20, won: 6, drawn: 3, lost: 11, goalsFor: 19, goalsAgainst: 25 },
  { slug: "cheonan", name: "Cheonan City", played: 20, won: 4, drawn: 8, lost: 8, goalsFor: 26, goalsAgainst: 29 },
  { slug: "cheongju", name: "Chungbuk Cheongju", played: 20, won: 2, drawn: 13, lost: 5, goalsFor: 23, goalsAgainst: 33 },
  { slug: "ansan", name: "Ansan Greeners", played: 20, won: 5, drawn: 4, lost: 11, goalsFor: 21, goalsAgainst: 37 },
  { slug: "jeonnam", name: "Jeonnam Dragons", played: 19, won: 2, drawn: 7, lost: 10, goalsFor: 21, goalsAgainst: 34 },
  { slug: "gimhae", name: "Gimhae FC", played: 19, won: 2, drawn: 5, lost: 12, goalsFor: 16, goalsAgainst: 37 },
];

export const RIVAL_FIXTURES: RivalFixture[] = [
  // --- Round 22 ---
  { round: 22, home: "suwon-samsung", away: "suwon-fc" },
  { round: 22, home: "busan-ipark", away: "hwaseong" },
  { round: 22, home: "seoul-e-land", away: "ansan" },
  { round: 22, home: "daegu", away: "chungnam-asan" },
  // --- Round 23 ---
  { round: 23, home: "daegu", away: "busan-ipark" },
  { round: 23, home: "seoul-e-land", away: "paju" },
  { round: 23, home: "cheonan", away: "suwon-samsung" },
  { round: 23, home: "jeonnam", away: "hwaseong" },
  { round: 23, home: "suwon-fc", away: "gimhae" },
  // --- Round 24 ---
  { round: 24, home: "suwon-fc", away: "busan-ipark" },
  { round: 24, home: "seongnam", away: "seoul-e-land" },
  { round: 24, home: "gimpo", away: "suwon-samsung" },
  { round: 24, home: "hwaseong", away: "cheongju" },
  { round: 24, home: "ansan", away: "daegu" },
  // --- Round 25 ---
  { round: 25, home: "cheongju", away: "seoul-e-land" },
  { round: 25, home: "suwon-samsung", away: "chungnam-asan" },
  { round: 25, home: "busan-ipark", away: "ansan" },
  { round: 25, home: "cheonan", away: "hwaseong" },
  { round: 25, home: "yongin", away: "suwon-fc" },
  { round: 25, home: "paju", away: "daegu" },
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
