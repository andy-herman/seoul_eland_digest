import type { CardId } from "./cards";

export type Locale = "en" | "pt";

export interface CardText {
  title: string;
  fact: string;
  hint: string;
}

export interface MascotProfile {
  name: string;
  korean: string;
  kind: string;
  age: string;
  story: string[];
  likesLabel: string;
  likes: string;
  signature: string;
}

export interface Strings {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  intro: string;
  subtitle: string;
  loading: string;
  loadError: string;
  chooseMascot: string;
  shootMode: string;
  shootModeDesc: string;
  saveMode: string;
  saveModeDesc: string;
  best: (n: number) => string;
  howToPlay: string;
  howShoot: string;
  howSave: string;
  keyboardHint: string;
  musicLabel: string;
  musicOn: string;
  musicOff: string;
  nowPlaying: string;
  score: string;
  level: string;
  lives: string;
  pause: string;
  resume: string;
  paused: string;
  menu: string;
  mute: string;
  unmute: string;
  shoot: string;
  diveLeft: string;
  stay: string;
  diveRight: string;
  fullTime: string;
  finalScore: string;
  newBest: string;
  newCards: string;
  playAgain: string;
  switchMascot: string;
  share: string;
  shareText: (score: number) => string;
  linkCopied: string;
  statsShoot: (goals: number, level: number) => string;
  statsSave: (saves: number, level: number) => string;
  canvasLabel: string;
  popups: {
    goal: string;
    save: string;
    post: string;
    bar: string;
    wide: string;
    over: string;
    topCorner: string;
    lucky: string;
    level: (n: number) => string;
    heal: string;
    fish: string;
    power: string;
    nap: string;
    balloon: string;
    meat: string;
  };
  announce: {
    goal: (points: number, score: number) => string;
    save: (lives: number) => string;
    saveMine: (points: number, score: number) => string;
    conceded: (lives: number) => string;
    missed: (outcome: string, lives: number) => string;
    lucky: (score: number) => string;
    level: (n: number) => string;
    card: (title: string) => string;
    gameOver: (score: number) => string;
    aimAcross: string;
    aimHeight: string;
    diveNow: string;
  };
  quips: { leoul: string[]; lenyang: string[] };
  meetHeading: string;
  meetIntro: string;
  leoul: MascotProfile;
  lenyang: MascotProfile;
  cardsHeading: string;
  cardsIntro: string;
  collected: (n: number, total: number) => string;
  locked: string;
  newCard: string;
  cards: Record<CardId, CardText>;
  credit: string;
  artCredit: string;
}

const en: Strings = {
  pageTitle: "Leoul & Lenyang's Penalty Party | Seoul E-Land Digest",
  pageDescription:
    "Take penalties as Leoul or go in goal as Lenyang in a cute mini-game starring Seoul E-Land FC's mascots, collect all 12 mascot cards, and get to know the Leopards' two mascots.",
  eyebrow: "Mascot game",
  heading: "Leoul & Lenyang's Penalty Party",
  intro: "Take penalties as Leoul or go in goal as Lenyang, and collect all 12 mascot cards. Sound on: the soundtrack is the club's own 서울의 노래 (2024 ver).",
  subtitle: "Penalty Party",
  loading: "Warming up...",
  loadError: "The game couldn't load. Refresh the page to try again.",
  chooseMascot: "Choose your mascot",
  shootMode: "Shoot as Leoul",
  shootModeDesc: "Beat Lenyang with corner shots",
  saveMode: "Save as Lenyang",
  saveModeDesc: "Read Leoul and hug the ball",
  best: (n) => `Best: ${n.toLocaleString("en-US")}`,
  howToPlay: "How to play",
  howShoot:
    "Shoot as Leoul: a marker sweeps across the goal. Tap once to lock the direction, then tap again to set the height. Corners score more, and the top corners are almost impossible to save. Three misses and the party's over.",
  howSave:
    "Save as Lenyang: Leoul steps up. A glow hints where he's aiming (at higher levels it can lie). Dive left, stay in the middle or dive right before the ball arrives. Three goals conceded and it's over.",
  keyboardHint: "Keyboard: Space to shoot · arrow keys to dive · P to pause · M for sound",
  musicLabel: "Music",
  musicOn: "On",
  musicOff: "Off",
  nowPlaying: "Soundtrack: 서울의 노래 (2024 ver), Seoul E-Land FC",
  score: "Score",
  level: "Level",
  lives: "Lives",
  pause: "Pause",
  resume: "Resume",
  paused: "Paused",
  menu: "Menu",
  mute: "Turn sound off",
  unmute: "Turn sound on",
  shoot: "Shoot!",
  diveLeft: "Dive left",
  stay: "Stay",
  diveRight: "Dive right",
  fullTime: "Full time!",
  finalScore: "Final score",
  newBest: "New best!",
  newCards: "New cards",
  playAgain: "Play again",
  switchMascot: "Switch mascot",
  share: "Share",
  shareText: (score) => `I scored ${score.toLocaleString("en-US")} in Leoul & Lenyang's Penalty Party! Can you beat it?`,
  linkCopied: "Link copied",
  statsShoot: (goals, level) => `${goals} ${goals === 1 ? "goal" : "goals"} · level ${level}`,
  statsSave: (saves, level) => `${saves} ${saves === 1 ? "save" : "saves"} · level ${level}`,
  canvasLabel: "Penalty game: Leoul takes penalties against Lenyang, the goalkeeper, in front of a cheering crowd.",
  popups: {
    goal: "GOAL!",
    save: "SAVED!",
    post: "POST!",
    bar: "CROSSBAR!",
    wide: "WIDE!",
    over: "OVER!",
    topCorner: "TOP CORNER!",
    lucky: "PHEW!",
    level: (n) => `LEVEL ${n}!`,
    heal: "+1 LIFE",
    fish: "FISH! +1 LIFE",
    power: "POWER SHOT!",
    nap: "Lenyang is napping!",
    balloon: "Lenyang spotted a balloon!",
    meat: "Hit the meat for a bonus!",
  },
  announce: {
    goal: (points, score) => `Goal! Plus ${points}. Score ${score}.`,
    save: (lives) => `Saved by Lenyang. ${lives} ${lives === 1 ? "life" : "lives"} left.`,
    saveMine: (points, score) => `Great save! Plus ${points}. Score ${score}.`,
    conceded: (lives) => `Leoul scores. ${lives} ${lives === 1 ? "life" : "lives"} left.`,
    missed: (outcome, lives) => `${outcome} ${lives} ${lives === 1 ? "life" : "lives"} left.`,
    lucky: (score) => `Leoul missed the target. Score ${score}.`,
    level: (n) => `Level ${n}.`,
    card: (title) => `New mascot card unlocked: ${title}.`,
    gameOver: (score) => `Full time. Final score ${score}.`,
    aimAcross: "Aim across the goal, then tap or press Space.",
    aimHeight: "Now set the height and tap again.",
    diveNow: "Leoul is stepping up. Dive left, stay, or dive right.",
  },
  quips: {
    leoul: [
      "Giving up? Not in my dictionary!",
      "Short legs, strong kick!",
      "Back from cuteness training!",
      "This one's for the fans!",
      "Let's go, Seoul E-Land!",
      "Do I smell meat?",
    ],
    lenyang: [
      "Are we... brothers?",
      "Round thing... must hug!",
      "I've been studying your tactics.",
      "Is there fish after this?",
      "Mine! Mine! Mine!",
      "Nice jersey. Mine was free.",
    ],
  },
  meetHeading: "Meet the mascots",
  meetIntro: "Seoul E-Land FC has two mascots, and one of them may not be official staff.",
  leoul: {
    name: "Leoul",
    korean: "레울",
    kind: "Soccer-crazy leopard",
    age: "Estimated age: born in 2015",
    story: [
      "To keep pace with a changing club, Leoul went off to train in cuteness on Inwangsan, a mountain in Seoul, and came back for the 2020 season.",
      "Laziness and giving up are not in his dictionary.",
    ],
    likesLabel: "Likes",
    likes: "fans, soccer, meat, training, leopard print",
    signature: "A blue mane that stands for the spirit of Seoul E-Land FC, and short but strong legs.",
  },
  lenyang: {
    name: "Lenyang",
    korean: "레냥",
    kind: "The Jamsil cat",
    age: "Estimated age: about 1",
    story: [
      "Lenyang lived at Jamsil Sports Complex. When he saw Leoul, whose markings look a lot like his, he began to wonder: could we be brothers?",
      "He sneaked into the Seoul E-Land locker room after Leoul and now follows him everywhere, gathering information. The jersey he swiped is a bonus.",
    ],
    likesLabel: "Likes",
    likes: "soccer balls, naps, attention, social media, fish, leopard print",
    signature: "Squishy ears, and an obsession with anything round.",
  },
  cardsHeading: "Mascot cards",
  cardsIntro: "Unlock all 12 by playing both mascots. Your collection is saved in this browser.",
  collected: (n, total) => `${n} of ${total} collected`,
  locked: "Locked",
  newCard: "New card!",
  cards: {
    "leoul-soccer-crazy": {
      title: "Soccer-crazy leopard",
      fact: "Laziness and giving up are not in his dictionary. Leoul is Seoul E-Land's soccer-crazy leopard.",
      hint: "Take your first shot as Leoul.",
    },
    "leoul-blue-mane": {
      title: "The blue mane",
      fact: "The blue mane on Leoul's head stands for the spirit of Seoul E-Land FC.",
      hint: "Score your first goal.",
    },
    "leoul-short-legs": {
      title: "Short but strong",
      fact: "Leoul's legs are short but strong. Ask any top corner.",
      hint: "Score in a top corner.",
    },
    "leoul-born-2015": {
      title: "Born in 2015",
      fact: "Leoul's estimated birth year is 2015, the year Seoul E-Land played their first season.",
      hint: "Score 5 goals in one game.",
    },
    "leoul-meat": {
      title: "Meat lover",
      fact: "Leoul's favorite things: fans, soccer, meat, training and leopard print.",
      hint: "Hit the meat skewer with a goal.",
    },
    "leoul-inwangsan": {
      title: "Cuteness training",
      fact: "To keep pace with a changing club, Leoul trained in cuteness on Inwangsan, a mountain in Seoul, and came back for the 2020 season.",
      hint: "Save one of Leoul's power shots as Lenyang.",
    },
    "lenyang-jamsil-cat": {
      title: "The Jamsil cat",
      fact: "Lenyang is a cat from Jamsil Sports Complex, about one year old, with squishy ears.",
      hint: "Play your first round as Lenyang.",
    },
    "lenyang-brothers": {
      title: "Are we brothers...?",
      fact: "Lenyang noticed that Leoul's markings look just like his, and started to wonder if they might be brothers.",
      hint: "Make your first save.",
    },
    "lenyang-jersey": {
      title: "The swiped jersey",
      fact: "That Seoul E-Land jersey? Lenyang swiped it on his way into the locker room. Consider it a bonus.",
      hint: "Make a diving save in a corner.",
    },
    "lenyang-spy": {
      title: "Locker-room spy",
      fact: "He sneaked into the Seoul E-Land locker room after Leoul and now follows him everywhere, gathering information.",
      hint: "Make 5 saves in one game.",
    },
    "lenyang-round-things": {
      title: "Obsessed with round things",
      fact: "Lenyang can't resist anything round. Soccer balls, balloons... it all has to be hugged.",
      hint: "Score while Lenyang stares at a balloon.",
    },
    "lenyang-nap": {
      title: "Nap time",
      fact: "Lenyang's favorite things: soccer balls, naps, attention, social media, fish and leopard print.",
      hint: "Score while Lenyang takes a nap.",
    },
  },
  credit:
    "Leoul, Lenyang and the song 서울의 노래 (2024 ver) belong to Seoul E-Land FC and are used with the club's permission.",
  artCredit: "Game art made in Blender and with AI image models, based on the club's official mascot art.",
};

const pt: Strings = {
  pageTitle: "A Festa dos Pênaltis do Leoul e do Lenyang | Seoul E-Land Digest",
  pageDescription:
    "Cobre pênaltis com o Leoul ou vá para o gol com o Lenyang num minijogo fofo com os mascotes do Seoul E-Land FC, colecione as 12 cartas e conheça os dois mascotes dos Leopards.",
  eyebrow: "Jogo dos mascotes",
  heading: "A Festa dos Pênaltis do Leoul e do Lenyang",
  intro: "Cobre pênaltis com o Leoul ou vá para o gol com o Lenyang e colecione as 12 cartas dos mascotes. Ligue o som: a trilha é a própria 서울의 노래 (versão 2024) do clube.",
  subtitle: "Festa dos Pênaltis",
  loading: "Aquecendo...",
  loadError: "Não foi possível carregar o jogo. Atualize a página para tentar de novo.",
  chooseMascot: "Escolha seu mascote",
  shootMode: "Chute com o Leoul",
  shootModeDesc: "Supere o Lenyang com chutes no canto",
  saveMode: "Defenda com o Lenyang",
  saveModeDesc: "Leia o Leoul e abrace a bola",
  best: (n) => `Recorde: ${n.toLocaleString("pt-BR")}`,
  howToPlay: "Como jogar",
  howShoot:
    "Chute com o Leoul: uma mira passa de um lado para o outro do gol. Toque uma vez para travar a direção e toque de novo para escolher a altura. Chutes no canto valem mais, e no ângulo é quase impossível defender. Três erros e a festa acaba.",
  howSave:
    "Defenda com o Lenyang: o Leoul vai para a bola. Um brilho indica onde ele vai chutar (nas fases mais altas, ele pode enganar). Pule para a esquerda, fique no meio ou pule para a direita antes de a bola chegar. Três gols sofridos e acabou.",
  keyboardHint: "Teclado: Espaço para chutar · setas para pular · P para pausar · M para o som",
  musicLabel: "Música",
  musicOn: "Ligada",
  musicOff: "Desligada",
  nowPlaying: "Trilha: 서울의 노래 (versão 2024), Seoul E-Land FC",
  score: "Pontos",
  level: "Fase",
  lives: "Vidas",
  pause: "Pausar",
  resume: "Continuar",
  paused: "Pausado",
  menu: "Menu",
  mute: "Desligar o som",
  unmute: "Ligar o som",
  shoot: "Chutar!",
  diveLeft: "Pular à esquerda",
  stay: "Ficar",
  diveRight: "Pular à direita",
  fullTime: "Fim de jogo!",
  finalScore: "Pontuação final",
  newBest: "Novo recorde!",
  newCards: "Cartas novas",
  playAgain: "Jogar de novo",
  switchMascot: "Trocar de mascote",
  share: "Compartilhar",
  shareText: (score) => `Fiz ${score.toLocaleString("pt-BR")} pontos na Festa dos Pênaltis do Leoul e do Lenyang! Consegue superar?`,
  linkCopied: "Link copiado",
  statsShoot: (goals, level) => `${goals} ${goals === 1 ? "gol" : "gols"} · fase ${level}`,
  statsSave: (saves, level) => `${saves} ${saves === 1 ? "defesa" : "defesas"} · fase ${level}`,
  canvasLabel: "Jogo de pênaltis: o Leoul cobra pênaltis contra o goleiro Lenyang, diante de uma torcida animada.",
  popups: {
    goal: "GOL!",
    save: "DEFENDEU!",
    post: "NA TRAVE!",
    bar: "NO TRAVESSÃO!",
    wide: "PRA FORA!",
    over: "POR CIMA!",
    topCorner: "NO ÂNGULO!",
    lucky: "UFA!",
    level: (n) => `FASE ${n}!`,
    heal: "+1 VIDA",
    fish: "PEIXE! +1 VIDA",
    power: "CHUTE ESPECIAL!",
    nap: "O Lenyang está cochilando!",
    balloon: "O Lenyang viu um balão!",
    meat: "Acerte a carne para ganhar bônus!",
  },
  announce: {
    goal: (points, score) => `Gol! Mais ${points}. Pontos: ${score}.`,
    save: (lives) => `O Lenyang defendeu. ${lives === 1 ? "Resta 1 vida" : `Restam ${lives} vidas`}.`,
    saveMine: (points, score) => `Que defesa! Mais ${points}. Pontos: ${score}.`,
    conceded: (lives) => `Gol do Leoul. ${lives === 1 ? "Resta 1 vida" : `Restam ${lives} vidas`}.`,
    missed: (outcome, lives) => `${outcome} ${lives === 1 ? "Resta 1 vida" : `Restam ${lives} vidas`}.`,
    lucky: (score) => `O Leoul errou o alvo. Pontos: ${score}.`,
    level: (n) => `Fase ${n}.`,
    card: (title) => `Nova carta desbloqueada: ${title}.`,
    gameOver: (score) => `Fim de jogo. Pontuação final: ${score}.`,
    aimAcross: "Mire na horizontal e toque ou aperte Espaço.",
    aimHeight: "Agora escolha a altura e toque de novo.",
    diveNow: "O Leoul vai para a bola. Pule para a esquerda, fique ou pule para a direita.",
  },
  quips: {
    leoul: [
      "Desistir? Não está no meu dicionário!",
      "Perna curta, chute forte!",
      "Voltei do treino de fofura!",
      "Esse é pela torcida!",
      "Vamos, Seoul E-Land!",
      "Tô sentindo cheiro de carne?",
    ],
    lenyang: [
      "Será que somos... irmãos?",
      "Coisa redonda... preciso abraçar!",
      "Andei estudando sua tática.",
      "Depois tem peixe?",
      "É minha! É minha!",
      "Bela camisa. A minha saiu de graça.",
    ],
  },
  meetHeading: "Conheça os mascotes",
  meetIntro: "O Seoul E-Land FC tem dois mascotes, e um deles talvez nem seja funcionário oficial.",
  leoul: {
    name: "Leoul",
    korean: "레울",
    kind: "O leopardo louco por futebol",
    age: "Idade estimada: nascido em 2015",
    story: [
      "Para acompanhar as mudanças do clube, o Leoul foi treinar fofura no Inwangsan, uma montanha de Seul, e voltou para a temporada 2020.",
      "Preguiça e desistir não existem no dicionário dele.",
    ],
    likesLabel: "Gosta de",
    likes: "torcedores, futebol, carne, treino, estampa de leopardo",
    signature: "Uma juba azul que representa a garra do Seoul E-Land FC, e pernas curtas, mas fortes.",
  },
  lenyang: {
    name: "Lenyang",
    korean: "레냥",
    kind: "O gato de Jamsil",
    age: "Idade estimada: cerca de 1 ano",
    story: [
      "O Lenyang morava no Complexo Esportivo de Jamsil. Quando viu o Leoul, com manchas muito parecidas com as dele, começou a se perguntar: será que somos irmãos?",
      "Ele entrou escondido no vestiário do Seoul E-Land atrás do Leoul e agora vai atrás dele para todo lado, coletando informações. A camisa que ele surrupiou veio de bônus.",
    ],
    likesLabel: "Gosta de",
    likes: "bola de futebol, soneca, atenção, redes sociais, peixe, estampa de leopardo",
    signature: "Orelhas molinhas e uma obsessão por qualquer coisa redonda.",
  },
  cardsHeading: "Cartas dos mascotes",
  cardsIntro: "Desbloqueie as 12 jogando com os dois mascotes. Sua coleção fica salva neste navegador.",
  collected: (n, total) => `${n} de ${total} coletadas`,
  locked: "Bloqueada",
  newCard: "Carta nova!",
  cards: {
    "leoul-soccer-crazy": {
      title: "Louco por futebol",
      fact: "Preguiça e desistir não existem no dicionário dele. O Leoul é o leopardo louco por futebol do Seoul E-Land.",
      hint: "Cobre seu primeiro chute com o Leoul.",
    },
    "leoul-blue-mane": {
      title: "A juba azul",
      fact: "A juba azul na cabeça do Leoul representa a garra do Seoul E-Land FC.",
      hint: "Marque seu primeiro gol.",
    },
    "leoul-short-legs": {
      title: "Curtas, mas fortes",
      fact: "As pernas do Leoul são curtas, mas fortes. Que o diga o ângulo.",
      hint: "Marque um gol no ângulo.",
    },
    "leoul-born-2015": {
      title: "Nascido em 2015",
      fact: "O ano de nascimento estimado do Leoul é 2015, o mesmo da primeira temporada do Seoul E-Land.",
      hint: "Marque 5 gols numa mesma partida.",
    },
    "leoul-meat": {
      title: "Fã de carne",
      fact: "Coisas favoritas do Leoul: torcedores, futebol, carne, treino e estampa de leopardo.",
      hint: "Acerte o espetinho de carne com um gol.",
    },
    "leoul-inwangsan": {
      title: "Treino de fofura",
      fact: "Para acompanhar as mudanças do clube, o Leoul treinou fofura no Inwangsan, uma montanha de Seul, e voltou para a temporada 2020.",
      hint: "Defenda um chute especial do Leoul com o Lenyang.",
    },
    "lenyang-jamsil-cat": {
      title: "O gato de Jamsil",
      fact: "O Lenyang é um gato do Complexo Esportivo de Jamsil, com cerca de um ano e orelhas molinhas.",
      hint: "Jogue sua primeira rodada com o Lenyang.",
    },
    "lenyang-brothers": {
      title: "Será que somos irmãos...?",
      fact: "O Lenyang reparou que as manchas do Leoul são iguaizinhas às dele e começou a se perguntar se os dois seriam irmãos.",
      hint: "Faça sua primeira defesa.",
    },
    "lenyang-jersey": {
      title: "A camisa surrupiada",
      fact: "Aquela camisa do Seoul E-Land? O Lenyang surrupiou quando entrou no vestiário. Considere um bônus.",
      hint: "Faça uma defesa voando no canto.",
    },
    "lenyang-spy": {
      title: "Espião do vestiário",
      fact: "Ele entrou escondido no vestiário do Seoul E-Land atrás do Leoul e agora vai atrás dele para todo lado, coletando informações.",
      hint: "Faça 5 defesas numa mesma partida.",
    },
    "lenyang-round-things": {
      title: "Obcecado por coisas redondas",
      fact: "O Lenyang não resiste a nada redondo. Bola, balão... tudo precisa de um abraço.",
      hint: "Marque enquanto o Lenyang olha para um balão.",
    },
    "lenyang-nap": {
      title: "Hora da soneca",
      fact: "Coisas favoritas do Lenyang: bola de futebol, soneca, atenção, redes sociais, peixe e estampa de leopardo.",
      hint: "Marque enquanto o Lenyang tira uma soneca.",
    },
  },
  credit:
    "Leoul, Lenyang e a música 서울의 노래 (versão 2024) pertencem ao Seoul E-Land FC e são usados com autorização do clube.",
  artCredit: "Arte do jogo feita no Blender e com modelos de IA de imagem, a partir da arte oficial dos mascotes.",
};

export const STRINGS: Record<Locale, Strings> = { en, pt };
