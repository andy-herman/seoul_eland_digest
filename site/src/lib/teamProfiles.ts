import { getTeamLogo } from "./teamLogos";
import { withBase } from "./paths";

export type TeamProfile = {
  slug: string;
  name: string;
  shortName: string;
  location: string;
  category: "club" | "competition";
  summary: string;
  fanNote: string;
  logo?: string;
};

const TEAM_PROFILES: TeamProfile[] = ([
  {
    slug: "k-league-2-2026",
    name: "K League 2 2026",
    shortName: "K League 2",
    location: "South Korea",
    category: "competition",
    summary:
      "South Korea's second tier is the weekly promotion race Seoul E-Land are trying to escape.",
    fanNote:
      "For English-language readers, the important context is simple: every dropped point matters because the playoff picture can change quickly.",
    logo: "/assets/crest.png",
  },
  {
    slug: "ansan-greeners",
    name: "Ansan Greeners",
    shortName: "Ansan",
    location: "Ansan",
    category: "club",
    summary: "A Gyeonggi-based K League 2 side and regular league opponent.",
    fanNote: "Matches against Ansan are the kind Seoul E-Land need to control if they want to stay in the promotion conversation.",
  },
  {
    slug: "busan-ipark",
    name: "Busan IPark",
    shortName: "Busan",
    location: "Busan",
    category: "club",
    summary: "One of the bigger names in the division, with top-flight history and promotion expectations.",
    fanNote: "Busan games are useful measuring sticks because they usually test Seoul E-Land's defensive shape and transition control.",
  },
  {
    slug: "cheonan",
    name: "Cheonan",
    shortName: "Cheonan",
    location: "Cheonan",
    category: "club",
    summary: "A K League 2 opponent that can turn matches into physical, low-margin contests.",
    fanNote: "These fixtures often reveal whether Seoul E-Land can turn territorial control into clear chances.",
  },
  {
    slug: "chungnam-asan",
    name: "Chungnam Asan",
    shortName: "Asan",
    location: "Asan",
    category: "club",
    summary: "A disciplined K League 2 club from South Chungcheong Province.",
    fanNote: "Away trips to Asan tend to be useful tests of rotation, defensive concentration, and set-piece detail.",
  },
  {
    slug: "daegu",
    name: "Daegu",
    shortName: "Daegu",
    location: "Daegu",
    category: "club",
    summary: "A club with recent top-flight pedigree, making any meeting a useful benchmark.",
    fanNote: "When Daegu appear on the schedule, Seoul E-Land need to show they can handle pace and pressure from a more established side.",
  },
  {
    slug: "gimpo-citizen",
    name: "Gimpo Citizen",
    shortName: "Gimpo",
    location: "Gimpo",
    category: "club",
    summary: "A compact, competitive K League 2 opponent from Gyeonggi Province.",
    fanNote: "Gimpo matches often become awkward and scrappy, which makes game management just as important as chance creation.",
  },
  {
    slug: "gyeongnam",
    name: "Gyeongnam",
    shortName: "Gyeongnam",
    location: "Changwon / Gyeongnam",
    category: "club",
    summary: "A familiar K League 2 opponent with enough quality to punish loose possession.",
    fanNote: "These games are a good read on whether Seoul E-Land's midfield can protect the back line.",
  },
  {
    slug: "hwaseong-fc",
    name: "Hwaseong FC",
    shortName: "Hwaseong",
    location: "Hwaseong",
    category: "club",
    summary: "A rising Gyeonggi club whose matches can expose concentration lapses.",
    fanNote: "Hwaseong are a reminder that promotion pushes are not only decided against the biggest names.",
  },
  {
    slug: "paju-frontier",
    name: "Paju Frontier",
    shortName: "Paju",
    location: "Paju",
    category: "club",
    summary: "A Paju-based opponent that gives the schedule a local Gyeonggi edge.",
    fanNote: "These are the matches where Seoul E-Land's set pieces and bench impact should show up.",
  },
  {
    slug: "suwon-bluewings",
    name: "Suwon Bluewings",
    shortName: "Suwon Bluewings",
    location: "Suwon",
    category: "club",
    summary: "One of Korean football's marquee clubs and a major promotion-race reference point.",
    fanNote: "For Seoul E-Land fans, Suwon are a measuring stick for whether the team can handle high-pressure, high-attention fixtures.",
  },
  {
    slug: "suwon-fc",
    name: "Suwon FC",
    shortName: "Suwon FC",
    location: "Suwon",
    category: "club",
    summary: "A Suwon-based club whose games bring another tough Gyeonggi matchup.",
    fanNote: "Suwon FC fixtures are useful tests of Seoul E-Land's spacing, second-ball work, and ability to defend direct attacks.",
  },
  {
    slug: "yongin",
    name: "Yongin FC",
    shortName: "Yongin",
    location: "Yongin",
    category: "club",
    summary: "A new K League 2 club from Yongin, adding another Gyeonggi opponent to the calendar.",
    fanNote: "Expansion and new-club fixtures can be tricky: Seoul E-Land still need to show control, not just rely on experience.",
  },
] as TeamProfile[]).map((team) => ({
  ...team,
  logo: team.logo ? withBase(team.logo) : getTeamLogo(team.name) ?? getTeamLogo(team.shortName),
}));

export function getTeamProfiles() {
  return TEAM_PROFILES;
}

export function getTeamProfile(slug: string) {
  return TEAM_PROFILES.find((team) => team.slug === slug);
}
