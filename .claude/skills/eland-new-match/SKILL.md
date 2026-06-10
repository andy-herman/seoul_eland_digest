---
name: eland-new-match
description: Process a new Seoul E-Land match. Saves the YouTube transcript the user provides, updates fixtures.yaml with the result, re-compiles the research brief, regenerates that round's Obsidian digest grounded in the brief, and runs the em-dash / US-spelling sweep. Use when the user invokes /eland-new-match or paste in a Korean YouTube highlights transcript and asks for a digest update.
---

# eland-new-match

Process a freshly-played Seoul E-Land FC match end-to-end: save the user's transcript, log the result, regenerate the round digest in their Obsidian vault.

## When to invoke

The user types `/eland-new-match` (with optional `--round N`) and either pastes a Korean YouTube highlights transcript directly into the chat OR points to a file path. They may also provide the match result (e.g., "R11 W 2-1 vs Chungnam Asan").

## What you have access to

- `data/fixtures.yaml` — authoritative fixture list. Contains rounds with `result: "TBD"` for unplayed matches.
- `research_dump/` — source material directory.
- `scripts/add_match_transcript.py` — saves a transcript and updates `user_supplied.json`.
- `scripts/compile_brief.py` — re-compiles `Recent_News_Research_Brief.md` from all sources.
- `scripts/regenerate_from_brief.py` — regenerates a round digest from the brief. Supports `--round N`.
- `scripts/sweep_us_english.py` — strips em dashes and converts UK→US spellings across the vault.
- `venv/Scripts/python.exe` — the project's Python interpreter (always use this, not system Python).

## Steps

1. **Identify the round.** Read `data/fixtures.yaml`. Determine which round this transcript is for:
   - If the user passed `--round N`, use that.
   - Otherwise, find the smallest round number whose `result` is still `"TBD"` AND whose `date` is in the past. That's the most likely target.
   - If ambiguous, ask the user to confirm.

2. **Update the fixture if needed.** If the user provided the result (or stated "we won 2-1 vs Chungnam Asan"), update `fixtures.yaml`:
   - Replace `result: "TBD"` with the actual result string (`"W 2-1"`, `"L 1-2"`, or `"D 0-0"`)
   - Set `home_score` and `away_score` based on the venue and result.
   If the user did NOT provide a result, infer it from the transcript itself (look for "최종 스코어" / "final score" lines). If still uncertain, ask before continuing — don't guess.

3. **Save the transcript.** Write the user's transcript to a temp file, then call:
   ```
   venv/Scripts/python.exe scripts/add_match_transcript.py --round N --file <temp-path>
   ```
   This creates `research_dump/r{N}_youtube_transcript.txt` and updates `user_supplied.json`.

4. **Re-compile the brief.** Run:
   ```
   venv/Scripts/python.exe scripts/compile_brief.py
   ```
   This rebuilds `Recent_News_Research_Brief.md` with the new transcript included. Takes ~30 seconds.

5. **Regenerate just this round's digest.** Run:
   ```
   venv/Scripts/python.exe scripts/regenerate_from_brief.py --round N
   ```
   This writes `Sports/Seoul_E-Land/Digests/2026-R{NN}_Seoul_E-Land_Digest.md` and updates the master index + player notes.

6. **Sweep.** Run:
   ```
   venv/Scripts/python.exe scripts/sweep_us_english.py
   ```
   Removes em dashes and any UK→US spellings.

7. **Report.** Show the user:
   - The path to the new digest file (use a markdown link)
   - The headline (the line starting with `>` in the digest)
   - Notable facts that came through (scorers, key incidents)
   - The sweep stats (dashes removed)

## Behavior rules

- ALWAYS use `venv/Scripts/python.exe`, not `python` directly. The venv has all dependencies installed.
- NEVER overwrite `fixtures.yaml` without first reading it and applying a targeted edit. Use the Edit tool.
- The transcript may be Korean text with timestamps like `0:044 seconds`. That's fine — the brief compiler reads it as-is, the analyst LLM speaks Korean.
- If the user pastes the transcript directly in chat (not a file path), write it to `research_dump/_tmp_transcript_{N}.txt` first, then pass that path to `add_match_transcript.py`. Delete the temp file after success.
- The brief compilation takes ~30s. The regenerate step takes ~20s. Tell the user "compiling brief…" and "regenerating digest…" so they know each stage is in flight.
- After success, do NOT auto-open the digest file. Just give the user the markdown link.

## Common variations

- **"Just regenerate, I haven't added anything new"** — skip steps 2-3, jump straight to compile+regenerate+sweep.
- **"Fixtures.yaml is wrong, R3 was actually Mar 14 not Mar 13"** — edit fixtures.yaml directly, then re-run regenerate for that round.
- **"I have transcripts for two rounds at once"** — handle each round in sequence: save both transcripts, compile brief once, regenerate both rounds, sweep once at the end.
