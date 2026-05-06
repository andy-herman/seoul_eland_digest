# Eland Digest — Site

Public-blog frontend for the [Seoul E-Land Digest](../README.md) pipeline. Built with Astro 5, Tailwind v4, and TypeScript content collections.

## How content flows

```
Obsidian vault (Luna Master)         site/
└── Sports/Seoul_E-Land/             ├── scripts/sync-content.mjs
    ├── Digests/    ───── copy ───→  ├── src/content/digests/
    └── Players/    ───── copy ───→  ├── src/content/players/
                              └────→ └── src/content/places/  (filtered)
```

The vault is the source of truth. The sync script copies markdown files into `src/content/` on every `dev`/`build`. The synced folders are gitignored.

## Develop

```
npm install        # one-time
npm run dev        # syncs from vault, then starts Astro dev server
```

By default the vault path is `C:/Andy Herman/Luna Master/Sports/Seoul_E-Land`. Edit `scripts/sync-content.mjs` if the vault moves.

## Build

```
npm run build      # syncs, type-checks, builds static site to dist/
npm run preview    # serve the built site locally
```

## Deploy

Not wired up yet. Two reasonable options:

- **GitHub Pages** — free for public repos. Requires the project to be in git first. Add a workflow at `.github/workflows/deploy.yml`.
- **Cloudflare Pages / Netlify** — free tier, custom domain support, automatic deploys on push.

Either way: pick a domain, set `site` in `astro.config.mjs` to the canonical URL, and (for GitHub Pages) set the `base` if deploying to a subpath.

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
