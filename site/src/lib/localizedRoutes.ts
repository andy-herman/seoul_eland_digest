// Which pages exist in which language, so hreflang links and language buttons
// only point at real pages. Routes are site-relative, without the site base,
// and always end in "/".
import { localePrefix, type AlternateLink, type Locale } from "./i18n";
import { getOfficialRosterWithPhotos } from "./officialRoster";
import { getPreMatchPreviews } from "./prematchPreviews";
import { safeGetCollection } from "./safeContent";

const LOCALES: Locale[] = ["en", "pt", "ko"];

// Static pages come straight from the file system.
const PAGE_FILES = Object.keys(import.meta.glob("/src/pages/**/*.astro"));

// Dynamic routes whose slugs are content-collection ids.
const COLLECTION_ROUTES: { section: string; collections: Record<Locale, string> }[] = [
  { section: "rounds", collections: { en: "digests", pt: "digestsPt", ko: "digestsKo" } },
  { section: "articles", collections: { en: "articles", pt: "articlesPt", ko: "articlesKo" } },
  { section: "guides", collections: { en: "guides", pt: "guidesPt", ko: "guidesKo" } },
  { section: "korean-cup", collections: { en: "koreanCup", pt: "koreanCupPt", ko: "koreanCupKo" } },
];

export function normalizeRoute(path: string) {
  const withLead = path.startsWith("/") ? path : `/${path}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
}

/** Route of the same page in another language: "/pt/rounds/x/" -> "/ko/rounds/x/". */
export function swapLocale(path: string, locale: Locale) {
  const route = normalizeRoute(path);
  const bare = route.replace(/^\/(pt|ko)(?=\/)/, "") || "/";
  return normalizeRoute(`${localePrefix[locale]}${bare}`);
}

let registry: Promise<Set<string>> | undefined;

async function buildRegistry() {
  const routes = new Set<string>();
  for (const file of PAGE_FILES) {
    if (file.includes("[")) continue;
    const route = file.replace(/^\/src\/pages/, "").replace(/\.astro$/, "").replace(/\/index$/, "/");
    routes.add(normalizeRoute(route || "/"));
  }
  for (const { section, collections } of COLLECTION_ROUTES) {
    for (const locale of LOCALES) {
      for (const entry of await safeGetCollection(collections[locale])) {
        routes.add(normalizeRoute(`${localePrefix[locale]}/${section}/${entry.id.replace(/\.md$/, "")}`));
      }
    }
  }
  for (const locale of LOCALES) {
    for (const preview of getPreMatchPreviews(locale)) {
      routes.add(normalizeRoute(`${localePrefix[locale]}/previews/${preview.slug}`));
    }
  }
  // Every language with a squad page renders a profile for each official player.
  const roster = await getOfficialRosterWithPhotos();
  for (const locale of LOCALES) {
    if (!routes.has(normalizeRoute(`${localePrefix[locale]}/players`))) continue;
    for (const player of roster) routes.add(normalizeRoute(`${localePrefix[locale]}/players/${player.slug}`));
  }
  return routes;
}

export async function routeExists(path: string) {
  registry ??= buildRegistry();
  const routes = await registry;
  return routes.has(normalizeRoute(path));
}

/** The page's twin in `locale`, or undefined when that language has no such page. */
export async function localizedHref(path: string, locale: Locale) {
  const target = swapLocale(path, locale);
  return (await routeExists(target)) ? target : undefined;
}

/** hreflang alternates for a page: only languages that really have it. */
export async function alternatesFor(path: string): Promise<AlternateLink[]> {
  const links: AlternateLink[] = [];
  for (const locale of LOCALES) {
    const href = await localizedHref(path, locale);
    if (href) links.push({ lang: locale, href });
  }
  const english = links.find((link) => link.lang === "en");
  if (english) links.push({ lang: "x-default", href: english.href });
  return links;
}
