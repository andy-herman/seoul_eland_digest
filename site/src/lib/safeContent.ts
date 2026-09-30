import { getCollection } from "astro:content";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const KO_CONTENT_DIRS: Record<string, string> = {
  digestsKo: "digests-ko",
  guidesKo: "guides-ko",
  articlesKo: "articles-ko",
  koreanCupKo: "korean-cup-ko",
};

export async function safeGetCollection(name: string): Promise<any[]> {
  const koDir = KO_CONTENT_DIRS[name];
  if (koDir) {
    const dir = path.resolve(process.cwd(), "src", "content", koDir);
    if (!existsSync(dir) || !readdirSync(dir).some((file) => file.endsWith(".md"))) {
      return [];
    }
  }
  try {
    return await getCollection(name as any);
  } catch (error) {
    if (error instanceof Error && /does not exist or is empty/.test(error.message)) {
      return [];
    }
    throw error;
  }
}
