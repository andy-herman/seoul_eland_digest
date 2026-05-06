// Copies digests + player notes from the Obsidian vault into src/content/
// for Astro's content collections to pick up.
//
// Source of truth is the vault. Content in src/content/{digests,digests-pt,players,places}
// is refreshed on every build.

import { mkdir, readdir, copyFile, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VAULT_BASE = "C:/Andy Herman/Luna Master/Sports/Seoul_E-Land";
const SITE_BASE = join(__dirname, "..", "src", "content");

const SRC = {
  digests: join(VAULT_BASE, "Digests"),
  digestsPt: join(VAULT_BASE, "Digests-PT"),
  players: join(VAULT_BASE, "Players"),
};

const DEST = {
  digests: join(SITE_BASE, "digests"),
  digestsPt: join(SITE_BASE, "digests-pt"),
  players: join(SITE_BASE, "players"),
  places: join(SITE_BASE, "places"),
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

async function copyTree(srcDir, destDir, predicate, transform) {
  if (!existsSync(srcDir)) {
    console.warn(`[sync] missing source: ${srcDir} — skipping`);
    return 0;
  }
  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir);
  let count = 0;
  for (const entry of entries) {
    const srcPath = join(srcDir, entry);
    const s = await stat(srcPath);
    if (!s.isFile()) continue;
    if (!entry.endsWith(".md")) continue;
    if (predicate && !predicate(entry)) continue;
    const destPath = join(destDir, entry);
    if (transform) {
      const content = await readFile(srcPath, "utf8");
      await writeFile(destPath, transform(content), "utf8");
    } else {
      await copyFile(srcPath, destPath);
    }
    count += 1;
  }
  return count;
}

async function main() {
  console.log("[sync] vault →", VAULT_BASE);

  const digestCount = await copyTree(SRC.digests, DEST.digests, undefined, scrubDigestForSite);
  console.log(`[sync] copied ${digestCount} digest(s)`);

  const digestPtCount = await copyTree(
    SRC.digestsPt,
    DEST.digestsPt,
    (name) => /^\d{4}-R\d+_Seoul_E-Land_Digest\.md$/i.test(name),
    scrubDigestForSite,
  );
  console.log(`[sync] copied ${digestPtCount} Portuguese digest(s)`);

  // Place names: file name ends with a venue noun. Don't match the Korean
  // surname "Park" — players named "Park Chang-hwan" must stay players.
  const placeRegex = /\b(Stadium|Arena|Field|Park)\.md$|\b(Stadium|Arena|Field)\b/i;
  const playerCount = await copyTree(SRC.players, DEST.players, (name) => {
    return !placeRegex.test(name);
  }, scrubReferenceNoteForSite);
  console.log(`[sync] copied ${playerCount} player note(s)`);

  const placeCount = await copyTree(SRC.players, DEST.places, (name) => {
    return placeRegex.test(name);
  }, scrubReferenceNoteForSite);
  console.log(`[sync] copied ${placeCount} place note(s)`);

  // Always seed empty content folders so Astro doesn't error if vault is empty.
  for (const dir of Object.values(DEST)) {
    await mkdir(dir, { recursive: true });
  }
}

main().catch((err) => {
  console.error("[sync] failed:", err);
  process.exit(1);
});
