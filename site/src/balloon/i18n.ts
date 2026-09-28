import type { Behavior, BossKind, Hero, Locale, WorldId } from "./data";

export interface BalloonStrings {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  intro: string;
  translateLabel: string;
  translateAria: string;
  canvasLabel: string;
  loading: string;
  loadError: string;
  chooseHero: string;
  heroes: Record<Hero, { name: string; type: string; desc: string }>;
  statBalloons: string;
  statRange: string;
  statSpeed: string;
  play: string;
  continueLabel: string;
  worldsTitle: string;
  worlds: Record<WorldId, string>;
  stages: Record<string, string>;
  locked: string;
  bestRank: (rank: string) => string;
  bossStage: string;
  back: string;
  meet: string;
  behaviors: Record<Behavior, string>;
  bossMoves: Record<BossKind, string>;
  tips: Record<string, string>;
  start: string;
  ready: string;
  go: string;
  clear: string;
  hurry: string;
  paused: string;
  resume: string;
  restart: string;
  toWorlds: string;
  next: string;
  retry: string;
  overTitle: string;
  overText: string;
  resultTitle: string;
  score: string;
  time: string;
  heartsLost: string;
  newBest: string;
  newCards: string;
  endingTitle: string;
  endingText: string;
  trappedHint: string;
  trappedNoNeedle: string;
  stageLabel: (id: string) => string;
  pause: string;
  mute: string;
  music: string;
  musicOn: string;
  musicOff: string;
  balloonBtn: string;
  itemBtn: string;
  hudHearts: string;
  hudTime: string;
  hudScore: string;
  hudNeedles: string;
  hudShields: string;
  howToPlay: string;
  howRules: string;
  howTrap: string;
  howItems: string;
  howBoss: string;
  keyboardHint: string;
  touchHint: string;
  albumHeading: string;
  albumIntro: string;
  collected: (n: number, total: number) => string;
  lockedHint: string;
  heroCard: Record<Hero, { kind: string; fact: string }>;
  allGames: string;
  credit: string;
  artCredit: string;
  nowPlaying: string;
  rotateTip: string;
  cardUnlocked: (name: string) => string;
}

const en: BalloonStrings = {
  pageTitle: "Leoul & Lenyang's Balloon Battle | Seoul E-Land Digest",
  pageDescription: "A 1-player water-balloon adventure in the style of Crazy Arcade: 18 stages across 6 worlds and 6 bosses, starring Seoul E-Land's Leoul and Lenyang against all 16 other K League 2 mascots.",
  eyebrow: "Mascot game · Seoul E-Land FC",
  heading: "Leoul & Lenyang's Balloon Battle",
  intro: "Drop water balloons, trap the K League 2 mascots in bubbles, then pop them. Six worlds, eighteen stages and six giant bosses, in the style of the classic Korean arcade game.",
  translateLabel: "Português",
  translateAria: "Ler em português",
  canvasLabel: "Balloon Battle game board",
  loading: "Filling the water balloons...",
  loadError: "The game could not load. Check your connection and refresh.",
  chooseHero: "Choose your hero",
  heroes: {
    leoul: { name: "Leoul", type: "Speed type", desc: "Quick on his feet from the very first step." },
    lenyang: { name: "Lenyang", type: "Count type", desc: "Starts with two balloons and can carry the most." },
  },
  statBalloons: "Balloons",
  statRange: "Stream",
  statSpeed: "Speed",
  play: "Play",
  continueLabel: "Continue",
  worldsTitle: "Pick a stage",
  worlds: {
    toytown: "Seoul Toy Town",
    harbor: "Busan Harbor",
    forest: "Fluffy Forest",
    frost: "Frosty Peak",
    steel: "Gwangyang Steelworks",
    stadium: "Grand Stadium",
  },
  stages: {
    "1-1": "Toy Town Crossing",
    "1-2": "Brick Park",
    "1-3": "Giant Swoony",
    "2-1": "Heart of the Harbor",
    "2-2": "Cargo Maze",
    "2-3": "Captain Gunhami",
    "3-1": "Flower Meadow",
    "3-2": "Mushroom Grove",
    "3-3": "King Chaba",
    "4-1": "Ice Rink",
    "4-2": "Crash Site",
    "4-3": "Mars Lands",
    "5-1": "Assembly Line",
    "5-2": "The Smelter",
    "5-3": "Mecha Cheolryong",
    "6-1": "Training Ground",
    "6-2": "Match Day",
    "6-3": "Aguileon's Final",
  },
  locked: "Locked",
  bestRank: (rank) => `Best: ${rank}`,
  bossStage: "Boss",
  back: "Back",
  meet: "Mascots on this stage",
  behaviors: {
    wander: "wanders around",
    dasher: "dashes at you down straight lines",
    thief: "grabs your power-ups",
    knight: "his shield blocks water from the front",
    clay: "cracks on the first hit, gets trapped on the second",
    lobber: "throws water balloons at you",
    hopper: "hops over blocks",
    flyer: "flies over blocks and hunts you",
    charger: "roars, then charges",
    floater: "floats over balloons",
    teleporter: "teleports around the map",
    breather: "mint breath slows you down",
    armored: "armored: the first hit knocks it off",
    roller: "rolls around like a ball",
    hunter: "hunts you and dodges your balloons",
    swooper: "flies over everything and swoops",
  },
  bossMoves: {
    swoony: "dashes across the board, then leaps and splashes down where you stand",
    gunhami: "fires big cannon balloons and calls his crew",
    chaba: "charges, roars to scramble your controls and calls the squirrels",
    mars: "teleports, sends decoys and fires a water beam across a row",
    cheolryong: "armored until the steam vent opens; fires rockets and steam shocks",
    aguileon: "flies over everything: feather storms, swoops and a rally of mascots",
  },
  tips: {
    tipBush: "Hide in bushes: mascots can't see you in there.",
    tipThief: "KaO grabs power-ups. Get to them first!",
    tipBoss: "Only water streams hurt a boss. Hit it while it's dizzy for double damage.",
    tipPush: "Walk into a banded crate to push it.",
    tipKnight: "Ddokdi's shield stops water from the front. Get him from the side.",
    tipPond: "Streams fly across ponds, but nobody can walk on water.",
    tipCharger: "When Chaba roars, get out of his line!",
    tipIce: "Ice is slippery: you keep sliding until you hit something.",
    tipTeleport: "Mars blinks around the map. Watch where he lands.",
    tipBelt: "Conveyor belts carry you and your balloons.",
    tipDrain: "A balloon on a drain sprays water out of every other drain.",
    tipSprinkler: "Sprinklers flash purple, then spray.",
    tipHunter: "Ronny and his twin hunt you down and dodge balloons.",
    tipFinal: "Aguileon flies over everything. Watch for the red tiles!",
  },
  start: "Start",
  ready: "Ready?",
  go: "Go!",
  clear: "Stage clear!",
  hurry: "Hurry up!",
  paused: "Paused",
  resume: "Resume",
  restart: "Restart stage",
  toWorlds: "Stage select",
  next: "Next stage",
  retry: "Try again",
  overTitle: "Popped!",
  overText: "The mascots got you this time.",
  resultTitle: "Stage clear!",
  score: "Score",
  time: "Time",
  heartsLost: "Hearts lost",
  newBest: "New best!",
  newCards: "New mascot cards",
  endingTitle: "Champions!",
  endingText: "Leoul and Lenyang beat every mascot in K\u00a0League\u00a02. Try for SS on every stage!",
  trappedHint: "Trapped! Press the item button to use a needle.",
  trappedNoNeedle: "Trapped! Wriggle free before the bubble pops... or find a needle next time.",
  stageLabel: (id) => `Stage ${id}`,
  pause: "Pause",
  mute: "Sound",
  music: "Music",
  musicOn: "on",
  musicOff: "off",
  balloonBtn: "Balloon",
  itemBtn: "Item",
  hudHearts: "Hearts",
  hudTime: "Time",
  hudScore: "Score",
  hudNeedles: "Needles",
  hudShields: "Shields",
  howToPlay: "How to play",
  howRules: "Drop a water balloon and it bursts after 3 seconds, sending water along its row and column. Water breaks the colored blocks, traps mascots in bubbles and sets off other balloons in a chain.",
  howTrap: "Walk into a trapped mascot to pop it. Pop every mascot to clear the stage. If water gets you, you are stuck in a bubble for 4 seconds: use a needle to escape. Touching a mascot costs a heart.",
  howItems: "Balloons add a balloon, potions stretch the stream, cleats add speed, the golden potion maxes the stream, kick boots let you kick balloons, ginseng maxes everything for 10 seconds. Watch out for the yellow card: it scrambles your controls.",
  howBoss: "Bosses only take damage from streams. Red tiles show where an attack will land. Hit a dizzy boss for double damage.",
  keyboardHint: "Keyboard: arrows or WASD to move, Space to drop a balloon, X or Shift for items, P to pause, M for sound.",
  touchHint: "Touch: drag the left pad to move, tap Balloon to drop one, tap Item for a needle or shield.",
  albumHeading: "Mascot album",
  albumIntro: "Pop a mascot in Balloon Battle to add its card. There are 16 K League 2 mascots to meet, plus Leoul and Lenyang.",
  collected: (n, total) => `${n} of ${total} collected`,
  lockedHint: "Pop this mascot to unlock its card.",
  heroCard: {
    leoul: { kind: "Soccer-crazy leopard", fact: "Seoul E-Land's leopard trained in cuteness on Inwangsan, a mountain in Seoul, and came back for the 2020 season. Giving up is not in his dictionary." },
    lenyang: { kind: "The Jamsil cat", fact: "The cat from Jamsil Sports Complex who sneaked into the Seoul E-Land locker room after Leoul. The jersey was swiped on the way in." },
  },
  allGames: "All games",
  credit: "Leoul, Lenyang, 서울의 노래 and 사랑하는 나의 서울 이랜드 © Seoul E-Land FC. Every K League 2 club mascot is used with permission of its club (Gimhae FC 2008 and Gimpo FC use their city mascots).",
  artCredit: "Gameplay inspired by Crazy Arcade (Nexon); all art, maps and sounds are original. Mascot sprites made with AI image tools from official art; blocks, props and effects rendered in Blender.",
  nowPlaying: "Soundtrack: 서울의 노래 (2024 ver) and 사랑하는 나의 서울 이랜드 (2022 ver), Seoul E-Land FC.",
  rotateTip: "Tip: on a phone, portrait works best.",
  cardUnlocked: (name) => `New card: ${name}`,
};

const pt: BalloonStrings = {
  ...en,
  pageTitle: "A Batalha de Balões do Leoul e do Lenyang | Seoul E-Land Digest",
  pageDescription: "Uma aventura de balões d'água para 1 jogador no estilo de Crazy Arcade: 18 fases em 6 mundos e 6 chefes, com Leoul e Lenyang, do Seoul E-Land, contra os outros 16 mascotes da K League 2.",
  eyebrow: "Jogo dos mascotes · Seoul E-Land FC",
  heading: "A Batalha de Balões do Leoul e do Lenyang",
  intro: "Solte balões d'água, prenda os mascotes da K League 2 em bolhas e estoure todos. Seis mundos, dezoito fases e seis chefes gigantes, no estilo do clássico fliperama coreano.",
  translateLabel: "English",
  translateAria: "Read in English",
  canvasLabel: "Tabuleiro da Batalha de Balões",
  loading: "Enchendo os balões d'água...",
  loadError: "O jogo não carregou. Confira a conexão e atualize a página.",
  chooseHero: "Escolha seu herói",
  heroes: {
    leoul: { name: "Leoul", type: "Tipo velocidade", desc: "Rápido desde o primeiro passo." },
    lenyang: { name: "Lenyang", type: "Tipo quantidade", desc: "Começa com dois balões e carrega mais que todos." },
  },
  statBalloons: "Balões",
  statRange: "Jato",
  statSpeed: "Velocidade",
  play: "Jogar",
  continueLabel: "Continuar",
  worldsTitle: "Escolha uma fase",
  worlds: {
    toytown: "Cidade de Brinquedo de Seul",
    harbor: "Porto de Busan",
    forest: "Floresta Fofinha",
    frost: "Pico Gelado",
    steel: "Siderúrgica de Gwangyang",
    stadium: "Grande Estádio",
  },
  stages: {
    "1-1": "Faixa da Cidade de Brinquedo",
    "1-2": "Parque dos Tijolinhos",
    "1-3": "Swoony Gigante",
    "2-1": "Coração do Porto",
    "2-2": "Labirinto de Cargas",
    "2-3": "Capitão Gunhami",
    "3-1": "Campo de Flores",
    "3-2": "Bosque dos Cogumelos",
    "3-3": "Rei Chaba",
    "4-1": "Pista de Gelo",
    "4-2": "Local da Queda",
    "4-3": "Mars Pousa",
    "5-1": "Linha de Montagem",
    "5-2": "A Fundição",
    "5-3": "Mecha Cheolryong",
    "6-1": "Campo de Treino",
    "6-2": "Dia de Jogo",
    "6-3": "A Final do Aguileon",
  },
  locked: "Bloqueada",
  bestRank: (rank) => `Melhor: ${rank}`,
  bossStage: "Chefe",
  back: "Voltar",
  meet: "Mascotes nesta fase",
  behaviors: {
    wander: "passeia por aí",
    dasher: "dispara em linha reta até você",
    thief: "rouba seus itens",
    knight: "o escudo bloqueia a água pela frente",
    clay: "racha no primeiro golpe e é preso no segundo",
    lobber: "arremessa balões d'água em você",
    hopper: "pula por cima dos blocos",
    flyer: "voa sobre os blocos e caça você",
    charger: "ruge e depois investe",
    floater: "flutua por cima dos balões",
    teleporter: "se teletransporta pelo mapa",
    breather: "o bafo de menta deixa você lento",
    armored: "blindado: o primeiro golpe tira a armadura",
    roller: "rola por aí como uma bola",
    hunter: "caça você e desvia dos balões",
    swooper: "voa sobre tudo e dá rasantes",
  },
  bossMoves: {
    swoony: "atravessa o campo em disparada, depois salta e cai espirrando água onde você está",
    gunhami: "dispara balões de canhão gigantes e chama a tripulação",
    chaba: "investe, ruge para embaralhar seus controles e chama os esquilos",
    mars: "se teletransporta, cria sósias e dispara um raio d'água numa linha inteira",
    cheolryong: "blindado até a válvula de vapor abrir; dispara foguetes e choques de vapor",
    aguileon: "voa sobre tudo: tempestades de penas, rasantes e uma convocação de mascotes",
  },
  tips: {
    tipBush: "Esconda-se nos arbustos: os mascotes não veem você lá dentro.",
    tipThief: "O KaO pega os itens. Chegue antes dele!",
    tipBoss: "Só os jatos d'água ferem um chefe. Acerte enquanto ele está tonto para dano em dobro.",
    tipPush: "Ande contra uma caixa com faixas para empurrá-la.",
    tipKnight: "O escudo do Ddokdi para a água pela frente. Acerte pelo lado.",
    tipPond: "Os jatos passam por cima dos lagos, mas ninguém anda na água.",
    tipCharger: "Quando o Chaba rugir, saia da linha dele!",
    tipIce: "O gelo escorrega: você desliza até bater em algo.",
    tipTeleport: "O Mars pisca pelo mapa. Veja onde ele aparece.",
    tipBelt: "As esteiras levam você e seus balões.",
    tipDrain: "Um balão num ralo faz jorrar água de todos os outros ralos.",
    tipSprinkler: "Os irrigadores piscam em roxo e depois esguicham.",
    tipHunter: "O Ronny e o gêmeo caçam você e desviam dos balões.",
    tipFinal: "O Aguileon voa sobre tudo. Fique de olho nos quadrados vermelhos!",
  },
  start: "Começar",
  ready: "Prontos?",
  go: "Já!",
  clear: "Fase concluída!",
  hurry: "Depressa!",
  paused: "Pausado",
  resume: "Continuar",
  restart: "Reiniciar fase",
  toWorlds: "Escolher fase",
  next: "Próxima fase",
  retry: "Tentar de novo",
  overTitle: "Estourou!",
  overText: "Os mascotes pegaram você desta vez.",
  resultTitle: "Fase concluída!",
  score: "Pontos",
  time: "Tempo",
  heartsLost: "Corações perdidos",
  newBest: "Novo recorde!",
  newCards: "Novas figurinhas",
  endingTitle: "Campeões!",
  endingText: "Leoul e Lenyang venceram todos os mascotes da K\u00a0League\u00a02. Tente SS em todas as fases!",
  trappedHint: "Preso! Aperte o botão de item para usar uma agulha.",
  trappedNoNeedle: "Preso! Tente escapar antes que a bolha estoure... ou pegue uma agulha na próxima.",
  stageLabel: (id) => `Fase ${id}`,
  pause: "Pausar",
  mute: "Som",
  music: "Música",
  musicOn: "ligada",
  musicOff: "desligada",
  balloonBtn: "Balão",
  itemBtn: "Item",
  hudHearts: "Corações",
  hudTime: "Tempo",
  hudScore: "Pontos",
  hudNeedles: "Agulhas",
  hudShields: "Escudos",
  howToPlay: "Como jogar",
  howRules: "Solte um balão d'água e ele estoura em 3 segundos, espalhando água pela linha e pela coluna. A água quebra os blocos coloridos, prende os mascotes em bolhas e faz outros balões estourarem em cadeia.",
  howTrap: "Encoste num mascote preso para estourá-lo. Estoure todos para vencer a fase. Se a água pegar você, fica preso numa bolha por 4 segundos: use uma agulha para escapar. Encostar num mascote custa um coração.",
  howItems: "Balões dão mais um balão, poções aumentam o jato, chuteiras dão velocidade, a poção dourada leva o jato ao máximo, as botas de chute deixam você chutar balões e o ginseng deixa tudo no máximo por 10 segundos. Cuidado com o cartão amarelo: ele embaralha os controles.",
  howBoss: "Os chefes só sofrem dano dos jatos. Os quadrados vermelhos mostram onde o ataque vai cair. Acerte o chefe tonto para dano em dobro.",
  keyboardHint: "Teclado: setas ou WASD para andar, Espaço para soltar um balão, X ou Shift para itens, P para pausar, M para o som.",
  touchHint: "Toque: arraste o controle da esquerda para andar, toque em Balão para soltar um e em Item para agulha ou escudo.",
  albumHeading: "Álbum de mascotes",
  albumIntro: "Estoure um mascote na Batalha de Balões para ganhar a figurinha. São 16 mascotes da K League 2, mais o Leoul e o Lenyang.",
  collected: (n, total) => `${n} de ${total} coletadas`,
  lockedHint: "Estoure este mascote para liberar a figurinha.",
  heroCard: {
    leoul: { kind: "Leopardo louco por futebol", fact: "O leopardo do Seoul E-Land treinou fofura no Inwangsan, uma montanha de Seul, e voltou para a temporada de 2020. Desistir não está no dicionário dele." },
    lenyang: { kind: "O gato de Jamsil", fact: "O gato do Complexo Esportivo de Jamsil que entrou escondido no vestiário do Seoul E-Land atrás do Leoul. A camisa foi surrupiada no caminho." },
  },
  allGames: "Todos os jogos",
  credit: "Leoul, Lenyang, 서울의 노래 e 사랑하는 나의 서울 이랜드 © Seoul E-Land FC. Todos os mascotes dos clubes da K League 2 são usados com permissão dos clubes (o Gimhae FC 2008 e o Gimpo FC usam os mascotes das cidades).",
  artCredit: "Jogabilidade inspirada em Crazy Arcade (Nexon); toda a arte, os mapas e os sons são originais. Sprites dos mascotes feitos com ferramentas de IA a partir da arte oficial; blocos, objetos e efeitos renderizados no Blender.",
  nowPlaying: "Trilha: 서울의 노래 (versão 2024) e 사랑하는 나의 서울 이랜드 (versão 2022), Seoul E-Land FC.",
  rotateTip: "Dica: no celular, o modo retrato funciona melhor.",
  cardUnlocked: (name) => `Nova figurinha: ${name}`,
};

export const BB_STRINGS: Record<Locale, BalloonStrings> = { en, pt };
