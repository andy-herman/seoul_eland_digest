import { withBase } from "./paths";

export function normaliseTeamName(teamName: string) {
  return teamName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const RAW_TEAM_LOGOS: Record<string, string> = {
  "Ansan Greeners": "/assets/teams/ansan-greeners.svg",
  "Busan IPark": "/assets/teams/busan-ipark.svg",
  Cheonan: "/assets/teams/cheonan.svg",
  "Chungnam Asan": "/assets/teams/chungnam-asan.svg",
  Daegu: "/assets/teams/daegu.svg",
  "Gimpo Citizen": "/assets/teams/gimpo-citizen.svg",
  Gyeongnam: "/assets/teams/gyeongnam.svg",
  "Hwaseong FC": "/assets/teams/hwaseong-fc.svg",
  "Paju Frontier": "/assets/teams/paju-frontier.png",
  "Seoul E-Land FC": "/assets/crest.png",
  "Seongnam FC": "/assets/teams/seongnam-fc.png",
  Seongnam: "/assets/teams/seongnam-fc.png",
  "Suwon Bluewings": "/assets/teams/suwon-bluewings.svg",
  "Suwon FC": "/assets/teams/suwon-fc.png",
  "Jeonnam Dragons": "/assets/teams/jeonnam-dragons.png",
  Jeonnam: "/assets/teams/jeonnam-dragons.png",
  "Chungbuk Cheongju": "/assets/teams/chungbuk-cheongju.png",
  Cheongju: "/assets/teams/chungbuk-cheongju.png",
  "Gimhae FC": "/assets/teams/gimhae-fc.png",
  Gimhae: "/assets/teams/gimhae-fc.png",
  Yongin: "/assets/teams/yongin-fc.svg",
  "Yongin FC": "/assets/teams/yongin-fc.svg",
};

const TEAM_LOGOS = Object.fromEntries(
  Object.entries(RAW_TEAM_LOGOS).map(([teamName, logo]) => [normaliseTeamName(teamName), logo]),
);

export function getTeamLogo(teamName: string) {
  const logo = TEAM_LOGOS[normaliseTeamName(teamName)];
  return logo ? withBase(logo) : undefined;
}

export function getTeamInitials(teamName: string) {
  return teamName
    .replace(/\b(fc|ipark)\b/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
