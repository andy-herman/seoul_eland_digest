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

export const STANDINGS_AS_OF = "Round 29 (2026-10-18)";

export const CLUB_RECORDS: ClubRecord[] = [
  // Promotion contenders, shown in the race table.
  { slug: "suwon-samsung", name: "Suwon Samsung Bluewings", played: 27, won: 18, drawn: 5, lost: 4, goalsFor: 46, goalsAgainst: 23, tracked: true },
  { slug: "seoul-e-land", name: "Seoul E-Land", played: 28, won: 16, drawn: 6, lost: 6, goalsFor: 52, goalsAgainst: 32, tracked: true },
  { slug: "suwon-fc", name: "Suwon FC", played: 27, won: 15, drawn: 9, lost: 3, goalsFor: 53, goalsAgainst: 30, tracked: true },
  { slug: "daegu", name: "Daegu FC", played: 27, won: 14, drawn: 7, lost: 6, goalsFor: 51, goalsAgainst: 36, tracked: true },
  { slug: "hwaseong", name: "Hwaseong FC", played: 28, won: 12, drawn: 8, lost: 8, goalsFor: 43, goalsAgainst: 31, tracked: true },
  { slug: "busan-ipark", name: "Busan IPark", played: 28, won: 13, drawn: 6, lost: 9, goalsFor: 44, goalsAgainst: 36, tracked: true },

  // Rest of the division. Ratings only; not shown in the race table.
  { slug: "chungnam-asan", name: "Chungnam Asan", played: 27, won: 9, drawn: 9, lost: 9, goalsFor: 35, goalsAgainst: 32 },
  { slug: "gimpo", name: "Gimpo FC", played: 27, won: 9, drawn: 11, lost: 7, goalsFor: 35, goalsAgainst: 32 },
  { slug: "gyeongnam", name: "Gyeongnam FC", played: 27, won: 8, drawn: 11, lost: 8, goalsFor: 31, goalsAgainst: 31 },
  { slug: "seongnam", name: "Seongnam FC", played: 27, won: 7, drawn: 10, lost: 10, goalsFor: 30, goalsAgainst: 35 },
  { slug: "yongin", name: "Yongin FC", played: 27, won: 5, drawn: 12, lost: 10, goalsFor: 32, goalsAgainst: 41 },
  { slug: "paju", name: "Paju Frontier", played: 27, won: 8, drawn: 6, lost: 13, goalsFor: 26, goalsAgainst: 33 },
  { slug: "cheongju", name: "Chungbuk Cheongju", played: 28, won: 6, drawn: 14, lost: 8, goalsFor: 35, goalsAgainst: 45 },
  { slug: "cheonan", name: "Cheonan City", played: 27, won: 5, drawn: 11, lost: 11, goalsFor: 31, goalsAgainst: 37 },
  { slug: "ansan", name: "Ansan Greeners", played: 28, won: 7, drawn: 4, lost: 17, goalsFor: 32, goalsAgainst: 53 },
  { slug: "jeonnam", name: "Jeonnam Dragons", played: 27, won: 5, drawn: 9, lost: 13, goalsFor: 31, goalsAgainst: 46 },
  { slug: "gimhae", name: "Gimhae FC", played: 27, won: 2, drawn: 8, lost: 17, goalsFor: 22, goalsAgainst: 56 },
];

export const RIVAL_FIXTURES: RivalFixture[] = [
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
