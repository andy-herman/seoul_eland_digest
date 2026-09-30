import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { getPreMatchPreviews } from "../lib/prematchPreviews";
import { safeGetCollection } from "../lib/safeContent";

// Hand-rolled sitemap (no @astrojs/sitemap; see rss.xml.ts for why). Covers
// every content-driven route plus the section pages. Player pages are omitted
// because they depend on a remote roster fetch; crawlers reach them through
// the squad page anyway.

const STATIC_PATHS = [
  "/",
  "/matches",
  "/previews",
  "/tracker",
  "/korean-cup",
  "/guides",
  "/articles",
  "/articles/season-review",
  "/players",
  "/play",
  "/play/penalty-party",
  "/play/dribble-dash",
  "/play/balloon-battle",
  "/play/head-to-head",
  "/play/mascot-kart",
  "/play/seoul-song",
  "/play/take-five",
  "/play/paw-hunt",
  "/play/clap-for-seoul",
  "/play/yut-nori",
  "/play/tifo-master",
  "/support",
  "/about",
  "/pt/",
  "/pt/matches",
  "/pt/previews",
  "/pt/tracker",
  "/pt/korean-cup",
  "/pt/guides",
  "/pt/articles",
  "/pt/articles/season-review",
  "/pt/players",
  "/pt/play",
  "/pt/play/penalty-party",
  "/pt/play/dribble-dash",
  "/pt/play/balloon-battle",
  "/pt/play/head-to-head",
  "/pt/play/mascot-kart",
  "/pt/play/seoul-song",
  "/pt/play/take-five",
  "/pt/play/paw-hunt",
  "/pt/play/clap-for-seoul",
  "/pt/play/yut-nori",
  "/pt/play/tifo-master",
  "/ko/",
  "/ko/matches",
  "/ko/previews",
  "/ko/tracker",
  "/ko/korean-cup",
  "/ko/guides",
  "/ko/articles",
  "/ko/articles/season-review",
  "/ko/players",
  "/ko/play",
];

export async function GET(context: APIContext) {
  const site = (context.site ?? new URL("https://seoulelanddigest.com")).href.replace(/\/$/, "");

  const paths: string[] = [...STATIC_PATHS];

  const digests = await getCollection("digests");
  for (const digest of digests) {
    paths.push(`/rounds/${digest.id.replace(/\.md$/, "")}`);
  }
  const digestsPt = await getCollection("digestsPt");
  for (const digest of digestsPt) {
    paths.push(`/pt/rounds/${digest.id.replace(/\.md$/, "")}`);
  }
  const digestsKo = await safeGetCollection("digestsKo");
  for (const digest of digestsKo) {
    paths.push(`/ko/rounds/${digest.id.replace(/\.md$/, "")}`);
  }

  for (const preview of getPreMatchPreviews("en")) {
    paths.push(`/previews/${preview.slug}`);
  }
  for (const preview of getPreMatchPreviews("pt")) {
    paths.push(`/pt/previews/${preview.slug}`);
  }
  for (const preview of getPreMatchPreviews("ko")) {
    paths.push(`/ko/previews/${preview.slug}`);
  }

  const guides = await getCollection("guides");
  for (const guide of guides) {
    paths.push(`/guides/${guide.id.replace(/\.md$/, "")}`);
  }
  const guidesPt = await getCollection("guidesPt");
  for (const guide of guidesPt) {
    paths.push(`/pt/guides/${guide.id.replace(/\.md$/, "")}`);
  }
  const guidesKo = await safeGetCollection("guidesKo");
  for (const guide of guidesKo) {
    paths.push(`/ko/guides/${guide.id.replace(/\.md$/, "")}`);
  }
  const articles = await getCollection("articles");
  for (const article of articles) {
    paths.push(`/articles/${article.id.replace(/\.md$/, "")}`);
  }
  const articlesPt = await getCollection("articlesPt");
  for (const article of articlesPt) {
    paths.push(`/pt/articles/${article.id.replace(/\.md$/, "")}`);
  }
  const articlesKo = await safeGetCollection("articlesKo");
  for (const article of articlesKo) {
    paths.push(`/ko/articles/${article.id.replace(/\.md$/, "")}`);
  }

  const koreanCup = await getCollection("koreanCup");
  for (const article of koreanCup) {
    paths.push(`/korean-cup/${article.id.replace(/\.md$/, "")}`);
  }
  const koreanCupPt = await getCollection("koreanCupPt");
  for (const article of koreanCupPt) {
    paths.push(`/pt/korean-cup/${article.id.replace(/\.md$/, "")}`);
  }
  const koreanCupKo = await safeGetCollection("koreanCupKo");
  for (const article of koreanCupKo) {
    paths.push(`/ko/korean-cup/${article.id.replace(/\.md$/, "")}`);
  }

  const places = await getCollection("places");
  for (const place of places) {
    paths.push(`/places/${place.id.replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
  }

  const urls = paths
    .map((path) => `  <url><loc>${site}${path}</loc></url>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
