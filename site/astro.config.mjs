import { readdirSync } from "node:fs";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import remarkWikiLink from "remark-wiki-link";
import { visit } from "unist-util-visit";

// The production domain is the default so canonical URLs, OG tags, the sitemap
// and the RSS feed come out right on Vercel builds, where SITE_URL is not set.
const site = process.env.SITE_URL ?? "https://seoulelanddigest.com";
const base = process.env.SITE_BASE?.trim() || "/";
const linkBase = base === "/" ? "" : base.replace(/\/$/, "");

// Only slugs that actually generate a page belong here. Player pages come from
// getOfficialRosterWithPhotos(), so squad members only. Anything listed here
// without a page becomes a link to a 404; anything omitted renders as plain
// text, which is why the manager (Kim Do-gyun) is deliberately absent. Add him
// back the day a staff page exists.
// Players who left mid-season (Francisco Geraldes, Park Jin-young) drop off the
// official roster, so they have no page and are left out here too.
const playerSlugs = new Set([
  "ahn-joo-wan",
  "bae-jin-woo",
  "bae-seo-jun",
  "baek-ji-woong",
  "byeon-gyeong-jun",
  "alan-carius",
  "carius",
  "cho-jun-hyun",
  "choi-rang",
  "eom-ye-hun",
  "euller",
  "gabriel",
  "gabriel-santos",
  "hwang-jae-yun",
  "kang-hyeon-je",
  "kang-min-jae",
  "kang-young-seok",
  "kim-hyun",
  "kim-hyun-woo",
  "kim-joo-hwan",
  "kim-oh-kyu",
  "kim-tae-san",
  "kim-woo-bin",
  "lee-ju-hyeok",
  "min-sung-jun",
  "oh-in-pyo",
  "osmar",
  "park-chang-hwan",
  "park-jae-hwan",
  "park-jae-yong",
  "park-sun-woo",
  "seo-jin-seok",
  "son-hyuk-chan",
  "yang-seung-min",
  "yoon-seok-ju",
  "yun-seok-ju",
  "ahn-joo-wan",
  "bae-seo-jun",
  "oh-in-pyo",
]);

const placeSlugs = new Set(["mokdong-stadium"]);
const teamSlugs = new Set([
  "ansan-greeners",
  "busan-ipark",
  "cheonan",
  "chungnam-asan",
  "daegu",
  "gimpo-citizen",
  "gyeongnam",
  "hwaseong-fc",
  "k-league-2-2026",
  "paju-frontier",
  "suwon-bluewings",
  "suwon-fc",
  "yongin",
  "yongin-fc",
]);

// Short forms that appear in the vault prose but are not the page slug.
const playerAliases = new Map([
  ["carius", "alan-carius"],
  ["gabriel", "gabriel-santos"],
  ["yun-seok-ju", "yoon-seok-ju"],
]);

// Preview slugs are read from disk so round previews, the season preview and
// the club report all resolve without anyone maintaining a second list.
function readPreviewSlugs() {
  try {
    return new Set(
      readdirSync(new URL("./src/content/prematch-previews", import.meta.url))
        .filter((f) => f.endsWith(".md"))
        .map((f) => slugify(f)),
    );
  } catch {
    return new Set();
  }
}

function slugify(name) {
  return name
    .replace(/\.md$/i, "")
    .normalize("NFD") // split accented characters so Cariús slugifies to carius
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const previewSlugs = readPreviewSlugs();

// Returned when a wikilink names something with no page on the site. Those
// render as plain text rather than as a link to a URL that 404s.
const UNRESOLVED = "__unresolved-wikilink__";

function resolveWikiLink(name) {
  const slug = slugify(name);

  if (/^2026-r\d+-seoul-e-land-digest$/.test(slug)) {
    return `rounds/${name.replace(/\.md$/i, "").replace(/ /g, "-").toLowerCase()}`;
  }

  if (previewSlugs.has(slug)) return `previews/${slug}`;
  if (playerAliases.has(slug)) return `players/${playerAliases.get(slug)}`;
  if (playerSlugs.has(slug)) return `players/${slug}`;
  if (placeSlugs.has(slug)) return `places/${slug}`;
  if (teamSlugs.has(slug)) return `teams/${slug === "yongin-fc" ? "yongin" : slug}`;

  return UNRESOLVED;
}

// remark-wiki-link always emits an anchor. Anything we could not resolve gets
// downgraded here to a plain span, which matches how the pre-match preview
// renderer already treats wikilinks.
function remarkUnresolvedWikiLinksAsText() {
  return (tree) => {
    visit(tree, "wikiLink", (node) => {
      if (node.data?.permalink !== UNRESOLVED) return;
      node.data.hName = "span";
      node.data.hProperties = {};
    });
  };
}

// Korean content links to the Korean edition wherever it has the page, so the
// HTML that crawlers read already points at /ko/ (players always; rounds and
// previews once their Korean version exists).
function readKoreanSlugs(dir) {
  try {
    return new Set(
      readdirSync(new URL(`./src/content/${dir}`, import.meta.url))
        .filter((f) => f.endsWith(".md"))
        .map((f) => (dir === "digests-ko" ? f.replace(/\.md$/i, "").replace(/ /g, "-").toLowerCase() : slugify(f))),
    );
  } catch {
    return new Set();
  }
}

function rehypeKoreanEditionLinks() {
  const koRounds = readKoreanSlugs("digests-ko");
  const koPreviews = readKoreanSlugs("prematch-previews-ko");
  return (tree, file) => {
    const source = String(file.path ?? file.history?.[0] ?? "");
    if (!/[\\/]content[\\/][^\\/]+-ko[\\/]/.test(source)) return;
    visit(tree, "element", (node) => {
      if (node.tagName !== "a" || typeof node.properties?.href !== "string") return;
      const href = node.properties.href;
      if (!href.startsWith(`${linkBase}/`)) return;
      const path = href.slice(linkBase.length);
      const match = path.match(/^\/(players|rounds|previews)\/([^/?#]+)\/?([?#].*)?$/);
      if (!match) return;
      const [, section, slug, rest = ""] = match;
      const hasKorean =
        section === "players" || (section === "rounds" ? koRounds.has(slug) : koPreviews.has(slug));
      if (hasKorean) node.properties.href = `${linkBase}/ko/${section}/${slug}${rest}`;
    });
  };
}

export default defineConfig({
  site,
  base,
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [
      [
        remarkWikiLink,
        {
          pageResolver: (name) => [resolveWikiLink(name)],
          hrefTemplate: (permalink) => `${linkBase}/${permalink}`,
          aliasDivider: "|",
        },
      ],
      remarkUnresolvedWikiLinksAsText,
    ],
    rehypePlugins: [rehypeKoreanEditionLinks],
  },
});
