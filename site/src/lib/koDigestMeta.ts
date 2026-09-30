// Korean title and description for a round review, shared by the /ko/rounds
// pages and /ko/rss.xml. Search results and feed readers show these, so they
// must be fully Korean.
import { koTeam } from "./teamNamesKo";

type DigestLike = {
  body?: string;
  data: { round: number; opponent: string; result?: string; date: Date };
};

const OUTCOME_KO: Record<string, string> = { W: "승", D: "무", L: "패" };

export function koDigestMeta(entry: DigestLike) {
  const opponent = koTeam(entry.data.opponent, "short");
  const [outcome = "", score = ""] = String(entry.data.result ?? "").split(" ");
  const outcomeKo = OUTCOME_KO[outcome] ?? "";
  const dateStr = entry.data.date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const title = `${entry.data.round}라운드 리뷰: 서울 이랜드 vs ${opponent}`;
  const feedTitle = score ? `${entry.data.round}라운드 리뷰: 서울 이랜드 ${score} ${opponent}` : title;
  // The digest opens with a one-line Korean summary in a blockquote.
  const lede = entry.body?.match(/^>\s*\*?(.+?)\*?\s*$/m)?.[1]?.trim();
  let description = lede ?? "";
  if (description.length > 160) {
    const cut = description.lastIndexOf(".", 158);
    description = cut > 40 ? description.slice(0, cut + 1) : `${description.slice(0, 157)}…`;
  }
  if (!description) {
    description = `${dateStr} K리그2 ${entry.data.round}라운드, 서울 이랜드 ${score} ${opponent}${outcomeKo ? `(${outcomeKo})` : ""}. 경기 리뷰와 선수 평가, 전술 포인트.`;
  }
  return { title, feedTitle, description, opponent, score, outcomeKo, dateStr };
}
