export function stripMarkdown(value: string) {
  return value
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getDigestDeck(body: string | undefined, fallback: string) {
  if (!body) return fallback;
  const quote = body.match(/^>\s*(.+)$/m)?.[1];
  return stripMarkdown(quote ?? fallback);
}
