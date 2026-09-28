// Take Five copy in English and Portuguese (Brazil). No em dashes in site copy.
import type { Objective, Outcome, Tier } from "./engine";
import type { Chapter } from "./levels";
import type { RewriteGoal } from "./rewrite";

export type Locale = "en" | "pt";

export interface LevelText {
  title: string;
  brief: string;
  tip: string;
}

export interface TakeFiveStrings {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  ko: string;
  intro: string;
  translateLabel: string;
  translateAria: string;
  loading: string;
  campaign: string;
  rewrite: string;
  rewriteIntro: string;
  chapters: Record<Chapter, { name: string; blurb: string }>;
  levels: Record<string, LevelText>;
  locked: string;
  lockedHint: string;
  levelN: (n: number) => string;
  tiers: Record<Tier, string>;
  defendedBy: (mascot: string, club: string) => string;
  objectivesTitle: string;
  goalStar: string;
  objective: (o: Objective, scorer: string) => string;
  players: (n: number) => string;
  seconds: (s: number) => string;
  enterStudio: string;
  back: string;
  menu: string;
  // studio
  takeLabel: (n: number) => string;
  record: string;
  punchIn: (t: string) => string;
  stop: string;
  keep: string;
  discard: string;
  play: string;
  pause: string;
  undo: string;
  clear: string;
  slow: string;
  routes: string;
  normalSpeed: string;
  recorded: string;
  empty: string;
  paradoxTag: string;
  selectHint: string;
  rec: string;
  playback: string;
  ready: string;
  go: string;
  punchCountdown: (t: string) => string;
  outcomes: Record<Outcome, string>;
  paradox: (name: string, what: "kick" | "receive") => string;
  takeKept: (name: string) => string;
  takeDiscarded: string;
  undone: string;
  cleared: (name: string) => string;
  nothingToUndo: string;
  firstHint: string;
  pass: string;
  shoot: string;
  lob: string;
  keysLive: string;
  coach: string;
  coachTitle: string;
  // results
  goalTitle: string;
  goalAt: (t: string) => string;
  passesN: (n: number) => string;
  takesN: (n: number) => string;
  newBest: string;
  keepEditing: string;
  watchReplay: string;
  next: string;
  share: string;
  copied: string;
  shareText: (level: string) => string;
  shareFail: string;
  // watch
  watchTitle: string;
  watchLevel: (level: string) => string;
  watchAgain: string;
  tryLevel: string;
  badLink: string;
  // rewrite
  roundLabel: (round: number) => string;
  scoreLine: (ours: number, theirs: number, opp: string) => string;
  rewriteGoal: (goal: RewriteGoal, ours: number, theirs: number) => string;
  venue: Record<"home" | "away" | "neutral", string>;
  rewriteBrief: (opp: string, mascot: string, ours: number, theirs: number, venue: string) => string;
  // settings
  music: string;
  sound: string;
  on: string;
  off: string;
  howTitle: string;
  how: string[];
  controlsTitle: string;
  controls: string[];
  credits: string;
}

const pad = (t: number) => t.toFixed(1);

const en: TakeFiveStrings = {
  pageTitle: "Take Five: the one-player five-a-side | Seoul E-Land Digest",
  pageDescription:
    "Record every player of a Seoul E-Land attack yourself, one take at a time, like overdubbing a song. Your earlier takes replay as echoes while you add the next pass, run and finish. 12 levels plus every 2026 league match to rewrite.",
  eyebrow: "Mascot games · Take Five",
  heading: "Take Five",
  ko: "나 혼자 FC",
  intro:
    "One player, five parts. Record the pass, then record the run to meet it, then the finish. Every take you keep plays back as an echo, so a whole team move is built by you alone. Then rewrite this season's real results against the rival mascots.",
  translateLabel: "Português",
  translateAria: "Ler em português",
  loading: "Setting up the tactics board…",
  campaign: "Campaign",
  rewrite: "Rewrite the Result",
  rewriteIntro:
    "Every league match Seoul E-Land have played in 2026, newest first. Same opponent, their mascots at their real strength, and one attack to change the scoreline.",
  chapters: {
    school: { name: "Overdub School", blurb: "One and two players. Learn to record, re-record and play with your own echo." },
    fives: { name: "Combination Play", blurb: "Three and four players against zones, markers and a presser." },
    moments: { name: "Big Moments", blurb: "Corners, free kicks, counters and the full five." },
  },
  levels: {
    l1: {
      title: "First Take",
      brief: "Every goal starts with one take. It is just Euller, the ball and a keeper: run at goal and shoot.",
      tip: "Hold shoot to power it up and let go. Push the stick left or right as you release to pick a corner.",
    },
    l2: {
      title: "Meet Yourself",
      brief: "Take 1: Cariús plays the ball into space for Euller. Take 2: Euller runs onto it. Your first take plays back while you record the second.",
      tip: "Record Cariús first. A quick tap of pass rolls the ball to the teammate you are facing; holding it sends the ball further.",
    },
    l3: {
      title: "Give and Go",
      brief: "A presser hunts the ball. Cho plays it wide to Hong, Hong gives it back, and Cho finishes.",
      tip: "Record Cho's pass, then Hong's return, then record Cho again to add the run and the finish. A new take replaces the old one.",
    },
    l4: {
      title: "Shake the Shadow",
      brief: "Kim Hyun has a marker glued to him, and a lone run gets tackled. Bounce it off Gabriel and let Kim Hyun finish first time.",
      tip: "Pass, then run past your marker straight away. Aim the return pass at where Kim Hyun will be, not where he is.",
    },
    l5: {
      title: "Late Arrival",
      brief: "Two zones guard the box. Move it wide and let Baek Ji-woong arrive late to score.",
      tip: "Zones only leave their patch for a ball they can reach. Passes that go around a zone, not through it, arrive.",
    },
    l6: {
      title: "Head Start",
      brief: "Cho switches it to Hong on the right, Hong crosses, Euller attacks the ball in the air.",
      tip: "Lobs fly over defenders. When a lob drops to you above knee height, press shoot to head it.",
    },
    l7: {
      title: "The Cutback",
      brief: "Hong beats the zone down the line and cuts it back. Find the free man and hit it first time.",
      tip: "A pass pulled back from the byline is hard to defend: the defenders are running toward their own goal.",
    },
    l8: {
      title: "Rondo",
      brief: "Four players, a presser and two zones. Keep the ball moving: the presser can only chase one of you.",
      tip: "Short passes beat the press. Record the players who receive early before the ones who finish.",
    },
    l9: {
      title: "Corner Routine",
      brief: "Cariús takes the corner. Euller and Park pull their markers away, and Osmar attacks the space they leave.",
      tip: "Set pieces are choreography. Record the decoy runs first, then the delivery, then the finish.",
    },
    l10: {
      title: "Over the Wall",
      brief: "A free kick with a two-man wall. Chip it over to a runner, or roll it square for a first-time shot.",
      tip: "The wall never moves. Lob over it, or pass around it, and finish before the keeper sets himself.",
    },
    l11: {
      title: "Counterattack",
      brief: "The ball is won deep and only two defenders are back. Three passes and a finish before they recover.",
      tip: "Run first and pass later: forward runs stretch the zones apart.",
    },
    l12: {
      title: "The Full Five",
      brief: "Everything you have learned. Two markers, a zone and a presser. Get all five players on the ball and score.",
      tip: "Marked players are walls: they lay the ball off first time, they cannot turn. The free players carry the attack.",
    },
  },
  locked: "Locked",
  lockedHint: "Score in the level before to unlock",
  levelN: (n) => `Level ${n}`,
  tiers: { 1: "Friendly", 2: "Organised", 3: "Sharp", 4: "Elite" },
  defendedBy: (mascot, club) => `Defended by ${mascot} (${club})`,
  objectivesTitle: "Stars",
  goalStar: "Score a goal",
  objective: (o, scorer) => {
    switch (o.kind) {
      case "time":
        return `Score within ${pad(o.value ?? 0)} s`;
      case "passes":
        return `Complete ${o.value ?? 1} or more passes`;
      case "allTouch":
        return "Every player touches the ball";
      case "header":
        return "Score with a header";
      case "oneTouch":
        return "Finish first time";
      case "maxSlots":
        return `Use ${o.value ?? 5} players or fewer`;
      case "scorer":
        return `${scorer} scores`;
      case "noParadox":
        return "No paradoxes";
    }
  },
  players: (n) => (n === 1 ? "1 player" : `${n} players`),
  seconds: (s) => `${s} s`,
  enterStudio: "Enter the studio",
  back: "Back",
  menu: "Menu",
  takeLabel: (n) => `Take ${n}`,
  record: "Record",
  punchIn: (t) => `Punch in at ${t} s`,
  stop: "Stop",
  keep: "Keep take",
  discard: "Discard",
  play: "Play",
  pause: "Pause",
  undo: "Undo",
  clear: "Clear",
  slow: "Slow motion",
  routes: "Routes",
  normalSpeed: "Normal speed",
  recorded: "Recorded",
  empty: "Empty",
  paradoxTag: "Paradox",
  selectHint: "Pick a player, then press Record.",
  rec: "REC",
  playback: "PLAYBACK",
  ready: "Ready",
  go: "GO",
  punchCountdown: (t) => `Live in ${t}`,
  outcomes: {
    goal: "GOAL!",
    saved: "Saved by the keeper",
    blocked: "Shot blocked",
    intercepted: "Pass intercepted",
    tackled: "Tackled",
    claimed: "The keeper claims it",
    wide: "Wide of the post",
    over: "Over the bar",
    "post-out": "Off the post",
    out: "Out of play",
    lost: "Ball lost",
    time: "Time's up",
  },
  paradox: (name, what) => (what === "kick" ? `Paradox: ${name}'s recorded kick never happened` : `Paradox: the ball never reached ${name}`),
  takeKept: (name) => `Take kept: ${name}`,
  takeDiscarded: "Take discarded",
  undone: "Undone",
  cleared: (name) => `${name}'s take cleared`,
  nothingToUndo: "Nothing to undo",
  firstHint: "Pick a player and press Record. When the take is over, pick the next player: your first take plays back as an echo.",
  pass: "Pass",
  shoot: "Shoot",
  lob: "Lob",
  keysLive: "Move WASD or arrows · Pass J or Space · Shoot K · Lob L · hold to power up · Enter keeps · Esc discards",
  coach: "Coach's take",
  coachTitle: "The coach's solution",
  goalTitle: "Goal!",
  goalAt: (t) => `Scored at ${t} s`,
  passesN: (n) => (n === 1 ? "1 pass" : `${n} passes`),
  takesN: (n) => (n === 1 ? "1 take" : `${n} takes`),
  newBest: "New best",
  keepEditing: "Keep editing",
  watchReplay: "Watch replay",
  next: "Next level",
  share: "Share this goal",
  copied: "Link copied",
  shareText: (level) => `I built this Seoul E-Land goal on my own in Take Five: ${level}. Watch it:`,
  shareFail: "Could not copy the link",
  watchTitle: "Watching a shared goal",
  watchLevel: (level) => `Built one take at a time in ${level}`,
  watchAgain: "Watch again",
  tryLevel: "Try this level",
  badLink: "That goal link could not be read. It may be from an older version of the game.",
  roundLabel: (r) => `Round ${r}`,
  scoreLine: (ours, theirs, opp) => `Seoul E-Land ${ours}-${theirs} ${opp}`,
  rewriteGoal: (goal, ours, theirs) => {
    const s = `${ours + 1}-${theirs}`;
    if (goal === "equalise") return `Make it ${s}`;
    if (goal === "win") return `Win it ${s}`;
    if (goal === "pullBack") return `Pull one back: ${s}`;
    return `One more: ${s}`;
  },
  venue: { home: "at Mokdong", away: "away", neutral: "at a neutral ground" },
  rewriteBrief: (opp, mascot, ours, theirs, venue) =>
    `The real match ${venue} ended ${ours}-${theirs}. ${mascot} and the ${opp} defence are back for one more attack. Score it and the result changes, in this game at least.`,
  music: "Music",
  sound: "Sound",
  on: "On",
  off: "Off",
  howTitle: "How it works",
  how: [
    "Pick a player and record a take: you control only that player, for a few seconds.",
    "When the take ends it is kept as an echo. Pick the next player and record again: the echoes replay exactly as you played them.",
    "Aim passes at where a teammate's echo will be. A pass that lands near an echo's route snaps onto it.",
    "Re-record any player at any time, or punch in halfway through a take to fix just the end.",
    "If a change breaks what an echo did (a pass it expected never arrives), you get a paradox marker. Re-record that player to fix it.",
    "Score for one star. Two more stars for the level's objectives: speed, passes, headers and more.",
  ],
  controlsTitle: "Controls",
  controls: [
    "Keyboard: move with WASD or the arrow keys. Pass with J or Space, shoot with K, lob with L. Hold to power up, release to kick.",
    "Phone: drag the stick on the left, hold Pass, Shoot or Lob on the right and release to kick.",
    "A quick tap of Pass rolls the ball to the teammate you are facing. Slow motion makes recording easier.",
  ],
  credits:
    "Leoul, Lenyang and the song 서울의 노래 (2024 ver) belong to Seoul E-Land FC. The other K League 2 mascots belong to their clubs. All are used with permission. Player art is from the Digest's sticker set.",
};

const pt: TakeFiveStrings = {
  pageTitle: "Take Five: o futebol de cinco de um jogador só | Seoul E-Land Digest",
  pageDescription:
    "Grave sozinho cada jogador de um ataque do Seoul E-Land, uma tomada por vez, como quem sobrepõe faixas numa música. As tomadas anteriores voltam como ecos enquanto você acrescenta o passe, a corrida e a finalização. 12 fases e todos os jogos da liga de 2026 para reescrever.",
  eyebrow: "Jogos dos mascotes · Take Five",
  heading: "Take Five",
  ko: "나 혼자 FC",
  intro:
    "Um jogador, cinco partes. Grave o passe, depois a corrida para recebê-lo, depois a finalização. Cada tomada que você guarda volta como eco, e assim a jogada inteira sai de você sozinho. Depois, reescreva os resultados reais da temporada contra os mascotes rivais.",
  translateLabel: "English",
  translateAria: "Read in English",
  loading: "Montando a prancheta…",
  campaign: "Campanha",
  rewrite: "Reescreva o Resultado",
  rewriteIntro:
    "Todos os jogos da liga que o Seoul E-Land já fez em 2026, do mais recente ao mais antigo. O mesmo adversário, os mascotes na força real deles e um ataque para mudar o placar.",
  chapters: {
    school: { name: "Escola de Gravação", blurb: "Um e dois jogadores. Aprenda a gravar, regravar e jogar com o seu próprio eco." },
    fives: { name: "Jogo Combinado", blurb: "Três e quatro jogadores contra zonas, marcadores e um pressionador." },
    moments: { name: "Grandes Momentos", blurb: "Escanteios, faltas, contra-ataques e os cinco juntos." },
  },
  levels: {
    l1: {
      title: "Primeira Tomada",
      brief: "Todo gol começa com uma tomada. São só o Euller, a bola e o goleiro: parta para o gol e chute.",
      tip: "Segure o chute para carregar a força e solte. Empurre o direcional para a esquerda ou para a direita ao soltar para escolher o canto.",
    },
    l2: {
      title: "Encontre Você Mesmo",
      brief: "Tomada 1: o Cariús põe a bola no espaço para o Euller. Tomada 2: o Euller chega nela. A primeira tomada volta enquanto você grava a segunda.",
      tip: "Grave o Cariús primeiro. Um toque rápido no passe rola a bola para o companheiro à sua frente; segurando, a bola vai mais longe.",
    },
    l3: {
      title: "Tabela",
      brief: "Um pressionador caça a bola. O Cho abre com o Hong, o Hong devolve e o Cho finaliza.",
      tip: "Grave o passe do Cho, depois a devolução do Hong, depois grave o Cho de novo com a corrida e o chute. Uma tomada nova substitui a antiga.",
    },
    l4: {
      title: "Livre-se da Sombra",
      brief: "O Kim Hyun tem um marcador grudado nele, e a jogada individual acaba em desarme. Tabele com o Gabriel e deixe o Kim Hyun finalizar de primeira.",
      tip: "Passe e passe logo pelo marcador. Mire a devolução onde o Kim Hyun vai estar, não onde ele está.",
    },
    l5: {
      title: "Chegada de Trás",
      brief: "Duas zonas protegem a área. Abra o jogo e deixe o Baek Ji-woong chegar de trás para marcar.",
      tip: "A zona só sai do lugar por uma bola que ela alcança. Passes que contornam a zona, sem atravessá-la, chegam.",
    },
    l6: {
      title: "Cabeçada",
      brief: "O Cho inverte para o Hong na direita, o Hong cruza e o Euller ataca a bola pelo alto.",
      tip: "Lançamentos passam por cima dos defensores. Quando a bola chega acima do joelho, aperte chute para cabecear.",
    },
    l7: {
      title: "Passe para Trás",
      brief: "O Hong vence a zona pela linha de fundo e rola para trás. Ache quem está livre e bata de primeira.",
      tip: "O passe para trás vindo da linha de fundo é difícil de marcar: os defensores estão correndo em direção ao próprio gol.",
    },
    l8: {
      title: "Bobinho",
      brief: "Quatro jogadores, um pressionador e duas zonas. Faça a bola girar: o pressionador só persegue um de cada vez.",
      tip: "Passes curtos vencem a pressão. Grave primeiro quem recebe cedo, depois quem finaliza.",
    },
    l9: {
      title: "Jogada de Escanteio",
      brief: "O Cariús cobra o escanteio. Euller e Park arrastam os marcadores, e o Osmar ataca o espaço que sobra.",
      tip: "Bola parada é coreografia. Grave primeiro as corridas de distração, depois a cobrança, depois a finalização.",
    },
    l10: {
      title: "Por Cima da Barreira",
      brief: "Uma falta com barreira de dois. Levante por cima para quem entra, ou role para o lado para um chute de primeira.",
      tip: "A barreira não se mexe. Passe por cima dela ou ao lado dela e finalize antes de o goleiro se ajeitar.",
    },
    l11: {
      title: "Contra-Ataque",
      brief: "A bola é roubada lá atrás e só dois defensores voltam. Três passes e a finalização antes de eles se recomporem.",
      tip: "Corra primeiro e passe depois: as corridas em profundidade separam as zonas.",
    },
    l12: {
      title: "Os Cinco Juntos",
      brief: "Tudo o que você aprendeu. Dois marcadores, uma zona e um pressionador. Faça os cinco tocarem na bola e marque.",
      tip: "Jogador marcado é parede: devolve de primeira e não consegue girar. Os livres levam o ataque.",
    },
  },
  locked: "Bloqueada",
  lockedHint: "Marque na fase anterior para liberar",
  levelN: (n) => `Fase ${n}`,
  tiers: { 1: "Amistoso", 2: "Organizado", 3: "Afiado", 4: "Elite" },
  defendedBy: (mascot, club) => `Defesa de ${mascot} (${club})`,
  objectivesTitle: "Estrelas",
  goalStar: "Marque um gol",
  objective: (o, scorer) => {
    switch (o.kind) {
      case "time":
        return `Marque em até ${pad(o.value ?? 0).replace(".", ",")} s`;
      case "passes":
        return `Complete ${o.value ?? 1} passes ou mais`;
      case "allTouch":
        return "Todos tocam na bola";
      case "header":
        return "Marque de cabeça";
      case "oneTouch":
        return "Finalize de primeira";
      case "maxSlots":
        return `Use no máximo ${o.value ?? 5} jogadores`;
      case "scorer":
        return `${scorer} marca`;
      case "noParadox":
        return "Sem paradoxos";
    }
  },
  players: (n) => (n === 1 ? "1 jogador" : `${n} jogadores`),
  seconds: (s) => `${String(s).replace(".", ",")} s`,
  enterStudio: "Entrar no estúdio",
  back: "Voltar",
  menu: "Menu",
  takeLabel: (n) => `Tomada ${n}`,
  record: "Gravar",
  punchIn: (t) => `Regravar a partir de ${t} s`,
  stop: "Parar",
  keep: "Guardar tomada",
  discard: "Descartar",
  play: "Assistir",
  pause: "Pausar",
  undo: "Desfazer",
  clear: "Apagar",
  slow: "Câmera lenta",
  routes: "Rotas",
  normalSpeed: "Velocidade normal",
  recorded: "Gravado",
  empty: "Vazio",
  paradoxTag: "Paradoxo",
  selectHint: "Escolha um jogador e aperte Gravar.",
  rec: "GRAVANDO",
  playback: "REPLAY",
  ready: "Pronto",
  go: "JÁ",
  punchCountdown: (t) => `Ao vivo em ${t}`,
  outcomes: {
    goal: "GOL!",
    saved: "Defesa do goleiro",
    blocked: "Chute bloqueado",
    intercepted: "Passe interceptado",
    tackled: "Desarmado",
    claimed: "O goleiro fica com a bola",
    wide: "Para fora",
    over: "Por cima do travessão",
    "post-out": "Na trave e para fora",
    out: "Bola fora de jogo",
    lost: "Bola perdida",
    time: "Acabou o tempo",
  },
  paradox: (name, what) => (what === "kick" ? `Paradoxo: o chute gravado de ${name} não aconteceu` : `Paradoxo: a bola nunca chegou a ${name}`),
  takeKept: (name) => `Tomada guardada: ${name}`,
  takeDiscarded: "Tomada descartada",
  undone: "Desfeito",
  cleared: (name) => `Tomada de ${name} apagada`,
  nothingToUndo: "Nada para desfazer",
  firstHint: "Escolha um jogador e aperte Gravar. Quando a tomada acabar, escolha o próximo: a primeira tomada volta como eco.",
  pass: "Passe",
  shoot: "Chute",
  lob: "Lançar",
  keysLive: "Mova com WASD ou setas · Passe J ou Espaço · Chute K · Lançamento L · segure para carregar · Enter guarda · Esc descarta",
  coach: "Tomada do técnico",
  coachTitle: "A solução do técnico",
  goalTitle: "Gol!",
  goalAt: (t) => `Gol aos ${t.replace(".", ",")} s`,
  passesN: (n) => (n === 1 ? "1 passe" : `${n} passes`),
  takesN: (n) => (n === 1 ? "1 tomada" : `${n} tomadas`),
  newBest: "Novo recorde",
  keepEditing: "Continuar editando",
  watchReplay: "Ver replay",
  next: "Próxima fase",
  share: "Compartilhar este gol",
  copied: "Link copiado",
  shareText: (level) => `Montei sozinho este gol do Seoul E-Land no Take Five: ${level}. Assista:`,
  shareFail: "Não foi possível copiar o link",
  watchTitle: "Assistindo a um gol compartilhado",
  watchLevel: (level) => `Montado uma tomada por vez em ${level}`,
  watchAgain: "Ver de novo",
  tryLevel: "Jogar esta fase",
  badLink: "Não deu para ler este link de gol. Ele pode ser de uma versão antiga do jogo.",
  roundLabel: (r) => `Rodada ${r}`,
  scoreLine: (ours, theirs, opp) => `Seoul E-Land ${ours}-${theirs} ${opp}`,
  rewriteGoal: (goal, ours, theirs) => {
    const s = `${ours + 1}-${theirs}`;
    if (goal === "equalise") return `Empate: ${s}`;
    if (goal === "win") return `Vire para ${s}`;
    if (goal === "pullBack") return `Diminua: ${s}`;
    return `Mais um: ${s}`;
  },
  venue: { home: "em Mokdong", away: "fora de casa", neutral: "em campo neutro" },
  rewriteBrief: (opp, mascot, ours, theirs, venue) =>
    `O jogo real ${venue} terminou ${ours}-${theirs}. ${mascot} e a defesa do ${opp} voltam para mais um ataque. Marque e o resultado muda, pelo menos neste jogo.`,
  music: "Música",
  sound: "Som",
  on: "Ligado",
  off: "Desligado",
  howTitle: "Como funciona",
  how: [
    "Escolha um jogador e grave uma tomada: você controla só esse jogador, por alguns segundos.",
    "Quando a tomada termina, ela vira um eco. Escolha o próximo jogador e grave de novo: os ecos repetem exatamente o que você fez.",
    "Mire os passes onde o eco do companheiro vai estar. Um passe que cai perto do caminho de um eco se ajusta a ele.",
    "Regrave qualquer jogador quando quiser, ou regrave só a partir do meio de uma tomada para corrigir o final.",
    "Se uma mudança estraga o que um eco fez (um passe que ele esperava não chega), aparece um paradoxo. Regrave esse jogador para resolver.",
    "O gol vale uma estrela. Outras duas vêm dos objetivos da fase: rapidez, passes, cabeçadas e mais.",
  ],
  controlsTitle: "Controles",
  controls: [
    "Teclado: mova com WASD ou as setas. Passe com J ou Espaço, chute com K, lançamento com L. Segure para carregar e solte para chutar.",
    "Celular: arraste o direcional à esquerda, segure Passe, Chute ou Lançar à direita e solte para chutar.",
    "Um toque rápido no Passe rola a bola para o companheiro à sua frente. A câmera lenta facilita a gravação.",
  ],
  credits:
    "Leoul, Lenyang e a música 서울의 노래 (versão 2024) pertencem ao Seoul E-Land FC. Os mascotes dos outros clubes da K League 2 pertencem aos seus clubes. Todos são usados com permissão. A arte dos jogadores vem do álbum de figurinhas do Digest.",
};

export const TAKE5_STRINGS: Record<Locale, TakeFiveStrings> = { en, pt };
