import {
  getEnglishNationality,
  getEnglishPlayerName,
  getEnglishPosition,
  getPlayerSlug,
} from "./playerLocalisation";

export type OfficialPlayer = {
  playerSeq: number;
  korName: string;
  backNumber: string | number | null;
  nationality: string | null;
  position: string | null;
  birthday: string | null;
  height: string | number | null;
  weight: string | number | null;
};

type PlayerResponse = {
  resultCode: string;
  resultMsg: string;
  data: OfficialPlayer[];
};

/** Season totals as published by the club on each player's own page. */
export type OfficialPlayerStats = {
  appearances?: number;
  goals?: number;
  assists?: number;
  minutes?: number;
  /** The season the club is reporting, e.g. 2026. */
  season?: number;
};

export type OfficialPlayerWithPhoto = OfficialPlayer & {
  englishName: string;
  englishNationality: string;
  englishPosition: string;
  slug: string;
  photoUrl: string;
  stats: OfficialPlayerStats;
};

// The club labels the season block in Korean. Map the labels we care about;
// unknown labels are ignored rather than guessed at.
const STAT_LABELS: Record<string, keyof OfficialPlayerStats> = {
  "출장경기수": "appearances",
  "출장": "appearances",
  "골": "goals",
  "득점": "goals",
  "도움": "assists",
  "플레이 시간": "minutes",
  "플레이시간": "minutes",
};

function parseStats(detailHtml: string): OfficialPlayerStats {
  const stats: OfficialPlayerStats = {};

  const season = detailHtml.match(/<h2>\s*(\d{4})\s*시즌\s*성적\s*<\/h2>/);
  if (season) stats.season = Number(season[1]);

  const block = detailHtml.match(/<ul class="stats-box">([\s\S]*?)<\/ul>/);
  if (!block) return stats;

  for (const item of block[1].matchAll(/<p>([\s\S]*?)<\/p>\s*<strong>([\s\S]*?)<\/strong>/g)) {
    const label = item[1].replace(/<[^>]+>/g, "").trim();
    const key = STAT_LABELS[label];
    if (!key || key === "season") continue;
    const value = Number(item[2].replace(/<[^>]+>/g, "").replace(/[^\d.-]/g, ""));
    if (Number.isFinite(value)) stats[key] = value;
  }

  return stats;
}

// The roster API leaves birthday null for every player, but each player's own
// page carries it as 생년월일 in YYYY.MM.DD. Parse it there instead.
function parseBirthday(detailHtml: string): string | undefined {
  const match = detailHtml.match(/<h3>\s*생년월일\s*<\/h3>\s*<p>\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*<\/p>/);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function getOfficialPlayerDetail(player: OfficialPlayer) {
  const detailResponse = await fetch(`https://www.seoulelandfc.com/team/player/${player.playerSeq}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!detailResponse.ok) {
    throw new Error(
      `Failed to load official player page for ${player.korName}: ${detailResponse.status}`,
    );
  }

  const detailHtml = await detailResponse.text();
  const photoMatch = detailHtml.match(/<img src="([^"]*\/upload\/T_PLAYER\/[^"]+)"/);

  if (!photoMatch?.[1]) {
    throw new Error(`Official player page did not include a photo for ${player.korName}`);
  }

  // Stats are best-effort: a player with no minutes has an empty block, and a
  // layout change upstream should not take the whole build down over a photo
  // that parsed fine.
  return {
    photoUrl: photoMatch[1],
    stats: parseStats(detailHtml),
    birthday: parseBirthday(detailHtml),
  };
}

export async function getOfficialRoster() {
  const response = await fetch("https://www.seoulelandfc.com/api/team/player/player", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load Seoul E-Land roster: ${response.status}`);
  }

  const payload = (await response.json()) as PlayerResponse;

  if (payload.resultCode !== "200") {
    throw new Error(`Failed to load Seoul E-Land roster: ${payload.resultMsg}`);
  }

  return payload.data
    .filter((player) => player.backNumber != null && String(player.backNumber).trim() !== "")
    .sort((a, b) => Number(a.backNumber) - Number(b.backNumber));
}

export async function getOfficialRosterWithPhotos(): Promise<OfficialPlayerWithPhoto[]> {
  const roster = await getOfficialRoster();

  return Promise.all(
    roster.map(async (player) => {
      const detail = await getOfficialPlayerDetail(player);
      return {
        ...player,
        birthday: player.birthday ?? detail.birthday ?? null,
        englishName: getEnglishPlayerName(player.korName),
        englishNationality: getEnglishNationality(player.nationality),
        englishPosition: getEnglishPosition(player.position),
        slug: getPlayerSlug(player.korName),
        photoUrl: detail.photoUrl,
        stats: detail.stats,
      };
    }),
  );
}
