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

export const STANDINGS_AS_OF = "Round 28 (2026-10-11)";

export const CLUB_RECORDS: ClubRecord[] = [
  // Promotion contenders, shown in the race table.
  { slug: "suwon-samsung", name: "Suwon Samsung Bluewings", played: 26, won: 17, drawn: 5, lost: 4, goalsFor: 43, goalsAgainst: 21, tracked: true },
  { slug: "seoul-e-land", name: "Seoul E-Land", played: 27, won: 15, drawn: 6, lost: 6, goalsFor: 46, goalsAgainst: 30, tracked: true },
  { slug: "suwon-fc", name: "Suwon FC", played: 26, won: 14, drawn: 9, lost: 3, goalsFor: 51, goalsAgainst: 29, tracked: true },
  { slug: "daegu", name: "Daegu FC", played: 26, won: 13, drawn: 7, lost: 6, goalsFor: 48, goalsAgainst: 35, tracked: true },
  { slug: "hwaseong", name: "Hwaseong FC", played: 27, won: 12, drawn: 8, lost: 7, goalsFor: 41, goalsAgainst: 28, tracked: true },
  { slug: "busan-ipark", name: "Busan IPark", played: 27, won: 12, drawn: 6, lost: 9, goalsFor: 42, goalsAgainst: 35, tracked: true },

  // Rest of the division. Ratings only; not shown in the race table.
  { slug: "chungnam-asan", name: "Chungnam Asan", played: 26, won: 9, drawn: 8, lost: 9, goalsFor: 35, goalsAgainst: 32 },
  { slug: "gimpo", name: "Gimpo FC", played: 26, won: 8, drawn: 11, lost: 7, goalsFor: 31, goalsAgainst: 31 },
  { slug: "gyeongnam", name: "Gyeongnam FC", played: 26, won: 8, drawn: 10, lost: 8, goalsFor: 31, goalsAgainst: 31 },
  { slug: "seongnam", name: "Seongnam FC", played: 26, won: 7, drawn: 10, lost: 9, goalsFor: 29, goalsAgainst: 33 },
  { slug: "yongin", name: "Yongin FC", played: 26, won: 5, drawn: 12, lost: 9, goalsFor: 32, goalsAgainst: 37 },
  { slug: "paju", name: "Paju Frontier", played: 26, won: 8, drawn: 6, lost: 12, goalsFor: 25, goalsAgainst: 29 },
  { slug: "cheongju", name: "Chungbuk Cheongju", played: 27, won: 6, drawn: 14, lost: 7, goalsFor: 34, goalsAgainst: 42 },
  { slug: "cheonan", name: "Cheonan City", played: 27, won: 5, drawn: 11, lost: 11, goalsFor: 31, goalsAgainst: 37 },
  { slug: "ansan", name: "Ansan Greeners", played: 27, won: 6, drawn: 4, lost: 17, goalsFor: 28, goalsAgainst: 53 },
  { slug: "jeonnam", name: "Jeonnam Dragons", played: 26, won: 5, drawn: 9, lost: 12, goalsFor: 30, goalsAgainst: 44 },
  { slug: "gimhae", name: "Gimhae FC", played: 26, won: 2, drawn: 8, lost: 16, goalsFor: 20, goalsAgainst: 50 },
];

export const RIVAL_FIXTURES: RivalFixture[] = [
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
