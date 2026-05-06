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

export type OfficialPlayerWithPhoto = OfficialPlayer & {
  englishName: string;
  englishNationality: string;
  englishPosition: string;
  slug: string;
  photoUrl: string;
};

async function getOfficialPhotoUrl(player: OfficialPlayer) {
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

  return photoMatch[1];
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
    roster.map(async (player) => ({
      ...player,
      englishName: getEnglishPlayerName(player.korName),
      englishNationality: getEnglishNationality(player.nationality),
      englishPosition: getEnglishPosition(player.position),
      slug: getPlayerSlug(player.korName),
      photoUrl: await getOfficialPhotoUrl(player),
    })),
  );
}
