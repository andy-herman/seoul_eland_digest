import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import remarkWikiLink from "remark-wiki-link";

const site = process.env.SITE_URL ?? "https://example.com";
const base = process.env.SITE_BASE?.trim() || "/";
const linkBase = base === "/" ? "" : base.replace(/\/$/, "");

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
  "geraldes",
  "hwang-jae-yun",
  "francisco-geraldes",
  "iredale",
  "john-iredale",
  "kang-hyeon-je",
  "kang-min-jae",
  "kang-young-seok",
  "kim-do-gyun",
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
  "park-jin-young",
  "park-sun-woo",
  "seo-jin-seok",
  "son-hyuk-chan",
  "yang-seung-min",
  "yoon-seok-ju",
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

function slugify(name) {
  return name
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveWikiLink(name) {
  const slug = slugify(name);

  if (/^2026-r\d+-seoul-e-land-digest$/.test(slug)) {
    return `rounds/${name.replace(/\.md$/i, "").replace(/ /g, "-").toLowerCase()}`;
  }

  if (playerSlugs.has(slug)) return `players/${slug}`;
  if (placeSlugs.has(slug)) return `places/${slug}`;
  if (teamSlugs.has(slug)) return `teams/${slug === "yongin-fc" ? "yongin" : slug}`;

  return `teams/${slug}`;
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
    ],
  },
});
