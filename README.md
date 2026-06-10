# Seoul E-Land FC Weekly Digest

An automated weekly pipeline that scrapes Korean sports news for Seoul E-Land FC (서울이랜드FC) coverage, translates and consolidates the stories, and writes a tactical analyst-voice digest into your Obsidian vault.

## Architecture

```
Korean sources → Scraper → Hermes 4 70B (translation)
                              ↓
                          Hermes 4 70B (cluster duplicates)
                              ↓
                          Claude Sonnet 4.5 (analyst voice)
                              ↓
                          Obsidian vault (.md files + wikilinks)
```

The split is deliberate. Translation is mechanical and benefits from the cheap-fast Hermes route. The analyst-voice synthesis is the creative bottleneck and is worth the extra spend on Claude Sonnet.

**Approximate cost per run:** $0.05 to $0.30 depending on news volume that week.

## Prerequisites

1. **Python 3.10 or higher** installed on Windows
2. **Nous Portal account** with an API key from [portal.nousresearch.com](https://portal.nousresearch.com/)
3. **Anthropic API account** with a key from [console.anthropic.com](https://console.anthropic.com/)
4. **Obsidian vault** at `C:\Andy Herman\Luna Master` (already configured, synced via Obsidian Sync)

## Initial Setup

### 1. Place the project folder

Save this entire folder somewhere stable. Recommended location:
```
C:\Andy Herman\Coding Projects (Local)\seoul_eland_digest\
```

### 2. Create a Python virtual environment

Open PowerShell or Command Prompt in the project folder and run:

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure your API keys

Copy `.env.example` to `.env`:

```powershell
copy .env.example .env
```

Open `.env` in a text editor and paste in your real API keys:

```
NOUS_API_KEY=your-nous-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

The `.env` file is in `.gitignore` so it will not be committed if you ever put this in version control.

### 4. Verify the vault path

Open `config.yaml` and confirm the `vault.base_path` matches your Obsidian location. The default is set to:
```
C:/Andy Herman/Luna Master/Sports/Seoul_E-Land
```

The `Sports/Seoul_E-Land` subfolder will be created automatically on first run if it does not exist.

### 5. Test a manual run

Before scheduling, run the script manually to validate everything works:

```powershell
venv\Scripts\activate
python seoul_eland_digest.py
```

Expected output:
- Console logs showing each stage progressing
- A new file at `Sports\Seoul_E-Land\Digests\2026-W18_Seoul_E-Land_Digest.md` (or similar)
- A few new files in `Sports\Seoul_E-Land\Players\`
- A master index at `Sports\Seoul_E-Land\Seoul_E-Land_Index.md`

Open Obsidian, point it at the `Andy` vault, and confirm you can see the new files. Open the digest and verify the wikilinks resolve.

### 6. Schedule the weekly run

See `docs/setup_task_scheduler.md` for step-by-step Windows Task Scheduler instructions.

## Day-to-Day Use

You will not need to touch the script most weeks. Every Monday at 8 AM PT, Task Scheduler will run `run_weekly.bat`, which generates a fresh digest in your vault.

## Tuning the Analyst Voice

If after a few weeks the analyst voice feels off, edit `prompts/analyst_voice.txt`. This is the single file that controls how the digest is written. The prompt is intentionally verbose and instructable. You can tighten the voice, adjust the structure, or shift the section emphasis without touching code.

See `docs/tuning_the_voice.md` for guidance.

## Adding or Removing News Sources

Edit `sources.yaml`. Each source has a tier (1-3) and a method. Tier 3 sources are fan forums and are only scraped when `features.include_fan_sentiment` is true in `config.yaml`.

Worth noting: the v1 scraper relies primarily on Naver News search, which already aggregates most of the listed Tier 1 sources. The per-outlet scraping in `sources.yaml` is mostly documentation for now and will be activated in future versions.

## Troubleshooting

**Script runs but no articles found**
Naver search results may have shifted DOM structure. Run with `--verbose` and inspect logs in the `logs/` folder. The most fragile component is the BeautifulSoup selectors in `modules/scraper.py`.

**Translation step fails with auth error**
Verify your `.env` file has the correct `NOUS_API_KEY`. Test with a curl command against the Nous Portal API to confirm the key works.

**Digest written but Obsidian does not show it**
Obsidian Sync may still be uploading. Check the Sync status indicator in the bottom-right of the Obsidian window — it should show a green checkmark when caught up.

**Costs growing higher than expected**
Lower `features.max_articles_per_run` in `config.yaml` from 50 to 25. The biggest cost driver is total tokens fed to the analyst voice stage.

## Project Structure

```
seoul_eland_digest/
├── seoul_eland_digest.py          # Main orchestrator
├── config.yaml                    # All configuration
├── sources.yaml                   # Korean source list
├── .env.example                   # API key template (copy to .env)
├── requirements.txt               # Python dependencies
├── run_weekly.bat                 # Task Scheduler entry point
├── prompts/
│   ├── translate.txt              # Korean to English translation
│   ├── deduplicate.txt            # Story clustering
│   ├── analyst_voice.txt          # The ex-pro analyst voice
│   └── match_report.txt           # Tactical deep-dive
├── modules/
│   ├── llm_client.py              # Provider-agnostic LLM wrapper
│   ├── scraper.py                 # Korean source scraper
│   └── obsidian_writer.py         # Markdown formatting + wikilinks
├── docs/
│   ├── setup_task_scheduler.md    # Windows scheduler walkthrough
│   └── tuning_the_voice.md        # Prompt tuning guide
└── logs/                          # Run history (created automatically)
```

## Next Steps After v1

These are deferred features. Not in v1, but worth flagging:

1. **Live standings and fixture scraping** from kleague.com. Currently stubbed; the analyst infers position from article context.
2. **Fan forum integration** for FM Korea and DC Inside. Code skeleton in `sources.yaml`, scraping logic not yet implemented.
3. **Match report deep-dives** as separate Obsidian notes. Prompt is written (`prompts/match_report.txt`); orchestrator wiring is not.
4. **Telegram or email notification** when a digest is generated. Easy add via httpx POST.
5. **Per-source DOM selectors** for the outlets that Naver does not index well.
