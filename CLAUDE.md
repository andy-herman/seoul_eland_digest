# CLAUDE.md

Weekly pipeline that gathers Korean news about Seoul E-Land FC (K League 2), translates and consolidates it, and writes an analyst-voice round digest into Andy's Obsidian vault. Runs Mondays via Windows Task Scheduler (`run_weekly.bat`). A public Astro site in `site/` republishes the vault content.

## Two generations of pipeline, both live

1. **Original orchestrator** `seoul_eland_digest.py` (run with `--round N`, defaults to most recent played round). Stages in order:
   - Scrape: `modules/scraper.py`, Naver News search anchored plus/minus 4 days around the match date
   - Translate: `stage_translate` in `seoul_eland_digest.py`, Korean to English per article
   - Deduplicate: `stage_deduplicate`, clusters same-story articles into JSON (has a one-cluster-per-article fallback if JSON parsing fails)
   - Synthesize: `stage_synthesize`, analyst-voice digest grounded in `data/fixtures.yaml` match facts and season record
   - Write: `modules/obsidian_writer.py`
2. **Brief-based weekly flow**, what `run_weekly.bat` actually runs today. It bypasses the live Naver scrape: `scripts/fetch_kleague_fixtures.py`, `scripts/fetch_kleagueunited_preview.py`, `scripts/compile_brief.py` (rebuilds `Recent_News_Research_Brief.md` from `research_dump/`), `scripts/regenerate_from_brief.py` (regenerates the round digest from the brief), `scripts/sweep_us_english.py`, `scripts/translate_digest_pt.py`, `scripts/dedupe_player_notes.py`, `scripts/vault_audit.py`, then `scripts/publish_site_vercel.ps1`.

All LLM calls go through `modules/llm_client.py`: a single Azure OpenAI deployment, keyless auth via `DefaultAzureCredential` (requires `az login`). The README's architecture section (Hermes via Nous Portal plus Claude Sonnet) is stale; trust the code and `.env.example`. Temperature is not configurable (GPT-5 family deployments reject custom values).

## Config split

- `config.yaml`: vault paths, per-job `max_tokens`, feature flags (`max_articles_per_run`, `dedupe_threshold`), team name variants for filtering
- `sources.yaml`: tiered Korean source list. Mostly documentation; the v1 scraper leans on Naver search, which aggregates most Tier 1 outlets. Tier 3 fan forums are not yet wired in
- `data/fixtures.yaml`: authoritative fixture list and results. Rounds not yet played carry `result: "TBD"`. Everything (season record, digest grounding, opponent-name exclusions) derives from it
- `data/exclusions.yaml`: names that must not become player notes (opponents, venues)
- `.env` (from `.env.example`): `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, API version, token scope

## Vault output contract

Target: `C:/Andy Herman/Luna Master/Sports/Seoul_E-Land` (set in `config.yaml`).

- Digests go to `Digests/` named `2026-R{NN}_Seoul_E-Land_Digest.md`; Portuguese companions to `Digests-PT/`; player notes to `Players/`; match reports to `Matches/`
- Player notes are auto-created for every `[[wikilink]]` in the digest that matches a person-name heuristic and is not excluded. New notes get YAML frontmatter (`type: player`, `team`, `created`, `tags`) and a `## Mentions` section; existing notes get a backlink line appended
- Master index `Seoul_E-Land_Index.md` gets a new entry prepended under `## Round Digests` (skipped if the digest filename is already listed)
- Output must be US English with no em-dashes; `scripts/sweep_us_english.py` enforces this after generation

## Prompts are first-class artifacts

Everything the models are told lives in `prompts/*.txt`: `translate`, `deduplicate`, `analyst_voice` (the single file controlling the digest voice), `match_report`, `portuguese_digest`, `portuguese_preview`. Tune the voice by editing `analyst_voice.txt`, not code. Placeholders like `{match_info}` are substituted by literal string replacement (`_format_prompt`), so raw braces in JSON examples are safe.

## Skills

- `eland-new-match`: run when Andy pastes a Korean YouTube highlights transcript or invokes `/eland-new-match`. Saves the transcript, updates `fixtures.yaml`, recompiles the brief, regenerates that round's digest, runs the sweep
- `eland-publish-site`: run after weekly digest generation. Builds the Astro site, stages only public files, commits, pushes to main so Vercel deploys

## The site half

`site/` is an Astro 5 + Tailwind static site. `site/scripts/sync-content.mjs` copies sanitized vault markdown into `site/src/content/` on every dev and build; the vault is the source of truth. Wikilinks resolve via `remark-wiki-link` with hardcoded slug sets in `site/astro.config.mjs` (new players need a slug added there).

There are two deploy paths, both triggered by a push to main:

- Vercel: `vercel.json` at the repo root plus `scripts/publish_site_vercel.ps1` (build, stage public files only, commit, push; Vercel Git integration deploys from `/`)
- GitHub Pages: `.github/workflows/deploy-pages.yml` builds with `SITE_BASE=/seoul_eland_digest` and deploys to Pages

Only one should be canonical. TODO Andy: pick one and remove or disable the other.

Never stage `.env`, `logs/`, `research_dump/`, or private pipeline scripts when publishing the site.

## Known fragile spots

- The BeautifulSoup selectors in `modules/scraper.py` break when Naver shifts its DOM (per the README, the most fragile component). Run with logs in `logs/` to diagnose
- `regenerate_from_brief.py` splits the brief on `### R{n}` headings via regex; heading format changes break round matching
- `backfill.sh` passes a `--weeks-back` flag the orchestrator no longer accepts; `backfill_rounds.sh` (per-round) is the working one

## Running locally

Always use the project venv, never system Python: `venv\Scripts\python.exe seoul_eland_digest.py --round 8`, or the individual `scripts/*.py`. Requires `az login` beforehand. Full weekly flow: `run_weekly.bat`. A run costs roughly $0.05 to $0.30 depending on news volume; the analyst-voice stage is the main token spend, capped by `features.max_articles_per_run`.
