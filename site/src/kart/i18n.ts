// Mascot Kart strings in English and Brazilian Portuguese.
import type { Difficulty, ItemKind, Mode } from "./types";

export type Locale = "en" | "pt";

export interface KartStrings {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  intro: string;
  translateLabel: string;
  translateAria: string;
  loading: string;
  menuTagline: string;
  gp: string;
  gpHint: string;
  quick: string;
  quickHint: string;
  tt: string;
  ttHint: string;
  modeLabel: string;
  modes: Record<Mode, string>;
  modeHints: Record<Mode, string>;
  diffLabel: string;
  diffs: Record<Difficulty, string>;
  diffHints: Record<Difficulty, string>;
  chooseDriver: string;
  drivers: Record<"leoul" | "lenyang", { name: string; blurb: string }>;
  chooseCup: string;
  chooseTrack: string;
  cups: Record<"seoul" | "korea", { name: string; field: string }>;
  tracks: Record<string, { name: string; ko: string; blurb: string }>;
  back: string;
  start: string;
  laps: (n: number) => string;
  race: (n: number, of: number) => string;
  lap: string;
  finalLap: string;
  wrongWay: string;
  ready: string;
  go: string;
  finish: string;
  retireIn: (s: number) => string;
  retired: string;
  boosts: Record<string, string>;
  items: Record<ItemKind, string>;
  hits: Record<string, string>;
  blocked: string;
  tapStart: string;
  keysHint: string;
  pause: string;
  paused: string;
  resume: string;
  restart: string;
  quit: string;
  music: string;
  results: string;
  standings: (n: number, of: number) => string;
  colPos: string;
  colDriver: string;
  colTime: string;
  colPts: string;
  bestLap: string;
  total: string;
  next: string;
  retry: string;
  menu: string;
  seeStandings: string;
  cupResult: string;
  trophy: Record<"gold" | "silver" | "bronze" | "none", string>;
  trophyText: Record<"gold" | "silver" | "bronze" | "none", string>;
  ttResult: string;
  newRecord: string;
  record: string;
  ghost: string;
  you: string;
  ordinal: (n: number) => string;
  controlsTitle: string;
  controls: string[];
  howTitle: string;
  how: string[];
  credits: string;
}

const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const KART_STRINGS: Record<Locale, KartStrings> = {
  en: {
    pageTitle: "Mascot Kart | Seoul E-Land Digest",
    pageDescription: "A KartRider-style kart race: drive Leoul or Lenyang against the 16 other K League 2 mascots on eight tracks from Mokdong to Busan, with drifts, boosters and water balloons.",
    eyebrow: "New browser game",
    heading: "Mascot Kart",
    intro: "Drift, boost and throw water balloons as Leoul or Lenyang against the mascots of the other 16 K League 2 clubs. Two cups and eight tracks, from Mokdong Stadium to the Gwangan Bridge.",
    translateLabel: "Português",
    translateAria: "Play in Portuguese",
    loading: "Warming up the engines...",
    menuTagline: "Leoul and Lenyang take on K League 2",
    gp: "Grand Prix",
    gpHint: "Four races, points for every finish, a trophy for the top three.",
    quick: "Quick race",
    quickHint: "One race on any track.",
    tt: "Time trial",
    ttHint: "Just you and the clock, and a ghost of your best run.",
    modeLabel: "Race type",
    modes: { speed: "Speed", item: "Items" },
    modeHints: { speed: "No items. Drift to fill the booster gauge, then fire your boosters.", item: "Grab item boxes: water balloons, soccer balls, bananas and more." },
    diffLabel: "Class",
    diffs: { rookie: "Rookie", l1: "L1", pro: "Pro" },
    diffHints: { rookie: "Friendly rivals. Good for learning to drift.", l1: "A real race.", pro: "The mascots drive to win." },
    chooseDriver: "Choose your driver",
    drivers: {
      leoul: { name: "Leoul", blurb: "Seoul E-Land's leopard. Loves a long straight and a big booster." },
      lenyang: { name: "Lenyang", blurb: "Leoul's cat friend. Small, quick and never lets go of a drift." },
    },
    chooseCup: "Choose a cup",
    chooseTrack: "Choose a track",
    cups: {
      seoul: { name: "Seoul Cup", field: "Four Seoul tracks against the capital-region clubs: Seongnam, Suwon FC, Suwon Samsung, Gimpo, Ansan, Hwaseong, Yongin and Paju." },
      korea: { name: "Korea Cup", field: "Four tracks in rival cities against Busan, Gyeongnam, Jeonnam, Daegu, Cheonan, Chungbuk Cheongju, Chungnam Asan and Gimhae." },
    },
    tracks: {
      mokdong: { name: "Mokdong Stadium Loop", ko: "목동 스타디움 루프", blurb: "Seoul E-Land's home. A wide loop round the stadium with a jump and an S-bend." },
      hangang: { name: "Han River Night Run", ko: "한강 나이트 런", blurb: "Yeouido at night: over the river on a high bridge, back on a low deck." },
      namsan: { name: "Namsan Tower Climb", ko: "남산 타워 클라임", blurb: "Hairpins up to N Seoul Tower and a fast drop through the pines." },
      suwon: { name: "Suwon Fortress Walls", ko: "수원 화성 성곽", blurb: "Through the fortress gates, over stone bridges and down a market alley." },
      busan: { name: "Busan Gwangan Bridge", ko: "부산 광안대교", blurb: "The beach road, then a long sweep over the sea on the bridge." },
      jinhae: { name: "Jinhae Cherry Blossoms", ko: "진해 벚꽃길", blurb: "Back and forth across the stream under the blossoms." },
      gwangyang: { name: "Gwangyang Dragon Harbor", ko: "광양 드래곤 하버", blurb: "Steelworks, a container slalom and the Yi Sun-sin Bridge." },
      daegu: { name: "Daegu Daefrica Heat", ko: "대구 대프리카", blurb: "Up to 83 Tower, down the fried-egg jumps, through the apple trees." },
    },
    back: "Back",
    start: "Start",
    laps: (n) => `${n} laps`,
    race: (n, of) => `Race ${n} of ${of}`,
    lap: "LAP",
    finalLap: "FINAL LAP!",
    wrongWay: "WRONG WAY",
    ready: "READY",
    go: "GO!",
    finish: "FINISH!",
    retireIn: (s) => `Finish in ${s}!`,
    retired: "RETIRE",
    boosts: { start: "Start boost!", instant: "Instant boost!", draft: "Slipstream!", nitro: "Booster!", pad: "Boost pad!", item: "Booster!" },
    items: { booster: "Booster", ball: "Soccer ball", balloon: "Water balloon", banana: "Banana", gloves: "Keeper gloves", magnet: "Magnet", redcard: "Red card", roar: "Leoul's roar" },
    hits: { puddle: "Splash!", balloon: "Splash!", banana: "Slipped!", ball: "Bonk!", redcard: "Red card!", roar: "Roar!" },
    blocked: "Blocked!",
    tapStart: "Hold ITEM on GO for a start boost",
    keysHint: "Arrows or WASD drive · Shift or Space drifts · Ctrl or E fires",
    pause: "Pause",
    paused: "Paused",
    resume: "Resume",
    restart: "Restart race",
    quit: "Quit to menu",
    music: "Music",
    results: "Race results",
    standings: (n, of) => `Standings after race ${n} of ${of}`,
    colPos: "Pos",
    colDriver: "Driver",
    colTime: "Time",
    colPts: "Pts",
    bestLap: "Best lap",
    total: "Total",
    next: "Next race",
    retry: "Race again",
    menu: "Menu",
    seeStandings: "Standings",
    cupResult: "Cup results",
    trophy: { gold: "Gold trophy!", silver: "Silver trophy!", bronze: "Bronze trophy!", none: "No trophy this time" },
    trophyText: {
      gold: "Champions! The whole of Mokdong is singing.",
      silver: "Runners-up. So close to the top step.",
      bronze: "On the podium. A trophy for the cabinet.",
      none: "Finish in the top three for a trophy. Try Rookie class if the mascots are too quick.",
    },
    ttResult: "Time trial",
    newRecord: "New record!",
    record: "Record",
    ghost: "Ghost",
    you: "You",
    ordinal: ord,
    controlsTitle: "Controls",
    controls: [
      "Keyboard: the arrows or WASD drive and steer. Hold Shift or Space while turning to drift. Ctrl, E or X fires your booster or item. P or Esc pauses.",
      "Phones and tablets: the kart accelerates by itself. Steer with the left and right buttons, hold DRIFT through corners, and tap ITEM. BRAKE backs you out of trouble.",
      "Gamepad: left stick steers, A accelerates, B brakes, X or RB drifts, Y or LB fires.",
    ],
    howTitle: "How to drive like a pro",
    how: [
      "Drift through corners to fill the booster gauge. A full gauge gives you a booster; you can carry two.",
      "Straighten the kart before you let go of a drift, or tap the accelerator right after, for an instant boost (blue flames).",
      "Tuck in right behind another kart on a straight for a slipstream boost.",
      "Press accelerate just before GO for a start boost.",
      "In item races, water balloons trap karts in a bubble, soccer balls chase the kart ahead, and a red card goes after the leader.",
    ],
    credits:
      "Leoul and Lenyang belong to Seoul E-Land FC. The other mascots belong to Ansan Greeners FC, Busan IPark, Cheonan City FC, Chungbuk Cheongju FC, Chungnam Asan FC, Daegu FC, Gimhae FC 2008, Gimpo FC, Gyeongnam FC, Hwaseong FC, Jeonnam Dragons, Paju Frontier FC, Seongnam FC, Suwon FC, Suwon Samsung Bluewings and Yongin FC, and are used with permission. Songs 서울의 노래 (2024 ver) and 사랑하는 나의 서울 이랜드 (2022 ver) used with Seoul E-Land FC's permission. Inspired by Nexon's KartRider. Tracks, karts and landmarks modelled in Blender for this game. Fan-made game, not an official club or Nexon product.",
  },
  pt: {
    pageTitle: "Mascot Kart | Seoul E-Land Digest",
    pageDescription: "Uma corrida de kart no estilo KartRider: pilote o Leoul ou o Lenyang contra os 16 outros mascotes da K League 2 em oito pistas, de Mokdong a Busan, com drifts, turbos e balões d'água.",
    eyebrow: "Novo jogo no navegador",
    heading: "Mascot Kart",
    intro: "Faça drift, use turbos e jogue balões d'água com o Leoul ou o Lenyang contra os mascotes dos outros 16 clubes da K League 2. Duas copas e oito pistas, do Estádio de Mokdong à Ponte Gwangan.",
    translateLabel: "English",
    translateAria: "Jogar em inglês",
    loading: "Esquentando os motores...",
    menuTagline: "Leoul e Lenyang contra a K League 2",
    gp: "Grand Prix",
    gpHint: "Quatro corridas, pontos por chegada e troféu para os três primeiros.",
    quick: "Corrida rápida",
    quickHint: "Uma corrida em qualquer pista.",
    tt: "Contra o relógio",
    ttHint: "Só você, o cronômetro e o fantasma da sua melhor volta.",
    modeLabel: "Tipo de corrida",
    modes: { speed: "Velocidade", item: "Itens" },
    modeHints: { speed: "Sem itens. Faça drift para encher a barra de turbo e dispare os turbos.", item: "Pegue as caixas de itens: balões d'água, bolas de futebol, bananas e mais." },
    diffLabel: "Categoria",
    diffs: { rookie: "Novato", l1: "L1", pro: "Pro" },
    diffHints: { rookie: "Rivais camaradas. Bom para aprender o drift.", l1: "Uma corrida de verdade.", pro: "Os mascotes correm para vencer." },
    chooseDriver: "Escolha o piloto",
    drivers: {
      leoul: { name: "Leoul", blurb: "O leopardo do Seoul E-Land. Adora uma reta longa e um turbão." },
      lenyang: { name: "Lenyang", blurb: "A gata amiga do Leoul. Pequena, rápida e não larga um drift." },
    },
    chooseCup: "Escolha a copa",
    chooseTrack: "Escolha a pista",
    cups: {
      seoul: { name: "Copa Seul", field: "Quatro pistas em Seul contra os clubes da região da capital: Seongnam, Suwon FC, Suwon Samsung, Gimpo, Ansan, Hwaseong, Yongin e Paju." },
      korea: { name: "Copa Coreia", field: "Quatro pistas nas cidades rivais contra Busan, Gyeongnam, Jeonnam, Daegu, Cheonan, Chungbuk Cheongju, Chungnam Asan e Gimhae." },
    },
    tracks: {
      mokdong: { name: "Circuito do Estádio de Mokdong", ko: "목동 스타디움 루프", blurb: "A casa do Seoul E-Land. Uma volta larga ao redor do estádio, com rampa e curva em S." },
      hangang: { name: "Noite no Rio Han", ko: "한강 나이트 런", blurb: "Yeouido à noite: sobre o rio numa ponte alta e de volta pelo tabuleiro baixo." },
      namsan: { name: "Subida da Torre Namsan", ko: "남산 타워 클라임", blurb: "Grampos até a N Seoul Tower e uma descida rápida entre os pinheiros." },
      suwon: { name: "Muralhas de Suwon", ko: "수원 화성 성곽", blurb: "Pelos portões da fortaleza, pontes de pedra e um beco de mercado." },
      busan: { name: "Ponte Gwangan de Busan", ko: "부산 광안대교", blurb: "A avenida da praia e depois uma longa curva sobre o mar." },
      jinhae: { name: "Cerejeiras de Jinhae", ko: "진해 벚꽃길", blurb: "Vai e volta sobre o riacho debaixo das flores." },
      gwangyang: { name: "Porto do Dragão de Gwangyang", ko: "광양 드래곤 하버", blurb: "Siderúrgica, slalom de contêineres e a Ponte Yi Sun-sin." },
      daegu: { name: "Calorão de Daegu", ko: "대구 대프리카", blurb: "Até a 83 Tower, pelas rampas de ovo frito e entre as macieiras." },
    },
    back: "Voltar",
    start: "Largar",
    laps: (n) => `${n} voltas`,
    race: (n, of) => `Corrida ${n} de ${of}`,
    lap: "VOLTA",
    finalLap: "ÚLTIMA VOLTA!",
    wrongWay: "CONTRAMÃO",
    ready: "PREPARAR",
    go: "JÁ!",
    finish: "CHEGADA!",
    retireIn: (s) => `Termine em ${s}!`,
    retired: "ABANDONO",
    boosts: { start: "Turbo de largada!", instant: "Turbo instantâneo!", draft: "Vácuo!", nitro: "Turbo!", pad: "Rampa de turbo!", item: "Turbo!" },
    items: { booster: "Turbo", ball: "Bola de futebol", balloon: "Balão d'água", banana: "Banana", gloves: "Luvas de goleiro", magnet: "Ímã", redcard: "Cartão vermelho", roar: "Rugido do Leoul" },
    hits: { puddle: "Splash!", balloon: "Splash!", banana: "Escorregou!", ball: "Pow!", redcard: "Cartão vermelho!", roar: "Rugido!" },
    blocked: "Defendeu!",
    tapStart: "Segure ITEM no JÁ para o turbo de largada",
    keysHint: "Setas ou WASD pilotam · Shift ou Espaço fazem drift · Ctrl ou E disparam",
    pause: "Pausar",
    paused: "Pausado",
    resume: "Continuar",
    restart: "Reiniciar corrida",
    quit: "Voltar ao menu",
    music: "Música",
    results: "Resultado da corrida",
    standings: (n, of) => `Classificação após a corrida ${n} de ${of}`,
    colPos: "Pos",
    colDriver: "Piloto",
    colTime: "Tempo",
    colPts: "Pts",
    bestLap: "Melhor volta",
    total: "Total",
    next: "Próxima corrida",
    retry: "Correr de novo",
    menu: "Menu",
    seeStandings: "Classificação",
    cupResult: "Resultado da copa",
    trophy: { gold: "Troféu de ouro!", silver: "Troféu de prata!", bronze: "Troféu de bronze!", none: "Sem troféu desta vez" },
    trophyText: {
      gold: "Campeões! Mokdong inteiro está cantando.",
      silver: "Vice. Quase no degrau mais alto.",
      bronze: "No pódio. Mais um troféu para a estante.",
      none: "Termine entre os três primeiros para ganhar um troféu. Tente a categoria Novato se os mascotes estiverem rápidos demais.",
    },
    ttResult: "Contra o relógio",
    newRecord: "Novo recorde!",
    record: "Recorde",
    ghost: "Fantasma",
    you: "Você",
    ordinal: (n) => `${n}º`,
    controlsTitle: "Controles",
    controls: [
      "Teclado: as setas ou WASD aceleram e viram. Segure Shift ou Espaço na curva para fazer drift. Ctrl, E ou X dispara o turbo ou o item. P ou Esc pausa.",
      "Celular e tablet: o kart acelera sozinho. Vire com os botões de esquerda e direita, segure DRIFT nas curvas e toque em ITEM. FREIO tira você de enrascadas.",
      "Controle: o analógico esquerdo vira, A acelera, B freia, X ou RB faz drift, Y ou LB dispara.",
    ],
    howTitle: "Como pilotar como profissional",
    how: [
      "Faça drift nas curvas para encher a barra de turbo. Barra cheia vale um turbo, e você pode guardar dois.",
      "Endireite o kart antes de soltar o drift, ou acelere logo depois, para um turbo instantâneo (fogo azul).",
      "Cole atrás de outro kart na reta para ganhar o vácuo.",
      "Acelere um pouco antes do JÁ para o turbo de largada.",
      "Nas corridas com itens, o balão d'água prende o kart numa bolha, a bola persegue o kart da frente e o cartão vermelho vai atrás do líder.",
    ],
    credits:
      "Leoul e Lenyang pertencem ao Seoul E-Land FC. Os outros mascotes pertencem ao Ansan Greeners FC, Busan IPark, Cheonan City FC, Chungbuk Cheongju FC, Chungnam Asan FC, Daegu FC, Gimhae FC 2008, Gimpo FC, Gyeongnam FC, Hwaseong FC, Jeonnam Dragons, Paju Frontier FC, Seongnam FC, Suwon FC, Suwon Samsung Bluewings e Yongin FC, e são usados com permissão. Músicas 서울의 노래 (versão 2024) e 사랑하는 나의 서울 이랜드 (versão 2022) usadas com permissão do Seoul E-Land FC. Inspirado no KartRider da Nexon. Pistas, karts e pontos turísticos modelados no Blender para este jogo. Jogo feito por fãs, não é um produto oficial do clube nem da Nexon.",
  },
};
