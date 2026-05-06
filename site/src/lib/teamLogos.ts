import { withBase } from "./paths";

const TEAM_LOGOS: Record<string, string> = {
  "ansan greeners": "/assets/teams/ansan-greeners.svg",
  "busan ipark": "/assets/teams/busan-ipark.svg",
  cheonan: "/assets/teams/cheonan.svg",
  "chungnam asan": "/assets/teams/chungnam-asan.svg",
  daegu: "/assets/teams/daegu.svg",
  "gimpo citizen": "/assets/teams/gimpo-citizen.svg",
  gyeongnam: "/assets/teams/gyeongnam.svg",
  "hwaseong fc": "/assets/teams/hwaseong-fc.svg",
  "paju frontier": "/assets/teams/paju-frontier.png",
  "seoul e-land fc": "/assets/crest.png",
  "suwon bluewings": "/assets/teams/suwon-bluewings.svg",
  "suwon fc": "/assets/teams/suwon-fc.png",
  yongin: "/assets/teams/yongin-fc.svg",
  "yongin fc": "/assets/teams/yongin-fc.svg",
};

export function normaliseTeamName(teamName: string) {
  return teamName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

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
