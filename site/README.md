# Eland Digest — Site

Public-blog frontend for the [Seoul E-Land Digest](../README.md) pipeline. Built with Astro 5, Tailwind v4, and TypeScript content collections.

## How content flows

```
Obsidian vault (Luna Master)         site/
└── Sports/Seoul_E-Land/             ├── scripts/sync-content.mjs
    ├── Digests/                     ├── src/content/digests/
    ├── Digests-PT/    ─── copy ───→ ├── src/content/digests-pt/
    ├── Players/                     ├── src/content/players/
    │                          └───→ ├── src/content/places/  (filtered)
    └── Scouting Report/...          ├── src/content/prematch-previews/
                               └───→ └── src/content/prematch-previews-pt/
```

The vault is the authoring source of truth. The sync script copies sanitized, supporter-facing markdown into `src/content/` on every `dev`/`build`; committed copies let Vercel build even when the local vault is unavailable.

## Develop

```
npm install        # one-time
npm run dev        # syncs from vault, then starts Astro dev server
```

By default the vault path is `C:/Andy Herman/Luna Master/Sports/Seoul_E-Land`; set `SEOUL_ELAND_VAULT_BASE` if the vault moves. Pre-match previews can also be overridden at build time with `PREMATCH_PREVIEW_DIR` and `PREMATCH_PREVIEW_PT_DIR`.

## Build

```
npm run build      # syncs, type-checks, builds static site to dist/
npm run preview    # serve the built site locally
```

## Deploy

Vercel is configured from the repository root:

- Install: `cd site && npm ci`
- Build: `cd site && npm run build`
- Output: `site/dist`

## Layout

```
site/
├── astro.config.mjs        Astro + Tailwind + remark-wiki-link config
├── package.json
├── public/                 static assets (favicon)
├── scripts/
│   └── sync-content.mjs    vault → content/ copy
└── src/
    ├── components/         Header, Footer, ResultBadge, DigestCard
    ├── content/
    │   └── config.ts       collection schemas
    ├── layouts/
    │   └── BaseLayout.astro
    ├── pages/
    │   ├── index.astro             round list
    │   ├── about.astro
    │   ├── rounds/[...slug].astro  one digest
    │   ├── players/[...slug].astro one player
    │   └── places/[...slug].astro  one stadium etc.
    └── styles/
        └── global.css      Tailwind + Pretendard + light prose defaults
```

## What is intentionally minimal

The visual design is deliberately restrained — clean typography, two accent colours, very few flourishes. The next pass will use the [front-end-design Claude Code skill](https://github.com/anthropics) for proper typographic rhythm, palette, and component polish.

## Wikilinks

The vault uses `[[Mokdong Stadium]]`-style wikilinks. The build pipeline resolves these via `remark-wiki-link` to `/places/<slug>` URLs. If the target page doesn't exist, the link still renders (Astro's static build will warn).
