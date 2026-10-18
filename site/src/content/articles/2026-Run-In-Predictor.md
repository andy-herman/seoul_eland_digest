---
title: "The Run-In Predictor: 250,000 Simulations of Seoul E-Land's Last Four Matches"
description: "A new model of every remaining K League 2 fixture, tested on this season before we trusted it: form, home and away, head-to-head, weather, referees, coaches, injuries and yellow cards. Seoul E-Land are 23 percent for the top two and 55 percent to finish third. Here is what each factor is worth."
date: 2026-10-18
series: "Promotion Race"
order: 8
tags: [seoul-eland, feature, promotion-race, simulation, predictions]
---
This is a bigger model than the one behind [Chasing K1](/articles/2026-chasing-k1-promotion), built to answer one question properly: with four matches left, what are Seoul E-Land's real chances, and which of the things people argue about actually move them? It plays out all 40 remaining K League 2 fixtures, not just Seoul's, 250,000 times. It rates every club from every K League 2 result since 2024, and it takes in home and away, previous meetings, the weather at each ground, the five coaching changes of this season, each referee's booking record, every player's yellow-card count and the injuries we could confirm.

Before trusting any of it, we tested it. For every round from 10 to 29 of this season, the model was fitted only on what was known before that round and asked to predict it. Each factor stayed in only at the weight that test supported. Some factors earned their place, and some turned out to be worth almost nothing.

## The Headline Numbers

| Club | Points now | Average final total | Title | Top two | Finish third |
|---|---|---|---|---|---|
| Suwon Samsung | 59 | 68.0 | 83% | 97% | 3% |
| Suwon FC | 54 | 63.6 | 15% | 74% | 21% |
| Seoul E-Land | 54 | 61.1 | 2% | 23% | 55% |
| Daegu | 49 | 57.9 | under 1% | 5% | 21% |

Seoul's most likely finish is third, in 55 percent of the 250,000 runs, with second and fourth each about 21 percent. A playoff place was already certain. Third matters more than it looks: the semi-final is a single match at the higher seed's ground, and the higher seed goes through on a draw, so third means a home tie against the sixth-placed side that Seoul do not even need to win. [The Long Way Up](/articles/2026-the-playoff-route) explains the format.

## Seoul's Four Matches

| Round | Date | Match | Win | Draw | Loss | Expected goals (Seoul first) | Likeliest score | Clean sheet |
|---|---|---|---|---|---|---|---|---|
| 31 | Sat Oct 31, 14:00 | at Yongin | 47% | 30% | 23% | 1.74 to 1.16 | 1-1 (14%) | 31% |
| 32 | Sat Nov 7, 16:30 | v Jeonnam | 55% | 26% | 19% | 2.05 to 1.16 | 1-1 (12%) | 31% |
| 33 | Sun Nov 22, 16:30 | v Chungnam Asan | 48% | 31% | 21% | 1.64 to 1.03 | 1-1 (15%) | 35% |
| 34 | Sun Nov 29, time to be set | at Gyeongnam | 46% | 32% | 22% | 1.55 to 1.01 | 1-1 (15%) | 36% |

Seoul are favorites in all four and above 55 percent in none. The likeliest single score is 1-1 every time, which looks strange next to a 46 to 55 percent chance of winning: a draw is concentrated in a few scores, while a win is spread across 1-0, 2-0, 2-1, 3-1 and the rest. The next most likely scores are 2-1 to Seoul at Yongin and against Jeonnam (9 percent each) and 1-0 to Seoul in the last two (10 percent each).

Winning all four happens in about 6 percent of runs, and even then it is enough for the top two 84 percent of the time. This is what each final total is worth:

| Seoul's final points | How often | Top two when it happens |
|---|---|---|
| 66 (four wins) | 6% | 84% |
| 64 | 14% | 55% |
| 63 | 10% | 40% |
| 62 | 13% | 25% |
| 61 | 18% | 14% |
| 60 | 12% | 7% |
| 59 or fewer | 28% | 3% or less |

## Where It Turns

**Yongin first.** Win there (47 percent) and Seoul's chance of the top two rises to 35 percent. Draw (30 percent) and it falls to 16. Lose (23 percent) and it is about 10.

**Then Suwon FC.** Seoul cannot catch them without help. In the runs where Suwon FC finish on 60 points or fewer (13 percent), Seoul go up 65 percent of the time; on 61 to 63 (34 percent of runs), 33 percent; on 64 to 66 (37 percent), 9 percent; on 67 or more (16 percent), 4 percent. Suwon FC have five matches left to Seoul's four, and four of them are at home.

**And the tiebreaker.** Ties on points are broken by goals scored, then goal difference. Seoul finish level on points with Suwon FC in about one run in twelve, and finish above them in only 28 percent of those, because Suwon FC lead 53 to 52 on goals scored and have an extra match to add to it.

## Every Factor, and What It Was Worth

The last column shows Seoul's top-two chance with that one factor switched off, against 23.3 percent with everything in. Those runs are 100,000 each, so treat differences under half a point as noise.

| Factor | How it is measured | What the test said | Seoul's top two without it |
|---|---|---|---|
| Team strength and recent form | Ratings from every K League 2 match since 2024, with recent matches counting most | The biggest single gain over our old model. A long memory won: a result 240 days old counts half as much as the latest one | 23.4% (all matches counted equally) |
| Draws | Calibrated to the league's draw rate | The second-biggest gain | 23.2% |
| Home and away | A league-wide home edge plus a small, heavily shrunk effect for each club | Home sides score 9 percent more. The club-by-club part added almost nothing | 23.3% |
| Head-to-head | Venue-adjusted results of earlier meetings since 2024, shrunk toward zero | A small gain, within the noise | 25.5% |
| Weather | Rain, cold and wind at kickoff | No measurable gain | 23.5% |
| Coaches | Separate ratings under the new coach at the five clubs that changed | Within the noise | 22.7% |
| Referees | Each main referee's booking rate | No effect on goals; used for cards | (part of cards) |
| Cards and suspensions | Every booking simulated for players who can reach a ban | Not testable on past rounds | 22.7% |
| Injuries and absences | Confirmed injuries and bans | Not testable on past rounds | 23.8% |

**Form is overrated, at least in the short run.** We tried half-lives from 60 to 540 days, and counting every match the same. The 60-day version, which comes closest to judging a team on its last five matches, was the worst of them; anything from 180 to 365 days did about equally well. That matters for Seoul, who are 11 goals scored and 4 conceded over their last five. The old model leaned on that run and gave Seoul a 70 percent chance at Yongin. This one gives 47.

**K League 2 draws, and models forget it.** About 30 percent of matches have been drawn three seasons running (30.2 in 2024, 29.6 in 2025, 31.5 this year). A standard goals model predicts about 26. Correcting for it was the second-biggest improvement in the test, and it is why every Seoul match above carries a draw chance of 26 to 32 percent.

**Head-to-head moves Seoul's number the most, on the thinnest evidence.** For Seoul's own fixtures it roughly cancels out. Seoul have lost once in seven meetings with Gyeongnam since 2024, which helps them on the last day, but have not beaten Jeonnam at Mokdong in four attempts, which hurts. The cost to Seoul comes from Suwon FC, who won away at Chungbuk Cheongju (4-1), Chungnam Asan (3-1) and Ansan (3-1) earlier this season, and all three now visit them. The test liked a small weight for previous meetings better than none, but by less than its own margin of error. Without it, Seoul would be at 25.5 percent.

**Weather barely registers.** The model checked the conditions at kickoff for all 232 matches this season, using weather records for each ground. In the 12 played in real rain, about 11 percent more goals went in than the ratings expected, which fits Sunday's 6-2 in a flooded Mokdong, but it did not improve predictions. Cold and wind showed nothing. For the run-in, the forecast for Yongin on October 31 is still 13 days out, so the model leans on ten years of records for that ground and date: a 2 percent chance of rain at kickoff. The one condition that may matter is cold: there is a 33 percent chance it is 5°C or colder when Chungnam Asan kick off at Mokdong on November 22, though cold had no measurable effect on goals this season.

**Coaches.** Five clubs changed coach this season: Daegu (Choi Sung-yong from Round 10), Jeonnam (Lim Kwan-sik from Round 11), Chungnam Asan (André from Round 12), Seongnam (Kim Hae-un from Round 22) and Gimhae (caretaker Choi Myeong-seong from Round 28). Two of them, Jeonnam and Chungnam Asan, are among Seoul's last four opponents. The model rates them about 6 percent weaker in attack under their new coaches than their longer records suggest. The effect is small and uncertain, but it helps Seoul by about half a point.

**Referees decide bookings, not goals.** Crews are named only two hours before kickoff, so every simulated match draws a referee from the 19 who have taken charge of at least three league matches this season. They average 3.7 yellow cards a match. The strictest of them books about 30 percent more than that and the most lenient about 24 percent fewer. We found no referee effect on goals.

**Cards and suspensions.** The ban comes at a player's 5th, 8th and 10th caution, then every 2nd. Every booking is simulated, and a suspended player weakens his side for the next match. For Seoul:

- [Son Hyuk-chan](/players/son-hyuk-chan) misses Yongin after his fifth caution on Sunday.
- [Baek Ji-woong](/articles/2026-season-review-baek-ji-woong) is on four. In 35 percent of runs he misses one of the last three matches: 13 percent Jeonnam, 12 percent Chungnam Asan, 10 percent Gyeongnam.
- [Park Chang-hwan](/articles/2026-season-review-park-chang-hwan) is on eight and needs two more, which happens in 13 percent of runs.

Across the division, the card factor helps Seoul slightly, because more of the danger sits with the clubs around them:

- **Suwon FC:** they lose Lee Jae-won to a ban for Round 30. Ha Jung-woo, their eight-goal forward, Choi Ki-yoon and Han Chan-hee are each a booking away.
- **Suwon Samsung:** Lee Geon-hee is on seven.
- **Yongin:** four regular starters, captain Choi Young-jun among them, are on four yellows. A booking at Cheongju on October 25 rules that player out against Seoul, and it is close to even money that at least one of them is booked.
- **Jeonnam:** five players, captain Yoo Ji-ha among them, are on four. A booking at home to Seongnam on November 1 would keep them out of the trip to Mokdong.

**Injuries.** Club captain [Kim Oh-kyu](/articles/2026-season-review-kim-oh-kyu) hurt a knee ligament against Daegu on September 19. Sports Chosun reports he is out for the season; the club has not said so, but he has missed the last two matches and the model leaves him out of all four. Longer absences and returns elsewhere are left to the ratings, which have already absorbed them. That covers Daegu's Edgar, Suwon Samsung's Heiss, Suwon FC's Frizzo coming back from a head injury, and the players Daegu and Suwon Samsung have recovered from military service.

## How Good Is It?

The test asked each model to predict all 160 matches from Round 10 to Round 29, one round at a time, with no knowledge of the future. The score is log loss, which measures how much probability a model put on what actually happened; lower is better.

| Model | Score |
|---|---|
| Guessing from how often home wins, draws and away wins happened in 2024 and 2025 | 1.103 |
| Our old model (season goals blended with the last five matches) | 1.070 |
| This model | 1.034 |

The new model did better on 88 of the 160 matches. The improvement is about 1.8 times its own standard error, which makes it likely but not certain, because 160 matches is not a large sample. Its probabilities are about right. Across the 95 times it gave an outcome a 40 to 60 percent chance, the model averaged 48 percent, and those outcomes happened 48 percent of the time. It expected draws in 31 percent of matches; the real figure was 32. Its one lean is that it slightly underrated home wins, 36 percent predicted against 39 percent in reality.

The old model's hand-set adjustments for injuries and the like could not be replayed, so they are not part of this test. The test compares only the engines underneath.

## Why This Says 23 and Chasing K1 Says 26

The two models agree on the shape of the race and differ on Seoul by three points. The main difference is how they read recent form. Chasing K1's lighter model blends each club's last five matches into its ratings, and Seoul's last five read 11 scored and 4 conceded, so it rates their run-in matches higher: 70 percent to win at Yongin, against 47 here. The test above says the last five carry less information than they seem. The new model also expects more draws in every match, but that costs Seoul almost nothing overall, because it holds back Suwon FC in the same way. A gap of three points is a fair measure of how much the choice of method matters this late in a season.

## What It Cannot See

- **Motivation.** Yongin, Jeonnam and Ansan can no longer reach the playoffs, and Chungnam Asan and Gyeongnam are alive mainly on paper. There is no evidence in our data to size that, so the model ignores it.
- **Team selection.** It does not know whether a coach rotates or who starts.
- **The referee on the day.** The crew is published two hours before kickoff.
- **Weather beyond the forecast window**, and how much a forecast 13 days out is worth.
- **What happens inside a match after a red card**, and the second match of a ban for a straight red, which the model counts as one.
- **Anything about the playoffs** beyond who gets there.

## The Bottom Line

The new model trims Chasing K1's 26 percent to 23 and still sees the same race. Seoul are favorites in all four remaining matches, but not heavy favorites in any. The top two depends as much on Suwon FC dropping points as on Seoul winning: win at Yongin and Seoul's number rises to 35 percent, and if Suwon FC finish on 60 or fewer it is 65. The likeliest finish is third, worth a home semi-final in which a draw is enough. The 250,000 runs keep coming back to one thing, though: the 6-2 on Sunday only matters if the goals keep coming at Yongin.
