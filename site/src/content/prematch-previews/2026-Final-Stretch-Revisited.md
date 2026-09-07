---
type: "feature"
scope: "season-preview"
kind: "season"
status: "draft"
season: "2026"
league: "K League 2"
label: "Feature"
round_range: "Rounds 26-34"
date: "2026-09-07"
opponent: ""
tags: [seoul-eland, feature, promotion-race, predictions, simulation]
---

# Final Stretch Revisited: New Predictions Based on AI Simulations

On July 12, with Seoul E-Land fifth on 29 points, we published a round-by-round call for the entire second half of the season and promised to grade it in public. Eight rounds later the grade is four hits from eight, and the club is doing better than we said: 45 points, second place, 16 points banked from those eight matches against the 13 we called. That is a good problem to have, but it is still a problem, because the July sheet was written before Kim Do-gyun's side went nine unbeaten, before Suwon Samsung bought Luis, before Hwaseong lost their stadium and before Busan stopped winning altogether.

So we rebuilt the forecast from scratch. This time it is not one analyst's gut call per round. It is a simulation, run 20,000 times, fed with everything we could verify about the eight remaining Seoul matches and about every other club in the top eight. The July calls stay on the [Season Tracker](/tracker) exactly as published and keep being graded. The new calls below go on the same tracker as a second, separately graded line, frozen from today.

## The short version

- Seoul E-Land are projected to finish on 60 points, almost exactly what July said, but by a completely different route: fewer losses, more draws, and a much harder opening two weeks than the model expected in July.
- The chance of an automatic promotion place (top two) is 37 percent. The chance of finishing in the top six is effectively 100 percent. The most likely single finishing position is third, at 43 percent.
- Suwon Samsung are the title favorite at 60 percent. Suwon FC, not Seoul, are the favorite for the second automatic spot at 43 percent, because six of their nine remaining matches are at home, where they have not lost all season.
- The predicted record for the last eight is 4 wins, 3 draws and 1 loss: wins against Gimpo, Gimhae, Jeonnam and Chungnam Asan, draws with Suwon Samsung, Daegu and Gyeongnam, and a loss at Yongin. Seoul are the more likely winner in every single match, but eight favorites do not all win, and a sheet that said they would (69 points) would not be a prediction anyone believes.
- The playoff line is live. Busan hold sixth only 46 percent of the time. Chungnam Asan and Gimpo, both seven points back with a game in hand, take the last playoff place in roughly one simulation in five between them.

## How the July calls have held up

| Round | Fixture | July call | Result | Verdict |
|---|---|---|---|---|
| 18 | Suwon FC (A) | Draw | 2-2 | Hit |
| 19 | Cheonan (H) | Win | 4-3 | Hit |
| 20 | Busan (A) | Loss | 2-1 | Miss (better) |
| 21 | Hwaseong (A) | Loss | 0-0 | Miss (better) |
| 22 | Ansan (H) | Win | 3-1 | Hit |
| 23 | Paju (H) | Win | 1-1 | Miss (worse) |
| 24 | Seongnam (A) | Draw | 1-1 | Hit |
| 25 | Chungbuk Cheongju (A) | Loss | 2-0 | Miss (better) |

Three of the four misses went Seoul's way. The July model was too pessimistic about away trips to the top six and too optimistic about routine home games, which is exactly the pattern a form-blind points-per-game model produces. The new model tries to fix both.

## What the simulation looks at

The July preview used one number per club: points per game. The new model uses the following, all of it pulled from Korean match reports, club sites and league records over the past two days and written up in a research dossier per opponent.

1. **Season attack and defense strength.** Goals for and against per match, relative to the league average of 1.35 goals per team per match.
2. **Form.** Goals for and against in the last five league matches, weighted at 35 percent against the season rate. Seoul's last five read 7 scored, 3 conceded.
3. **Home and away.** The league-wide split (1.48 home goals to 1.21 away) is the baseline, and every club's own home and away record was checked against it. This matters enormously this year: Hwaseong have no home matches left, Gimpo have one home win in nine, and Gimhae have never won a home league match in their professional history.
4. **Availability.** Injuries and suspensions confirmed as of September 7, and accumulated yellow cards. Under the K League 2 rules, a fifth yellow brings a one-match ban and every third after that, and the count carries into the playoffs.
5. **Motivation.** Whether a match is likely to be a dead rubber for the opponent by the time it is played. There is no relegation from K League 2 this year because none of the K3 applicants secured a license, so the bottom clubs have nothing but pride to play for from October on.
6. **Head to head.** Small nudges where a pattern has held for several seasons, like Seoul's five-match unbeaten record against Gyeongnam or Jeonnam's four-visit unbeaten run at Mokdong.

Each match is then played 20,000 times with a Poisson scoring model and a low-score correction that makes 0-0 and 1-1 slightly more common than a naive model would, which is what actually happens in football. Every remaining fixture involving the top eight (58 matches) is simulated together so the final table is consistent, and clubs are ranked by the K League tiebreak: points, then goals scored, then goal difference.

Every adjustment is a multiplier of at most 15 percent on expected goals, and every one of them is written down with a reason. If you disagree with a reason, you can see how much it moved the number.

## The eight remaining matches

Two things are shown for each match and they are not the same. The probabilities are the model's odds for that match on its own. The "predicted" column is the call that goes on the tracker, and it is built the way the July sheet was: the model's expected record first (4.4 wins, 2.1 draws, 1.5 losses, which rounds to 4-3-1 and 15 points), then each result placed in the match where it is most likely. That is why the tracker sheet does not simply read eight wins even though Seoul are the likelier winner in all eight. Expected goals are Seoul first, opponent second.

| Round | Date | Fixture | Win | Draw | Loss | Predicted | Expected goals | Clean sheet | July call | Expected points |
|---|---|---|---|---|---|---|---|---|---|---|
| 26 | Sat Sep 12, 16:30 | Suwon Samsung (H) | 38% | 32% | 31% | Draw | 1.2 - 1.1 | 35% | Draw | 1.45 |
| 27 | Sat Sep 19, 19:00 | Daegu (H) | 47% | 30% | 23% | Draw | 1.4 - 0.9 | 41% | Win | 1.71 |
| 28 | Fri Oct 9, 16:30 | Gimpo (A) | 54% | 28% | 19% | Win | 1.6 - 0.8 | 44% | Win | 1.89 |
| 29 | Sun Oct 18, 14:00 | Gimhae (H) | 83% | 13% | 4% | Win | 2.6 - 0.5 | 63% | Win | 2.61 |
| 31 | Sat Oct 31, 14:00 | Yongin (A) | 43% | 28% | 28% | Loss | 1.4 - 1.1 | 32% | Draw | 1.59 |
| 32 | Sat Nov 7, 16:30 | Jeonnam (H) | 68% | 21% | 11% | Win | 2.1 - 0.8 | 47% | Win | 2.25 |
| 33 | Sun Nov 22, 16:30 | Chungnam Asan (H) | 59% | 26% | 15% | Win | 1.7 - 0.7 | 49% | Win | 2.03 |
| 34 | Sun Nov 29, TBD | Gyeongnam (A) | 43% | 32% | 25% | Draw | 1.2 - 0.9 | 41% | Win | 1.61 |

The predicted sheet is worth 15 points, the expected points add up to 15.1, and both land on 60. The three draws sit in the three matches the model treats as coin flips (win and loss within 10 points of each other), and the one loss goes to the away trip where the loss probability is highest among the rest. The July sheet, for comparison, had Seoul on 24 points from these same eight matches (six wins, one draw, one loss at Gimpo). The new sheet is nine points more cautious about the same fixtures, almost entirely because of what has happened to Suwon FC, Yongin and the two Suwon clubs since July.

On clean sheets, since every fan wants eight: the model expects about three and a half in these eight matches, and the chance of shutting out all eight opponents is roughly one in 800. The most likely shutouts are Gimhae (63 percent), Chungnam Asan and Jeonnam (both under 50). Both teams score in a little under half of the simulated matches, most often at Yongin.

### Round 26, Suwon Samsung at home: the coin flip

The biggest match in the club's history is also the one the model is least sure about. Seoul's edge is small and comes almost entirely from circumstances: Suwon lost Ko Seung-beom and Bruno Silva to injuries in the first half hour on Sunday, and Lee Jung-hyo said afterward that he expects both to miss this match. Their starting goalkeeper, Kim Jun-hong, left for the Asian Games on Sunday, so reserve Kim Min-jun, who kept a clean sheet against Chungnam Asan after three months out, is the likely starter. Against that, Suwon have won three straight, are eight unbeaten, and now have Luis, who has 12 league goals this season and scored nine of his ten Gimpo goals after the 75th minute. Seoul have won two of three against Suwon at Mokdong and Kim Do-gyun's record against them is four wins in six. The model lands at 38 percent Seoul, 32 draw, 31 Suwon. Seoul are the narrow favorite on the day, but this is the closest of the eight, and in a 4-3-1 sheet it is the first place a draw belongs. Predicted: draw, the same as July. If Seoul do win it, the whole projection moves: a home win here lifts the top-two chance from 37 to about 45 percent on its own.

One card note: Park Chang-hwan is on seven yellows, one away from his next ban, and Baek Ji-woong is on four, one away from his first. Neither is suspended for Saturday, but a booking for either on Saturday costs Seoul a starter against Daegu the following week.

### Round 27, Daegu at home

Daegu's numbers under Choi Sung-yong are very good (9 wins, 5 draws, 2 losses since he took over), but the last five have produced four goals, and the reason is specific: Edgar, their top scorer with eight, has a calf injury with no return date, and the attack has become a one-man Cesinha show, with the local press pointing out that Daegu have not won a match in which the 36-year-old did not register a goal or assist. Hwang Jae-won, their right wing-back, was sent off for kicking an opponent at Paju and will miss at least Round 26; whether the disciplinary committee extends the ban into this match is not yet known. Seoul won 3-1 at Daegu in March. Model: 47-30-23, Seoul the clear favorite. Predicted: draw, where July said win. This is the call most likely to look too cautious in hindsight, and it is a draw in the sheet only because Daegu are the second-best side Seoul face and the model has to put its three draws somewhere. A Seoul win here is the single most likely result.

### Round 28, Gimpo away: the Hangul Day trip

Gimpo are the strangest home side in the division. They opened the season with 13 straight away matches while their pitch was relaid, went 6-5-2 on the road, and have then won once in nine at the new Solteo surface (1 win, 5 draws, 3 losses, 14 conceded). They also sold Luis, who scored 10 of their 26 goals, to Suwon Samsung on August 20, and in the two matches since they have conceded six. Add a club-record embezzlement scandal, four straight winless meetings with Seoul, and a red card in each of the last two of them, and the model gives Seoul 54 percent away from home, its second-highest away probability of the run-in. The one caution is rest: Gimpo will arrive after 20 days without a league match because of the September international window, and Friday, October 9 is a public holiday, so the crowd will be bigger than their usual 1,000 to 1,500. Call Win, same as July.

### Round 29, Gimhae at home

The nearest thing to a banker. Gimhae are 17th on 13 points, have never won a home league match, and have conceded 45 in 23. They have improved since a summer rebuild (1.5 conceded per game since Round 13 against 2.45 before), and Woo Je-uk scored three in three after joining from Hwaseong before getting injured, but by October 18 they will be safe from a relegation playoff that no longer exists and playing for nothing. Seoul won 3-1 at Gimhae in July. Model: 83-13-4. Call Win, same as July.

### Round 31, Yongin away

Yongin are the match the model changed its mind on the most. In July we called a draw against a side that draws 11 of 23, and their home record (2 wins, 6 draws, 4 losses) supports that. But Yongin have quietly become a different team since the summer window: 2 wins, 2 draws and 1 loss since August 1, 9 scored and 5 conceded, with Vitinho, a Brazilian winger signed from the Maltese league, scoring in consecutive matches. Two things push the other way. Goalkeeper Hwang Sung-min was hurt in a collision on September 5 and his status is unreported, and by October 31 Yongin will be a mid-table club with an eighth-place target and little else. Seoul drew 2-2 with them in May. Model: 43-28-28. Predicted: loss, where July said draw. Yongin is the one match in the sheet where the predicted result is not even the model's second choice, and that needs explaining. The sheet has to carry one loss, because 1.5 expected losses over eight matches do not become zero. Of the four matches that are not clear Seoul wins, this is the away trip with the highest loss probability after Suwon Samsung, and Suwon at home is the better place for a draw. The honest one-line version: Seoul should win at Yongin more often than not, but if they are going to drop all three points anywhere in this run, the model thinks it is here or at Mokdong against Suwon.

### Round 32, Jeonnam at home

Jeonnam have the worst away record in the division: one win in 14, 28 goals conceded, two points per game given away. They have also improved sharply since Lim Gwan-sik switched to a back four in late August, with two clean sheets in their last three. Valdivia, who has started all 23 league matches and leads them in goals and assists, is the one player who can hurt Seoul, and two of their regulars, Yun Min-ho and Hong Seok-hyun, are one yellow from a ban with six matches to go before this one. History says be careful: Jeonnam have not lost at Mokdong in four visits, and Seoul needed an 87th-minute scramble from Alan Carius to beat them in Gwangyang in May. Model: 68-21-11. Call Win, same as July.

### Round 33, Chungnam Asan at home

Asan beat Seoul 3-0 in May, the worst afternoon of the season, but that was under an interim coach and with Seoul down to ten men for the last twenty minutes. Under Andre they are a solid home side (6 wins, 4 draws, 2 losses) and a weak away one: two away wins all season, ten goals in eleven away matches, four straight away defeats coming into this. Their soft run of fixtures in October is their last chance to close the seven-point gap to sixth; if they have not done it by then, this is a dead rubber for them and a promotion match for Seoul. The wage crisis that surfaced in October 2025 resurfaced in the city council this week. Model: 59-26-15. Call Win, same as July.

### Round 34, Gyeongnam away: the final day

Gyeongnam are two teams. At Changwon they have taken 20 of their 30 points and won four of their last six; away from it they draw almost everything. Kim Hyun-o, an 18-year-old U-20 World Cup alumnus, has six goals in his last nine. Seoul are unbeaten in the last five meetings (4 wins, 1 draw) and Gyeongnam have scored twice in those five. By November 29 Gyeongnam should be safe and out of the playoff race, while Seoul may have promotion or a playoff seed on the line. Kickoff time is not yet set. Model: 43-32-25, the third of the coin flips, and the draw probability is the highest of the eight. Predicted: draw, where July said win.

## Who is going up, and who is going to the playoffs

The whole point of simulating the other clubs is that Seoul's fate depends on them. Here is where 20,000 seasons put each of the top eight. Positions are within the top eight only; nobody below eighth is modeled, which is safe because ninth-placed Gyeongnam are eight points behind Busan with a worse run-in.

| Club | Points now | Projected final | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th or 8th | Automatic (top 2) | Playoffs (3rd to 6th) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Suwon Samsung | 50 (24 pl) | 65 | 60% | 26% | 12% | 2% | 0% | 0% | 0% | 86% | 14% |
| Suwon FC | 44 (23 pl) | 62 | 27% | 43% | 23% | 6% | 1% | 0% | 0% | 70% | 30% |
| Seoul E-Land | 45 (24 pl) | 60 | 11% | 26% | 43% | 18% | 3% | 0% | 0% | 37% | 63% |
| Daegu | 43 (24 pl) | 56 | 1% | 6% | 20% | 54% | 15% | 4% | 0% | 7% | 93% |
| Hwaseong | 40 (24 pl) | 52 | 0% | 0% | 2% | 13% | 47% | 32% | 7% | 0% | 93% |
| Busan IPark | 38 (24 pl) | 50 | 0% | 0% | 1% | 7% | 30% | 46% | 16% | 0% | 84% |
| Chungnam Asan | 31 (23 pl) | 44 | 0% | 0% | 0% | 0% | 3% | 11% | 86% | 0% | 14% |
| Gimpo | 31 (23 pl) | 43 | 0% | 0% | 0% | 0% | 2% | 7% | 91% | 0% | 9% |

Some of what is in that table:

**Suwon Samsung are not home yet.** A 60 percent title chance is strong, but a 14 percent chance of falling into the playoffs is not nothing for a club that lost the 2025 final on a 3-0 aggregate. Their remaining fixtures include Daegu away, Hwaseong at home, and a final day at Jeonnam, who concede almost nothing at Gwangyang. Saturday at Mokdong is their hardest remaining match.

**Suwon FC are the real rival for second.** They have a game in hand, six of nine at home where they are 6-4-0, an 11-match unbeaten run, and no top-six opponent left except Hwaseong. Their weaknesses are real too: a 35 percent draw rate, Frizzo (13 goals, the league's top scorer) lost consciousness in a collision on Saturday and is doubtful for Sunday, Derlan is suspended after a straight red, and five regulars, including their captain and their build-up midfielder Gu Bon-cheol, are one yellow from a ban. The model has them at 62 points to Seoul's 60, and the head-to-head is done (Seoul 3-0 in April, 2-2 in July), so this race will be decided by who drops points against the bottom half.

**Daegu are a playoff team unless Edgar returns quickly.** Fourth in 54 percent of simulations. Their remaining fixtures include both Suwon clubs, Seoul away and Hwaseong away.

**Hwaseong's nine-match road trip is the story nobody is telling.** Their stadium closed for renovation after the Cheongju match on August 29, they have no training base during the works, and they take 1.38 points per away game against 1.81 at home. Cha Du-ri's contract is up in December and he refuses to discuss it. The model still has them in the playoffs 93 percent of the time, because they are eight points clear of seventh and defend well anywhere, but a fifth-place finish (47 percent) means a semifinal away from home, if they had a home.

**Busan are the club most likely to be caught.** Eight league matches without a win, four goals in those eight, supporters hanging the main banner upside down, and a manager who said on Saturday that he feels "unlimited responsibility". They still finish sixth 46 percent of the time and in the playoffs 84 percent, because all eight of their remaining opponents are currently seventh or lower and they beat seven of them the first time round. But 16 percent is a real chance of missing out, and every one of Asan's and Gimpo's simulated playoff runs goes through Busan's collapse.

**Chungnam Asan and Gimpo** need to win roughly six of nine to reach the mid-forties and hope. Asan's October is soft (Gimhae, Gyeongnam, Gimpo at home) which is why they get 14 percent to Gimpo's 9.

## What Seoul need

The distribution of Seoul's final total is wide: everything from 53 to 67 shows up regularly, with the middle third of outcomes between 59 and 62. Some thresholds:

- Sixty points or more: 56 percent of simulations.
- Sixty-two or more: 34 percent. This is roughly where second place starts to become more likely than not, because Suwon FC's projected 62 is the number to beat.
- Sixty-five or more: 9 percent, and it takes something like seven wins from eight.

The practical translation: automatic promotion is a six-wins-from-eight proposition, and the two matches that decide whether that is realistic are the next two, at home, against the two best sides Seoul will face. We re-ran the simulation conditioned on those two results. Take four points or more from Suwon Samsung and Daegu and the top-two probability climbs to 53 percent (67 percent if both are won). Take one point or none and it falls to 13 percent.

## What could break this

- **Cards.** Park Chang-hwan (7 yellows) and Baek Ji-woong (4) are the two Seoul players closest to a ban. Kim Oh-kyu, Park Jae-yong, Gabriel and Son Hyuk-chan are on three. The model does not predict bookings, so a suspension for the Daegu match would push that draw call toward a loss.
- **Concussions and unknown injuries.** Frizzo's status at Suwon FC and the Ko Seung-beom and Bruno Silva injuries at Suwon Samsung were all reported without a diagnosis or timeline. We adjusted only for the next match in each case.
- **Motivation cuts both ways.** Dead-rubber sides sometimes play free. Asan beat Seoul 2-1 at Mokdong in November 2024 with nothing to play for.
- **Yellow-card data.** Seoul's and Suwon FC's card counts come from a third-party statistics site, not from the K League's own record, which did not render. The direction is right; the exact counts could be off by one.
- **Small samples.** Hwaseong have played eight away matches, Gimpo nine at home. We blended these splits with season rates rather than trusting them outright, but the model will still be wrong in ways the July one was not, and it will be graded on the same page.

## On the record

The July calls stand and continue to be graded. The eight predicted results above are frozen as of September 7 and go on the Season Tracker as a second line, with the model's probability for that result shown next to each one. When the season ends we will publish how many each set got right, and how far each projected total missed by. If the honest answer in December is that a points-per-game model from July did as well as 20,000 simulations from September, we will say so.

The simulation code, the adjustments and the reasons behind each of them are in the project repository. Behind the numbers sit eleven research dossiers, one per opponent and contender, built over the weekend from Korean match reports, club sites, league records and the K League competition rules. That is the increase in research we promised. Whether it produces an increase in accuracy is now up to the players.
