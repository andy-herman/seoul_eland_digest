import { AI_TIER, OPPONENTS, OPPONENT_SLUGS, type OpponentSlug } from "../h2h/data";

export type Locale = "en" | "pt";

export const RIVAL_CHOICES = OPPONENT_SLUGS.map((slug) => ({
  slug,
  name: OPPONENTS[slug].name,
  club: OPPONENTS[slug].club,
  color: OPPONENTS[slug].color,
  tier: AI_TIER[slug],
}));

export interface ThrowCopy {
  id: string;
  ko: string;
  roman: string;
  animal: string;
  meaning: string;
  steps: string;
}

export interface YutStrings {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  ko: string;
  intro: string;
  translateLabel: string;
  translateAria: string;
  loading: string;
  play: string;
  rivalMode: string;
  passMode: string;
  friendly: string;
  pro: string;
  random: string;
  pickRival: string;
  pickStrength: string;
  strength: string;
  menu: string;
  howTitle: string;
  controlsTitle: string;
  credits: string;
  scoreboard: string;
  throw: string;
  throwHint: string;
  throwAgain: string;
  queue: string;
  bench: string;
  home: string;
  newPiece: string;
  confirm: string;
  cancel: string;
  turn: string;
  goals: string;
  result: string;
  rematch: string;
  restart: string;
  save: string;
  mute: string;
  unmute: string;
  noMoves: string;
  goal: string;
  tackle: string;
  caught: string;
  stack: string;
  shortcut: string;
  danger: string;
  passAndPlayTeam: [string, string];
  throwNames: Record<string, ThrowCopy>;
  hints: string[];
  how: string[];
  controls: string[];
  commentary: {
    ready: string;
    chooseThrow: string;
    choosePiece: string;
    chooseDestination: string;
    noMoves: string;
    extra: string;
    home: (name: string) => string;
    capture: (name: string) => string;
    stack: (name: string, count: number) => string;
    shortcut: (name: string) => string;
    plain: (name: string, steps: number) => string;
    back: (name: string) => string;
    aiMove: (name: string) => string;
    danger: (name: string) => string;
    win: (name: string) => string;
  };
}

export const PLAYER_NAMES = {
  leoul: { en: "Leoul", pt: "Leoul", ko: "레울" },
  lenyang: { en: "Lenyang", pt: "Lenyang", ko: "레냥" },
  euller: { en: "Euller", pt: "Euller", ko: "에울레르" },
  carius: { en: "Alan Cariús", pt: "Alan Cariús", ko: "까리우스" },
};

export function tierLabel(locale: Locale, slug: OpponentSlug): string {
  const tier = AI_TIER[slug];
  if (locale === "pt") return ["", "Calmo", "Esperto", "Forte", "Elite"][tier] ?? "Forte";
  return ["", "Gentle", "Clever", "Strong", "Elite"][tier] ?? "Strong";
}

export const YUT_STRINGS: Record<Locale, YutStrings> = {
  en: {
    pageTitle: "Yut Nori FC | Seoul E-Land Digest",
    pageDescription: "Play Korea's traditional Yut Nori as a Seoul E-Land FC football board game with Leoul, Lenyang and K League 2 mascots.",
    eyebrow: "Traditional Korean board game, football match energy",
    heading: "Yut Nori FC",
    ko: "윷놀이 FC",
    intro:
      "Throw the sticks on the straw mat, race four Seoul E-Land pieces around a football-pitch 윷판, stack teammates, tackle rivals and score by crossing the GOAL corner.",
    translateLabel: "Português",
    translateAria: "Play in Portuguese",
    loading: "Warming up the sticks...",
    play: "Play",
    rivalMode: "Vs rival mascot",
    passMode: "Pass and play",
    friendly: "Friendly",
    pro: "Pro",
    random: "Chaos",
    pickRival: "Pick a rival",
    pickStrength: "AI strength",
    strength: "Strength",
    menu: "Menu",
    howTitle: "How to play",
    controlsTitle: "Controls",
    credits:
      "Yut Nori is a traditional Korean game. Leoul, Lenyang and the song belong to Seoul E-Land FC; the other mascots belong to their clubs; all are used with permission.",
    scoreboard: "Match score",
    throw: "Throw",
    throwHint: "Click, press Space, or flick up on the mat.",
    throwAgain: "Throw again!",
    queue: "Throw queue",
    bench: "Bench",
    home: "Home",
    newPiece: "New piece",
    confirm: "Tap the glowing destination to confirm.",
    cancel: "Cancel",
    turn: "Turn",
    goals: "goals",
    result: "Full time",
    rematch: "Rematch",
    restart: "Restart",
    save: "Record on this device",
    mute: "Mute",
    unmute: "Sound",
    noMoves: "No legal move. The turn rolls on.",
    goal: "GOAL!",
    tackle: "Tackle!",
    caught: "Caught!",
    stack: "One-two!",
    shortcut: "Shortcut!",
    danger: "Danger next turn",
    passAndPlayTeam: ["Seoul E-Land", "Lenyang XI"],
    throwNames: {
      back: { id: "back", ko: "빽도", roman: "back-do", animal: "back-do", meaning: "back pass", steps: "-1 step" },
      do: { id: "do", ko: "도", roman: "do", animal: "pig", meaning: "pig", steps: "+1 step" },
      gae: { id: "gae", ko: "개", roman: "gae", animal: "dog", meaning: "dog", steps: "+2 steps" },
      geol: { id: "geol", ko: "걸", roman: "geol", animal: "sheep", meaning: "sheep", steps: "+3 steps" },
      yut: { id: "yut", ko: "윷", roman: "yut", animal: "cow", meaning: "cow", steps: "+4 steps" },
      mo: { id: "mo", ko: "모", roman: "mo", animal: "horse", meaning: "horse", steps: "+5 steps" },
    },
    hints: [
      "윷 and 모 are big counter-attacks, so you throw again.",
      "Capture a rival stack to send it to the bench and earn another throw.",
      "Land on your own piece to stack it. A stack moves as one team bus.",
    ],
    how: [
      "The board is a traditional 윷판 drawn over a football pitch: a square with an X, 29 chalk spots, four corners and the center spot.",
      "Move from the GOAL corner around the outside. Shortcuts only happen when a piece starts a move on corner B, corner C or the center circle.",
      "Throws are 도 1, 개 2, 걸 3, 윷 4 and 모 5. If only the marked stick lands flat, 빽도 moves one spot backward.",
      "Landing exactly on the GOAL corner is not a score yet. One more forward step crosses the line. First to four goals wins.",
    ],
    controls: [
      "Keyboard: Space throws, Tab or arrow keys cycle moves, Enter confirms.",
      "Mouse: click the mat or Throw button, pick a chip, pick a pulsing piece, then click the ghost destination.",
      "Touch: flick up on the mat. On phones the game runs full screen with safe-area padding.",
    ],
    commentary: {
      ready: "Leoul and Lenyang are ready on the mat.",
      chooseThrow: "Pick a throw chip.",
      choosePiece: "Pick a pulsing piece or send a new runner from the bench.",
      chooseDestination: "Preview set. Tap the ghost to confirm.",
      noMoves: "No legal move. The turn passes.",
      extra: "Counter-attack, throw again!",
      home: (name) => `${name} crosses the GOAL line!`,
      capture: (name) => `${name} wins a tackle and sends the rival back to the bench.`,
      stack: (name, count) => `${name} links up for a stack of ${count}.`,
      shortcut: (name) => `${name} takes the shortcut through the center circle.`,
      plain: (name, steps) => `${name} advances ${steps} ${steps === 1 ? "spot" : "spots"}.`,
      back: (name) => `${name} plays a back pass.`,
      aiMove: (name) => `${name} is thinking...`,
      danger: (name) => `${name} is exposed to a tackle next turn.`,
      win: (name) => `${name} win the match!`,
    },
  },
  pt: {
    pageTitle: "Yut Nori FC | Seoul E-Land Digest",
    pageDescription: "Jogue o tradicional Yut Nori coreano como um jogo de futebol do Seoul E-Land FC, com Leoul, Lenyang e mascotes da K League 2.",
    eyebrow: "Jogo tradicional coreano com clima de futebol",
    heading: "Yut Nori FC",
    ko: "윷놀이 FC",
    intro:
      "Arremesse os bastões no tapete, leve quatro peças do Seoul E-Land por um 윷판 em formato de campo, junte companheiros, dê carrinhos nos rivais e marque cruzando o canto do GOL.",
    translateLabel: "English",
    translateAria: "Play in English",
    loading: "Aquecendo os bastões...",
    play: "Jogar",
    rivalMode: "Contra mascote rival",
    passMode: "Dois jogadores",
    friendly: "Amistoso",
    pro: "Pro",
    random: "Caos",
    pickRival: "Escolha o rival",
    pickStrength: "Força da IA",
    strength: "Força",
    menu: "Menu",
    howTitle: "Como jogar",
    controlsTitle: "Controles",
    credits:
      "Yut Nori é um jogo tradicional coreano. Leoul, Lenyang e a música pertencem ao Seoul E-Land FC; os outros mascotes pertencem aos seus clubes; todos são usados com permissão.",
    scoreboard: "Placar da partida",
    throw: "Arremessar",
    throwHint: "Clique, aperte Espaço, ou deslize para cima no tapete.",
    throwAgain: "Jogue de novo!",
    queue: "Fila de arremessos",
    bench: "Banco",
    home: "Casa",
    newPiece: "Nova peça",
    confirm: "Toque no destino brilhando para confirmar.",
    cancel: "Cancelar",
    turn: "Vez",
    goals: "gols",
    result: "Fim de jogo",
    rematch: "Revanche",
    restart: "Recomeçar",
    save: "Recorde neste aparelho",
    mute: "Mudo",
    unmute: "Som",
    noMoves: "Sem jogada legal. A vez segue.",
    goal: "GOL!",
    tackle: "Carrinho!",
    caught: "Pegou!",
    stack: "Tabela!",
    shortcut: "Atalho!",
    danger: "Perigo na próxima vez",
    passAndPlayTeam: ["Seoul E-Land", "Lenyang XI"],
    throwNames: {
      back: { id: "back", ko: "빽도", roman: "back-do", animal: "back-do", meaning: "passe para trás", steps: "-1 casa" },
      do: { id: "do", ko: "도", roman: "do", animal: "porco", meaning: "porco", steps: "+1 casa" },
      gae: { id: "gae", ko: "개", roman: "gae", animal: "cachorro", meaning: "cachorro", steps: "+2 casas" },
      geol: { id: "geol", ko: "걸", roman: "geol", animal: "ovelha", meaning: "ovelha", steps: "+3 casas" },
      yut: { id: "yut", ko: "윷", roman: "yut", animal: "boi", meaning: "boi", steps: "+4 casas" },
      mo: { id: "mo", ko: "모", roman: "mo", animal: "cavalo", meaning: "cavalo", steps: "+5 casas" },
    },
    hints: [
      "윷 e 모 são contra-ataques, então você arremessa outra vez.",
      "Capture uma pilha rival para mandá-la ao banco e ganhar outro arremesso.",
      "Caia em uma peça sua para formar uma pilha. A pilha se move como um ônibus do time.",
    ],
    how: [
      "O tabuleiro é um 윷판 tradicional desenhado sobre um campo de futebol: um quadrado com X, 29 marcas de cal, quatro cantos e o círculo central.",
      "Saia do canto do GOL e rode por fora. Atalhos só valem quando a peça começa a jogada no canto B, no canto C ou no círculo central.",
      "Os arremessos são 도 1, 개 2, 걸 3, 윷 4 e 모 5. Se só o bastão marcado cair plano, 빽도 recua uma casa.",
      "Cair exatamente no canto do GOL ainda não marca. Um passo adiante cruza a linha. Quem fizer quatro gols vence.",
    ],
    controls: [
      "Teclado: Espaço arremessa, Tab ou setas alternam jogadas, Enter confirma.",
      "Mouse: clique no tapete ou no botão, escolha um chip, uma peça pulsando e o destino fantasma.",
      "Toque: deslize para cima no tapete. No celular a partida fica em tela cheia com margem segura.",
    ],
    commentary: {
      ready: "Leoul e Lenyang estão prontos no tapete.",
      chooseThrow: "Escolha um chip de arremesso.",
      choosePiece: "Escolha uma peça pulsando ou mande uma nova do banco.",
      chooseDestination: "Prévia pronta. Toque no fantasma para confirmar.",
      noMoves: "Sem jogada legal. A vez passa.",
      extra: "Contra-ataque, arremesse de novo!",
      home: (name) => `${name} cruza a linha do GOL!`,
      capture: (name) => `${name} dá o carrinho e manda o rival para o banco.`,
      stack: (name, count) => `${name} faz tabela para uma pilha de ${count}.`,
      shortcut: (name) => `${name} pega o atalho pelo círculo central.`,
      plain: (name, steps) => `${name} avança ${steps} ${steps === 1 ? "casa" : "casas"}.`,
      back: (name) => `${name} toca para trás.`,
      aiMove: (name) => `${name} está pensando...`,
      danger: (name) => `${name} pode sofrer carrinho na próxima vez.`,
      win: (name) => `${name} vence a partida!`,
    },
  },
};
