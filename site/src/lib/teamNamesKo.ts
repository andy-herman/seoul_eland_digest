export type TeamNameStyle = "full" | "short";

type TeamKo = { full: string; short: string };

const TEAM_NAMES_KO: Record<string, TeamKo> = {
  "Seoul E-Land FC": { full: "서울 이랜드 FC", short: "서울 이랜드" },
  "Seoul E-Land": { full: "서울 이랜드 FC", short: "서울 이랜드" },
  "Ansan Greeners": { full: "안산 그리너스 FC", short: "안산" },
  "Busan IPark": { full: "부산 아이파크", short: "부산" },
  Cheonan: { full: "천안시티FC", short: "천안" },
  "Cheonan City": { full: "천안시티FC", short: "천안" },
  "Cheonan City FC": { full: "천안시티FC", short: "천안" },
  "Chungnam Asan": { full: "충남아산FC", short: "충남아산" },
  "Chungbuk Cheongju": { full: "충북청주FC", short: "충북청주" },
  Daegu: { full: "대구FC", short: "대구" },
  "Daegu FC": { full: "대구FC", short: "대구" },
  "Gimpo Citizen": { full: "김포FC", short: "김포" },
  "Gimpo FC": { full: "김포FC", short: "김포" },
  "Gimhae FC": { full: "김해FC2008", short: "김해" },
  Gyeongnam: { full: "경남FC", short: "경남" },
  "Gyeongnam FC": { full: "경남FC", short: "경남" },
  "Hwaseong FC": { full: "화성FC", short: "화성" },
  "Jeonnam Dragons": { full: "전남 드래곤즈", short: "전남" },
  "Paju Frontier": { full: "파주 프런티어 FC", short: "파주" },
  "Paju Frontier FC": { full: "파주 프런티어 FC", short: "파주" },
  "Seongnam FC": { full: "성남FC", short: "성남" },
  "Suwon Bluewings": { full: "수원 삼성 블루윙즈", short: "수원 삼성" },
  "Suwon Samsung": { full: "수원 삼성 블루윙즈", short: "수원 삼성" },
  "Suwon Samsung Bluewings": { full: "수원 삼성 블루윙즈", short: "수원 삼성" },
  "Suwon FC": { full: "수원FC", short: "수원FC" },
  Yongin: { full: "용인FC", short: "용인" },
  "Yongin FC": { full: "용인FC", short: "용인" },
  "Ulsan HD": { full: "울산 HD", short: "울산" },
  "FC Seoul": { full: "FC서울", short: "FC서울" },
  "Incheon United": { full: "인천 유나이티드", short: "인천" },
  "Gimcheon Sangmu": { full: "김천 상무", short: "김천" },
  "Gwangju FC": { full: "광주FC", short: "광주" },
  "Jeju SK": { full: "제주SK FC", short: "제주" },
  "FC Anyang": { full: "FC안양", short: "안양" },
  "Bucheon FC 1995": { full: "부천FC1995", short: "부천" },
  "Jeonbuk Hyundai Motors": { full: "전북 현대 모터스", short: "전북" },
  "Daejeon Hana Citizen": { full: "대전하나시티즌", short: "대전" },
  "Pohang Steelers": { full: "포항 스틸러스", short: "포항" },
  "Gangwon FC": { full: "강원FC", short: "강원" },
  "Siheung Citizens": { full: "시흥시민축구단", short: "시흥" },
  "Ulsan Citizens": { full: "울산시민축구단", short: "울산시민" },
  "FC Mokpo": { full: "FC목포", short: "목포" },
  "Busan Transportation Corp": { full: "부산교통공사", short: "부산교통공사" },
  "Jinju Citizens": { full: "진주시민축구단", short: "진주" },
  "Gyeongju KHNP": { full: "경주 한수원", short: "경주" },
  "Yangpyeong FC": { full: "양평FC", short: "양평" },
  "Yeoju FC": { full: "여주FC", short: "여주" },
  "Dangjin Citizens": { full: "당진시민축구단", short: "당진" },
  "Namyangju Citizens": { full: "남양주시민축구단", short: "남양주" },
  "Pyeongchang United": { full: "평창 유나이티드", short: "평창" },
  "Changwon FC": { full: "창원FC", short: "창원" },
  "Gimhae FC 2008": { full: "김해FC2008", short: "김해" },
  "Pocheon Citizens": { full: "포천시민축구단", short: "포천" },
  "Geoje Citizens": { full: "거제시민축구단", short: "거제" },
  "FC Gangneung": { full: "강릉시민축구단", short: "강릉" },
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
