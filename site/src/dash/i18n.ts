import type { Hero, Locale } from "./data";

export interface DashStrings {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  intro: string;
  canvasLabel: string;
  loading: string;
  loadError: string;
  menuTitle: string;
  menuSubtitle: string;
  heroes: Record<Hero, { name: string; desc: string }>;
  best: (n: number) => string;
  albumProgress: (n: number, total: number) => string;
  howToPlay: string;
  howJump: string;
  howSlide: string;
  howTreats: string;
  keyboardHint: string;
  hintTouch: string;
  hintKeys: string;
  rotateTip: string;
  jump: string;
  slide: string;
  pause: string;
  mute: string;
  musicLabel: string;
  musicOn: string;
  musicOff: string;
  nowPlaying: string;
  scoreLabel: string;
  bestLabel: string;
  treatsLabel: string;
  paused: string;
  resume: string;
  menu: string;
  tackledBy: (name: string) => string;
  trippedCone: string;
  coneClub: string;
  stats: (meters: number, treats: number, passed: number) => string;
  newBest: string;
  bestLine: (n: number) => string;
  newCardsHeading: string;
  playAgain: string;
  changeHero: string;
  seeAlbum: string;
  newCard: (name: string, club: string) => string;
  nightToast: string;
  announceStart: (hero: string) => string;
  announceCrash: (who: string, score: number) => string;
  albumHeading: string;
  albumIntro: string;
  collected: (n: number, total: number) => string;
  locked: string;
  lockedHint: string;
  heroLockedHint: (name: string) => string;
  heroCard: Record<Hero, { kind: string; fact: string }>;
  allGames: string;
  translateLabel: string;
  translateAria: string;
  credit: string;
  artCredit: string;
}

const en: DashStrings = {
  pageTitle: "Leoul & Lenyang's Dribble Dash | Seoul E-Land Digest",
  pageDescription:
    "A running game with Seoul E-Land's mascots: dribble past the mascots of all 16 other K League 2 clubs and collect their album cards.",
  eyebrow: "Mascot game",
  heading: "Leoul & Lenyang's Dribble Dash",
  intro:
    "Dribble past the mascots of all 16 other K League 2 clubs. Jump their slide tackles, slide under their flying leaps, and fill your mascot album.",
  canvasLabel: "Dribble Dash: a side-scrolling soccer run",
  loading: "Lacing up the boots...",
  loadError: "The game art didn't load. Check your connection and reload the page.",
  menuTitle: "Dribble Dash",
  menuSubtitle: "Choose your dribbler",
  heroes: {
    leoul: { name: "Leoul", desc: "The soccer-crazy leopard. Loves meat, so grab the skewers." },
    lenyang: { name: "Lenyang", desc: "The Jamsil cat. Loves fish, and anything round." },
  },
  best: (n) => `Best: ${n}`,
  albumProgress: (n, total) => `Album: ${n} of ${total}`,
  howToPlay: "How to play",
  howJump: "Slide tackles come in low: tap the stage or press Jump to hop over them.",
  howSlide: "Flying leaps come in high: hold Slide or swipe down to duck under them. Don't jump into the high flyers!",
  howTreats: "Treats are worth 25 points. Every mascot you get past goes into your album.",
  keyboardHint: "Keyboard: Space or ↑ to jump, ↓ to slide, P to pause.",
  hintTouch: "Tap to jump, hold Slide to duck",
  hintKeys: "Space to jump, ↓ to slide",
  rotateTip: "Tip: turn your phone sideways for a bigger pitch.",
  jump: "Jump",
  slide: "Slide",
  pause: "Pause",
  mute: "Sound",
  musicLabel: "Music",
  musicOn: "on",
  musicOff: "off",
  nowPlaying: "Soundtrack: 서울의 노래 (2024 ver), Seoul E-Land FC",
  scoreLabel: "Score",
  bestLabel: "Best",
  treatsLabel: "Treats",
  paused: "Paused",
  resume: "Resume",
  menu: "Menu",
  tackledBy: (name) => `Tackled by ${name}!`,
  trippedCone: "Tripped over a cone!",
  coneClub: "Training cones: undefeated since forever",
  stats: (meters, treats, passed) => `${meters} m · ${treats} ${treats === 1 ? "treat" : "treats"} · ${passed} ${passed === 1 ? "mascot" : "mascots"} beaten`,
  newBest: "New best!",
  bestLine: (n) => `Best: ${n}`,
  newCardsHeading: "New album cards",
  playAgain: "Play again",
  changeHero: "Change mascot",
  seeAlbum: "See the album",
  newCard: (name, club) => `New card: ${name} (${club})`,
  nightToast: "Night match! The floodlights are on.",
  announceStart: (hero) => `${hero} is off and dribbling.`,
  announceCrash: (who, score) => `${who} Final score ${score}.`,
  albumHeading: "Mascot album",
  albumIntro:
    "Get past a mascot once to add its card. That's 16 clubs to meet, plus Leoul and Lenyang. Your album is saved in this browser.",
  collected: (n, total) => `${n} of ${total} collected`,
  locked: "Locked",
  lockedHint: "Dribble past this mascot to unlock the card.",
  heroLockedHint: (name) => `Play a run as ${name} to unlock.`,
  heroCard: {
    leoul: {
      kind: "Soccer-crazy leopard",
      fact: "Seoul E-Land's leopard trained in cuteness on Inwangsan, a mountain in Seoul, and came back for the 2020 season. Giving up is not in his dictionary.",
    },
    lenyang: {
      kind: "The Jamsil cat",
      fact: "The cat from Jamsil Sports Complex who sneaked into the Seoul E-Land locker room after Leoul. The jersey was swiped on the way in.",
    },
  },
  allGames: "All mascot games",
  translateLabel: "Português",
  translateAria: "Play in Portuguese",
  credit:
    "Every mascot belongs to its club and is used with permission: Ansan Greeners FC, Busan IPark, Cheonan City FC, Chungbuk Cheongju FC, Chungnam Asan FC, Daegu FC, Gimhae FC 2008 and Gimhae City, Gimpo FC and Gimpo City, Gyeongnam FC, Hwaseong FC, Jeonnam Dragons, Paju Frontier FC, Seongnam FC, Suwon FC, Suwon Samsung Bluewings and Yongin FC. Leoul, Lenyang and the song 서울의 노래 (2024 ver) belong to Seoul E-Land FC.",
  artCredit:
    "Game art made in Blender and with AI image models (Kling O1), drawn from each club's official mascot art. Mascot facts come from the clubs' own mascot pages.",
};

const pt: DashStrings = {
  pageTitle: "A Corrida do Drible do Leoul e do Lenyang | Seoul E-Land Digest",
  pageDescription:
    "Um jogo de corrida com os mascotes do Seoul E-Land: drible os mascotes dos outros 16 clubes da K League 2 e complete o álbum de cartas.",
  eyebrow: "Jogo dos mascotes",
  heading: "A Corrida do Drible do Leoul e do Lenyang",
  intro:
    "Drible os mascotes dos outros 16 clubes da K League 2. Pule os carrinhos, deslize por baixo dos voadores e complete o seu álbum de mascotes.",
  canvasLabel: "Corrida do Drible: uma corrida de futebol com rolagem lateral",
  loading: "Amarrando as chuteiras...",
  loadError: "A arte do jogo não carregou. Confira a conexão e recarregue a página.",
  menuTitle: "Corrida do Drible",
  menuSubtitle: "Escolha quem vai driblar",
  heroes: {
    leoul: { name: "Leoul", desc: "O leopardo louco por futebol. Adora carne, então pegue os espetinhos." },
    lenyang: { name: "Lenyang", desc: "O gato de Jamsil. Adora peixe e tudo que é redondo." },
  },
  best: (n) => `Recorde: ${n}`,
  albumProgress: (n, total) => `Álbum: ${n} de ${total}`,
  howToPlay: "Como jogar",
  howJump: "Os carrinhos vêm por baixo: toque na tela ou aperte Pular para passar por cima.",
  howSlide: "Os voadores vêm por cima: segure Deslizar ou deslize o dedo para baixo. Não pule nos voadores altos!",
  howTreats: "Cada petisco vale 25 pontos. Todo mascote que você passar entra no seu álbum.",
  keyboardHint: "Teclado: Espaço ou ↑ para pular, ↓ para deslizar, P para pausar.",
  hintTouch: "Toque para pular, segure Deslizar para abaixar",
  hintKeys: "Espaço para pular, ↓ para deslizar",
  rotateTip: "Dica: vire o celular de lado para ver o campo maior.",
  jump: "Pular",
  slide: "Deslizar",
  pause: "Pausar",
  mute: "Som",
  musicLabel: "Música",
  musicOn: "ligada",
  musicOff: "desligada",
  nowPlaying: "Trilha: 서울의 노래 (versão 2024), Seoul E-Land FC",
  scoreLabel: "Pontos",
  bestLabel: "Recorde",
  treatsLabel: "Petiscos",
  paused: "Pausado",
  resume: "Continuar",
  menu: "Menu",
  tackledBy: (name) => `Derrubado por ${name}!`,
  trippedCone: "Tropeçou num cone!",
  coneClub: "Cones de treino: invictos desde sempre",
  stats: (meters, treats, passed) => `${meters} m · ${treats} ${treats === 1 ? "petisco" : "petiscos"} · ${passed} ${passed === 1 ? "mascote driblado" : "mascotes driblados"}`,
  newBest: "Novo recorde!",
  bestLine: (n) => `Recorde: ${n}`,
  newCardsHeading: "Novas cartas no álbum",
  playAgain: "Jogar de novo",
  changeHero: "Trocar de mascote",
  seeAlbum: "Ver o álbum",
  newCard: (name, club) => `Nova carta: ${name} (${club})`,
  nightToast: "Jogo noturno! Os refletores acenderam.",
  announceStart: (hero) => `${hero} saiu driblando.`,
  announceCrash: (who, score) => `${who} Pontuação final: ${score}.`,
  albumHeading: "Álbum de mascotes",
  albumIntro:
    "Passe por um mascote uma vez para ganhar a carta dele. São 16 clubes para conhecer, mais o Leoul e o Lenyang. O álbum fica salvo neste navegador.",
  collected: (n, total) => `${n} de ${total} no álbum`,
  locked: "Bloqueada",
  lockedHint: "Drible este mascote para liberar a carta.",
  heroLockedHint: (name) => `Jogue uma partida com o ${name} para liberar.`,
  heroCard: {
    leoul: {
      kind: "Leopardo louco por futebol",
      fact: "O leopardo do Seoul E-Land treinou fofura no Inwangsan, uma montanha de Seul, e voltou para a temporada de 2020. Desistir não está no dicionário dele.",
    },
    lenyang: {
      kind: "O gato de Jamsil",
      fact: "O gato do Complexo Esportivo de Jamsil que entrou escondido no vestiário do Seoul E-Land atrás do Leoul. A camisa foi surrupiada no caminho.",
    },
  },
  allGames: "Todos os jogos dos mascotes",
  translateLabel: "Inglês",
  translateAria: "Jogar em inglês",
  credit:
    "Cada mascote pertence ao seu clube e é usado com permissão: Ansan Greeners FC, Busan IPark, Cheonan City FC, Chungbuk Cheongju FC, Chungnam Asan FC, Daegu FC, Gimhae FC 2008 e cidade de Gimhae, Gimpo FC e cidade de Gimpo, Gyeongnam FC, Hwaseong FC, Jeonnam Dragons, Paju Frontier FC, Seongnam FC, Suwon FC, Suwon Samsung Bluewings e Yongin FC. Leoul, Lenyang e a música 서울의 노래 (versão 2024) pertencem ao Seoul E-Land FC.",
  artCredit:
    "Arte do jogo feita no Blender e com modelos de IA de imagem (Kling O1), a partir da arte oficial dos mascotes de cada clube. As curiosidades vêm das páginas oficiais dos clubes.",
};

export const DASH_STRINGS: Record<Locale, DashStrings> = { en, pt };
