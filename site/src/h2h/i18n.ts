import type { Locale } from "./data";
import type { FcEventType, RestartType } from "./fc/types";
import type { FcPos } from "./ratings";

export interface FcButtonLabels {
  pass: string;
  shoot: string;
  lob: string;
  through: string;
}

export type EndVariant = "champion" | "runnerUp" | "playoff" | "mid" | "relegation";

function enOrdinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

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
  seasonLine: (g: number, a: number, apps: number) => string;
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
  pausedTitle: string;
  leaveMatch: string;
  pausedHint: string;
  restart: string;
  menu: string;
  jump: string;
  kick: string;
  power: string;
  speed: string;
  shot: string;
  draw: string;
  result: string;
  matchStats: string;
  tableMove: (before: number, after: number) => string;
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
  tapToSkip: string;
  venueHome: string;
  venueAway: (club: string) => string;
  roundOf: (n: number) => string;
  banner: Record<"win" | "draw" | "loss", string>;
  pointsShort: (n: number) => string;
  statKicks: string;
  statHeaders: string;
  statPower: string;
  statTerritory: string;
  noGoals: string;
  rematch: string;
  pickRival: string;
  leaguePosition: string;
  moveLine: (before: number, after: number) => string;
  ordinal: (n: number) => string;
  endTitle: Record<EndVariant, string>;
  endLine: Record<EndVariant, (pos: string) => string>;
  endRecord: string;
  endGoals: string;
  endPoints: string;
  endBestWin: string;
  endBeaten: string;
  endNoneBeaten: string;
  ofTeams: string;
  zonePromoted: string;
  zonePlayoff: string;
  zoneRelegation: string;
  roundShort: (n: number) => string;
  vsLabel: (opponent: string) => string;
  statPossession: string;
  statShots: string;
  statPasses: string;
  statTackles: string;
  statCorners: string;
  goalBanner: string;
  fcBanners: Partial<Record<FcEventType, string>>;
  btnAttack: FcButtonLabels;
  btnDefend: FcButtonLabels;
  btnSetPiece: (type: RestartType, direct: boolean) => FcButtonLabels;
  sprint: string;
  setPieceHint: (type: RestartType, direct: boolean) => string;
  keysHint: string;
  faceLabels: [string, string, string, string, string, string];
  gkLabels: [string, string, string, string, string, string];
  posLabel: (pos: FcPos) => string;
  footLabel: (foot: "L" | "R") => string;
  skillMoves: string;
  weakFoot: string;
  playStyles: string;
  yourFive: string;
  teamOvr: string;
  cardNote: string;
  halfTimeShort: string;
  controls: string;
  credits: string;
}

const PT_POS = { GK: "GOL", CB: "ZAG", LB: "LE", RB: "LD", LWB: "ALE", RWB: "ALD", CDM: "VOL", CM: "MC", CAM: "MEI", LM: "ME", RM: "MD", LW: "PE", RW: "PD", CF: "SA", ST: "ATA" };

export const H2H_STRINGS: Record<Locale, H2HStrings> = {
  en: {
    pageTitle: "Head-to-Head League | Seoul E-Land Digest",
    pageDescription: "An arcade five-a-side Seoul E-Land game: lead the real 2026 squad against the K League 2 mascots, pass, cross, shoot and take corners through a 16-match season.",
    eyebrow: "New browser game",
    heading: "Head-to-Head League",
    intro: "Pick a 2026 Seoul E-Land player to captain a five-a-side team of the real squad. Pass, cross, shoot and take corners against the mascots of the other K League 2 clubs, and climb a live 17-team table.",
    loading: "Inflating the match ball...",
    translateLabel: "Português",
    translateAria: "Play in Portuguese",
    season: "League season",
    quick: "Quick match",
    playerSelect: "Choose your player",
    playerHelp: "Your pick captains the team and plays in the five. Every player has an FC-style card from 2026 form and past EA ratings.",
    seasonLine: (g, a, apps) => `2026: ${g} goals, ${a} assists, ${apps} apps`,
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
    pausedTitle: "Paused",
    leaveMatch: "Leave match",
    pausedHint: "Leaving does not count the match, so you can play this fixture again.",
    restart: "Restart",
    menu: "Menu",
    jump: "Jump",
    kick: "Kick",
    power: "Power",
    speed: "Speed",
    shot: "Shot",
    draw: "Draw",
    result: "Result",
    matchStats: "Match stats",
    tableMove: (before, after) => `Table: ${before} → ${after}`,
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
    tapToSkip: "Tap or press any key to skip",
    venueHome: "Mokdong Stadium, Leoul Park",
    venueAway: (club) => `Away at ${club}`,
    roundOf: (n) => `Round ${n} of 16`,
    banner: { win: "Victory!", draw: "Draw", loss: "Defeat" },
    pointsShort: (n) => `+${n} ${n === 1 ? "pt" : "pts"}`,
    statKicks: "Kicks",
    statHeaders: "Headers",
    statPower: "Power shots",
    statTerritory: "Territory",
    noGoals: "No goals",
    rematch: "Rematch",
    pickRival: "Choose rival",
    leaguePosition: "League position",
    moveLine: (before, after) => (after < before ? `Up to ${enOrdinal(after)}` : after > before ? `Down to ${enOrdinal(after)}` : `Stays ${enOrdinal(after)}`),
    ordinal: enOrdinal,
    endTitle: { champion: "K League 2 champions!", runnerUp: "Promoted!", playoff: "Promotion playoff", mid: "Season complete", relegation: "Relegation playoff" },
    endLine: {
      champion: () => "Top of the table after 16 rounds. Seoul E-Land go up to K League 1 as champions.",
      runnerUp: () => "Second place is a golden ticket in 2026. Seoul E-Land go straight up to K League 1.",
      playoff: (pos) => `${pos} place keeps the dream alive. The December playoff is the road to K League 1.`,
      mid: (pos) => `${pos} place this time. Pick a player and go again: the table resets, the dream does not.`,
      relegation: () => "17th means a one-match playoff against the K3 champion. Regroup and start a new campaign.",
    },
    endRecord: "W-D-L",
    endGoals: "Goals",
    endPoints: "Points",
    endBestWin: "Best win",
    endBeaten: "Mascots beaten",
    endNoneBeaten: "None this time. Next season!",
    ofTeams: "of 17",
    zonePromoted: "Promoted",
    zonePlayoff: "Promotion playoff",
    zoneRelegation: "Relegation playoff",
    roundShort: (n) => `R${n}`,
    vsLabel: (opponent) => `vs ${opponent}`,
    statPossession: "Possession",
    statShots: "Shots (on target)",
    statPasses: "Passes completed",
    statTackles: "Tackles won",
    statCorners: "Corners",
    goalBanner: "GOAL!",
    fcBanners: { corner: "Corner", freekick: "Free kick", penalty: "Penalty!", throwin: "Throw-in", goalkick: "Goal kick", save: "Save!", catch: "Caught!", post: "Off the post!", halftime: "Half time", fulltime: "Full time", kickoff: "Kick off" },
    btnAttack: { pass: "Pass", shoot: "Shoot", lob: "Lob", through: "Through" },
    btnDefend: { pass: "Switch", shoot: "Tackle", lob: "Slide", through: "Press" },
    btnSetPiece: (type, direct) => (type === "penalty" ? { pass: "-", shoot: "Shoot", lob: "-", through: "-" } : { pass: type === "throwin" ? "Throw" : "Short", shoot: direct ? "Shoot" : "-", lob: type === "corner" ? "Cross" : type === "throwin" ? "Long" : "Long ball", through: "-" }),
    sprint: "Sprint",
    setPieceHint: (type, direct) =>
      ({
        corner: "Corner: aim with the stick, hold Lob and release to cross. Pass plays it short.",
        freekick: direct ? "Free kick in range: aim, then hold Shoot and release. Pass plays it short, Lob crosses." : "Free kick: aim, then Pass short or hold Lob for a long ball.",
        penalty: "Penalty: aim across the goal, then hold Shoot and release.",
        throwin: "Throw-in: aim with the stick, then Pass. Lob throws it long.",
        goalkick: "Goal kick: aim, then Pass short or hold Lob to go long.",
        kickoff: "Kick off: press Pass to start.",
      })[type] + " It plays itself after 5 seconds.",
    keysHint: "Keys: J pass · K shoot · L lob · I through · Shift sprint",
    faceLabels: ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"],
    gkLabels: ["DIV", "HAN", "KIC", "REF", "SPD", "POS"],
    posLabel: (pos) => pos,
    footLabel: (foot) => (foot === "L" ? "Left foot" : "Right foot"),
    skillMoves: "Skill moves",
    weakFoot: "Weak foot",
    playStyles: "PlayStyles",
    yourFive: "Your five",
    teamOvr: "Team OVR",
    cardNote: "Fan-made FC-style ratings from 2026 form and past EA SPORTS FC cards, not official EA data.",
    halfTimeShort: "HT",
    controls: "Keyboard: WASD or the arrows move, Shift sprints. J or Z passes (switches player when defending), K, X or Space shoots (tackles), L or C lobs and crosses (slide tackle), I or V plays a through ball (sends a teammate to press). Hold Shoot or Lob for more power. P or Esc pauses. Gamepad: A pass, B shoot, X lob, Y through, RT sprint. On phones and tablets: the stick on the left, the four buttons on the right.",
    credits:
      "Players and kits from Seoul E-Land FC's 2026 squad and New Balance Gradient of Motion kits. Player characters drawn with Kling AI from the club's 2026 profile photos. Mascots belong to Ansan Greeners FC, Busan IPark, Cheonan City FC, Chungbuk Cheongju FC, Chungnam Asan FC, Daegu FC, Gimhae FC 2008 and Gimhae City, Gimpo FC and Gimpo City, Gyeongnam FC, Hwaseong FC, Jeonnam Dragons, Paju Frontier FC, Seongnam FC, Suwon FC, Suwon Samsung Bluewings and Yongin FC, and are used with permission. Song 서울의 노래 (2024 ver.) used with Seoul E-Land FC's permission. Player ratings are fan-made FC-style cards, not official EA SPORTS FC data. Fan-made game, not an official club product.",
  },
  pt: {
    pageTitle: "Liga Cabeça a Cabeça | Seoul E-Land Digest",
    pageDescription: "Um futebol de cinco em estilo arcade do Seoul E-Land: comande o elenco real de 2026 contra os mascotes da K League 2, com passes, cruzamentos, chutes e escanteios em 16 rodadas.",
    eyebrow: "Novo jogo no navegador",
    heading: "Liga Cabeça a Cabeça",
    intro: "Escolha um jogador do Seoul E-Land 2026 para ser o capitão de um time de cinco com o elenco real. Passe, cruze, chute e cobre escanteios contra os mascotes dos outros clubes da K League 2 e suba numa tabela com 17 times.",
    loading: "Enchendo a bola do jogo...",
    translateLabel: "English",
    translateAria: "Jogar em inglês",
    season: "Temporada da liga",
    quick: "Jogo rápido",
    playerSelect: "Escolha o jogador",
    playerHelp: "Seu escolhido é o capitão e joga no quinteto. Cada jogador tem uma carta no estilo FC com base em 2026 e em notas antigas da EA.",
    seasonLine: (g, a, apps) => `2026: ${g} gols, ${a} assistências, ${apps} jogos`,
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
    pausedTitle: "Pausado",
    leaveMatch: "Sair da partida",
    pausedHint: "Sair não conta a partida, então você pode jogar este confronto de novo.",
    restart: "Recomeçar",
    menu: "Menu",
    jump: "Pular",
    kick: "Chutar",
    power: "Especial",
    speed: "Velocidade",
    shot: "Chute",
    draw: "Empate",
    result: "Resultado",
    matchStats: "Números da partida",
    tableMove: (before, after) => `Tabela: ${before} → ${after}`,
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
    tapToSkip: "Toque ou aperte qualquer tecla para pular",
    venueHome: "Estádio Mokdong, Leoul Park",
    venueAway: (club) => `Fora de casa, contra o ${club}`,
    roundOf: (n) => `Rodada ${n} de 16`,
    banner: { win: "Vitória!", draw: "Empate", loss: "Derrota" },
    pointsShort: (n) => `+${n} ${n === 1 ? "pt" : "pts"}`,
    statKicks: "Chutes",
    statHeaders: "Cabeçadas",
    statPower: "Especiais",
    statTerritory: "Território",
    noGoals: "Sem gols",
    rematch: "Revanche",
    pickRival: "Escolher rival",
    leaguePosition: "Posição na tabela",
    moveLine: (before, after) => (after < before ? `Sobe para ${after}º` : after > before ? `Cai para ${after}º` : `Segue em ${after}º`),
    ordinal: (n) => `${n}º`,
    endTitle: { champion: "Campeões da K League 2!", runnerUp: "Acesso garantido!", playoff: "Play-off de acesso", mid: "Temporada encerrada", relegation: "Play-off de rebaixamento" },
    endLine: {
      champion: () => "Líder depois de 16 rodadas. O Seoul E-Land sobe para a K League 1 como campeão.",
      runnerUp: () => "Em 2026, o segundo lugar vale o acesso direto. O Seoul E-Land sobe direto para a K League 1.",
      playoff: (pos) => `O ${pos} lugar mantém o sonho vivo. O play-off de dezembro é o caminho para a K League 1.`,
      mid: (pos) => `${pos} lugar desta vez. Escolha um jogador e tente de novo: a tabela recomeça, o sonho continua.`,
      relegation: () => "O 17º lugar leva a um jogo único contra o campeão da K3. Hora de se reorganizar e recomeçar.",
    },
    endRecord: "V-E-D",
    endGoals: "Gols",
    endPoints: "Pontos",
    endBestWin: "Maior vitória",
    endBeaten: "Mascotes derrotados",
    endNoneBeaten: "Nenhum desta vez. Fica para a próxima!",
    ofTeams: "de 17",
    zonePromoted: "Acesso direto",
    zonePlayoff: "Play-off de acesso",
    zoneRelegation: "Play-off de rebaixamento",
    roundShort: (n) => `R${n}`,
    vsLabel: (opponent) => `contra ${opponent}`,
    statPossession: "Posse de bola",
    statShots: "Chutes (no gol)",
    statPasses: "Passes certos",
    statTackles: "Desarmes",
    statCorners: "Escanteios",
    goalBanner: "GOL!",
    fcBanners: { corner: "Escanteio", freekick: "Falta", penalty: "Pênalti!", throwin: "Lateral", goalkick: "Tiro de meta", save: "Defesa!", catch: "Segurou!", post: "Na trave!", halftime: "Intervalo", fulltime: "Fim de jogo", kickoff: "Saída de bola" },
    btnAttack: { pass: "Passe", shoot: "Chute", lob: "Lançar", through: "Enfiada" },
    btnDefend: { pass: "Trocar", shoot: "Desarme", lob: "Carrinho", through: "Pressão" },
    btnSetPiece: (type, direct) => (type === "penalty" ? { pass: "-", shoot: "Chute", lob: "-", through: "-" } : { pass: type === "throwin" ? "Cobrar" : "Curto", shoot: direct ? "Chute" : "-", lob: type === "corner" ? "Cruzar" : type === "throwin" ? "Longo" : "Lançar", through: "-" }),
    sprint: "Correr",
    setPieceHint: (type, direct) =>
      ({
        corner: "Escanteio: mire com o direcional, segure Lançar e solte para cruzar. Passe cobra curto.",
        freekick: direct ? "Falta perto do gol: mire, segure Chute e solte. Passe cobra curto, Lançar cruza." : "Falta: mire e toque Passe para jogar curto ou segure Lançar para uma bola longa.",
        penalty: "Pênalti: mire no gol, segure Chute e solte.",
        throwin: "Lateral: mire com o direcional e toque Passe. Lançar cobra longo.",
        goalkick: "Tiro de meta: mire e toque Passe para sair curto ou segure Lançar para bola longa.",
        kickoff: "Saída de bola: toque Passe para começar.",
      })[type] + " Depois de 5 segundos a cobrança sai sozinha.",
    keysHint: "Teclas: J passe · K chute · L lançar · I enfiada · Shift correr",
    faceLabels: ["RIT", "FIN", "PAS", "DRI", "DEF", "FÍS"],
    gkLabels: ["ELA", "MAN", "CHU", "REF", "VEL", "POS"],
    posLabel: (pos) => (PT_POS as Record<string, string>)[pos] ?? pos,
    footLabel: (foot) => (foot === "L" ? "Pé esquerdo" : "Pé direito"),
    skillMoves: "Dribles",
    weakFoot: "Perna ruim",
    playStyles: "Estilos de jogo",
    yourFive: "Seu quinteto",
    teamOvr: "Geral do time",
    cardNote: "Notas no estilo FC feitas por fãs, com base na temporada 2026 e em cartas antigas do EA SPORTS FC. Não são dados oficiais da EA.",
    halfTimeShort: "INT",
    controls: "Teclado: WASD ou as setas movem, Shift corre. J ou Z passa (troca de jogador na defesa), K, X ou Espaço chuta (desarma), L ou C lança e cruza (carrinho), I ou V dá a enfiada (manda um companheiro pressionar). Segure Chute ou Lançar para mais força. P ou Esc pausa. Controle: A passe, B chute, X lançar, Y enfiada, RT correr. No celular e no tablet: o direcional à esquerda e os quatro botões à direita.",
    credits:
      "Jogadores e uniformes do elenco 2026 do Seoul E-Land FC e da coleção New Balance Gradient of Motion. Personagens dos jogadores desenhados com Kling AI a partir das fotos oficiais do clube em 2026. Os mascotes pertencem a Ansan Greeners FC, Busan IPark, Cheonan City FC, Chungbuk Cheongju FC, Chungnam Asan FC, Daegu FC, Gimhae FC 2008 e cidade de Gimhae, Gimpo FC e cidade de Gimpo, Gyeongnam FC, Hwaseong FC, Jeonnam Dragons, Paju Frontier FC, Seongnam FC, Suwon FC, Suwon Samsung Bluewings e Yongin FC, e são usados com permissão. Música 서울의 노래 (versão 2024) usada com permissão do Seoul E-Land FC. As notas dos jogadores são cartas no estilo FC feitas por fãs, não dados oficiais do EA SPORTS FC. Jogo de fã, não é um produto oficial do clube.",
  },
};
