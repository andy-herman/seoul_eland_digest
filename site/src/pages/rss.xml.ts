import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { getPreMatchPreviews } from "../lib/prematchPreviews";

// Hand-rolled RSS 2.0 feed (no @astrojs/rss: the package registry is not
// reachable from every machine this repo builds on, and the format is simple).

type FeedItem = {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  category: string;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(context: APIContext) {
  const site = (context.site ?? new URL("https://seoulelanddigest.vercel.app")).href.replace(/\/$/, "");

  const digests = await getCollection("digests");
  const digestItems: FeedItem[] = digests.map((digest) => {
    const slug = digest.id.replace(/\.md$/, "");
    return {
      title: `Round ${digest.data.round} Digest: Seoul E-Land ${digest.data.result} ${digest.data.opponent}`,
      link: `${site}/rounds/${slug}`,
      pubDate: digest.data.date,
      description: `Match report and analysis: Seoul E-Land FC ${digest.data.result} ${digest.data.opponent} (${digest.data.venue}), 2026 K League 2 Round ${digest.data.round}.`,
      category: "match-report",
    };
  });

  const previewItems: FeedItem[] = getPreMatchPreviews()
    .filter((preview) => preview.data.date)
    .map((preview) => ({
      title: preview.title,
      link: `${site}/previews/${preview.slug}`,
      pubDate: new Date(`${preview.data.date}T00:00:00Z`),
      description: preview.description,
      category: "preview",
    }))
    .filter((item) => !Number.isNaN(item.pubDate.getTime()));

  const guides = await getCollection("guides");
  const guideItems: FeedItem[] = guides.map((guide) => ({
    title: guide.data.title,
    link: `${site}/guides/${guide.id.replace(/\.md$/, "")}`,
    pubDate: guide.data.date,
    description: guide.data.description,
    category: "guide",
  }));

  const items = [...digestItems, ...previewItems, ...guideItems].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime(),
  );

  const itemXml = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      <description>${escapeXml(item.description)}</description>
      <category>${escapeXml(item.category)}</category>
    </item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Seoul E-Land Digest</title>
    <link>${escapeXml(site)}/</link>
    <atom:link href="${escapeXml(site)}/rss.xml" rel="self" type="application/rss+xml" />
    <description>English-language match reports, previews, and guides covering Seoul E-Land FC in the 2026 K League 2 season.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
