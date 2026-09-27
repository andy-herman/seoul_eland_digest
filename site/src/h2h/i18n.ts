import type { Locale } from "./data";

export interface H2HStrings {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  intro: string;
  loading: string;
  translateLabel: string;
  translateAria: string;
  season: string;
  quick: string;
  playerSelect: string;
  playerHelp: string;
  nextFixture: string;
  table: string;
  fixtures: string;
  playNext: string;
  newSeason: string;
  quickMatch: string;
  home: string;
  away: string;
  start: string;
  pause: string;
  resume: string;
  restart: string;
  menu: string;
  jump: string;
  kick: string;
  power: string;
  speed: string;
  shot: string;
  draw: string;
  result: string;
  winLine: (name: string) => string;
  lossLine: (name: string) => string;
  drawLine: string;
  pointsGained: (n: number) => string;
  homeLabel: string;
  awayLabel: string;
  continue: string;
  champion: string;
  playoff: string;
  again: string;
  controls: string;
  credits: string;
}

export const H2H_STRINGS: Record<Locale, H2HStrings> = {
  en: {
    pageTitle: "Head-to-Head League | Seoul E-Land Digest",
    pageDescription: "A Head Soccer style Seoul E-Land game: pick a 2026 player and play a 16-match K League 2 mascot season.",
    eyebrow: "New browser game",
    heading: "Head-to-Head League",
    intro: "Pick a 2026 Seoul E-Land player, take on the mascots of the other K League 2 clubs, and climb a live 17-team table.",
    loading: "Inflating the match ball...",
    translateLabel: "Português",
    translateAria: "Play in Portuguese",
    season: "League season",
    quick: "Quick match",
    playerSelect: "Choose your player",
    playerHelp: "Every player is viable. Speed, jump and shot are derived from position, height and 2026 production.",
    nextFixture: "Next fixture",
    table: "League table",
    fixtures: "Fixtures",
    playNext: "Play next match",
    newSeason: "New season",
    quickMatch: "Quick match",
    home: "Home",
    away: "Away",
    start: "Kick off",
    pause: "Pause",
    resume: "Resume",
    restart: "Restart",
    menu: "Menu",
    jump: "Jump",
    kick: "Kick",
    power: "Power",
    speed: "Speed",
    shot: "Shot",
    draw: "Draw",
    result: "Result",
    winLine: (name) => `${name} wins it.`,
    lossLine: (name) => `${name} takes it.`,
    drawLine: "A hard-earned draw.",
    pointsGained: (n) => `${n} ${n === 1 ? "point" : "points"} gained`,
    homeLabel: "Home kit",
    awayLabel: "Away kit",
    continue: "Continue",
    champion: "Champions! Seoul E-Land are promoted to K League 1.",
    playoff: "Play-off place secured. One more push for promotion.",
    again: "See you next season. Start a new campaign and climb again.",
    controls: "Keyboard: A/D or arrows move, W/↑ jump, S/↓/Space kick, F/Shift power, P/Esc pause. On phones, use the buttons around the pitch.",
    credits:
      "Players and kits from Seoul E-Land FC's 2026 squad and New Balance Gradient of Motion kits. Player characters drawn with Kling AI from the club's 2026 profile photos. Mascots belong to Ansan Greeners FC, Busan IPark, Cheonan City FC, Chungbuk Cheongju FC, Chungnam Asan FC, Daegu FC, Gimhae FC 2008 and Gimhae City, Gimpo FC and Gimpo City, Gyeongnam FC, Hwaseong FC, Jeonnam Dragons, Paju Frontier FC, Seongnam FC, Suwon FC, Suwon Samsung Bluewings and Yongin FC, and are used with permission. Song 서울의 노래 (2024 ver.) used with Seoul E-Land FC's permission. Fan-made game, not an official club product.",
  },
  pt: {
    pageTitle: "Liga Cabeça a Cabeça | Seoul E-Land Digest",
    pageDescription: "Um jogo no estilo Head Soccer do Seoul E-Land: escolha um jogador de 2026 e dispute uma temporada contra os mascotes da K League 2.",
    eyebrow: "Novo jogo no navegador",
    heading: "Liga Cabeça a Cabeça",
    intro: "Escolha um jogador do Seoul E-Land 2026, enfrente os mascotes dos outros clubes da K League 2 e suba numa tabela com 17 times.",
    loading: "Enchendo a bola do jogo...",
    translateLabel: "English",
    translateAria: "Jogar em inglês",
    season: "Temporada da liga",
    quick: "Jogo rápido",
    playerSelect: "Escolha o jogador",
    playerHelp: "Todos são competitivos. Velocidade, salto e chute vêm de posição, altura e produção em 2026.",
    nextFixture: "Próximo jogo",
    table: "Tabela da liga",
    fixtures: "Jogos",
    playNext: "Jogar próxima partida",
    newSeason: "Nova temporada",
    quickMatch: "Jogo rápido",
    home: "Casa",
    away: "Fora",
    start: "Começar",
    pause: "Pausar",
    resume: "Continuar",
    restart: "Recomeçar",
    menu: "Menu",
    jump: "Pular",
    kick: "Chutar",
    power: "Especial",
    speed: "Velocidade",
    shot: "Chute",
    draw: "Empate",
    result: "Resultado",
    winLine: (name) => `${name} venceu.`,
    lossLine: (name) => `${name} ficou com a vitória.`,
    drawLine: "Empate suado.",
    pointsGained: (n) => `${n} ${n === 1 ? "ponto ganho" : "pontos ganhos"}`,
    homeLabel: "Uniforme de casa",
    awayLabel: "Uniforme de fora",
    continue: "Continuar",
    champion: "Campeões! O Seoul E-Land subiu para a K League 1.",
    playoff: "Vaga no play-off garantida. Falta mais um empurrão pelo acesso.",
    again: "Até a próxima temporada. Comece uma nova campanha e tente subir de novo.",
    controls: "Teclado: A/D ou setas movem, W/↑ pula, S/↓/Espaço chuta, F/Shift usa o especial, P/Esc pausa. No celular, use os botões em volta do campo.",
    credits:
      "Jogadores e uniformes do elenco 2026 do Seoul E-Land FC e da coleção New Balance Gradient of Motion. Personagens dos jogadores desenhados com Kling AI a partir das fotos oficiais do clube em 2026. Os mascotes pertencem a Ansan Greeners FC, Busan IPark, Cheonan City FC, Chungbuk Cheongju FC, Chungnam Asan FC, Daegu FC, Gimhae FC 2008 e cidade de Gimhae, Gimpo FC e cidade de Gimpo, Gyeongnam FC, Hwaseong FC, Jeonnam Dragons, Paju Frontier FC, Seongnam FC, Suwon FC, Suwon Samsung Bluewings e Yongin FC, e são usados com permissão. Música 서울의 노래 (versão 2024) usada com permissão do Seoul E-Land FC. Jogo de fã, não é um produto oficial do clube.",
  },
};
