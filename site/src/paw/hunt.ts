export type PawChapter = 1 | 2 | 3;

export interface PawClue {
  id: string;
  number: number;
  chapter: PawChapter;
  chapterTitle: string;
  targetPath: string;
  targetPathPt?: string;
  selector: string;
  riddle: { en: string; pt: string };
  hint: { en: string; pt: string };
  source: { file: string; snippet: string };
}

export const PAW_TOTAL = 21;

export const CHAPTERS = [
  { number: 1, title: { en: "Matchday", pt: "Dia de jogo" } },
  { number: 2, title: { en: "The Squad", pt: "O elenco" } },
  { number: 3, title: { en: "Deep Digest", pt: "Digest profundo" } },
] as const;

export const PAWS: PawClue[] = [
  {
    id: "tracker-31-points",
    number: 1,
    chapter: 1,
    chapterTitle: "Matchday",
    targetPath: "/tracker/",
    targetPathPt: "/pt/tracker/",
    selector: "main h1, main h2",
    riddle: {
      en: "I chased a frozen prophecy: nine wins, four draws, three losses, and 31 little fish. Which scoreboard is Lenyang batting at?",
      pt: "Corri atrás de uma previsão congelada: nove vitórias, quatro empates, três derrotas e 31 peixinhos. Em qual placar a Lenyang mexeu?",
    },
    hint: { en: "Season tracker", pt: "Tracker da temporada" },
    source: {
      file: "site/src/data/seasonTracker.ts",
      snippet: "Summed: 9 wins, 4 draws, 3 losses = 31 points.",
    },
  },
  {
    id: "matches-results-source",
    number: 2,
    chapter: 1,
    chapterTitle: "Matchday",
    targetPath: "/matches/",
    targetPathPt: "/pt/matches/",
    selector: "main h1, main h2",
    riddle: {
      en: "I wanted results, upcoming fixtures, kickoff details, and links to every report in one burrow. Where did Lenyang sort the match trail?",
      pt: "Eu queria resultados, próximos jogos, horários e links para cada relato em uma toca só. Onde a Lenyang organizou a trilha das partidas?",
    },
    hint: { en: "Matches", pt: "Partidas" },
    source: {
      file: "site/src/pages/matches.astro",
      snippet: "The Seoul E-Land fixture list in one place: results, upcoming matches, kickoff details, and links into the round-by-round reports.",
    },
  },
  {
    id: "squad-card-links",
    number: 3,
    chapter: 1,
    chapterTitle: "Matchday",
    targetPath: "/players/",
    targetPathPt: "/pt/players/",
    selector: "main h1, main h2",
    riddle: {
      en: "I found shirt numbers, positions, photos, and little doors to every player. Which squad den did I scratch?",
      pt: "Achei números de camisa, posições, fotos e portinhas para cada jogador. Em qual toca do elenco eu arranhei?",
    },
    hint: { en: "Squad page", pt: "Página do elenco" },
    source: {
      file: "site/src/pages/players/index.astro",
      snippet: "English-language squad guide with player photos, positions, shirt numbers, and quick profile links for Seoul E-Land supporters.",
    },
  },
  {
    id: "matchday-omokgyo",
    number: 4,
    chapter: 1,
    chapterTitle: "Matchday",
    targetPath: "/guides/mokdong-stadium-matchday-guide/",
    targetPathPt: undefined,
    selector: "main h2",
    riddle: {
      en: "A station wears the stadium's name like a collar. Find the guide where Line 5 leads a cat ten minutes to Leoul Park.",
      pt: "Uma estação usa o nome do estádio como coleira. Ache o guia em que a Linha 5 leva a gata em dez minutos ao Leoul Park.",
    },
    hint: { en: "Matchday guide", pt: "Guia de dia de jogo" },
    source: {
      file: "site/src/content/guides/Mokdong Stadium Matchday Guide.md",
      snippet: "Take **Line 5 to Omokgyo Station**, whose official secondary name is literally \"Mokdong Stadium.\" From exits 3 or 4 it is about a ten minute walk.",
    },
  },
  {
    id: "games-six-mascots",
    number: 5,
    chapter: 1,
    chapterTitle: "Matchday",
    targetPath: "/play/",
    targetPathPt: "/pt/play/",
    selector: "main h1, main h2",
    riddle: {
      en: "Leoul and I found a whole shelf of phone-friendly toy boxes, and the club songs were playing. Where do mascots go to play?",
      pt: "Leoul e eu achamos uma prateleira inteira de brinquedos para celular, com as músicas do clube tocando. Onde os mascotes vão brincar?",
    },
    hint: { en: "Games page", pt: "Página de jogos" },
    source: {
      file: "site/src/components/GamesHub.astro",
      snippet: "They all work on your phone, and the soundtrack is the club's own songs, 서울의 노래 (2024 ver) and 사랑하는 나의 서울 이랜드 (2022 ver).",
    },
  },
  {
    id: "korean-cup-round-two",
    number: 6,
    chapter: 1,
    chapterTitle: "Matchday",
    targetPath: "/korean-cup/what-is-the-korean-cup/",
    targetPathPt: "/pt/korean-cup/what-is-the-korean-cup/",
    selector: "main h2",
    riddle: {
      en: "The cup door opened in Round 2 on July 15 for K League 2. Which explainer has the bracket string I pawed at?",
      pt: "A porta da Copa abriu na segunda rodada, em 15 de julho, para a K League 2. Qual explicador tem o fio da chave que eu puxei?",
    },
    hint: { en: "Korean Cup explainer", pt: "Explicador da Korean Cup" },
    source: {
      file: "site/src/content/korean-cup/what-is-the-korean-cup.md",
      snippet: "K League 2 clubs, Seoul E-Land included, enter at Round 2 on July 15.",
    },
  },
  {
    id: "home-ground-basics",
    number: 7,
    chapter: 1,
    chapterTitle: "Matchday",
    targetPath: "/places/mokdong-stadium/",
    targetPathPt: undefined,
    selector: "main h1, main h2",
    riddle: {
      en: "My home stage is where rounds, community events, and promotion-race pressure all meet. Which place page did I nap on?",
      pt: "Meu palco em casa é onde rodadas, eventos da comunidade e pressão pelo acesso se encontram. Em qual página de lugar tirei uma soneca?",
    },
    hint: { en: "Places", pt: "Lugares" },
    source: {
      file: "site/src/pages/places/[...slug].astro",
      snippet: "Mokdong Stadium, often referenced around the club as Leoul Park, is where Seoul E-Land's home rounds, community events, and promotion-race pressure all meet.",
    },
  },
  {
    id: "euller-left-foot",
    number: 8,
    chapter: 2,
    chapterTitle: "The Squad",
    targetPath: "/players/euller/",
    targetPathPt: "/pt/players/euller/",
    selector: "main h1, main h2",
    riddle: {
      en: "I followed a left paw from Marítimo to Mokdong: fifteen goals, fifteen assists, all in this shirt. Who owns the silky print?",
      pt: "Segui uma pata canhota do Marítimo a Mokdong: quinze gols, quinze assistências, tudo com esta camisa. De quem é a marca elegante?",
    },
    hint: { en: "Player profiles", pt: "Perfis de jogadores" },
    source: {
      file: "site/src/data/playerProfiles.ts",
      snippet: "Arrived from Marítimo in January 2025 with no Korean football behind him and now has fifteen goals and fifteen assists in K League play, every one of them in this shirt.",
    },
  },
  {
    id: "park-jae-yong-leading-scorer",
    number: 9,
    chapter: 2,
    chapterTitle: "The Squad",
    targetPath: "/players/park-jae-yong/",
    targetPathPt: "/pt/players/park-jae-yong/",
    selector: "main h1, main h2",
    riddle: {
      en: "The loose ball rattled in the box and the team's leading scorer pounced first. Which striker did Lenyang track?",
      pt: "A bola sobrou na área e o artilheiro do time atacou primeiro. Qual atacante a Lenyang seguiu?",
    },
    hint: { en: "Player profiles", pt: "Perfis de jogadores" },
    source: {
      file: "site/src/data/playerProfiles.ts",
      snippet: "The team's leading scorer, a penalty-box centre-forward who is reliably first to the loose ball in a crowd rather than a man who scores from thirty yards.",
    },
  },
  {
    id: "kim-oh-kyu-captain",
    number: 10,
    chapter: 2,
    chapterTitle: "The Squad",
    targetPath: "/players/kim-oh-kyu/",
    targetPathPt: "/pt/players/kim-oh-kyu/",
    selector: "main h1, main h2",
    riddle: {
      en: "This paw sits by the captain, a trusted lead protector nobody worries about. Which defender guards it?",
      pt: "Esta patinha fica ao lado do capitão, protetor de vantagem em quem ninguém teme confiar. Qual defensor a guarda?",
    },
    hint: { en: "Player profiles", pt: "Perfis de jogadores" },
    source: {
      file: "site/src/data/playerProfiles.ts",
      snippet: "The club captain, and quietly one of the most-used players in the squad.",
    },
  },
  {
    id: "min-sung-jun-every-match",
    number: 11,
    chapter: 2,
    chapterTitle: "The Squad",
    targetPath: "/players/min-sung-jun/",
    targetPathPt: "/pt/players/min-sung-jun/",
    selector: "main h1, main h2",
    riddle: {
      en: "I curled up behind the keeper who started every match of the promotion push and clawed points safe. Which gloves hid my paw?",
      pt: "Me enrosquei atrás do goleiro que começou todos os jogos da briga pelo acesso e salvou pontos. Quais luvas esconderam minha pata?",
    },
    hint: { en: "Player profiles", pt: "Perfis de jogadores" },
    source: {
      file: "site/src/data/playerProfiles.ts",
      snippet: "The one player who has started every match of the promotion push, and the reason at least two of those matches finished level rather than lost.",
    },
  },
  {
    id: "caio-left-footed",
    number: 12,
    chapter: 2,
    chapterTitle: "The Squad",
    targetPath: "/players/caio-marcelo/",
    targetPathPt: "/pt/players/caio-marcelo/",
    selector: "main h1, main h2",
    riddle: {
      en: "A 192cm Brazilian left foot padded in from Daegu just before the window shut. Which new centre-back got paw dust?",
      pt: "Um canhoto brasileiro de 1,92 m chegou do Daegu logo antes da janela fechar. Qual novo zagueiro ganhou pó de pata?",
    },
    hint: { en: "Player profiles", pt: "Perfis de jogadores" },
    source: {
      file: "site/src/data/playerProfiles.ts",
      snippet: "Brazilian centre-back, 192cm and left-footed, who played 50 times for Daegu across 2024 and 2025 and signed on August 18, a day before the summer window closed.",
    },
  },
  {
    id: "alan-round-19",
    number: 13,
    chapter: 2,
    chapterTitle: "The Squad",
    targetPath: "/players/alan-carius/",
    targetPathPt: "/pt/players/alan-carius/",
    selector: "main h1, main h2",
    riddle: {
      en: "Goal, two assists, Player of the Round, and one acrobatic finish. Which Brazilian's page made Lenyang tumble?",
      pt: "Gol, duas assistências, Jogador da Rodada e uma finalização acrobática. A página de qual brasileiro fez a Lenyang rolar?",
    },
    hint: { en: "Player profiles", pt: "Perfis de jogadores" },
    source: {
      file: "site/src/data/playerProfiles.ts",
      snippet: "Came back from injury and immediately produced a goal and two assists to win Player of the Round in Round 19, the goal itself an acrobatic finish against Cheonan.",
    },
  },
  {
    id: "baek-unlikely-goals",
    number: 14,
    chapter: 2,
    chapterTitle: "The Squad",
    targetPath: "/players/baek-ji-woong/",
    targetPathPt: "/pt/players/baek-ji-woong/",
    selector: "main h1, main h2",
    riddle: {
      en: "Listed in midfield, used at centre-back, still scoring more than many forwards. Which unlikely goal cat did I follow?",
      pt: "Listado no meio, usado na zaga e ainda marcando mais que muitos atacantes. Que gato improvável de gols eu segui?",
    },
    hint: { en: "Player profiles", pt: "Perfis de jogadores" },
    source: {
      file: "site/src/data/playerProfiles.ts",
      snippet: "Listed as a midfielder, used as a centre-back, and the club's most unlikely goal source: he has more goals this season than most of the forwards.",
    },
  },
  {
    id: "fc-seoul-borrowed-mokdong",
    number: 15,
    chapter: 3,
    chapterTitle: "Deep Digest",
    targetPath: "/guides/mokdong-stadium-matchday-guide/",
    targetPathPt: undefined,
    selector: "main h2",
    riddle: {
      en: "Even FC Seoul borrowed this ground for Asia when their pitch froze. Which guide has that chilly footnote?",
      pt: "Até o FC Seoul pegou este estádio emprestado para a Ásia quando seu gramado congelou. Qual guia tem essa nota gelada?",
    },
    hint: { en: "Mokdong guide", pt: "Guia de Mokdong" },
    source: {
      file: "site/src/content/guides/Mokdong Stadium Matchday Guide.md",
      snippet: "FC Seoul borrowed it for AFC Champions League matches in early 2026 when their own pitch froze.",
    },
  },
  {
    id: "korean-cup-exit",
    number: 16,
    chapter: 3,
    chapterTitle: "Deep Digest",
    targetPath: "/korean-cup/what-is-the-korean-cup/",
    targetPathPt: "/pt/korean-cup/what-is-the-korean-cup/",
    selector: "main h2",
    riddle: {
      en: "My cup dream went out 4-2 after extra time, level at 2-2 through ninety. Which bracket tale tells the sad meow?",
      pt: "Meu sonho de copa caiu por 4 a 2 na prorrogação, depois de 2 a 2 nos 90. Qual história da chave conta o miado triste?",
    },
    hint: { en: "Korean Cup", pt: "Korean Cup" },
    source: {
      file: "site/src/content/korean-cup/what-is-the-korean-cup.md",
      snippet: "Ulsan Citizen won 4-2 after extra time, having been level at 2-2 through ninety minutes, with Seoul finishing the match a man down.",
    },
  },
  {
    id: "promotion-final-60",
    number: 17,
    chapter: 3,
    chapterTitle: "Deep Digest",
    targetPath: "/articles/2026-second-round-robin-playoff-run-in-preview/",
    targetPathPt: "/pt/articles/2026-second-round-robin-playoff-run-in-preview/",
    selector: "main h1, main h2",
    riddle: {
      en: "I pawed the July crystal ball that turned 29 points plus 31 more into a projected 60. Which preview froze that chase?",
      pt: "Arranhei a bola de cristal de julho que somou 29 pontos com mais 31 e projetou 60. Qual prévia congelou essa caça?",
    },
    hint: { en: "Promotion preview", pt: "Prévia da briga pelo acesso" },
    source: {
      file: "site/src/data/seasonTracker.ts",
      snippet: "The preview projected a final total of 60 points by adding its predicted 31 to this 29.",
    },
  },
  {
    id: "record-crowd-suwon",
    number: 18,
    chapter: 3,
    chapterTitle: "Deep Digest",
    targetPath: "/guides/mokdong-stadium-matchday-guide/",
    targetPathPt: undefined,
    selector: "main h2",
    riddle: {
      en: "Nine thousand five hundred twenty-seven roared against Suwon in 2024. Which matchday guide keeps that crowd purr?",
      pt: "Nove mil quinhentos e vinte e sete rugiram contra Suwon em 2024. Qual guia de jogo guarda esse ronronar?",
    },
    hint: { en: "Matchday guide", pt: "Guia de dia de jogo" },
    source: {
      file: "site/src/content/guides/Mokdong Stadium Matchday Guide.md",
      snippet: "the club's record home crowd of 9,527 came against Suwon in 2024",
    },
  },
  {
    id: "daegu-round-27",
    number: 19,
    chapter: 3,
    chapterTitle: "Deep Digest",
    targetPath: "/rounds/2026-r27_seoul_e-land_digest/",
    targetPathPt: "/pt/rounds/2026-r27_seoul_e-land_digest/",
    selector: "main h1, main h2",
    riddle: {
      en: "Daegu came to town, and my paw landed on a 2-1 win report. Which round page has the fresh scratch?",
      pt: "O Daegu veio à cidade e minha pata caiu num relato de vitória por 2 a 1. Qual rodada tem esse arranhão recente?",
    },
    hint: { en: "Round digests", pt: "Relatos de rodadas" },
    source: {
      file: "site/src/content/digests/2026-R27_Seoul_E-Land_Digest.md",
      snippet: "opponent: Daegu\nvenue: home\nresult: W 2-1",
    },
  },
  {
    id: "chasing-k1-22-percent",
    number: 20,
    chapter: 3,
    chapterTitle: "Deep Digest",
    targetPath: "/articles/2026-chasing-k1-weekly-01/",
    targetPathPt: "/pt/articles/2026-chasing-k1-weekly-01/",
    selector: "main h1, main h2",
    riddle: {
      en: "A break, a table, and a 22 percent chance dangled like string. Which weekly chase did Lenyang swipe?",
      pt: "Uma pausa, uma tabela e uma chance de 22 por cento balançaram como barbante. Qual caça semanal a Lenyang atacou?",
    },
    hint: { en: "Chasing K1 articles", pt: "Artigos Chasing K1" },
    source: {
      file: "site/src/content/articles/2026-Chasing-K1-Weekly-01.md",
      snippet: "title: \"Chasing K1 Weekly, No. 1: The Break, the Table, and a 22 Percent Chance\"",
    },
  },
  {
    id: "team-suwon-bluewings",
    number: 21,
    chapter: 3,
    chapterTitle: "Deep Digest",
    targetPath: "/teams/suwon-bluewings/",
    targetPathPt: undefined,
    selector: "main h1, main h2",
    riddle: {
      en: "A blue rival from Suwon has its own scouting den in the team library. Find the opponent page where my final paw waits.",
      pt: "Um rival azul de Suwon tem sua própria toca de análise na biblioteca de times. Ache a página adversária onde minha última pata espera.",
    },
    hint: { en: "Team pages", pt: "Páginas de times" },
    source: {
      file: "site/src/data/seasonRivals.ts",
      snippet: "slug: \"suwon-bluewings\",\nname: \"Suwon Samsung Bluewings\"",
    },
  },
];

export function getPawById(id: string) {
  return PAWS.find((paw) => paw.id === id);
}

export function localizedTarget(paw: PawClue, locale: "en" | "pt") {
  return locale === "pt" && paw.targetPathPt ? paw.targetPathPt : paw.targetPath;
}
