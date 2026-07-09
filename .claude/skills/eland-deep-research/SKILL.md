---
name: eland-deep-research
description: Deep research a Seoul E-Land FC match across Korean sports news sites. Fan out parallel web-research agents over Naver News, K League official, kleagueunited.com, and the tiered outlets in sources.yaml, verify facts against the fixture file and any user transcript, then feed the findings into a round digest (recap) or pre-match preview. Use when the user asks for "deep research" on a played round or an upcoming opponent, or invokes /eland-deep-research [--round N] [--mode recap|preview].
---

# eland-deep-research

Research one Seoul E-Land match (recap of a played round, or preview of an upcoming round) across as many Korean sports news sources as practical, and turn the findings into the vault deliverable. This skill is the research layer; `eland-new-match` remains the transcript/pipeline layer and `CLAUDE_PLAYBOOK.md` in the vault (`Sports/Seoul_E-Land/`) remains the editorial law.

## When to invoke

- `/eland-deep-research --round N --mode recap` after a round has been played (usually right after `/eland-new-match` has saved the transcript).
- `/eland-deep-research --round N --mode preview` before the next round.
- The user says things like "deep research the Gimhae match", "research the next opponent across Korean news sites", "build me the recap with real sources".

## Ground rules (non-negotiable)

1. **`data/fixtures.yaml` is authoritative** for dates, venues, opponents, results. Read it first. Never invent fixtures. Note bye rounds (2026: R17 and R30 have no Seoul E-Land match; "next round" then means the next round WITH a fixture).
2. **No season mixing.** 2026 facts only. Date-window every search to the match date plus/minus 4 days (recap) or the two weeks before kickoff (preview). Reject URLs containing `/2025/` or 2025 datestamps. This is a hard rule the user has enforced before.
3. **User-supplied YouTube transcripts outrank news wires** on in-match facts (scorers, minutes, subs). Check `research_dump/r{N}_youtube_transcript.txt` before searching; treat it as ground truth and use research to corroborate and extend it.
4. **Never invent sources or facts.** Every claim in the findings file carries outlet + URL + date. If the web yields nothing for a claim, mark it `UNVERIFIED (transcript only)` or drop it. Conflicts between sources get flagged, not silently resolved.
5. **Editorial output rules** live in the playbook: US English, no em or en dashes, wikilink only Seoul E-Land entities, hangul in parentheses on first mention per section.

## Source map

Fan out across these, in tier order (full list with URLs in `sources.yaml`):

- **Naver News search** (aggregates most Tier 1 outlets). Recipe: `https://search.naver.com/search.naver?where=news&query=<urlencoded>&sort=1&pd=3&ds=YYYY.MM.DD&de=YYYY.MM.DD`. Always pass `pd=3&ds&de`.
- **K League official** (`kleague.com`) for match center facts, standings, disciplinary.
- **kleagueunited.com** (English) for round previews/reviews.
- **Tier 1 outlets:** MoneyToday Sports, Sports Kyunghyang, Footballist, Seoul E-Land official site.
- **Tier 2 outlets:** Sports Chosun, OSEN, Interfootball, Xports News, Sportalkorea, MK Sports, Yonhap.
- **Namu wiki** season page as a cross-check index, never as a primary source.
- **Tier 3 fan forums** (FM Korea, DC Inside E-Land gallery) only for sentiment color, clearly labeled as fan sentiment.

## Query recipes

Substitute the opponent's Korean name and round number. Run the Korean queries first; English second.

Recap mode (window = match date plus/minus 4 days):
- `서울이랜드 <opponent_ko>` / `<opponent_ko> 이랜드` / `이랜드 <opponent_ko>FC`
- `K리그2 <N>라운드` and `K리그2 <N>라운드 결과`
- `서울이랜드 김도균` (post-match presser)
- One query per goalscorer, e.g. `서울이랜드 박재용`, `에울레르 골`
- `K리그2 순위` (standings after the round)

Preview mode (window = last 14 days):
- `<opponent_ko>` club news: `<opponent_ko> 감독`, `<opponent_ko> 이적`, `<opponent_ko> 부상`, `<opponent_ko> 순위`
- `서울이랜드 <opponent_ko> 프리뷰`, `K리그2 <N>라운드 일정`
- Head-to-head: coverage of the earlier 2026 meeting if one exists (check fixtures.yaml)

## Procedure

1. **Anchor.** Read `data/fixtures.yaml`, `data/team_corpus.yaml` (opponent profile, `predicted_lineups`), the vault's latest digest and preview, and any `research_dump/r{N}_youtube_transcript.txt`.
2. **Fan out.** Launch 2-4 parallel research agents (general-purpose, with WebSearch/WebFetch), split by concern, e.g. recap: (a) match facts + pressers, (b) standings + league context, (c) transfers/off-pitch; preview: (a) opponent form and squad, (b) fixture verification + league context. Each agent must return structured raw findings with outlet/URL/date per fact and an explicit "could not verify" list.
3. **Verify.** Cross-check agent findings against fixtures.yaml and the transcript. Discard anything 2025-flavored. Where only the transcript supports a fact, keep it but attribute it to the broadcast.
4. **Persist findings.** Write `research_dump/r{N}_deepresearch.md` (structured findings + source list). If article bodies were captured, also write `research_dump/r{N}_naver_deepresearch.json` as a list of `{round, source, title, url, body}` objects; `compile_brief.py` picks up any `r*_naver*.json` automatically.
5. **Produce the deliverable.**
   - If the Azure pipeline is available (`.env` present, `az login` works): run the playbook sequence (`compile_brief.py`, then `regenerate_from_brief.py --round N` or `build_prematch_preview.py --round N`).
   - Otherwise draft directly, matching the established formats exactly: digests follow `Digests/2026-R{NN}_Seoul_E-Land_Digest.md` (frontmatter, headline blockquote, The Round in One Paragraph, Match Report, Player Performances, News and Transfers, Tactical and Strategic Watch, Standings Snapshot, Looking Ahead, My Honest Read, sources footer); previews follow `Scouting Report/K League 2 2026/Pre-Match Previews/2026-R{NN}_<Opp>_Preview.md` (frontmatter incl. `forecast_probabilities` and `predicted_lineup` JSON, At a Glance table, squad news, Predicted XI basis, opponent scouting, keys, forecast, bottom line). Predicted XI always starts from the PREVIOUS round's actual XI.
6. **Housekeeping.** Update `Seoul_E-Land_Index.md` (prepend digest entry / add preview entry), `data/fixtures.yaml` and `site/src/data/matches.ts` (both, always together) if a result landed, and `data/team_corpus.yaml` `predicted_lineups` for a preview. Run `venv/Scripts/python.exe scripts/sweep_us_english.py` and `scripts/vault_audit.py` if the venv exists; otherwise grep the new files for em/en dashes manually.
7. **Report.** Give the user: deliverable links, the headline, the 3-5 strongest sourced insights, and an honest list of what could not be verified online.

## Quality bar

- A recap must say something falsifiable about HOW the team played (shape, pressing, transition moments, finishing quality), not just what the score was. Mine the transcript for commentator observations (shot counts, saves, patterns like "Euller-Park Chang-hwan left side") and corroborate with press coverage.
- A preview must contain: opponent's exact table position and record, last-5 form, manager and shape, 2-4 named threats with production numbers, and a predicted Seoul XI grounded in the last actual XI.
- Sources footer counts only real consulted sources. Never pad the count.
