// Clap for Seoul copy in English and Portuguese (Brazil). No em dashes in site copy.
import type { ChantId } from "./chants";
import type { Judgment } from "./match";

export type Locale = "en" | "pt";

export interface ClapStrings {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  ko: string;
  intro: string;
  translateLabel: string;
  translateAria: string;
  loading: string;
  loadingSong: (pct: number) => string;
  inputTitle: string;
  micMode: string;
  micBlurb: string;
  tapMode: string;
  tapBlurb: string;
  levelTitle: string;
  levels: Record<"casual" | "ultras", { name: string; blurb: string }>;
  rivalTitle: string;
  nextMatch: (round: number) => string;
  tiers: Record<1 | 2 | 3 | 4, string>;
  kickOff: string;
  micAsking: string;
  micDenied: string;
  micUnsupported: string;
  micOn: string;
  calibrate: string;
  calTitle: string;
  calText: string;
  calStart: string;
  calResult: (ms: number) => string;
  calNone: string;
  bleedHint: string;
  songTitle: string;
  songPace: Record<"seoul-song-2024" | "my-seoul-eland-2022", string>;
  calDone: string;
  sensitivity: string;
  sensHint: string;
  chants: Record<ChantId, { name: string; how: string }>;
  next: string;
  judgments: Record<Judgment, string>;
  chanceHome: string;
  chanceAway: (mascot: string) => string;
  goalHome: (scorer: string) => string;
  goalAway: (mascot: string) => string;
  saveHome: string;
  saveAway: string;
  clearHome: string;
  clearAway: string;
  kickoffLine: string;
  halfLine: string;
  fullLine: string;
  room: string;
  clap: string;
  shout: string;
  pause: string;
  paused: string;
  resume: string;
  quit: string;
  restart: string;
  resultWin: string;
  resultDraw: string;
  resultLoss: string;
  resultText: (ours: number, theirs: number, opp: string) => string;
  accuracy: string;
  claps: string;
  loudest: string;
  perfects: string;
  stars: [string, string, string];
  record: (w: number, d: number, l: number) => string;
  again: string;
  menu: string;
  scorer: string;
  howTitle: string;
  how: string[];
  controlsTitle: string;
  controls: string[];
  privacy: string;
  credits: string;
}

const en: ClapStrings = {
  pageTitle: "Clap for Seoul: your claps are the controller | Seoul E-Land Digest",
  pageDescription:
    "A football match you play with your hands and voice. Clap the supporters' chants on the beat of 서울의 노래 (2024 ver) or 사랑하는 나의 서울 이랜드 (2022 ver) and the noise in the room drives Seoul E-Land's attacks. Made for watch parties, with a tap mode for quiet places.",
  eyebrow: "Mascot games · Clap for Seoul",
  heading: "Clap for Seoul",
  ko: "짝짝 짝짝짝",
  intro:
    "The microphone is the controller. Leoul leads the chants from the supporters' end: clap 짝짝 짝짝짝 and shout 서울! on the beat of the club song, and every chant you land pushes the team forward. A louder, tighter room scores more goals.",
  translateLabel: "Português",
  translateAria: "Ler em português",
  loading: "Filling the supporters' end…",
  loadingSong: (p) => `Loading the song… ${p}%`,
  inputTitle: "How will you cheer?",
  micMode: "Microphone",
  micBlurb: "Real claps and shouts. Best with a room full of fans. The audio never leaves your device.",
  tapMode: "Tap",
  tapBlurb: "Tap Clap and hold Shout on screen, or use Space and Enter.",
  levelTitle: "Timing",
  levels: {
    casual: { name: "Casual", blurb: "Wider timing windows for a lively living room." },
    ultras: { name: "Ultras", blurb: "Tight timing, like the real supporters' end." },
  },
  rivalTitle: "Opponent",
  nextMatch: (r) => `Next real match: Round ${r}`,
  tiers: { 1: "Friendly", 2: "Organised", 3: "Sharp", 4: "Elite" },
  kickOff: "Kick off",
  micAsking: "Allow the microphone so the game can hear your claps.",
  micDenied: "The microphone is blocked, so tap mode is on. You can allow it in the browser settings.",
  micUnsupported: "This browser cannot listen for claps, so tap mode is on.",
  micOn: "Listening",
  calibrate: "Calibrate",
  calTitle: "Clap with the beeps",
  calText: "Eight beeps are coming. Clap on each one so the game can learn your microphone's delay.",
  calStart: "Start",
  calResult: (ms) => `Your microphone is ${ms} ms late. Saved.`,
  calNone: "No claps heard. Clap louder, or turn the sensitivity up.",
  songTitle: "Which song?",
  songPace: { "seoul-song-2024": "steady, a good first match", "my-seoul-eland-2022": "faster, and a longer match" },
  bleedHint: "The song was leaking back into the microphone, which makes shouts hard to hear. Turn the speakers down a little, point them away from the device, or play the song on headphones.",
  calDone: "Done",
  sensitivity: "Clap sensitivity",
  sensHint: "Turn it down in a noisy bar, up in a quiet room.",
  chants: {
    jjak5: { name: "짝짝 짝짝짝", how: "Clap two slow, then three quick" },
    jjak3: { name: "짝짝짝 짝짝짝", how: "Three quick claps, twice" },
    seoul: { name: "서울! 서울!", how: "Shout SEOUL twice" },
    eland: { name: "짝 짝 짝 이랜드!", how: "Three claps, then shout E-LAND" },
    roll: { name: "박수 폭풍", how: "Clap storm: clap as fast as you can" },
    hush: { name: "쉿!", how: "Total silence" },
  },
  next: "Next",
  judgments: { perfect: "PERFECT", great: "GREAT", good: "GOOD", miss: "MISS" },
  chanceHome: "Seoul E-Land attack! Clap them on!",
  chanceAway: (m) => `${m} on the attack! Make some noise!`,
  goalHome: (s) => `GOAL! ${s} scores!`,
  goalAway: (m) => `${m} score. Lift them again!`,
  saveHome: "Saved! So close",
  saveAway: "Min Sung-jun saves!",
  clearHome: "Cleared. Keep singing",
  clearAway: "Blocked! The noise put them off",
  kickoffLine: "Kick-off at Mokdong!",
  halfLine: "Half-time. Catch your breath",
  fullLine: "Full time!",
  room: "Room",
  clap: "Clap",
  shout: "Shout",
  pause: "Pause",
  paused: "Paused",
  resume: "Resume",
  quit: "Quit",
  restart: "Restart",
  resultWin: "Win!",
  resultDraw: "Draw",
  resultLoss: "Defeat",
  resultText: (a, b, o) => `Seoul E-Land ${a}-${b} ${o}`,
  accuracy: "Chant accuracy",
  claps: "Claps heard",
  loudest: "Loudest moment",
  perfects: "Perfect beats",
  stars: ["Win the match", "Win with 72% chant accuracy", "Win by two with 88% accuracy"],
  record: (w, d, l) => `Your record against them: ${w} W, ${d} D, ${l} L`,
  again: "Play again",
  menu: "Menu",
  scorer: "the 12th man",
  howTitle: "How it works",
  how: [
    "Leoul calls a chant a bar before it starts. Clap or shout it on the beat of the club song.",
    "Every chant you land pushes Seoul E-Land forward on the momentum bar. A quiet room lets the rival build pressure.",
    "When the ball reaches their box, the next chant is the shot: land it and it is a goal.",
    "When the rival attacks, the next chant defends: a loud, tight room puts their striker off.",
    "Stray claps between the beats cost accuracy, so a clap storm is only for the 박수 폭풍.",
  ],
  controlsTitle: "Controls",
  controls: [
    "Microphone: clap with your hands and shout SEOUL and E-LAND. Works best with the phone or laptop facing the room.",
    "Tap mode: tap Clap on the beat and hold Shout for the shouted chants. On a keyboard use Space to clap and hold Enter to shout.",
    "If your claps land late, run Calibrate from the menu.",
  ],
  privacy: "The microphone is only used while a match is playing, and the sound is analysed on your device. Nothing is recorded or uploaded.",
  credits:
    "Leoul, Lenyang and the songs 서울의 노래 (2024 ver) and 사랑하는 나의 서울 이랜드 (2022 ver) belong to Seoul E-Land FC. The other K League 2 mascots belong to their clubs. All are used with permission.",
};

const pt: ClapStrings = {
  pageTitle: "Clap for Seoul: suas palmas são o controle | Seoul E-Land Digest",
  pageDescription:
    "Um jogo de futebol que você joga com as mãos e a voz. Bata palmas nos gritos da torcida no ritmo de 서울의 노래 (versão 2024) ou 사랑하는 나의 서울 이랜드 (versão 2022) e o barulho da sala empurra os ataques do Seoul E-Land. Feito para assistir aos jogos em grupo, com um modo de toque para lugares silenciosos.",
  eyebrow: "Jogos dos mascotes · Clap for Seoul",
  heading: "Clap for Seoul",
  ko: "짝짝 짝짝짝",
  intro:
    "O microfone é o controle. O Leoul puxa os gritos da arquibancada: bata 짝짝 짝짝짝 e grite 서울! no ritmo da música do clube, e cada grito certo empurra o time para a frente. Uma sala mais alta e mais afinada faz mais gols.",
  translateLabel: "English",
  translateAria: "Read in English",
  loading: "Enchendo a arquibancada…",
  loadingSong: (p) => `Carregando a música… ${p}%`,
  inputTitle: "Como você vai torcer?",
  micMode: "Microfone",
  micBlurb: "Palmas e gritos de verdade. Melhor com uma sala cheia de torcedores. O áudio nunca sai do seu aparelho.",
  tapMode: "Toque",
  tapBlurb: "Toque em Palmas e segure Grito na tela, ou use Espaço e Enter.",
  levelTitle: "Ritmo",
  levels: {
    casual: { name: "Casual", blurb: "Janelas de tempo mais largas para uma sala animada." },
    ultras: { name: "Ultras", blurb: "Tempo apertado, como na arquibancada de verdade." },
  },
  rivalTitle: "Adversário",
  nextMatch: (r) => `Próximo jogo real: rodada ${r}`,
  tiers: { 1: "Amistoso", 2: "Organizado", 3: "Afiado", 4: "Elite" },
  kickOff: "Começar",
  micAsking: "Permita o microfone para o jogo ouvir suas palmas.",
  micDenied: "O microfone está bloqueado, então o modo de toque está ativo. Dá para liberar nas configurações do navegador.",
  micUnsupported: "Este navegador não consegue ouvir palmas, então o modo de toque está ativo.",
  micOn: "Ouvindo",
  calibrate: "Calibrar",
  calTitle: "Bata palmas com os bipes",
  calText: "Vêm oito bipes. Bata palmas em cada um para o jogo aprender o atraso do seu microfone.",
  calStart: "Começar",
  calResult: (ms) => `Seu microfone atrasa ${ms} ms. Salvo.`,
  calNone: "Nenhuma palma ouvida. Bata mais forte ou aumente a sensibilidade.",
  songTitle: "Qual música?",
  songPace: { "seoul-song-2024": "ritmo firme, bom para começar", "my-seoul-eland-2022": "mais rápida, e uma partida mais longa" },
  bleedHint: "A música estava vazando de volta para o microfone, o que dificulta ouvir os gritos. Abaixe um pouco o som, vire as caixas para longe do aparelho ou toque a música no fone.",
  calDone: "Pronto",
  sensitivity: "Sensibilidade das palmas",
  sensHint: "Diminua num bar barulhento, aumente numa sala silenciosa.",
  chants: {
    jjak5: { name: "짝짝 짝짝짝", how: "Duas palmas lentas, depois três rápidas" },
    jjak3: { name: "짝짝짝 짝짝짝", how: "Três palmas rápidas, duas vezes" },
    seoul: { name: "서울! 서울!", how: "Grite SEOUL duas vezes" },
    eland: { name: "짝 짝 짝 이랜드!", how: "Três palmas, depois grite E-LAND" },
    roll: { name: "박수 폭풍", how: "Tempestade de palmas: bata o mais rápido que puder" },
    hush: { name: "쉿!", how: "Silêncio total" },
  },
  next: "Próximo",
  judgments: { perfect: "PERFEITO", great: "ÓTIMO", good: "BOM", miss: "ERROU" },
  chanceHome: "Ataque do Seoul E-Land! Empurrem o time!",
  chanceAway: (m) => `${m} no ataque! Façam barulho!`,
  goalHome: (s) => `GOL! ${s} marca!`,
  goalAway: (m) => `Gol de ${m}. Levantem o time de novo!`,
  saveHome: "Defendeu! Quase",
  saveAway: "Min Sung-jun defende!",
  clearHome: "Afastada. Continuem cantando",
  clearAway: "Bloqueado! O barulho atrapalhou",
  kickoffLine: "Bola rolando em Mokdong!",
  halfLine: "Intervalo. Respirem",
  fullLine: "Fim de jogo!",
  room: "Sala",
  clap: "Palmas",
  shout: "Grito",
  pause: "Pausar",
  paused: "Pausado",
  resume: "Continuar",
  quit: "Sair",
  restart: "Recomeçar",
  resultWin: "Vitória!",
  resultDraw: "Empate",
  resultLoss: "Derrota",
  resultText: (a, b, o) => `Seoul E-Land ${a}-${b} ${o}`,
  accuracy: "Precisão nos gritos",
  claps: "Palmas ouvidas",
  loudest: "Momento mais alto",
  perfects: "Batidas perfeitas",
  stars: ["Vença o jogo", "Vença com 72% de precisão", "Vença por dois com 88% de precisão"],
  record: (w, d, l) => `Seu retrospecto contra eles: ${w} V, ${d} E, ${l} D`,
  again: "Jogar de novo",
  menu: "Menu",
  scorer: "o 12º jogador",
  howTitle: "Como funciona",
  how: [
    "O Leoul anuncia cada grito um compasso antes. Bata palmas ou grite no ritmo da música do clube.",
    "Cada grito certo empurra o Seoul E-Land na barra de pressão. Uma sala quieta deixa o adversário crescer.",
    "Quando a bola chega na área deles, o próximo grito é o chute: acerte e é gol.",
    "Quando o adversário ataca, o próximo grito defende: uma sala alta e afinada atrapalha o atacante deles.",
    "Palmas fora da batida custam precisão, então a tempestade de palmas é só no 박수 폭풍.",
  ],
  controlsTitle: "Controles",
  controls: [
    "Microfone: bata palmas com as mãos e grite SEOUL e E-LAND. Funciona melhor com o celular ou o notebook virado para a sala.",
    "Modo de toque: toque em Palmas na batida e segure Grito nos gritos. No teclado, use Espaço para palmas e segure Enter para gritar.",
    "Se suas palmas chegam atrasadas, use Calibrar no menu.",
  ],
  privacy: "O microfone só é usado durante o jogo, e o som é analisado no seu aparelho. Nada é gravado nem enviado.",
  credits:
    "Leoul, Lenyang e as músicas 서울의 노래 (versão 2024) e 사랑하는 나의 서울 이랜드 (versão 2022) pertencem ao Seoul E-Land FC. Os mascotes dos outros clubes da K League 2 pertencem aos seus clubes. Todos são usados com permissão.",
};

export const CLAP_STRINGS: Record<Locale, ClapStrings> = { en, pt };
