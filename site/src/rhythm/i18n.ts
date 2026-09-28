// Seoul Song Rhythm copy in English and Portuguese. No em dashes in site copy.
export type Locale = "en" | "pt";

export interface RhythmStrings {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  ko: string;
  intro: string;
  translateLabel: string;
  translateAria: string;
  loading: string;
  loadingSong: string;
  play: string;
  songLabel: string;
  diffLabel: string;
  diffs: Record<"easy" | "normal" | "hard", { name: string; ko: string; blurb: string }>;
  notes: string;
  best: string;
  noBest: string;
  settings: string;
  speed: string;
  speedHint: string;
  offset: string;
  offsetHint: string;
  calibrate: string;
  calTitle: string;
  calText: string;
  calTap: string;
  calResult: (ms: number) => string;
  calDone: string;
  calAgain: string;
  hitSounds: string;
  on: string;
  off: string;
  pause: string;
  paused: string;
  resume: string;
  restart: string;
  quit: string;
  score: string;
  accuracy: string;
  maxCombo: string;
  combo: string;
  fever: string;
  judgments: Record<"perfect" | "great" | "good" | "miss", string>;
  early: string;
  late: string;
  results: string;
  newBest: string;
  fullCombo: string;
  allPerfect: string;
  retry: string;
  menu: string;
  gradeText: Record<"S" | "A" | "B" | "C" | "D", string>;
  keysHint: string;
  touchHint: string;
  howTitle: string;
  how: string[];
  controlsTitle: string;
  controls: string[];
  credits: string;
  audioError: string;
}

export const RHYTHM_STRINGS: Record<Locale, RhythmStrings> = {
  en: {
    pageTitle: "Seoul Song Rhythm | Seoul E-Land Digest",
    pageDescription: "A rhythm game to the club songs 서울의 노래 (2024 ver) and 사랑하는 나의 서울 이랜드 (2022 ver): drum along with Leoul, Lenyang and the Mokdong supporters' end on four lanes, in Easy, Normal and Hard.",
    eyebrow: "New browser game",
    heading: "Seoul Song Rhythm",
    ko: "서울의 노래 리듬",
    intro: "Drum along to the club's songs, 서울의 노래 (2024 ver) and 사랑하는 나의 서울 이랜드 (2022 ver), with Leoul, Lenyang and the whole supporters' end. Hit the notes as they reach the drums, hold the long ones, and build a combo until the stand goes into fever.",
    translateLabel: "Português",
    translateAria: "Play in Portuguese",
    loading: "Loading the stand…",
    loadingSong: "Loading the song…",
    play: "Play",
    songLabel: "Song",
    diffLabel: "Difficulty",
    diffs: {
      easy: { name: "Easy", ko: "쉬움", blurb: "The beat and the big moments. Good for a first go." },
      normal: { name: "Normal", ko: "보통", blurb: "The melody line, with chords in the chorus." },
      hard: { name: "Hard", ko: "어려움", blurb: "Every hit of the drums and the vocals, holds and all." },
    },
    notes: "notes",
    best: "Best",
    noBest: "Not played yet",
    settings: "Settings",
    speed: "Note speed",
    speedHint: "Higher is faster and gives you less time to read.",
    offset: "Timing",
    offsetHint: "If your hits feel late, for example on Bluetooth headphones, raise it.",
    calibrate: "Calibrate",
    calTitle: "Timing check",
    calText: "Tap any key, or the screen, on every click. Sixteen clicks, the same tempo as the song.",
    calTap: "Tap on the click",
    calResult: (ms) => `Your timing: ${ms > 0 ? "+" : ""}${ms} ms`,
    calDone: "Use this",
    calAgain: "Try again",
    hitSounds: "Drum sounds",
    on: "On",
    off: "Off",
    pause: "Pause",
    paused: "Paused",
    resume: "Resume",
    restart: "Restart",
    quit: "Quit",
    score: "Score",
    accuracy: "Accuracy",
    maxCombo: "Max combo",
    combo: "Combo",
    fever: "Fever",
    judgments: { perfect: "Perfect", great: "Great", good: "Good", miss: "Miss" },
    early: "Early",
    late: "Late",
    results: "Results",
    newBest: "New best!",
    fullCombo: "Full combo",
    allPerfect: "All perfect",
    retry: "Play again",
    menu: "Menu",
    gradeText: {
      S: "Leoul Park is shaking. The whole stand is singing with you.",
      A: "Brilliant drumming. The capo wants you on the front row.",
      B: "A proper away-day shift. The stand is behind you.",
      C: "You kept the song going. One more and it clicks.",
      D: "Even the capo misses a beat. Warm up and go again!",
    },
    keysHint: "D F J K",
    touchHint: "Tap the lanes",
    howTitle: "How to play",
    how: [
      "Notes fall down four lanes onto the drums. Hit each one as it reaches its drum: Perfect, Great and Good all keep your combo going, a Miss breaks it.",
      "Long notes are holds. Keep holding until the tail passes the drum.",
      "Keep the hits coming to fill the fever gauge. In fever every hit scores double, and a big combo multiplies your score up to four times.",
      "Your grade comes from accuracy: S from 95%, A from 90%, B from 80%, C from 70%.",
    ],
    controlsTitle: "Controls",
    controls: [
      "Keyboard: D, F, J and K, or the arrow keys, for the four lanes. P or Esc pauses.",
      "Phone and tablet: tap and hold anywhere in a lane. Two thumbs work best; turn the phone sideways for wider lanes.",
      "If the notes feel early or late, use Calibrate in the settings. On iPhone, switch off silent mode if you cannot hear the music.",
    ],
    credits:
      "The songs 서울의 노래 (2024 ver) and 사랑하는 나의 서울 이랜드 (2022 ver), Leoul and Lenyang belong to Seoul E-Land FC and are used with permission. The Mokdong stand, the drums and the notes were made in Blender for this game, and the charts were built from a beat and melody analysis of each song.",
    audioError: "The song did not load. Check your connection and try again.",
  },
  pt: {
    pageTitle: "Seoul Song Rhythm | Seoul E-Land Digest",
    pageDescription: "Um jogo de ritmo com as músicas do clube, 서울의 노래 (versão 2024) e 사랑하는 나의 서울 이랜드 (versão 2022): toque tambor com o Leoul, o Lenyang e a torcida de Mokdong em quatro pistas, no Fácil, Normal e Difícil.",
    eyebrow: "Novo jogo no navegador",
    heading: "Seoul Song Rhythm",
    ko: "서울의 노래 리듬",
    intro: "Toque tambor ao som das músicas do clube, 서울의 노래 (versão 2024) e 사랑하는 나의 서울 이랜드 (versão 2022), com o Leoul, o Lenyang e toda a torcida. Acerte as notas quando chegarem aos tambores, segure as longas e faça combos até a arquibancada entrar em febre.",
    translateLabel: "English",
    translateAria: "Jogar em inglês",
    loading: "Carregando a arquibancada…",
    loadingSong: "Carregando a música…",
    play: "Jogar",
    songLabel: "Música",
    diffLabel: "Dificuldade",
    diffs: {
      easy: { name: "Fácil", ko: "쉬움", blurb: "A batida e os grandes momentos. Bom para começar." },
      normal: { name: "Normal", ko: "보통", blurb: "A melodia, com acordes no refrão." },
      hard: { name: "Difícil", ko: "어려움", blurb: "Cada batida da bateria e da voz, com notas longas e tudo." },
    },
    notes: "notas",
    best: "Recorde",
    noBest: "Ainda não jogado",
    settings: "Ajustes",
    speed: "Velocidade das notas",
    speedHint: "Mais alto é mais rápido e dá menos tempo para ler.",
    offset: "Tempo",
    offsetHint: "Se os acertos parecem atrasados, por exemplo com fone Bluetooth, aumente.",
    calibrate: "Calibrar",
    calTitle: "Teste de tempo",
    calText: "Toque qualquer tecla, ou a tela, a cada clique. Dezesseis cliques, no mesmo ritmo da música.",
    calTap: "Toque no clique",
    calResult: (ms) => `Seu tempo: ${ms > 0 ? "+" : ""}${ms} ms`,
    calDone: "Usar este",
    calAgain: "Tentar de novo",
    hitSounds: "Som do tambor",
    on: "Ligado",
    off: "Desligado",
    pause: "Pausar",
    paused: "Pausado",
    resume: "Continuar",
    restart: "Recomeçar",
    quit: "Sair",
    score: "Pontos",
    accuracy: "Precisão",
    maxCombo: "Combo máximo",
    combo: "Combo",
    fever: "Febre",
    judgments: { perfect: "Perfeito", great: "Ótimo", good: "Bom", miss: "Erro" },
    early: "Cedo",
    late: "Tarde",
    results: "Resultado",
    newBest: "Novo recorde!",
    fullCombo: "Combo completo",
    allPerfect: "Tudo perfeito",
    retry: "Jogar de novo",
    menu: "Menu",
    gradeText: {
      S: "O Leoul Park está tremendo. A arquibancada inteira canta com você.",
      A: "Que batucada! O puxador quer você na primeira fila.",
      B: "Uma boa jornada de torcida. A arquibancada está com você.",
      C: "Você manteve a música viva. Mais uma e encaixa.",
      D: "Até o puxador erra uma batida. Aqueça e tente de novo!",
    },
    keysHint: "D F J K",
    touchHint: "Toque nas pistas",
    howTitle: "Como jogar",
    how: [
      "As notas descem por quatro pistas até os tambores. Acerte cada uma quando chegar ao tambor: Perfeito, Ótimo e Bom mantêm o combo, um Erro quebra.",
      "Notas longas são para segurar. Segure até a cauda passar pelo tambor.",
      "Acerte em sequência para encher a barra de febre. Na febre cada acerto vale o dobro, e um combo grande multiplica os pontos até quatro vezes.",
      "A nota final vem da precisão: S a partir de 95%, A de 90%, B de 80%, C de 70%.",
    ],
    controlsTitle: "Controles",
    controls: [
      "Teclado: D, F, J e K, ou as setas, para as quatro pistas. P ou Esc pausa.",
      "Celular e tablet: toque e segure em qualquer ponto de uma pista. Dois polegares funcionam melhor; vire o celular para pistas mais largas.",
      "Se as notas parecem adiantadas ou atrasadas, use Calibrar nos ajustes. No iPhone, desligue o modo silencioso se não ouvir a música.",
    ],
    credits:
      "As músicas 서울의 노래 (versão 2024) e 사랑하는 나의 서울 이랜드 (versão 2022), o Leoul e o Lenyang pertencem ao Seoul E-Land FC e são usados com permissão. A arquibancada de Mokdong, os tambores e as notas foram feitos no Blender para este jogo, e as partituras saíram de uma análise das batidas e da melodia de cada música.",
    audioError: "A música não carregou. Verifique a conexão e tente de novo.",
  },
};
