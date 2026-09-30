export const PLAYER_PROFILES_KO: Record<string, string> = {};

export function getPlayerProfileKo(slug: string) {
  return PLAYER_PROFILES_KO[slug];
}
