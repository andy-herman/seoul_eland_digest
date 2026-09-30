export type Locale = "en" | "pt" | "ko";

export const localePrefix: Record<Locale, string> = {
  en: "",
  pt: "/pt",
  ko: "/ko",
};

export const htmlLang: Record<Locale, string> = {
  en: "en",
  pt: "pt",
  ko: "ko",
};

export const ogLocale: Record<Locale, string> = {
  en: "en_US",
  pt: "pt_BR",
  ko: "ko_KR",
};

export const dateLocale: Record<Locale, string> = {
  en: "en-US",
  pt: "pt-BR",
  ko: "ko-KR",
};

export function asLocale(value: string | undefined): Locale {
  if (value === "pt" || value === "pt-BR") return "pt";
  if (value === "ko" || value === "ko-KR") return "ko";
  return "en";
}

export function formatDate(date: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions = {}) {
  const value = typeof date === "string" ? new Date(date.includes("T") ? date : `${date}T00:00:00Z`) : date;
  return new Intl.DateTimeFormat(dateLocale[locale], {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(value);
}

export function collectionName(base: "digests" | "guides" | "articles" | "koreanCup", locale: Locale) {
  const suffix = locale === "en" ? "" : locale === "pt" ? "Pt" : "Ko";
  return `${base}${suffix}` as const;
}

export type AlternateLink = { lang: Locale | "x-default"; href: string };

export const languageNames: Record<Locale, Record<Locale, string>> = {
  en: { en: "English", pt: "Português", ko: "Korean" },
  pt: { en: "Inglês", pt: "Português", ko: "Coreano" },
  ko: { en: "영어", pt: "포르투갈어", ko: "한국어" },
};

export const SERIES_KO: Record<string, string> = {
  "Season Review": "시즌 결산",
  "Promotion Race": "승격 레이스",
  Feature: "기획",
  "Season Preview": "시즌 프리뷰",
  "Chasing K1": "K리그1을 향해",
  "Chasing K1 Weekly": "K리그1을 향해 · 주간",
};

export function seriesKo(value: string) {
  return SERIES_KO[value] ?? value;
}

export function partKo(value: string | undefined) {
  if (!value) return "";
  const match = value.match(/^Part\s+(\d+)$/i);
  return match ? `${match[1]}편` : value;
}
