// The 16 other clubs of the 2026 K League 2 season and their mascots.
// Names follow each club's own romanization; facts come from the clubs'
// official mascot pages and K League coverage (see the research notes in the
// Luna Master vault). Every mascot is used with permission.

import metrics from "./sprites.json";

export type Locale = "en" | "pt";
export type Hero = "leoul" | "lenyang";

export const OPPONENT_SLUGS = [
  "ansan-greeners",
  "busan-ipark",
  "cheonan-city",
  "chungbuk-cheongju",
  "chungnam-asan",
  "daegu-fc",
  "gimhae-fc",
  "gimpo-fc",
  "gyeongnam-fc",
  "hwaseong-fc",
  "jeonnam-dragons",
  "paju-frontier",
  "seongnam-fc",
  "suwon-fc",
  "suwon-samsung-bluewings",
  "yongin-fc",
] as const;

export type OpponentSlug = (typeof OPPONENT_SLUGS)[number];
export type AlbumId = OpponentSlug | Hero;

export interface Opponent {
  slug: OpponentSlug;
  name: string;
  korean: string;
  club: string;
  clubKorean: string;
  color: string;
  /** Rika curls into a ball instead of sliding in feet first. */
  rolls?: boolean;
  kind: Record<Locale, string>;
  fact: Record<Locale, string>;
}

export const OPPONENTS: Record<OpponentSlug, Opponent> = {
  "ansan-greeners": {
    slug: "ansan-greeners",
    name: "Ronny",
    korean: "로니",
    club: "Ansan Greeners FC",
    clubKorean: "안산 그리너스 FC",
    color: "#0a8f5b",
    kind: { en: "Green wolf", pt: "Lobo verde" },
    fact: {
      en: "Ronny and his twin, Danny, are Ansan's green wolves. Green is Ansan's symbol color, and the wolf stands for grit and strength.",
      pt: "Ronny e o gêmeo Danny são os lobos verdes de Ansan. O verde é a cor-símbolo da cidade, e o lobo representa garra e força.",
    },
  },
  "busan-ipark": {
    slug: "busan-ipark",
    name: "Ddokdi",
    korean: "똑디",
    club: "Busan IPark",
    clubKorean: "부산 아이파크",
    color: "#c8102e",
    kind: { en: "Little knight", pt: "Pequeno cavaleiro" },
    fact: {
      en: "Fans voted Ddokdi into being in 2016: a knight with a shield for defense and a sword for fast attacks. Put his name with Hera's and you get 똑디해라, Busan dialect for \"do it right!\"",
      pt: "A torcida escolheu o Ddokdi em votação em 2016: um cavaleiro com escudo para defender e espada para atacar rápido. Junte o nome dele ao da Hera e sai 똑디해라, \"faz direito!\" no dialeto de Busan.",
    },
  },
  "cheonan-city": {
    slug: "cheonan-city",
    name: "Horami",
    korean: "호람이",
    club: "Cheonan City FC",
    clubKorean: "천안시티FC",
    color: "#4fa3da",
    kind: { en: "Squirrel", pt: "Esquilo" },
    fact: {
      en: "Horami grew up eating walnuts from the famous walnut tree at Gwangdeoksa temple. The pattern on Horami's forehead is Cheonan's Gyeore Tower, and winter is the worst, because there's no soccer.",
      pt: "Horami cresceu comendo nozes da famosa nogueira do templo Gwangdeoksa. A marca na testa é a Torre Gyeore, símbolo de Cheonan, e o inverno é a pior época, porque não tem futebol.",
    },
  },
  "chungbuk-cheongju": {
    slug: "chungbuk-cheongju",
    name: "Chaba",
    korean: "차바",
    club: "Chungbuk Cheongju FC",
    clubKorean: "충북청주FC",
    color: "#22306b",
    kind: { en: "Lion from the savanna", pt: "Leão da savana" },
    fact: {
      en: "Chaba left the savanna for Cheongju after falling for the club at a match. His role model is actor Ma Dong-seok, and he loves Leony, soccer and the bench press.",
      pt: "Chaba trocou a savana por Cheongju depois de se apaixonar pelo clube num jogo. O ídolo dele é o ator Ma Dong-seok, e ele ama a Leony, futebol e supino.",
    },
  },
  "chungnam-asan": {
    slug: "chungnam-asan",
    name: "Vooung Vooung E",
    korean: "붱붱이",
    club: "Chungnam Asan FC",
    clubKorean: "충남아산FC",
    color: "#1e3f8a",
    kind: { en: "Eagle-owl", pt: "Bufo-real" },
    fact: {
      en: "Asan's symbol bird, the eagle-owl, drawn by webtoon artist Kimong. Born March 10, 1998, shirt No. 20, and always teasing Titi the turtle.",
      pt: "A ave-símbolo de Asan, o bufo-real, desenhada pelo artista de webtoon Kimong. Nascido em 10 de março de 1998, camisa 20, e sempre implicando com a tartaruga Titi.",
    },
  },
  "daegu-fc": {
    slug: "daegu-fc",
    name: "Rika",
    korean: "리카",
    club: "Daegu FC",
    clubKorean: "대구FC",
    color: "#56b7e3",
    rolls: true,
    kind: { en: "Soccer-ball hedgehog", pt: "Ouriço bola de futebol" },
    fact: {
      en: "A hedgehog whose spines look like a soccer ball. The name comes from \"Daefrica,\" Daegu's nickname for its scorching summers, and fans chose Rika in a 2019 vote.",
      pt: "Um ouriço com espinhos que parecem uma bola de futebol. O nome vem de \"Daefrica\", o apelido de Daegu por causa do verão escaldante, e a torcida escolheu a Rika numa votação em 2019.",
    },
  },
  "gimhae-fc": {
    slug: "gimhae-fc",
    name: "Todeogi",
    korean: "토더기",
    club: "Gimhae FC 2008",
    clubKorean: "김해 FC 2008",
    color: "#a8835a",
    kind: { en: "Pottery duck", pt: "Pato de cerâmica" },
    fact: {
      en: "Gimhae City's mascot, modeled on a duck-shaped pottery vessel from the ancient Gaya kingdom. The name mixes 土 (to, earth) with \"deogi\" from the English word duck, and it won the grand prize at Korea's 2025 public character festival.",
      pt: "O mascote da cidade de Gimhae, inspirado num vaso de cerâmica em forma de pato do antigo reino de Gaya. O nome junta 土 (to, terra) com \"deogi\", de duck, pato em inglês, e levou o grande prêmio do festival coreano de personagens públicos de 2025.",
    },
  },
  "gimpo-fc": {
    slug: "gimpo-fc",
    name: "Posu",
    korean: "포수",
    club: "Gimpo FC",
    clubKorean: "김포FC",
    color: "#3a8fd0",
    kind: { en: "Water-drop kid", pt: "Gotinha d'água" },
    fact: {
      en: "Gimpo City's mascot, on loan to Gimpo FC. The name joins 浦 (po, riverside) from Gimpo with 水 (su, water), for a city of rivers and canals.",
      pt: "O mascote da cidade de Gimpo, emprestado ao Gimpo FC. O nome junta 浦 (po, margem de rio), de Gimpo, com 水 (su, água), para uma cidade de rios e canais.",
    },
  },
  "gyeongnam-fc": {
    slug: "gyeongnam-fc",
    name: "Gunhami",
    korean: "군함이",
    club: "Gyeongnam FC",
    clubKorean: "경남FC",
    color: "#d71920",
    kind: { en: "Big bird", pt: "Passarão" },
    fact: {
      en: "Official birthday: January 17, 2006. Height: 200 cm. Hobby: playing pranks. Gunhami's pledge is to cheer hard with the fans for promotion to K League 1.",
      pt: "Aniversário oficial: 17 de janeiro de 2006. Altura: 200 cm. Hobby: pregar peças. A promessa do Gunhami é torcer muito com a torcida pelo acesso à K League 1.",
    },
  },
  "hwaseong-fc": {
    slug: "hwaseong-fc",
    name: "Mars",
    korean: "마스",
    club: "Hwaseong FC",
    clubKorean: "화성FC",
    color: "#f26b21",
    kind: { en: "Soccer-mad alien", pt: "Alienígena fanático por futebol" },
    fact: {
      en: "An alien soccer fan who flew to Hwaseong after catching a soccer broadcast from space. Fans picked Mars in a 2026 audition, and the name fits: Hwaseong sounds just like 화성, Korean for Mars.",
      pt: "Um alienígena fã de futebol que voou para Hwaseong depois de captar uma transmissão de futebol no espaço. A torcida escolheu o Mars numa audição em 2026, e o nome combina: Hwaseong soa igual a 화성, Marte em coreano.",
    },
  },
  "jeonnam-dragons": {
    slug: "jeonnam-dragons",
    name: "Cheolryong",
    korean: "철룡이",
    club: "Jeonnam Dragons",
    clubKorean: "전남 드래곤즈",
    color: "#e0b000",
    kind: { en: "Steel dragon", pt: "Dragão de aço" },
    fact: {
      en: "A dragon reborn in the blast furnace of the Gwangyang steelworks, stronger than ever. Cheolryong guards Gwangyang's \"Dragon Dungeon\" and is back to help Jeonnam make history.",
      pt: "Um dragão renascido no alto-forno da siderúrgica de Gwangyang, mais forte do que nunca. Cheolryong guarda a \"Dragon Dungeon\" de Gwangyang e voltou para ajudar o Jeonnam a fazer história.",
    },
  },
  "paju-frontier": {
    slug: "paju-frontier",
    name: "Cosming",
    korean: "코스밍",
    club: "Paju Frontier FC",
    clubKorean: "파주 프런티어 FC",
    color: "#2b2f8f",
    kind: { en: "Space traveler", pt: "Viajante do espaço" },
    fact: {
      en: "Cosmic energy followed the \"Frontier Signal\" to Paju and landed in a field of cosmos flowers, becoming Cosming. The mission: spread winning energy to the fans.",
      pt: "Uma energia cósmica seguiu o \"Frontier Signal\" até Paju e pousou num campo de flores cosmos, virando o Cosming. A missão: espalhar energia de vitória para a torcida.",
    },
  },
  "seongnam-fc": {
    slug: "seongnam-fc",
    name: "KaO",
    korean: "까오",
    club: "Seongnam FC",
    clubKorean: "성남FC",
    color: "#2a2a2e",
    kind: { en: "Magpie", pt: "Pega" },
    fact: {
      en: "KaO and KaBi are magpies, the bird that links Seongnam, its citizens and the club. Since a 2020 makeover, they are forever seven years old.",
      pt: "KaO e KaBi são pegas, a ave que liga Seongnam, seus moradores e o clube. Desde uma repaginada em 2020, eles têm sete anos para sempre.",
    },
  },
  "suwon-fc": {
    slug: "suwon-fc",
    name: "Swoony",
    korean: "슈니",
    club: "Suwon FC",
    clubKorean: "수원FC",
    color: "#d2232a",
    kind: { en: "Water-drop superhero", pt: "Super-herói gota d'água" },
    fact: {
      en: "Swoony was born from the primordial water droplet that becomes the origin of Suwon in the future. A high-tech suit keeps Swoony in shape for hero duty and the search for the four generals of Suwon Hwaseong Fortress.",
      pt: "Swoony nasceu da gota d'água primordial que dá origem a Suwon no futuro. Um traje high-tech mantém o formato do herói na missão de encontrar os quatro generais da Fortaleza de Hwaseong, em Suwon.",
    },
  },
  "suwon-samsung-bluewings": {
    slug: "suwon-samsung-bluewings",
    name: "Aguileon",
    korean: "아길레온",
    club: "Suwon Samsung Bluewings",
    clubKorean: "수원 삼성 블루윙즈",
    color: "#0b3d91",
    kind: { en: "Griffin", pt: "Grifo" },
    fact: {
      en: "Águila (eagle) plus león (lion), Spanish for strength in the sky and on land. Aguileon was born June 1, 2005, was the K League's mascot leader from 2020 to 2022, and loves Suwon galbi.",
      pt: "Águila (águia) mais león (leão), em espanhol, para força no céu e em terra. Aguileon nasceu em 1º de junho de 2005, foi o líder dos mascotes da K League de 2020 a 2022 e adora o galbi de Suwon.",
    },
  },
  "yongin-fc": {
    slug: "yongin-fc",
    name: "Yonni",
    korean: "요니",
    club: "Yongin FC",
    clubKorean: "용인FC",
    color: "#8c1d40",
    kind: { en: "Mint dragon", pt: "Dragão menta" },
    fact: {
      en: "Yonni and Inni take their names from Yongin, a city whose name begins with 龍, dragon. Yonni is the gentle one, all about warm support for the fans.",
      pt: "Yonni e Inni tiram o nome de Yongin, cidade cujo nome começa com 龍, dragão. O Yonni é o mais meigo, todo carinho e apoio para a torcida.",
    },
  },
};

export interface SpriteMetric {
  file: string;
  w: number;
  h: number;
}

type PlayerPoseName = "run1" | "run2" | "run3" | "jump" | "slide" | "fall";

interface Metrics {
  opponents: Record<OpponentSlug, { tackle: SpriteMetric; leap: SpriteMetric }>;
  players: Record<Hero, Record<PlayerPoseName, SpriteMetric>>;
  cone: SpriteMetric;
  boards: { file: string; px: [number, number] };
  stands: { file: string; px: [number, number] };
}

export const SPRITES = metrics as unknown as Metrics;
export type { PlayerPoseName };
