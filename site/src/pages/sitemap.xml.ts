import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { getPreMatchPreviews } from "../lib/prematchPreviews";

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
  "/players",
  "/support",
  "/about",
  "/pt/",
  "/pt/matches",
  "/pt/previews",
  "/pt/tracker",
  "/pt/korean-cup",
  "/pt/guides",
];

export async function GET(context: APIContext) {
  const site = (context.site ?? new URL("https://seoulelanddigest.vercel.app")).href.replace(/\/$/, "");

  const paths: string[] = [...STATIC_PATHS];

  const digests = await getCollection("digests");
  for (const digest of digests) {
    paths.push(`/rounds/${digest.id.replace(/\.md$/, "")}`);
  }
  const digestsPt = await getCollection("digestsPt");
  for (const digest of digestsPt) {
    paths.push(`/pt/rounds/${digest.id.replace(/\.md$/, "")}`);
  }

  for (const preview of getPreMatchPreviews("en")) {
    paths.push(`/previews/${preview.slug}`);
  }
  for (const preview of getPreMatchPreviews("pt")) {
    paths.push(`/pt/previews/${preview.slug}`);
  }

  const guides = await getCollection("guides");
  for (const guide of guides) {
    paths.push(`/guides/${guide.id.replace(/\.md$/, "")}`);
  }
  const guidesPt = await getCollection("guidesPt");
  for (const guide of guidesPt) {
    paths.push(`/pt/guides/${guide.id.replace(/\.md$/, "")}`);
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
