import { PERIMETER, STATIONS, THROW_INFO, applyMove, discardIfNoMoves, drawThrow, formulaDistribution, makeRng, newGame, playAutoGame, previewMove, routeForLanding, stationNext, type GameState, type Station, type TeamId, type ThrowId } from "./model";

interface Report { violations: string[]; distribution: Record<string, { actual: number; expected: number; deltaPct: number }>; ai: Record<string, number>; determinism: boolean; games: { maxTurns: number; unfinished: number } }
const violations: string[] = [];
function ok(cond: unknown, msg: string): void { if (!cond) violations.push(msg); }
function eq<T>(a: T, b: T, msg: string): void { if (JSON.stringify(a) !== JSON.stringify(b)) violations.push(`${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }
function stateWith(team: TeamId, pos: Station, route = routeForLanding(pos, "perimeter"), history: Station[] = ["A"]): GameState { const s = newGame(1); s.teams[team].off = 3; s.teams[team].groups = [{ id: 1, team, pos, count: 1, route, history: [...history] }]; s.nextId = 2; s.mustThrow = false; return s; }

function testRoutes(): void {
  eq(STATIONS.length, 29, "board has 29 stations");
  for (let i = 1; i < PERIMETER.length - 1; i++) if (PERIMETER[i] !== "B" && PERIMETER[i] !== "C") eq(stationNext(PERIMETER[i], "perimeter"), PERIMETER[i + 1], `perimeter ${PERIMETER[i]}`);
  eq(stationNext("b4", "perimeter"), "A", "b4 returns A");
  eq(stationNext("B", "perimeter"), "d1", "B shortcut starts"); eq(stationNext("C", "perimeter"), "e1", "C shortcut starts"); eq(previewMove(stateWith(0, "O", "bdiag", ["d2"]),0,"do",1)?.path, ["e3"], "O starts home diagonal");
  let s = stateWith(0, "B", "perimeter", ["r4"]); eq(previewMove(s,0,"geol",1)?.path, ["d1","d2","O"], "B diagonal path");
  s = stateWith(0, "C", "perimeter", ["t4"]); eq(previewMove(s,0,"gae",1)?.path, ["e1","e2"], "C diagonal path");
  s = stateWith(0, "O", "bdiag", ["d2"]); eq(previewMove(s,0,"gae",1)?.path, ["e3","e4"], "O path home");
  s = stateWith(0, "d2", "bdiag", ["B","d1"]); eq(previewMove(s,0,"geol",1)?.path, ["O","d3","d4"], "passing O stays on B diagonal");
  s = stateWith(0, "e2", "cdiag", ["C","e1"]); eq(previewMove(s,0,"geol",1)?.path, ["O","e3","e4"], "passing O stays on C diagonal");
  s = stateWith(0, "b4", "perimeter", ["D","b1","b2","b3"]); const m = previewMove(s,0,"do",1)!; eq(m.to, "A", "exact A is not home"); applyMove(s, m); ok(s.teams[0].home === 0 && s.teams[0].groups[0].pos === "A", "landed A remains on board"); s.queue=["do"]; applyMove(s, previewMove(s,0,"do",1)!); eq(s.teams[0].home, 1, "one past A is home");
}
function testBackDo(): void {
  for (const st of STATIONS) { const hist: Station[] = st === "r1" ? ["A"] : st === "A" ? ["b4"] : ["A", "r1"]; const s = stateWith(0, st, routeForLanding(st, "bdiag"), hist); const m = previewMove(s,0,"back",1); ok(!!m, `back-do legal from ${st}`); }
  let s = stateWith(0, "r1", "perimeter", ["A"]); eq(previewMove(s,0,"back",1)?.to, "A", "back-do r1 to A");
  s = stateWith(0, "A", "perimeter", ["b4"]); eq(previewMove(s,0,"back",1)?.to, "b4", "back-do A retraces history");
  s = stateWith(0, "O", "bdiag", ["B","d1","d2"]); eq(previewMove(s,0,"back",1)?.to, "d2", "back-do O retraces actual route");
  s = newGame(2); s.queue=["back"]; s.mustThrow=false; const lost = discardIfNoMoves(s); eq(lost, ["back"], "back-do with no pieces is lost");
}
function testStackCaptureExtraWin(): void {
  let s = newGame(3); s.teams[0].off=2; s.teams[0].groups=[{id:1,team:0,pos:"r1",count:1,route:"perimeter",history:["A"]},{id:2,team:0,pos:"r2",count:1,route:"perimeter",history:["A","r1"]}]; s.nextId=3; s.queue=["do"]; s.mustThrow=false; applyMove(s, previewMove(s,0,"do",1)!); ok(s.teams[0].groups.length===1 && s.teams[0].groups[0].count===2, "stacking merges pieces"); s.queue=["gae"]; applyMove(s, previewMove(s,0,"gae",s.teams[0].groups[0].id)!); ok(s.teams[0].groups[0].count===2 && s.teams[0].groups[0].pos==="r4", "stack moves together");
  s = newGame(4); s.teams[0].off=3; s.teams[1].off=2; s.teams[0].groups=[{id:1,team:0,pos:"r1",count:1,route:"perimeter",history:["A"]}]; s.teams[1].groups=[{id:2,team:1,pos:"r2",count:2,route:"perimeter",history:["A","r1"]}]; s.queue=["do"]; s.mustThrow=false; applyMove(s, previewMove(s,0,"do",1)!); ok(s.teams[1].off===4 && s.teams[1].groups.length===0 && s.mustThrow, "capture sends stack off and grants throw");
  s = newGame(5); s.queue=[]; const yut = THROW_INFO.yut; s.queue.push("yut"); s.mustThrow = yut.extra; ok(s.mustThrow, "yut gives extra throw"); s.queue=[]; const mo = THROW_INFO.mo; s.queue.push("mo"); s.mustThrow = mo.extra; ok(s.mustThrow, "mo gives extra throw");
  s = newGame(6); s.teams[0].home=3; s.teams[0].off=3; s.teams[0].groups=[{id:1,team:0,pos:"A",count:1,route:"perimeter",history:["b4"]}]; s.queue=["do"]; s.mustThrow=false; applyMove(s, previewMove(s,0,"do",1)!); eq(s.winner, 0, "win detected when four home");
}
function testDistribution(): Report["distribution"] { const rng = makeRng(99); const counts: Record<string, number> = { back:0, do:0, gae:0, geol:0, yut:0, mo:0 }; const n = 100000; for (let i=0;i<n;i++) counts[drawThrow(rng).id]++; const expected = formulaDistribution(); const out: Report["distribution"] = {}; for (const id of Object.keys(counts) as ThrowId[]) { const actual = counts[id]/n; const deltaPct = Math.abs(actual - expected[id]) * 100; out[id] = { actual, expected: expected[id], deltaPct }; ok(deltaPct <= 0.5, `distribution ${id} outside 0.5 pct points`); } return out; }
function rate(a: "pro"|"friendly"|"random", b: "pro"|"friendly"|"random", games: number, seedBase: number): number { let wins=0; for (let i=0;i<games;i++) { const r=playAutoGame(seedBase+i,a,b); if (r.winner===0) wins++; else if (r.winner===null) violations.push(`unfinished strength game ${a} vs ${b} ${i}`); } return wins/games; }
function testGames(): { maxTurns: number; unfinished: number; ai: Report["ai"]; determinism: boolean } { let maxTurns=0, unfinished=0; for (let i=0;i<2000;i++) { const r=playAutoGame(10000+i, i%2 ? "friendly" : "pro", i%3 ? "friendly" : "pro"); maxTurns=Math.max(maxTurns,r.turns); if (r.winner===null) unfinished++; } ok(unfinished===0, "all 2000 AI games should end"); const a=playAutoGame(777,"pro","friendly"); const b=playAutoGame(777,"pro","friendly"); const determinism = a.trace === b.trace; ok(determinism, "same seed produces same game"); const ai = { proVsRandom: rate("pro","random",400,30000), proVsFriendly: rate("pro","friendly",400,40000), friendlyVsRandom: rate("friendly","random",400,50000) }; ok(ai.proVsRandom >= .85, "Pro beats random at least 85%"); ok(ai.proVsFriendly >= .60, "Pro beats Friendly at least 60%"); ok(ai.friendlyVsRandom >= .65, "Friendly beats random at least 65%"); return { maxTurns, unfinished, ai, determinism }; }

testRoutes(); testBackDo(); testStackCaptureExtraWin(); const distribution = testDistribution(); const game = testGames();
const report: Report = { violations, distribution, ai: game.ai, determinism: game.determinism, games: { maxTurns: game.maxTurns, unfinished: game.unfinished } };
console.log(JSON.stringify(report, null, 2));
if (violations.length) process.exit(1);
