# Tuning the Analyst Voice

The single most important file in this project is `prompts/analyst_voice.txt`. It controls how the digest reads. Everything else is plumbing.

## How to tune

Open `prompts/analyst_voice.txt`. The file is structured as:

1. Voice and style guidelines (top section)
2. Writing rules (middle section)
3. Output structure with section headers
4. Input data placeholders at the bottom

If the digest reads wrong, identify which of these three is the issue and edit the corresponding section.

## Common adjustments

**Digest is too generic, not committed enough**
Edit the "Voice and style" section. Strengthen the language around being direct and contrarian. Add specific examples of the kind of voice you want.

**Digest is too critical or harsh**
Soften the "Critical when warranted" line. Add a note like: "Praise specific, concrete moments of quality. Do not be reflexively negative."

**Digest sections are missing or appearing when they shouldn't**
The structure section uses conditional language like "ONLY include this section if a match was played." If the model is ignoring those conditions, make them louder. Use ALL CAPS for the conditional rules.

**Wikilinks are not being created**
The model is forgetting the `[[Wikilinks]]` instruction. Move that rule from the writing rules section to the top of the file under a heading like `CRITICAL: NEVER OMIT THIS`.

**Player names not formatted correctly**
The instruction is in writing rule 5. If it's being ignored, add specific examples of correct and incorrect formatting.

## The most important rule

Edit one thing at a time and run a test. If you change five things at once and the output gets worse, you will not know which change caused it.

The script supports manual runs:
```powershell
venv\Scripts\activate
python seoul_eland_digest.py
```

Run it, read the output, edit the prompt, run again. Iterate.

## What NOT to do

Do not edit the input data placeholders at the bottom of the file:
- `{iso_date}`, `{iso_week}`, `{window_start}`, `{window_end}`
- `{standings_data}`, `{upcoming_fixtures}`, `{news_clusters}`, `{fan_sentiment}`
- `{week_number}`

These are filled in programmatically. Changing the placeholder names will break the pipeline.

## When the voice has drifted enough that you want a different analyst entirely

Just rewrite the file. The orchestrator does not care what the prompt looks like, only that it produces a markdown digest with the expected structure. You can completely change the persona, the style, or the priorities of the digest by rewriting `analyst_voice.txt`. The rest of the pipeline keeps working.
