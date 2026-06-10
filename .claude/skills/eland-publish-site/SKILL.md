---
name: eland-publish-site
description: Publish the Seoul E-Land Digest Astro site after weekly digest generation. Builds the site, stages only public website files, commits changed content/assets, pushes to GitHub, and lets Vercel deploy from the connected repository.
---

# eland-publish-site

Publish the public Seoul E-Land Digest website after the weekly digest job finishes.

## When to invoke

Use after the weekly scheduled digest job has:

1. regenerated the English digest,
2. created the Portuguese companion digest,
3. deduplicated player notes,
4. completed the vault audit.

The scheduled task calls this automatically through `run_weekly.bat`.

## What it does

Runs:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\publish_site_vercel.ps1
```

That script:

1. Builds the Astro site from `site/` with Vercel root-url settings.
2. Runs the normal site sync, so vault content is copied into `site/src/content`.
3. Stages only public website files:
   - `site/`
   - `vercel.json`
   - `.github/workflows/deploy-pages.yml`
   - `.gitignore`
4. Commits changes with the standard Copilot co-author trailer.
5. Pushes to `origin main`.
6. Relies on Vercel Git integration to deploy production from the push.

## One-time Vercel setup

In Vercel, import/connect:

- GitHub repo: `andy-herman/seoul_eland_digest`
- Framework preset: Other / Astro-compatible static output
- Install command: `cd site && npm ci`
- Build command: `cd site && npm run build`
- Output directory: `site/dist`

The repo already includes `vercel.json` with those settings.

## Direct deploy option

If Git integration is not used, set a user or machine environment variable:

```powershell
setx VERCEL_TOKEN "<token>"
setx VERCEL_DEPLOY_DIRECT "1"
```

Then the publish script can run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\publish_site_vercel.ps1 -DirectVercelDeploy
```

Do not commit Vercel tokens to the repo.

## Behavior rules

- Keep the public repo boundary: do not stage backend scripts, `.env`, logs, research dumps, or private pipeline artifacts.
- If the site build fails, stop and do not push.
- If there are no public website changes, exit successfully without creating an empty commit.
- GitHub Pages remains supported because the Actions workflow sets `SITE_BASE=/seoul_eland_digest`; Vercel serves from `/`.
