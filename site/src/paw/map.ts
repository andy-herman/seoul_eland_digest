// t / tp: text on the page (EN / PT) that the paw sits beside, so pages with several paws keep them apart
export type SitePaw = { id: string; n: number; c: 1 | 2 | 3; p: string; pp?: string; s: string; t?: string; tp?: string };
export const PAW_TOTAL = 21;
export const SITE_PAWS: SitePaw[] = [
  { id: "tracker-31-points", n: 1, c: 1, p: "/tracker/", pp: "/pt/tracker/", s: "main h1, main h2" },
  { id: "matches-results-source", n: 2, c: 1, p: "/matches/", pp: "/pt/matches/", s: "main h1, main h2" },
  { id: "squad-card-links", n: 3, c: 1, p: "/players/", pp: "/pt/players/", s: "main h1, main h2" },
  { id: "matchday-omokgyo", n: 4, c: 1, p: "/guides/mokdong-stadium-matchday-guide/", s: "main h2", t: "Line 5 to Omokgyo Station" },
  { id: "games-six-mascots", n: 5, c: 1, p: "/play/", pp: "/pt/play/", s: "main h1, main h2" },
  { id: "korean-cup-round-two", n: 6, c: 1, p: "/korean-cup/what-is-the-korean-cup/", pp: "/pt/korean-cup/what-is-the-korean-cup/", s: "main h2", t: "enter at Round 2 on July 15", tp: "entram na 2ª Fase em 15 de julho" },
  { id: "home-ground-basics", n: 7, c: 1, p: "/places/mokdong-stadium/", s: "main h1, main h2" },
  { id: "euller-left-foot", n: 8, c: 2, p: "/players/euller/", pp: "/pt/players/euller/", s: "main h1, main h2" },
  { id: "park-jae-yong-leading-scorer", n: 9, c: 2, p: "/players/park-jae-yong/", pp: "/pt/players/park-jae-yong/", s: "main h1, main h2" },
  { id: "kim-oh-kyu-captain", n: 10, c: 2, p: "/players/kim-oh-kyu/", pp: "/pt/players/kim-oh-kyu/", s: "main h1, main h2" },
  { id: "min-sung-jun-every-match", n: 11, c: 2, p: "/players/min-sung-jun/", pp: "/pt/players/min-sung-jun/", s: "main h1, main h2" },
  { id: "caio-left-footed", n: 12, c: 2, p: "/players/caio-marcelo/", pp: "/pt/players/caio-marcelo/", s: "main h1, main h2" },
  { id: "alan-round-19", n: 13, c: 2, p: "/players/alan-carius/", pp: "/pt/players/alan-carius/", s: "main h1, main h2" },
  { id: "baek-unlikely-goals", n: 14, c: 2, p: "/players/baek-ji-woong/", pp: "/pt/players/baek-ji-woong/", s: "main h1, main h2" },
  { id: "fc-seoul-borrowed-mokdong", n: 15, c: 3, p: "/guides/mokdong-stadium-matchday-guide/", s: "main h2", t: "FC Seoul borrowed it for AFC Champions League matches" },
  { id: "korean-cup-exit", n: 16, c: 3, p: "/korean-cup/what-is-the-korean-cup/", pp: "/pt/korean-cup/what-is-the-korean-cup/", s: "main h2", t: "Ulsan Citizen won 4-2 after extra time", tp: "venceu por 4 a 2 na prorrogação" },
  { id: "promotion-final-60", n: 17, c: 3, p: "/articles/2026-second-round-robin-playoff-run-in-preview/", pp: "/pt/articles/2026-second-round-robin-playoff-run-in-preview/", s: "main h1, main h2" },
  { id: "record-crowd-suwon", n: 18, c: 3, p: "/guides/mokdong-stadium-matchday-guide/", s: "main h2", t: "record home crowd of 9,527" },
  { id: "daegu-round-27", n: 19, c: 3, p: "/rounds/2026-r27_seoul_e-land_digest/", pp: "/pt/rounds/2026-r27_seoul_e-land_digest/", s: "main h1, main h2" },
  { id: "chasing-k1-22-percent", n: 20, c: 3, p: "/articles/2026-chasing-k1-weekly-01/", pp: "/pt/articles/2026-chasing-k1-weekly-01/", s: "main h1, main h2" },
  { id: "team-suwon-bluewings", n: 21, c: 3, p: "/teams/suwon-bluewings/", s: "main h1, main h2" },
];
