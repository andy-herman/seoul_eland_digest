# Seoul E-Land FC Weekly Digest - Copilot Instructions

## What This Is

An automated pipeline that scrapes Korean sports news about Seoul E-Land FC (서울이랜드FC), translates and deduplicates articles, then synthesizes an analyst-voice digest into an Obsidian vault. Runs weekly via Windows Task Scheduler.

## Running the Pipeline

```powershell
# Always use the project venv — never system Python
venv\Scripts\python.exe seoul_eland_digest.py --round 8

# Omit --round to auto-detect the most recent played round
venv\Scripts\python.exe seoul_eland_digest.py
```

### Helper Scripts (all use `venv\Scripts\python.exe`)

| Script | Purpose |
|--------|---------|
| `scripts/add_match_transcript.py --round N --file path` | Save a YouTube transcript and update `user_supplied.json` |
| `scripts/add_match_transcripts_batch.py --dir path --dry-run` | Preview or batch-import user-supplied match transcripts |
| `scripts/fetch_kleague_official_snapshot.py` | Save private K League 2 standings/player records for scouting corpus checks |
| `scripts/update_k2_club_news.py` | Refresh private Naver/Daum K League 2 club-news archive and Obsidian scouting notes |
| `scripts/build_match_context.py --round N` | Build private match context from fixtures and opponent corpus |
| `scripts/build_prematch_preview.py --round N` | Build a private premium-candidate pre-match preview draft |
| `scripts/compile_brief.py` | Rebuild `Recent_News_Research_Brief.md` from all sources |
| `scripts/regenerate_from_brief.py --round N` | Regenerate one round's digest from the compiled brief |
| `scripts/sweep_us_english.py` | Strip em-dashes and convert UK→US spellings across vault output |

## Architecture

```
Korean sources → scraper.py → Azure OpenAI (translation)
                                    ↓
                              Azure OpenAI (deduplication)
                                    ↓
                              Azure OpenAI (analyst voice synthesis)
                                    ↓
                              obsidian_writer.py → Obsidian vault
```

All LLM calls route through a **single Azure OpenAI deployment** using keyless auth (`DefaultAzureCredential` / `az login`). The deployment name comes from `AZURE_OPENAI_DEPLOYMENT` in `.env`. Temperature is not configurable (GPT-5 family rejects custom values).

### Pipeline Stages (in `seoul_eland_digest.py`)

1. **Scrape** — Naver News search for team Korean names within a ±4-day window around the match date
2. **Translate** — Korean→English via the shared Azure deployment
3. **Deduplicate** — Cluster articles into story groups (JSON output)
4. **Synthesize** — Analyst-voice digest grounded in match info, season record, and news clusters
5. **Write** — Obsidian markdown with `[[wikilinks]]` for players, plus master index update

### Key Modules

- `modules/llm_client.py` — `LLMClient` class wrapping `AzureOpenAI`. Factory: `build_client_from_config()`
- `modules/scraper.py` — Naver search + BeautifulSoup extraction. Most fragile component (DOM changes break it)
- `modules/obsidian_writer.py` — Writes digests, player notes, and master index to the vault

## Conventions

### Prompts Are Plain Text Files

All LLM prompts live in `prompts/*.txt`. They use `{placeholder}` substitution (NOT Python f-strings or `.format()`). The custom `_format_prompt()` function in the orchestrator does literal replacement to avoid conflicts with JSON examples in prompts.

### Configuration Split

- `config.yaml` — Runtime config: vault paths, model token budgets, feature flags, team identifiers
- `sources.yaml` — Korean news sources with tiers (1-3) and scraping methods
- `data/fixtures.yaml` — Authoritative fixture list. Rounds with `result: "TBD"` are unplayed
- `.env` — Secrets: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`

### Fixture Data Is The Source of Truth

`data/fixtures.yaml` drives match info, season record computation, and upcoming fixtures. When processing a new match:
1. Update `fixtures.yaml` with the result (targeted edit, never overwrite the whole file)
2. Re-compile the brief
3. Regenerate the digest for that round

### Obsidian Output Conventions

- Digest filenames: `2026-R08_Seoul_E-Land_Digest.md`
- Player notes created on first mention, updated on subsequent rounds
- All cross-references use `[[wikilinks]]` for Obsidian graph navigation
- Vault path: configured in `config.yaml` under `vault.base_path`

### Windows-Specific

- `sys.stdout`/`stderr` are reconfigured to UTF-8 at startup (Korean text crashes cp1252)
- `SCRIPT_DIR = Path(__file__).parent.resolve()` ensures the script works regardless of CWD
- Scheduling: `run_weekly.bat` → Windows Task Scheduler (docs in `docs/setup_task_scheduler.md`)

### Style Notes

- US English spelling in all generated output (the sweep script enforces this)
- No em-dashes in output (converted to hyphens by `sweep_us_english.py`)

## Astro Frontend (`site/`)

The public frontend is an Astro 5 + Tailwind 4 site in `site/`. It publishes Obsidian digest content as an English-language Seoul E-Land supporter publication.

### Frontend Commands

```powershell
cd site
npm run dev
npm run build
npm run sync
```

`npm run build` runs `npm run sync`, `astro check`, and `astro build`. Use it after frontend changes.

### Site Content Flow

- Source vault: `C:\Andy Herman\Luna Master\Sports\Seoul_E-Land`
- Sync script: `site/scripts/sync-content.mjs`
- Synced content: `site/src/content/{digests,players,places}`
- The sync script strips public-facing generated/source-count footer lines from digest files before publishing.

### Frontend Design Direction

- Treat the site as a polished independent supporter publication, not a technical demo or generated archive.
- Use the official Seoul E-Land palette:
  - Navy: `#0B1752`
  - Dark navy: `#090C20`
  - Active blue: `#113EAE`
  - Gold: `#B38259`
  - Red: `#EB003B`
- Keep copy reader-facing. Avoid public wording like "AI", "generated", "automated pipeline", "sources consulted", "synthesized", "inferred", or "source of truth".
- Do not add or rehost match photos from news sources unless usage rights are explicitly clear.
- Safe visuals currently include:
  - official wordmark: `site/public/assets/logo-official.svg`
  - Seoul crest: `site/public/assets/crest.png`
  - opponent crests: `site/public/assets/teams/*`
  - official player photos resolved from seoulelandfc.com player detail pages.

### Key Frontend Files

- `site/src/pages/index.astro` — homepage and round archive
- `site/src/pages/rounds/[...slug].astro` — round article layout
- `site/src/pages/players/index.astro` — squad roster from official API
- `site/src/pages/players/[...slug].astro` — player notes/detail pages
- `site/src/components/DigestCard.astro` — round card component
- `site/src/components/TranslateButton.astro` — Portuguese Google Translate CTA
- `site/src/lib/teamLogos.ts` — opponent logo resolver
- `site/src/lib/playerLocalisation.ts` — English names/nationalities/positions for roster display

### Current QA Backlog

- Fix `[[wikilink]]` routing so known players go to `/players/...`, digests go to `/rounds/...`, and places stay under `/places/...`.
- Make squad cards clickable into player detail pages.
- Polish player detail pages to match the current roster/round design.
- Re-check mobile header behavior on narrow screens.
- Continue editorial cleanup for natural fan-facing language.
