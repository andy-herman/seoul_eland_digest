import type { APIContext } from "astro";
import { safeGetCollection } from "../../lib/safeContent";
import { getPreMatchPreviews } from "../../lib/prematchPreviews";
import { koTeam } from "../../lib/teamNamesKo";

type FeedItem = { title: string; link: string; pubDate: Date; description: string; category: string };
function escapeXml(value: string) { return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&apos;"); }
export async function GET(context: APIContext) {
  const site = (context.site ?? new URL("https://seoulelanddigest.com")).href.replace(/\/$/, "");
  const digests = await safeGetCollection("digestsKo");
  const digestItems: FeedItem[] = digests.map((digest) => { const slug = digest.id.replace(/\.md$/, ""); return { title: `${digest.data.round}라운드 리뷰: 서울 이랜드 ${digest.data.result} ${koTeam(digest.data.opponent,"short")}`, link: `${site}/ko/rounds/${slug}`, pubDate: digest.data.date, description: `서울 이랜드 FC ${digest.data.result} ${koTeam(digest.data.opponent,"short")} 경기 리뷰.`, category: "match-report" }; });
  const previewItems: FeedItem[] = getPreMatchPreviews("ko").filter((preview)=>preview.data.date).map((preview)=>({ title: preview.title, link: `${site}/ko/previews/${preview.slug}`, pubDate: new Date(`${preview.data.date}T00:00:00Z`), description: preview.description, category: "preview" })).filter((item)=>!Number.isNaN(item.pubDate.getTime()));
  const guides = await safeGetCollection("guidesKo");
  const guideItems: FeedItem[] = guides.map((guide)=>({ title: guide.data.title, link: `${site}/ko/guides/${guide.id.replace(/\.md$/,"")}`, pubDate: guide.data.date, description: guide.data.description, category: "guide" }));
  const articles = await safeGetCollection("articlesKo");
  const articleItems: FeedItem[] = articles.map((article)=>({ title: article.data.title, link: `${site}/ko/articles/${article.id.replace(/\.md$/,"")}`, pubDate: article.data.date, description: article.data.description, category: "article" }));
  const items = [...digestItems, ...previewItems, ...guideItems, ...articleItems].sort((a,b)=>b.pubDate.getTime()-a.pubDate.getTime());
  const itemXml = items.map((item)=>`    <item>\n      <title>${escapeXml(item.title)}</title>\n      <link>${escapeXml(item.link)}</link>\n      <guid isPermaLink="true">${escapeXml(item.link)}</guid>\n      <pubDate>${item.pubDate.toUTCString()}</pubDate>\n      <description>${escapeXml(item.description)}</description>\n      <category>${escapeXml(item.category)}</category>\n    </item>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>Seoul E-Land Digest 한국어</title>\n    <link>${escapeXml(site)}/ko/</link>\n    <atom:link href="${escapeXml(site)}/ko/rss.xml" rel="self" type="application/rss+xml" />\n    <description>서울 이랜드 FC 한국어 경기 리뷰, 프리뷰, 가이드.</description>\n    <language>ko</language>\n    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n${itemXml}\n  </channel>\n</rss>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
