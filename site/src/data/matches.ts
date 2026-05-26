export type MatchVenue = "home" | "away" | "neutral";

export type MatchFixture = {
  round: number;
  date: string;
  time: string;
  venue: MatchVenue;
  opponent: string;
  result: string;
  stadium: string;
  homeScore?: number;
  awayScore?: number;
};

export type ScheduleSection = {
  id: string;
  label: string;
  rounds: readonly [number, number];
  status: "published" | "pending";
};

export const season = 2026;
export const team = "Seoul E-Land FC";
export const sourceUrl = "https://www.kleague.com/schedule.do?leagueId=2&year=2026";
export const byeRounds = [17, 30] as const;

export const scheduleSections: ScheduleSection[] = [
  {
    id: "round-robin-1",
    label: "Round robin 1",
    rounds: [1, 17],
    status: "published",
  },
  {
    id: "round-robin-2",
    label: "Round robin 2",
    rounds: [18, 34],
    status: "published",
  },
];

// Source: K League official schedule API, fetched from the public 2026 K League 2 calendar.
export const fixtures: MatchFixture[] = [
  {
    round: 1,
    date: "2026-02-28",
    time: "16:30",
    venue: "away",
    opponent: "Suwon Bluewings",
    stadium: "Suwon World Cup Stadium",
    homeScore: 2,
    awayScore: 1,
    result: "L 1-2",
  },
  {
    round: 2,
    date: "2026-03-07",
    time: "14:00",
    venue: "home",
    opponent: "Gyeongnam",
    stadium: "Mokdong Stadium",
    homeScore: 1,
    awayScore: 0,
    result: "W 1-0",
  },
  {
    round: 3,
    date: "2026-03-14",
    time: "14:00",
    venue: "home",
    opponent: "Busan IPark",
    stadium: "Mokdong Stadium",
    homeScore: 2,
    awayScore: 3,
    result: "L 2-3",
  },
  {
    round: 4,
    date: "2026-03-21",
    time: "16:30",
    venue: "away",
    opponent: "Cheonan",
    stadium: "Cheonan Stadium",
    homeScore: 0,
    awayScore: 0,
    result: "D 0-0",
  },
  {
    round: 5,
    date: "2026-03-29",
    time: "16:30",
    venue: "away",
    opponent: "Daegu",
    stadium: "Daegu iM Bank Park",
    homeScore: 1,
    awayScore: 3,
    result: "W 3-1",
  },
  {
    round: 6,
    date: "2026-04-04",
    time: "14:00",
    venue: "home",
    opponent: "Suwon FC",
    stadium: "Mokdong Stadium",
    homeScore: 3,
    awayScore: 0,
    result: "W 3-0",
  },
  {
    round: 7,
    date: "2026-04-11",
    time: "16:30",
    venue: "away",
    opponent: "Paju Frontier",
    stadium: "Paju Stadium",
    homeScore: 1,
    awayScore: 3,
    result: "W 3-1",
  },
  {
    round: 8,
    date: "2026-04-19",
    time: "14:00",
    venue: "away",
    opponent: "Ansan Greeners",
    stadium: "Ansan Wa Stadium",
    homeScore: 0,
    awayScore: 2,
    result: "W 2-0",
  },
  {
    round: 9,
    date: "2026-04-26",
    time: "14:00",
    venue: "home",
    opponent: "Hwaseong FC",
    stadium: "Mokdong Stadium",
    homeScore: 1,
    awayScore: 2,
    result: "L 1-2",
  },
  {
    round: 10,
    date: "2026-05-03",
    time: "14:00",
    venue: "home",
    opponent: "Gimpo Citizen",
    stadium: "Mokdong Stadium",
    homeScore: 2,
    awayScore: 1,
    result: "W 2-1",
  },
  {
    round: 11,
    date: "2026-05-09",
    time: "14:00",
    venue: "away",
    opponent: "Chungnam Asan",
    stadium: "Asan Yi Sun-sin Stadium",
    result: "L 0-3",
    homeScore: 3,
    awayScore: 0,
  },
  {
    round: 12,
    date: "2026-05-16",
    time: "16:30",
    venue: "home",
    opponent: "Yongin",
    stadium: "Mokdong Stadium",
    result: "D 2-2",
    homeScore: 2,
    awayScore: 2,
  },
  { round: 13, date: "2026-05-24", time: "19:00", venue: "home", opponent: "Seongnam FC", stadium: "Mokdong Stadium", homeScore: 3, awayScore: 1, result: "W 3-1" },
  { round: 14, date: "2026-05-31", time: "16:30", venue: "away", opponent: "Jeonnam Dragons", stadium: "Gwangyang Football Stadium", result: "TBD" },
  { round: 15, date: "2026-06-07", time: "19:30", venue: "home", opponent: "Chungbuk Cheongju", stadium: "Mokdong Stadium", result: "TBD" },
  { round: 16, date: "2026-07-05", time: "19:30", venue: "away", opponent: "Gimhae FC", stadium: "Gimhae Stadium", result: "TBD" },
  { round: 18, date: "2026-07-18", time: "19:30", venue: "away", opponent: "Suwon FC", stadium: "Suwon Sports Complex", result: "TBD" },
  { round: 19, date: "2026-07-24", time: "19:30", venue: "home", opponent: "Cheonan", stadium: "Mokdong Stadium", result: "TBD" },
  { round: 20, date: "2026-08-02", time: "19:30", venue: "away", opponent: "Busan IPark", stadium: "Busan Gudeok Stadium", result: "TBD" },
  { round: 21, date: "2026-08-07", time: "19:30", venue: "away", opponent: "Hwaseong FC", stadium: "Hwaseong Sports Complex", result: "TBD" },
  { round: 22, date: "2026-08-16", time: "19:30", venue: "home", opponent: "Ansan Greeners", stadium: "Mokdong Stadium", result: "TBD" },
  { round: 23, date: "2026-08-23", time: "19:30", venue: "home", opponent: "Paju Frontier", stadium: "Mokdong Stadium", result: "TBD" },
  { round: 24, date: "2026-08-29", time: "19:30", venue: "away", opponent: "Seongnam FC", stadium: "Tancheon Stadium", result: "TBD" },
  { round: 25, date: "2026-09-04", time: "19:30", venue: "away", opponent: "Chungbuk Cheongju", stadium: "Cheongju Stadium", result: "TBD" },
  { round: 26, date: "2026-09-12", time: "16:30", venue: "home", opponent: "Suwon Bluewings", stadium: "Mokdong Stadium", result: "TBD" },
  { round: 27, date: "2026-09-19", time: "19:00", venue: "home", opponent: "Daegu", stadium: "Mokdong Stadium", result: "TBD" },
  { round: 28, date: "2026-10-09", time: "16:30", venue: "away", opponent: "Gimpo Citizen", stadium: "Gimpo Solteo Football Field", result: "TBD" },
  { round: 29, date: "2026-10-18", time: "14:00", venue: "home", opponent: "Gimhae FC", stadium: "Mokdong Stadium", result: "TBD" },
  { round: 31, date: "2026-10-31", time: "14:00", venue: "away", opponent: "Yongin", stadium: "Yongin Mireu Stadium", result: "TBD" },
  { round: 32, date: "2026-11-07", time: "16:30", venue: "home", opponent: "Jeonnam Dragons", stadium: "Mokdong Stadium", result: "TBD" },
  { round: 33, date: "2026-11-22", time: "16:30", venue: "home", opponent: "Chungnam Asan", stadium: "Mokdong Stadium", result: "TBD" },
  { round: 34, date: "2026-11-29", time: "TBD", venue: "away", opponent: "Gyeongnam", stadium: "Changwon Football Center", result: "TBD" },
];
