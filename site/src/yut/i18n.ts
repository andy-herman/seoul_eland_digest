import { OPPONENTS, OPPONENT_SLUGS } from "../h2h/data";
export type Locale = "en" | "pt";
export const RIVAL_CHOICES = OPPONENT_SLUGS.map((slug) => ({ slug, name: OPPONENTS[slug].name, club: OPPONENTS[slug].club }));
export interface YutStrings {
  pageTitle: string; pageDescription: string; eyebrow: string; heading: string; ko: string; intro: string; translateLabel: string; translateAria: string;
  play: string; rivalMode: string; passMode: string; friendly: string; pro: string; pickRival: string; menu: string; howTitle: string; controlsTitle: string; credits: string;
  scoreboard: string; throw: string; queue: string; bench: string; newPiece: string; confirm: string; cancel: string; turn: string; goals: string; result: string; restart: string; save: string;
  hints: string[]; how: string[]; controls: string[];
  terms: Record<string, string>; commentary: Record<string, string>;
}
export const YUT_STRINGS: Record<Locale, YutStrings> = {
  en: {
    pageTitle: "Yut Nori FC | Seoul E-Land Digest",
    pageDescription: "Play Korea's traditional Yut Nori as a Seoul E-Land FC football board game with Leoul, Lenyang and K League 2 mascots.",
    eyebrow: "Traditional game, football twist", heading: "Yut Nori FC", ko: "윷놀이 FC",
    intro: "Throw the sticks on the mat, send your runners around the pitch, stack teammates, tackle rivals and race four pieces over the goal line. Perfect for 설날, Seollal, Korean New Year.",
    translateLabel: "Português", translateAria: "Play in Portuguese", play: "Play", rivalMode: "Vs mascot", passMode: "Pass and play", friendly: "Friendly", pro: "Pro", pickRival: "Pick a rival", menu: "Menu",
    howTitle: "How to play", controlsTitle: "Controls", credits: "Yut Nori is a traditional Korean game. Leoul and Lenyang belong to Seoul E-Land FC; the other K League 2 mascots belong to their clubs; all are used with permission.",
    scoreboard: "Score", throw: "Throw", queue: "Throw queue", bench: "Bench", newPiece: "New piece", confirm: "Tap destination to confirm", cancel: "Cancel", turn: "Turn", goals: "goals", result: "Full time", restart: "Restart", save: "Records saved on this device",
    hints: ["Flick up, click and release, or press Space to throw.", "Choose any saved result and any legal piece. Yut and mo give another throw.", "A capture gives another throw. Stacks move together."],
    how: ["The board is a 윷판 drawn as a football pitch. Start at A, move counter-clockwise around the square, and use the diagonal shortcuts only when a piece starts a move from B, C or the centre O.", "Throws are 도 1, 개 2, 걸 3, 윷 4 and 모 5. 윷 and 모 are Counter-attack throws, so you throw again. If only the marked stick is flat it is 빽도, a Back-pass one step backward.", "Landing on your own piece makes a stack, 업기, called a One-two here. Landing on an opponent is a tackle, 잡기, and sends the full stack back to the bench.", "Landing exactly on A is not home. A later forward step crosses your goal line and scores. The first side to score all four pieces wins."],
    controls: ["Keyboard: Space or Enter throws. Tab cycles choices, arrow keys move across pieces, Enter confirms.", "Mouse: click the mat to throw, then click a throw, a piece and the highlighted destination.", "Touch: flick up on the mat to throw. In play mode the board fills the screen on phones; menus still scroll normally."],
    terms: { do: "do", gae: "gae", geol: "geol", yut: "yut", mo: "mo", back: "back-do" },
    commentary: { home: "Goal!", capture: "Tackle!", stack: "One-two!", shortcut: "Through ball!", extra: "Counter-attack! Throw again", back: "Back-pass!", lost: "That throw cannot be used." },
  },
  pt: {
    pageTitle: "Yut Nori FC | Seoul E-Land Digest",
    pageDescription: "Jogue o tradicional Yut Nori coreano como um jogo de futebol do Seoul E-Land FC, com Leoul, Lenyang e mascotes da K League 2.",
    eyebrow: "Jogo tradicional, versão futebol", heading: "Yut Nori FC", ko: "윷놀이 FC",
    intro: "Arremesse os bastões no tapete, avance pelo gramado, junte companheiros, dê carrinhos nos rivais e leve as quatro peças até a linha do gol. Perfeito para 설날, Seollal, o Ano Novo Coreano.",
    translateLabel: "English", translateAria: "Jogar em inglês", play: "Jogar", rivalMode: "Contra mascote", passMode: "Dois jogadores", friendly: "Amistoso", pro: "Pro", pickRival: "Escolha o rival", menu: "Menu",
    howTitle: "Como jogar", controlsTitle: "Controles", credits: "Yut Nori é um jogo tradicional coreano. Leoul e Lenyang pertencem ao Seoul E-Land FC; os outros mascotes da K League 2 pertencem aos seus clubes; todos são usados com permissão.",
    scoreboard: "Placar", throw: "Arremessar", queue: "Fila de arremessos", bench: "Banco", newPiece: "Nova peça", confirm: "Toque no destino para confirmar", cancel: "Cancelar", turn: "Vez", goals: "gols", result: "Fim de jogo", restart: "Recomeçar", save: "Recordes salvos neste aparelho",
    hints: ["Deslize para cima, clique e solte, ou aperte Espaço para arremessar.", "Escolha qualquer resultado guardado e qualquer peça legal. 윷 e 모 dão outro arremesso.", "Uma captura dá outro arremesso. Pilhas se movem juntas."],
    how: ["O tabuleiro é um 윷판 desenhado como campo de futebol. Saia do A, avance no sentido anti-horário e use atalhos diagonais só quando a peça começa a jogada no B, no C ou no centro O.", "Os arremessos são 도 1, 개 2, 걸 3, 윷 4 e 모 5. 윷 e 모 são Contra-ataques, então você joga outra vez. Se só o bastão marcado cair plano, é 빽도, um Passe para trás.", "Cair na sua própria peça forma uma pilha, 업기, aqui chamada de Tabela. Cair no adversário é carrinho, 잡기, e manda a pilha inteira para o banco.", "Cair exatamente no A ainda não é gol. Um passo seguinte cruza a linha do gol. Quem marcar com as quatro peças vence."],
    controls: ["Teclado: Espaço ou Enter arremessa. Tab alterna escolhas, setas mudam a peça, Enter confirma.", "Mouse: clique no tapete para arremessar, depois clique em um resultado, uma peça e o destino destacado.", "Toque: deslize para cima no tapete. Durante a partida o tabuleiro ocupa a tela no celular; os menus continuam rolando."],
    terms: { do: "do", gae: "gae", geol: "geol", yut: "yut", mo: "mo", back: "back-do" },
    commentary: { home: "Gol!", capture: "Carrinho!", stack: "Tabela!", shortcut: "Bola enfiada!", extra: "Contra-ataque! Jogue de novo", back: "Passe para trás!", lost: "Esse arremesso não pode ser usado." },
  },
};
