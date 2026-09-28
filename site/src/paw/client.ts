import { SITE_PAWS, PAW_TOTAL, type SitePaw } from "./map";
import { stripBase, withBase } from "../lib/paths";

const KEY = "paw-hunt-v1";
type Locale = "en" | "pt";
const CLIENT_STRINGS = {
  en: { ariaPaw: "Collect Lenyang paw print", found: (c: number, t: number) => `Paw ${c} of ${t} found!`, start: "You found one of Lenyang's paw prints! There are 21 hidden on the Digest.", startLink: "Start the hunt", hunt: "Hunt page" },
  pt: { ariaPaw: "Coletar patinha da Lenyang", found: (c: number, t: number) => `Patinha ${c} de ${t} encontrada!`, start: "Você encontrou uma das patinhas da Lenyang! Há 21 escondidas no Digest.", startLink: "Começar a caça", hunt: "Página da caça" },
} as const;

type Store = { started?: boolean; found: string[] };

function read(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { started: !!parsed.started, found: Array.isArray(parsed.found) ? parsed.found : [] };
  } catch {
    return { found: [] };
  }
}

function write(store: Store) {
  localStorage.setItem(KEY, JSON.stringify({ started: true, found: [...new Set(store.found)] }));
  window.dispatchEvent(new CustomEvent("paw-hunt:update"));
}

function chapterUnlocked(chapter: number, found: Set<string>) {
  if (chapter === 1) return true;
  return SITE_PAWS.filter((paw) => paw.c === chapter - 1).every((paw) => found.has(paw.id));
}

function norm(path: string) {
  const clean = stripBase(path).replace(/\/index\.html$/, "/").replace(/\.html$/, "/");
  return clean.endsWith("/") ? clean : `${clean}/`;
}

function toast(html: string) {
  document.querySelector(".paw-toast")?.remove();
  const el = document.createElement("div");
  el.className = "paw-toast";
  el.setAttribute("role", "status");
  el.innerHTML = html;
  document.body.append(el);
  window.setTimeout(() => el.remove(), 5200);
}

function icon(done: boolean) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="22" cy="28" rx="8" ry="11"/><ellipse cx="42" cy="28" rx="8" ry="11"/><ellipse cx="17" cy="15" rx="7" ry="9"/><ellipse cx="32" cy="12" rx="7" ry="9"/><ellipse cx="47" cy="15" rx="7" ry="9"/><path d="M19 43c0-9 7-15 13-15s13 6 13 15c0 7-7 10-13 10s-13-3-13-10Z"/>${done ? `<path class="paw-check" d="M22 38l7 7 14-18"/>` : ""}</svg>`;
}

// Beside the sentence the riddle is about when the page has it, otherwise on the first heading that
// does not already carry a paw, so two paws never sit on top of each other.
function findAnchor(paw: SitePaw, locale: Locale): HTMLElement | null {
  const phrase = locale === "pt" ? paw.tp : paw.t;
  if (phrase) {
    for (const el of document.querySelectorAll<HTMLElement>("main p, main li, main td, main blockquote")) {
      if (el.textContent?.includes(phrase)) return el;
    }
  }
  const all = [...document.querySelectorAll<HTMLElement>(paw.s)];
  return all.find((el) => !el.querySelector(".paw-print-button")) ?? all[0] ?? document.querySelector<HTMLElement>("main h1, main h2, main article");
}

function mountOne(paw: SitePaw, locale: Locale, found: Set<string>) {
  if (!chapterUnlocked(paw.c, found)) return;

  const anchor = findAnchor(paw, locale);
  if (!anchor || anchor.querySelector(`.paw-print-button[data-paw-id="${paw.id}"]`)) return;

  anchor.classList.add("paw-anchor-host");
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.pawId = paw.id;
  button.className = `paw-print-button${found.has(paw.id) ? " is-found" : ""}`;
  button.setAttribute("aria-label", CLIENT_STRINGS[locale].ariaPaw);
  button.innerHTML = icon(found.has(paw.id));
  anchor.append(button);

  button.addEventListener("click", () => {
    const current = read();
    const before = current.found.length;
    const wasStarted = !!current.started;
    if (!current.found.includes(paw.id)) current.found.push(paw.id);
    current.started = true;
    write(current);
    button.classList.add("is-found", "is-pop");
    button.innerHTML = icon(true);
    const count = new Set(current.found).size;
    const huntHref = withBase(locale === "pt" ? "/pt/play/paw-hunt/" : "/play/paw-hunt/");
    const firstDiscovery = before === 0 && !wasStarted;
    const msg = firstDiscovery ? CLIENT_STRINGS[locale].start : CLIENT_STRINGS[locale].found(count, PAW_TOTAL);
    toast(`${msg} <a href="${huntHref}">${firstDiscovery ? CLIENT_STRINGS[locale].startLink : CLIENT_STRINGS[locale].hunt}</a>`);
    window.setTimeout(() => button.classList.remove("is-pop"), 650);
  });
}

function mountPaw(locale: Locale) {
  const path = norm(location.pathname);
  const store = read();
  const found = new Set(store.found);
  SITE_PAWS.filter((item) => norm(locale === "pt" && item.pp ? item.pp : item.p) === path || norm(item.p) === path || (item.pp && norm(item.pp) === path)).forEach((paw) =>
    mountOne(paw, locale, found),
  );
}

function qaApi() {
  if (!new URLSearchParams(location.search).has("qa")) return;
  (window as any).__paw = {
    reset() {
      localStorage.removeItem(KEY);
      window.dispatchEvent(new CustomEvent("paw-hunt:update"));
    },
    collect(id: string) {
      const s = read();
      if (!s.found.includes(id)) s.found.push(id);
      write(s);
    },
    collectAll() {
      write({ started: true, found: SITE_PAWS.map((paw) => paw.id) });
    },
    list() {
      return { store: read(), paws: SITE_PAWS.map((paw) => ({ id: paw.id, chapter: paw.c, targetPath: paw.p, targetPathPt: paw.pp })) };
    },
  };
}

const locale = document.documentElement.lang.startsWith("pt") ? "pt" : "en";
qaApi();
mountPaw(locale);
