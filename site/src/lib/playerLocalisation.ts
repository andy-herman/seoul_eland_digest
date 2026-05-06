export const ENGLISH_PLAYER_NAMES: Record<string, string> = {
  민성준: "Min Sung-jun",
  박재환: "Park Jae-hwan",
  강민재: "Kang Min-jae",
  박진영: "Park Jin-young",
  오스마르: "Osmar",
  백지웅: "Baek Ji-woong",
  에울레르: "Euller",
  김현: "Kim Hyun",
  아이데일: "John Iredale",
  까리우스: "Alan Cariús",
  변경준: "Byeon Gyeong-jun",
  오인표: "Oh In-pyo",
  강현제: "Kang Hyeon-je",
  강영석: "Kang Young-seok",
  박재용: "Park Jae-yong",
  최랑: "Choi Rang",
  엄예훈: "Eom Ye-hun",
  김주환: "Kim Joo-hwan",
  김오규: "Kim Oh-kyu",
  서진석: "Seo Jin-seok",
  조준현: "Cho Jun-hyun",
  배서준: "Bae Seo-jun",
  윤석주: "Yoon Seok-ju",
  양승민: "Yang Seung-min",
  박선우: "Park Sun-woo",
  정연원: "Jeong Yeon-won",
  김현우: "Kim Hyun-woo",
  박창환: "Park Chang-hwan",
  황재윤: "Hwang Jae-yun",
  손혁찬: "Son Hyuk-chan",
  이주혁: "Lee Ju-hyeok",
  안주완: "Ahn Joo-wan",
  김태산: "Kim Tae-san",
  배진우: "Bae Jin-woo",
  제랄데스: "Francisco Geraldes",
  가브리엘: "Gabriel Santos",
  김우빈: "Kim Woo-bin",
};

const ENGLISH_NATIONALITIES: Record<string, string> = {
  대한민국: "South Korea",
  스페인: "Spain",
  브라질: "Brazil",
  호주: "Australia",
  포르투갈: "Portugal",
};

const ENGLISH_POSITIONS: Record<string, string> = {
  GK: "Goalkeeper",
  DF: "Defender",
  MF: "Midfielder",
  FW: "Forward",
  AM: "Attacker",
  OT: "Staff",
};

export function getEnglishPlayerName(koreanName: string) {
  return ENGLISH_PLAYER_NAMES[koreanName] ?? koreanName;
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getPlayerSlug(koreanName: string) {
  return slugify(getEnglishPlayerName(koreanName));
}

export function getEnglishNationality(nationality: string | null) {
  if (!nationality) {
    return "—";
  }

  return ENGLISH_NATIONALITIES[nationality] ?? nationality;
}

export function getEnglishPosition(position: string | null) {
  if (!position) {
    return "Player";
  }

  return ENGLISH_POSITIONS[position] ?? position;
}
