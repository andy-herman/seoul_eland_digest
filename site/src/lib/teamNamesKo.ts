export type TeamNameStyle = "full" | "short";

type TeamKo = { full: string; short: string };

const TEAM_NAMES_KO: Record<string, TeamKo> = {
  "Seoul E-Land FC": { full: "서울 이랜드 FC", short: "서울 이랜드" },
  "Seoul E-Land": { full: "서울 이랜드 FC", short: "서울 이랜드" },
  "Ansan Greeners": { full: "안산 그리너스", short: "안산" },
  "Busan IPark": { full: "부산 아이파크", short: "부산" },
  Cheonan: { full: "천안 시티 FC", short: "천안" },
  "Cheonan City": { full: "천안 시티 FC", short: "천안" },
  "Chungnam Asan": { full: "충남아산 FC", short: "충남아산" },
  "Chungbuk Cheongju": { full: "충북청주 FC", short: "충북청주" },
  Daegu: { full: "대구 FC", short: "대구" },
  "Daegu FC": { full: "대구 FC", short: "대구" },
  "Gimpo Citizen": { full: "김포 FC", short: "김포" },
  "Gimpo FC": { full: "김포 FC", short: "김포" },
  "Gimhae FC": { full: "김해 FC", short: "김해" },
  Gyeongnam: { full: "경남 FC", short: "경남" },
  "Gyeongnam FC": { full: "경남 FC", short: "경남" },
  "Hwaseong FC": { full: "화성 FC", short: "화성" },
  "Jeonnam Dragons": { full: "전남 드래곤즈", short: "전남" },
  "Paju Frontier": { full: "파주 프런티어 FC", short: "파주" },
  "Seongnam FC": { full: "성남 FC", short: "성남" },
  "Suwon Bluewings": { full: "수원 삼성", short: "수원 삼성" },
  "Suwon Samsung": { full: "수원 삼성", short: "수원 삼성" },
  "Suwon FC": { full: "수원FC", short: "수원FC" },
  Yongin: { full: "용인 FC", short: "용인" },
  "Yongin FC": { full: "용인 FC", short: "용인" },
};

const STADIUM_NAMES_KO: Record<string, string> = {
  "Mokdong Stadium": "목동종합운동장",
  "Mokdong Sports Complex": "목동종합운동장",
  "Suwon World Cup Stadium": "수원월드컵경기장",
  "Busan Asiad Main Stadium": "부산아시아드주경기장",
  "Gwangyang Football Stadium": "광양축구전용구장",
  "Tancheon Stadium": "탄천종합운동장",
  "Ansan Wa~ Stadium": "안산 와~스타디움",
  "Gimpo Salter Soccer Field": "김포솔터축구장",
  "Hwaseong Stadium": "화성종합경기타운",
  "Cheonan Stadium": "천안종합운동장",
  "Daegu iM Bank Park": "대구iM뱅크PARK",
  "Paju Stadium": "파주스타디움",
  "Ansan Wa Stadium": "안산 와~스타디움",
  "Asan Yi Sun-sin Stadium": "이순신종합운동장",
  "Gimhae Stadium": "김해종합운동장",
  "Suwon Sports Complex": "수원종합운동장",
  "Busan Gudeok Stadium": "부산구덕운동장",
  "Hwaseong Sports Complex": "화성종합경기타운",
  "Cheongju Stadium": "청주종합경기장",
  "Gimpo Solteo Football Field": "김포솔터축구장",
  "Yongin Mireu Stadium": "용인미르스타디움",
  "Changwon Football Center": "창원축구센터",
};

export const MASCOTS_KO = { leoul: "레울", lenyang: "레냥" } as const;

export function koTeam(name: string, style: TeamNameStyle = "full") {
  return TEAM_NAMES_KO[name]?.[style] ?? name;
}

export function stadiumKo(name?: string) {
  if (!name) return "경기장 미정";
  return STADIUM_NAMES_KO[name] ?? name;
}
