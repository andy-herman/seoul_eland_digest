# Head-to-Head League, FC edition: match engine spec

Andy (2026-09-27): "I like the concept, but the play mechanics are pretty boring. Can we make it more
like a soccer game like FC27 where you can pass, lob, shoot, kick corners, etc?"

The concept stays (real 2026 Seoul E-Land squad vs the 16 other K League 2 clubs' mascots, a 16-round
season plus quick matches). The 1v1 Head Soccer match is replaced by an arcade 5-a-side modelled on
EA SPORTS FC's Rush mode, seen from a broadcast camera (2.5D side view that scrolls along the pitch).
Shared types and constants: `site/src/h2h/fc/types.ts` (read it first).

## Teams
- Home: 5 real players chosen by the UI: [0] goalkeeper, then 4 outfield. Role from `SquadPlayer.pos`:
  GK -> GK, DF -> DEF, MF/AM -> MID, FW -> FWD (the UI sends 1 GK + 4 outfield).
- Away: 5 copies of the rival mascot ("the Ronny squad"), numbers 1, 4, 6, 8, 9. [0] is their GK.
- Home attacks toward +x (rival goal at x = PITCH_L). No side swap at half time.

## Ratings (engine derives them, 0..1)
Home from `SquadPlayer` (pos, height, goals, assists, apps, captain) similar to `playerStats()` in
`data.ts`: pace, shooting, passing, defending, gk. The captain (`opts.captain`) gets +0.04 on all.
Away from the tier. Keep the spread modest: skill should come from the user, not stats.

## Controls (`FcInput`, user drives `state.controlled`)
Attacking (home has the ball or it is loose and a home player is nearest):
- stick = move (8-way analog), sprint = hold.
- pass = ground pass on PRESS to the teammate best aligned with the stick (facing if no stick),
  preferring open lanes. Assisted power by distance.
- through = through ball on PRESS: pass into space ahead of the chosen teammate's run.
- lob = hold to charge, release: lofted pass / cross. Target teammate in the stick direction; if none,
  a point 8..34 m away scaled by charge. Near the rival box, facing goal, with no teammate in that
  direction it becomes a chip shot.
- shoot = hold to charge (0..1 over ~0.9 s), release: shot at the rival goal. Stick up/down picks
  the far/near side of the goal. Error grows with charge > 0.85 (can fly over the bar), pressure
  (defender within 2 m), a bad body angle and a low shooting rating.
- Airborne ball within reach (h about 0.9..2.4, within 1 m): shoot = header or volley at goal,
  pass = headed pass.
Defending (away has the ball):
- pass = switch to the home outfield player best placed to challenge (nearest to the ball; if the
  current one already is, the next nearest).
- shoot = standing tackle (short lunge, succeeds if the carrier is in front and within ~1.6 m,
  better with defending rating and timing; from behind it can be a foul).
- lob = slide tackle (3 m lunge along facing, ~0.45 s, then ~0.9 s on the grass). Ball first:
  wins it. Player first or from behind: foul.
- through = hold to send the nearest AI teammate to press the carrier.
Auto-switch like FC: on gaining possession control the carrier; when a pass is received control the
receiver; while defending switch to the nearest player when the current one is more than ~4 m
further from the ball than the nearest. Never hand control to the goalkeeper (AI keeps both GKs).
Expose `passTarget` (who a pass would go to now) and `charge`/`chargeKind` for the UI.

## Ball and players
- Ball in 3D (x, z, h) with gravity 9.81, a bounce (restitution ~0.5), rolling friction (constant
  decel ~4 m/s^2 plus a little drag) and small air drag. Posts (radius ~0.06) and crossbar bounce.
- Dribbling is arcade "sticky": the owner keeps the ball ~0.5..0.9 m in front (further when
  sprinting); sharp turns at sprint speed slow the player; a close opponent can poke it loose.
- Player speeds (arcade): jog ~4.6 m/s, sprint ~7 m/s, quick acceleration. No stamina needed.
- Players collide softly (no overlapping); the ball deflects off bodies.

## Rules and restarts (`state.setPiece`, phase "restart")
- Kick-off at the start, after half time (the other team) and after each goal (conceding team).
- Out over a touchline: throw-in to the team that did not touch it last.
- Out over a goal line (not a goal): corner if the defending team touched it last, else goal kick.
- Fouls: free kick at the spot; inside the defending team's penalty area: penalty. `direct` is true
  within ~25 m of goal. No offside, no cards.
- Home restarts wait for the user: the stick moves `aimX/aimZ` (corners: the cross target in the
  box; penalties: aim across the goal mouth), pass = short pass toward the aim, lob = cross/long
  ball to the aim (hold for power), shoot = shot (penalty and direct free kick only). After 5 s
  without input the engine plays it automatically. Away restarts are taken by the AI in 0.6..1.4 s.
- Penalties: the goalkeeper dives (AI, tier-based guess); the taker aims and powers the shot.
- Goal: phase "goal" ~2.5 s (scorers celebrate, the others are sad), then kick-off.
- Half time at half of `seconds`: phase "halftime" ~2 s. Full time: phase "ended".
- Quick match level at full time: golden goal for up to GOLDEN_GOAL_SECONDS, then the draw stands.
  League matches can end level.
- `minute` = elapsed mapped to 0..90 (golden goal shows 90+).

## AI (ai.ts), used for the whole away side, for home teammates off the ball, and for both GKs
- Formation shapes for 4 outfield (roughly 2-1-1) that slide with the ball and change between
  attacking (push up, widen, support angles, forward runs) and defending (compact, goal side).
- On the ball (away carrier, or home side in headless tests): choose between shooting, passing
  (progress plus openness of the lane and the receiver), through balls to runners, crosses from wide
  areas, and dribbling into space. The AI must pass and combine like a team, not only dribble.
- Defending: nearest player presses, the next covers the lane or goal side, others mark zones.
  Standing tackles mostly, slides rarely (tier-based), avoid fouls in the box at higher tiers.
- Goalkeepers: stay on the line between ball and goal centre, come off the line for through balls,
  dive at shots they can reach (catch, parry wide or over for a corner, or miss), then distribute.
- Tiers 1..4 (`AI_TIER` in data.ts, 1 easiest): reaction time, decision quality, pass and shot
  accuracy, pressing intensity, a small speed multiplier (about 0.94..1.04) and GK skill.
  Home off-ball teammates use sensible, tier-independent positioning.

## Headless suite (headless.ts): all assertions must pass
Run: `cd site && npx esbuild src/h2h/fc/headless.ts --bundle --platform=node --format=esm --outfile=/tmp/fc-headless.mjs && node /tmp/fc-headless.mjs`
- Equal AI (same tier both sides, 200+ seeded matches): goal split 0.4..0.6, 2..7 goals per match.
- `homeAiTier: 2` (a casual user) against each away tier, 200 matches each:

| Away tier | Home win % | Home loss % | Total goals / match |
|---|---|---|---|
| T1 | 70..90 | <= 15 | 2..7 |
| T2 | 45..65 | 15..35 | 2..7 |
| T3 | 28..45 | 35..55 | 2..7 |
| T4 | 12..28 | 50..72 | 2..7 |

  Points per match strictly falling from T1 to T4.
- Across the whole sample every restart type occurs (kickoff, throwin, corner, goalkick, freekick,
  penalty), saves happen, headers happen, and each side averages >= 12 attempted passes and
  >= 3 shots per match at every tier.
- Robustness: no NaN, no ball outside the pitch by more than 3 m during play, no player outside it
  by more than 3 m, no ball stuck (untouched and nearly still) for > 6 s in play, every restart
  resolves within 7 s (AI side, and home side via the 5 s auto-play), every match ends within
  `seconds` (+ golden goal), possession seconds add up to no more than the time in play.
- Determinism: the same seed gives the same result.
- Print a JSON summary with the per-tier table and the invariants.

## Engine API (sim.ts)
```ts
export class FcMatch {
  constructor(opts: FcMatchOptions)
  readonly opts: FcMatchOptions
  state: FcState
  step(input: FcInput): void // one FC_STEP; input is ignored for home when homeAiTier is set
  // QA hooks used by the UI tests
  endNow(): void // jump to full time (quick level score: straight to golden goal)
  forceGoal(side: Side): void // score for that side on the next step
  debugRestart(type: RestartType, side: Side): void // set up that restart now
}
export function blankFcInput(): FcInput
export function simulateFcMatch(opts: FcMatchOptions): FcMatch // AI vs AI to full time (homeAiTier default 2)
```
The engine must be DOM-free and deterministic (use `rng()` from data.ts with `opts.seed`).
No canvas, images or DOM: the renderer and UI are separate files owned by Copilot.

## Status (2026-09-27)

The engine in `sim.ts` was rewritten by Copilot after five agent rounds, keeping the contract above:
interception-aware passing (`laneMargin` compares the ball's arrival time with every defender's),
receivers and chasers moving to the predicted ball path, a keeper who reacts, misreads and dives with a
limited reach, physical tackles (ball first or foul), blocks, headers only in the jump window, and
restarts from real out-of-play. Tier differences come only from `FC_AI` and `RIVAL_OVR`.

With a real user the home AI teammates play like tier 3 and the keeper like tier 4 (`HUMAN_SUPPORT`),
so the user's own decisions decide matches. Latest headless run (200 matches per tier, bestFive(16)):

| Away tier | W-D-L | Win | Loss | Goals / match |
|---|---|---|---|---|
| T1 | 163-22-15 | 0.82 | 0.08 | 3.5 |
| T2 | 101-38-61 | 0.51 | 0.31 | 3.1 |
| T3 | 66-45-89 | 0.33 | 0.45 | 3.0 |
| T4 | 47-35-118 | 0.24 | 0.59 | 3.3 |

Mirror split 0.47, pass completion 55 to 68 percent, about 2 throw-ins, 0.7 corners, 1 foul, 5 headers
and 5 saves per match. A scripted human (FcInput only, defending goal side) wins 90, 57, 53 and 45
percent against T1 to T4; with no input at all the user's team loses every match.
