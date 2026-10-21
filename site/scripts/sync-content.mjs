// Copies digests, previews, guides, articles and player notes from the Obsidian
// vault into src/content/ for Astro's content collections to pick up.
//
// Rounds are now written straight into src/content/, so the repo, not the vault,
// usually holds the newer copy. The sync therefore only adds notes the site has
// never had: it never deletes, never overwrites an existing file, and never
// brings back a file git shows was removed. Set SEOUL_ELAND_SYNC_OVERWRITE=1 to
// let the vault's version replace existing files; removed files stay removed.

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VAULT_BASE = process.env.SEOUL_ELAND_VAULT_BASE || "C:/Andy Herman/Luna Master/Sports/Seoul_E-Land";
const SITE_BASE = join(__dirname, "..", "src", "content");
const OVERWRITE = process.env.SEOUL_ELAND_SYNC_OVERWRITE === "1";

// Every path under src/content/ that git has ever tracked, relative to it. Null
// when git is unavailable, in which case only files on disk are protected.
function trackedContentPaths() {
  try {
    const out = execFileSync(
      "git",
      ["-c", "core.quotePath=false", "log", "--all", "--no-renames", "--diff-filter=A",
        "--name-only", "--format=", "--relative", "-z", "--", "."],
      { cwd: SITE_BASE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 },
    );
    return new Set(out.split("\0").map((path) => path.trim()).filter(Boolean));
  } catch {
    console.warn("[sync] git history unavailable; removed files are not protected");
    return null;
  }
}

const TRACKED = existsSync(VAULT_BASE) ? trackedContentPaths() : null;
const held = [];
const removed = [];

const SRC = {
  digests: join(VAULT_BASE, "Digests"),
  digestsPt: join(VAULT_BASE, "Digests-PT"),
  digestsKo: join(VAULT_BASE, "Digests-KO"),
  players: join(VAULT_BASE, "Players"),
  prematchPreviews: join(VAULT_BASE, "Scouting Report", "K League 2 2026", "Pre-Match Previews"),
  prematchPreviewsPt: join(VAULT_BASE, "Scouting Report", "K League 2 2026", "Pre-Match Previews-PT"),
  prematchPreviewsKo: join(VAULT_BASE, "Scouting Report", "K League 2 2026", "Pre-Match Previews-KO"),
  guides: join(VAULT_BASE, "Guides"),
  guidesPt: join(VAULT_BASE, "Guides-PT"),
  guidesKo: join(VAULT_BASE, "Guides-KO"),
  articles: join(VAULT_BASE, "Articles"),
  articlesPt: join(VAULT_BASE, "Articles-PT"),
  articlesKo: join(VAULT_BASE, "Articles-KO"),
};

const DEST = {
  digests: join(SITE_BASE, "digests"),
  digestsPt: join(SITE_BASE, "digests-pt"),
  digestsKo: join(SITE_BASE, "digests-ko"),
  players: join(SITE_BASE, "players"),
  places: join(SITE_BASE, "places"),
  prematchPreviews: join(SITE_BASE, "prematch-previews"),
  prematchPreviewsPt: join(SITE_BASE, "prematch-previews-pt"),
  prematchPreviewsKo: join(SITE_BASE, "prematch-previews-ko"),
  guides: join(SITE_BASE, "guides"),
  guidesPt: join(SITE_BASE, "guides-pt"),
  guidesKo: join(SITE_BASE, "guides-ko"),
  articles: join(SITE_BASE, "articles"),
  articlesPt: join(SITE_BASE, "articles-pt"),
  articlesKo: join(SITE_BASE, "articles-ko"),
};

function polishFanFacingCopy(content) {
  return content.replace(/\bpipelines\b/gi, "pathways").replace(/\bpipeline\b/gi, "pathway");
}

function scrubDigestForSite(content) {
  return polishFanFacingCopy(content
    .replace(
      /\n---\s*\n\*Sources consulted this round: .*?Generated \d{4}-\d{2}-\d{2} via automated pipeline\.\*\s*$/s,
      "",
    )
    .replace(
      /\n\*Sources consulted this round: .*?Generated \d{4}-\d{2}-\d{2} via automated pipeline\.\*\s*$/s,
      "",
    ));
}

function scrubReferenceNoteForSite(content) {
  return polishFanFacingCopy(content
    .replace(/\r?\n\*(?:Player note|Home venue)[^\n]*\r?\n/g, "\n")
    .replace(/\r?\n\*Not yet narrated[^\n]*\r?\n/g, "\n")
    .replace(/\r?\n## Mentions\s*$/g, "\n"));
}

function scrubPreviewForSite(content) {
  return polishFanFacingCopy(content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !/^>\s*Private draft/i.test(trimmed) && !/^Generated:/i.test(trimmed);
    })
    .join("\n"));
}

// Returns how many files were written. Existing files the vault disagrees with
// go to `held`, previously removed files to `removed`, for the summary in main().
async function syncTree(srcDir, destDir, predicate, transform) {
  await mkdir(destDir, { recursive: true });
  if (!existsSync(srcDir)) {
    console.warn(`[sync] missing source: ${srcDir} — skipping`);
    return 0;
  }
  const relDir = relative(SITE_BASE, destDir).split(sep).join("/");
  const entries = await readdir(srcDir);
  let count = 0;
  for (const entry of entries) {
    const srcPath = join(srcDir, entry);
    const s = await stat(srcPath);
    if (!s.isFile()) continue;
    if (!entry.endsWith(".md")) continue;
    if (predicate && !predicate(entry)) continue;
    const destPath = join(destDir, entry);
    const raw = await readFile(srcPath, "utf8");
    const content = transform ? transform(raw) : raw;
    if (existsSync(destPath)) {
      if (!OVERWRITE) {
        const current = await readFile(destPath, "utf8");
        if (current.replace(/\r\n/g, "\n") !== content.replace(/\r\n/g, "\n")) held.push(`${relDir}/${entry}`);
        continue;
      }
    } else if (TRACKED?.has(`${relDir}/${entry}`)) {
      removed.push(`${relDir}/${entry}`);
      continue;
    }
    await writeFile(destPath, content, "utf8");
    count += 1;
  }
  return count;
}

async function main() {
  console.log("[sync] vault →", VAULT_BASE);

  const digestCount = await syncTree(SRC.digests, DEST.digests, undefined, scrubDigestForSite);
  console.log(`[sync] copied ${digestCount} digest(s)`);

  const digestPtCount = await syncTree(
    SRC.digestsPt,
    DEST.digestsPt,
    (name) => /^\d{4}-R\d+_Seoul_E-Land_Digest\.md$/i.test(name),
    scrubDigestForSite,
  );
  console.log(`[sync] copied ${digestPtCount} Portuguese digest(s)`);

  const digestKoCount = await syncTree(
    SRC.digestsKo,
    DEST.digestsKo,
    (name) => /^\d{4}-R\d+_Seoul_E-Land_Digest\.md$/i.test(name),
    scrubDigestForSite,
  );
  console.log(`[sync] copied ${digestKoCount} Korean digest(s)`);

  // Place names: file name ends with a venue noun. Don't match the Korean
  // surname "Park" — players named "Park Chang-hwan" must stay players.
  const placeRegex = /\b(Stadium|Arena|Field|Park)\.md$|\b(Stadium|Arena|Field)\b/i;
  const playerCount = await syncTree(SRC.players, DEST.players, (name) => {
    return !placeRegex.test(name);
  }, scrubReferenceNoteForSite);
  console.log(`[sync] copied ${playerCount} player note(s)`);

  const placeCount = await syncTree(SRC.players, DEST.places, (name) => {
    return placeRegex.test(name);
  }, scrubReferenceNoteForSite);
  console.log(`[sync] copied ${placeCount} place note(s)`);

  const previewCount = await syncTree(SRC.prematchPreviews, DEST.prematchPreviews, undefined, scrubPreviewForSite);
  console.log(`[sync] copied ${previewCount} pre-match preview(s)`);

  const previewPtCount = await syncTree(SRC.prematchPreviewsPt, DEST.prematchPreviewsPt, undefined, scrubPreviewForSite);
  console.log(`[sync] copied ${previewPtCount} Portuguese pre-match preview(s)`);

  const previewKoCount = await syncTree(SRC.prematchPreviewsKo, DEST.prematchPreviewsKo, undefined, scrubPreviewForSite);
  console.log(`[sync] copied ${previewKoCount} Korean pre-match preview(s)`);

  const guideCount = await syncTree(SRC.guides, DEST.guides, undefined, polishFanFacingCopy);
  console.log(`[sync] copied ${guideCount} guide(s)`);

  const guidePtCount = await syncTree(SRC.guidesPt, DEST.guidesPt, undefined, polishFanFacingCopy);
  console.log(`[sync] copied ${guidePtCount} Portuguese guide(s)`);

  const guideKoCount = await syncTree(SRC.guidesKo, DEST.guidesKo, undefined, polishFanFacingCopy);
  console.log(`[sync] copied ${guideKoCount} Korean guide(s)`);

  const articleCount = await syncTree(SRC.articles, DEST.articles, undefined, polishFanFacingCopy);
  console.log(`[sync] copied ${articleCount} article(s)`);

  const articlePtCount = await syncTree(SRC.articlesPt, DEST.articlesPt, undefined, polishFanFacingCopy);
  console.log(`[sync] copied ${articlePtCount} Portuguese article(s)`);

  const articleKoCount = await syncTree(SRC.articlesKo, DEST.articlesKo, undefined, polishFanFacingCopy);
  console.log(`[sync] copied ${articleKoCount} Korean article(s)`);

  if (held.length) {
    console.warn(`[sync] kept ${held.length} repo file(s) that differ from the vault (SEOUL_ELAND_SYNC_OVERWRITE=1 takes the vault's version):`);
    for (const path of held) console.warn(`  ${path}`);
  }
  if (removed.length) {
    console.warn(`[sync] skipped ${removed.length} vault file(s) that were removed from the repo:`);
    for (const path of removed) console.warn(`  ${path}`);
  }

  // Always seed empty content folders so Astro doesn't error if vault is empty.
  for (const dir of Object.values(DEST)) {
    await mkdir(dir, { recursive: true });
  }
}

main().catch((err) => {
  console.error("[sync] failed:", err);
  process.exit(1);
});
