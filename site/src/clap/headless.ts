// Clap for Seoul headless suite: the detector against synthetic rooms (quiet, loud, shouting, music,
// clap storms, groups clapping together, singing, talking, echoing rooms, and the song leaking back
// from the speakers with and without the song reference), the match balance for perfect, good,
// sloppy, silent and spamming rooms against every rival strength, and end-to-end runs where a whole
// match of synthetic room audio goes through the detector into the judge, with and without bleed.
// Build: npx esbuild src/clap/headless.ts --bundle --platform=node --format=esm --outfile=/tmp/clap-headless.mjs && node /tmp/clap-headless.mjs
import { CHANTS, FULLTIME_T, KICKOFF_T, buildCues } from "./chants";
import { ClapDetector, buildSongRef, type DetEvent, type SongRef } from "./detector";
import { ClapMatch, starsFor, type Tier } from "./match";
import { FS, addClap, addCrowd, addGroupClap, addMusic, addReverb, addShout, addSinging, addTalk, makeSong, rng, silence } from "./synth";

const violations: string[] = [];
const fail = (m: string) => violations.push(m);
const report: Record<string, unknown> = {};
const t0 = Date.now();

// ------------------------------------------------------------------ detector
function detect(buf: Float32Array, sens = 0.6, ref?: SongRef): DetEvent[] {
  const d = new ClapDetector({ sampleRate: FS, sensitivity: sens });
  if (ref) d.setRef(ref, 0);
  const out: DetEvent[] = [];
  for (let i = 0; i < buf.length; i += 128) out.push(...d.process(buf.subarray(i, Math.min(buf.length, i + 128)), i / FS));
  return out;
}
function matchClaps(truth: number[], ev: DetEvent[], tol = 0.04) {
  const claps = ev.filter((e) => e.type === "clap").map((e) => e.t);
  const used = new Set<number>();
  const errs: number[] = [];
  for (const t of truth) {
    let best = -1;
    let bd = tol;
    claps.forEach((c, i) => {
      if (!used.has(i) && Math.abs(c - t) < bd) {
        bd = Math.abs(c - t);
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      errs.push(Math.abs(claps[best] - t) * 1000);
    }
  }
  errs.sort((a, b) => a - b);
  return { truth: truth.length, hit: used.size, falsePos: claps.length - used.size, p95ms: errs.length ? errs[Math.floor(errs.length * 0.95)] : 0, shouts: ev.filter((e) => e.type === "shout" && e.on).length };
}
{
  const r = rng(11);
  const det: Record<string, unknown> = {};
  const train = (sec: number, crowd: number, music: number, lo: number, hi: number) => {
    const b = silence(sec);
    if (crowd) addCrowd(b, crowd, r);
    if (music) addMusic(b, music, 140, r);
    const truth: number[] = [];
    let t = 0.6;
    while (t < sec - 1) {
      truth.push(t);
      addClap(b, t, lo + r() * (hi - lo), r);
      t += 0.2 + r() * 0.6;
    }
    return matchClaps(truth, detect(b));
  };
  const quiet = train(30, 0.003, 0, 0.12, 0.8);
  const loud = train(30, 0.03, 0.02, 0.2, 0.8);
  det.quiet = quiet;
  det.loud = loud;
  if (quiet.hit / quiet.truth < 0.97 || quiet.falsePos > 1 || quiet.p95ms > 8) fail(`detector quiet room: ${JSON.stringify(quiet)}`);
  if (loud.hit / loud.truth < 0.92 || loud.falsePos > 2 || loud.p95ms > 10) fail(`detector loud room: ${JSON.stringify(loud)}`);
  {
    const b = silence(20);
    addCrowd(b, 0.01, r);
    for (let i = 0; i < 10; i++) addShout(b, 1 + i * 1.8, 0.3 + r() * 0.3, 0.25 + r() * 0.15, r);
    const m = matchClaps([], detect(b));
    det.shouts = m;
    if (m.falsePos > 0) fail(`detector: ${m.falsePos} claps heard in pure shouting`);
    if (m.shouts < 9) fail(`detector: only ${m.shouts} of 10 shouts heard`);
  }
  {
    const b = silence(20);
    addMusic(b, 0.05, 140, r);
    const m = matchClaps([], detect(b));
    det.music = m;
    if (m.falsePos > 0 || m.shouts > 0) fail(`detector: music bleed gave ${m.falsePos} claps and ${m.shouts} shouts`);
  }
  {
    // fast clapping at 7 a second is still heard clap by clap
    const b = silence(4);
    addCrowd(b, 0.005, r);
    const truth = Array.from({ length: 12 }, (_, i) => 0.6 + i * 0.14);
    for (const t of truth) addClap(b, t, 0.5, r);
    const m = matchClaps(truth, detect(b));
    det.fast = m;
    if (m.hit < 11 || m.falsePos > 0) fail(`detector: clapping at 7 a second heard ${m.hit} of 12 (${m.falsePos} false)`);
  }
  {
    // a clap storm (a room going wild, 10 claps a second and more) blurs into one roar that single
    // claps cannot be told apart in, so storms are scored by how much of the time the high band is lit
    const b = silence(5);
    addCrowd(b, 0.005, r);
    for (let t = 1; t < 3; t += 0.035 + r() * 0.05) addClap(b, t, 0.2 + r() * 0.4, r);
    const ev = detect(b);
    const lv = ev.filter((e): e is Extract<DetEvent, { type: "level" }> => e.type === "level");
    const during = lv.filter((e) => e.t >= 1.05 && e.t < 2.95);
    const lit = during.filter((e) => e.hot).length / Math.max(1, during.length);
    const before = lv.filter((e) => e.t > 0.3 && e.t < 0.95).filter((e) => e.hot).length;
    det.storm = { litFraction: +lit.toFixed(2), litBefore: before };
    if (lit < 0.8) fail(`detector: a clap storm lit only ${(lit * 100).toFixed(0)}% of the time`);
    if (before > 0) fail(`detector: the quiet room before the storm was lit ${before} times`);
  }
  report.detector = det;
}

// ------------------------------------------------------------------ the hard rooms
{
  const r = rng(21);
  const hard: Record<string, unknown> = {};
  const groupRoom = (sec: number, rt60 = 0) => {
    const b = silence(sec);
    addCrowd(b, rt60 ? 0.006 : 0.008, r);
    const truth: number[] = [];
    for (let t = 0.6; t < sec - 1; t += 0.45 + r() * 0.5) {
      addGroupClap(b, t, 3 + Math.floor(r() * 7), 0.012 + r() * 0.013, 0.2 + r() * 0.5, r);
      truth.push(t);
    }
    if (rt60) addReverb(b, rt60, 0.7);
    return matchClaps(truth, detect(b), 0.045);
  };
  // a few people clapping a beat together: one clap each, spread over 12 to 25 ms
  const groups = groupRoom(30);
  hard.groups = groups;
  if (groups.hit / groups.truth < 0.95 || groups.falsePos > 1) fail(`groups clapping together: ${JSON.stringify(groups)}`);
  {
    const b = silence(24);
    addCrowd(b, 0.006, r);
    addSinging(b, 0.5, 23, 0.25, r);
    const sing = matchClaps([], detect(b));
    const truth: number[] = [];
    for (let t = 1; t < 23; t += 0.5 + r() * 0.4) {
      addClap(b, t, 0.25 + r() * 0.5, r);
      truth.push(t);
    }
    const both = matchClaps(truth, detect(b));
    hard.singing = sing;
    hard.clapsOverSinging = both;
    if (sing.falsePos > 1) fail(`singing along: ${sing.falsePos} claps invented`);
    if (sing.shouts < 5) fail(`singing along: only ${sing.shouts} shouts heard`);
    if (both.hit / both.truth < 0.88 || both.falsePos > 2) fail(`claps over singing: ${JSON.stringify(both)}`);
  }
  for (const [name, amp] of [["talking", 0.2], ["loudTalking", 0.35]] as const) {
    const b = silence(24);
    addCrowd(b, 0.006, r);
    addTalk(b, 0.5, 23, amp, r);
    const m = matchClaps([], detect(b));
    hard[name] = m;
    // consonants can pass for claps; a few in 23 seconds of chatter is the price of hearing quiet claps
    if (m.falsePos > 7) fail(`${name}: ${m.falsePos} claps invented in 23 s`);
  }
  {
    const b = silence(24);
    addCrowd(b, 0.006, r);
    const truth: number[] = [];
    for (let t = 1; t < 23; t += 0.5 + r() * 0.4) {
      addClap(b, t, 0.15 + r() * 0.55, r);
      truth.push(t);
    }
    addReverb(b, 0.6, 0.5);
    const m = matchClaps(truth, detect(b));
    hard.reverb = m;
    if (m.hit / m.truth < 0.95 || m.falsePos > 1) fail(`claps in an echoing room: ${JSON.stringify(m)}`);
  }
  const gRev = groupRoom(30, 0.8);
  hard.groupsReverb = gRev;
  if (gRev.hit / gRev.truth < 0.93 || gRev.falsePos > 2) fail(`groups in an echoing room: ${JSON.stringify(gRev)}`);
  {
    const b = silence(24);
    addCrowd(b, 0.006, r);
    addTalk(b, 0.5, 23, 0.3, r);
    const truth: number[] = [];
    for (let t = 1; t < 23; t += 0.8 + r() * 0.5) {
      addClap(b, t, 0.2 + r() * 0.5, r);
      truth.push(t);
    }
    addReverb(b, 0.6, 0.5);
    const m = matchClaps(truth, detect(b));
    hard.talkClapsReverb = m;
    if (m.hit / m.truth < 0.75 || m.falsePos > 7) fail(`claps over talking in an echoing room: ${JSON.stringify(m)}`);
  }
  report.hardRooms = hard;
}

// ------------------------------------------------------------------ the song leaking from the speakers
// A stand-in song on the club song's beat grid (kick, snare with a clap layer, hats, bass, a voice)
// plays into the microphone at -12, -20 and -26 dB, the reference 20 ms early or late.
const SONG_SEC = 70;
const song = makeSong(SONG_SEC, 140, 0.1204, rng(8));
const songRef = buildSongRef(song, FS);
{
  const cues = buildCues();
  const bleedRep: Record<string, unknown> = {};
  for (const db of [-12, -20, -26]) {
    for (const shift of [0, 0.02, -0.02]) {
      const g = Math.pow(10, db / 20);
      const b = silence(SONG_SEC);
      const lag = Math.round(shift * FS);
      for (let i = 0; i < b.length; i++) {
        const j = i - lag;
        if (j >= 0 && j < song.length) b[i] = song[j] * g;
      }
      addCrowd(b, 0.004, rng(3));
      const key = `${db}dB${shift >= 0 ? "+" : ""}${Math.round(shift * 1000)}ms`;
      const after = (ev: DetEvent[]) => ({
        claps: ev.filter((e) => e.type === "clap" && e.t > 2).length,
        shouts: ev.filter((e) => e.type === "shout" && e.on && e.t > 2).length,
      });
      if (shift === 0) {
        // without the reference the song is full of claps: proof the test is a real one
        const plain = after(detect(b));
        bleedRep[`${db}dB noRef`] = plain;
        if (db === -12 && plain.claps < 40) fail(`bleed test is too easy: only ${plain.claps} claps heard in the song with no reference`);
      }
      const withRef = after(detect(b, 0.6, songRef));
      if (withRef.claps > 0 || withRef.shouts > 0) fail(`song bleed ${key} with the reference: ${withRef.claps} claps, ${withRef.shouts} shouts`);
      // the room joins in over the bleed: claps on the chant beats (right on the song's snare) and shouts
      const room = new Float32Array(b);
      const truth: number[] = [];
      const rr = rng(40 + db);
      let shouts = 0;
      for (const cue of cues) {
        if (cue.t1 > SONG_SEC - 1) break;
        for (const ct of cue.claps) {
          const tt = ct + gauss(rr) * 0.015;
          addClap(room, tt, 0.25 + rr() * 0.5, rr);
          truth.push(tt);
        }
        for (const s of cue.shouts) {
          addShout(room, s.t0, (s.t1 - s.t0) * 0.85, 0.3, rr);
          shouts++;
        }
      }
      const m = matchClaps(truth, detect(room, 0.6, songRef));
      bleedRep[key] = { bleed: withRef, room: m, expectedShouts: shouts };
      if (m.hit / m.truth < 0.88 || m.falsePos > 2) fail(`room claps over song bleed ${key}: ${JSON.stringify(m)}`);
      if (m.shouts < shouts - (db === -12 ? 2 : 1)) fail(`room shouts over song bleed ${key}: ${m.shouts} of ${shouts}`);
    }
  }
  report.songBleed = bleedRep;
}

// ------------------------------------------------------------------ balance
interface Style {
  jitter: number; // s, standard deviation of clap timing
  missRate: number;
  extraRate: number; // stray claps per second during chant bars
  spam: number; // claps per second all the time (0 = none)
  shouts: boolean;
  rollRate: number; // claps per second in a clap storm
  silent?: boolean;
}
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
}
function playMatch(tier: Tier, style: Style, seed: number, level: "casual" | "ultras" = "ultras"): ClapMatch {
  const r = rng(seed);
  const m = new ClapMatch({ tier, level, seed });
  const inputs: { t: number; kind: "clap" | "on" | "off" }[] = [];
  if (!style.silent) {
    for (const cue of m.cues) {
      const def = CHANTS[cue.chant];
      if (def.hush) continue;
      if (def.roll) {
        const n = Math.round(style.rollRate * (cue.t1 - cue.t0));
        for (let k = 0; k < n; k++) inputs.push({ t: cue.t0 + ((k + 0.5) / n) * (cue.t1 - cue.t0), kind: "clap" });
        continue;
      }
      for (const c of cue.claps) if (r() >= style.missRate) inputs.push({ t: c + gauss(r) * style.jitter, kind: "clap" });
      if (style.shouts)
        for (const s of cue.shouts) {
          if (r() < style.missRate) continue;
          const st = s.t0 + gauss(r) * style.jitter;
          inputs.push({ t: st, kind: "on" }, { t: st + (s.t1 - s.t0) * 0.9, kind: "off" });
        }
      const extras = Math.round(style.extraRate * (cue.t1 - cue.t0));
      for (let k = 0; k < extras; k++) inputs.push({ t: cue.t0 + r() * (cue.t1 - cue.t0), kind: "clap" });
    }
    if (style.spam) for (let t = KICKOFF_T; t < FULLTIME_T; t += 1 / style.spam) inputs.push({ t: t + r() * 0.01, kind: "clap" });
  }
  inputs.sort((a, b) => a.t - b.t);
  let k = 0;
  for (let t = KICKOFF_T - 1; t < FULLTIME_T + 3; t += 1 / 60) {
    while (k < inputs.length && inputs[k].t <= t) {
      const e = inputs[k++];
      if (e.kind === "clap") m.clap(e.t);
      else m.shout(e.t, e.kind === "on");
    }
    m.update(t);
    m.drain();
  }
  return m;
}
const STYLES: Record<string, Style> = {
  perfect: { jitter: 0.008, missRate: 0, extraRate: 0, spam: 0, shouts: true, rollRate: 9 },
  good: { jitter: 0.035, missRate: 0.05, extraRate: 0.2, spam: 0, shouts: true, rollRate: 7 },
  sloppy: { jitter: 0.08, missRate: 0.2, extraRate: 0.8, spam: 0, shouts: true, rollRate: 4 },
  tapsOnly: { jitter: 0.03, missRate: 0.05, extraRate: 0.2, spam: 0, shouts: false, rollRate: 7 },
  silent: { jitter: 0, missRate: 1, extraRate: 0, spam: 0, shouts: false, rollRate: 0, silent: true },
  spam: { jitter: 0, missRate: 1, extraRate: 0, spam: 8, shouts: false, rollRate: 0 },
  random: { jitter: 0, missRate: 1, extraRate: 3, spam: 0, shouts: false, rollRate: 3 },
};
const balance: Record<string, Record<string, string>> = {};
for (const [name, style] of Object.entries(STYLES)) {
  balance[name] = {};
  for (const tier of [1, 2, 3, 4] as Tier[]) {
    let w = 0;
    let d = 0;
    let l = 0;
    let gf = 0;
    let ga = 0;
    let acc = 0;
    const N = 20;
    for (let s = 0; s < N; s++) {
      const m = playMatch(tier, style, 1000 + s * 7 + tier);
      gf += m.score[0];
      ga += m.score[1];
      acc += m.accuracy;
      if (m.score[0] > m.score[1]) w++;
      else if (m.score[0] === m.score[1]) d++;
      else l++;
    }
    balance[name][`t${tier}`] = `W${w} D${d} L${l} gf${(gf / N).toFixed(1)} ga${(ga / N).toFixed(1)} acc${((acc / N) * 100).toFixed(0)}`;
    const winRate = w / N;
    if (name === "perfect" && (winRate < 1 || gf / N - ga / N < 2)) fail(`perfect room vs tier ${tier}: ${balance[name][`t${tier}`]}`);
    if (name === "good" && tier <= 3 && winRate < 0.8) fail(`good room vs tier ${tier} wins only ${w}/${N}`);
    if (name === "good" && tier === 4 && winRate < 0.5) fail(`good room vs tier 4 wins only ${w}/${N}`);
    if (name === "silent" && (w > 0 || gf > 0)) fail(`silent room vs tier ${tier}: ${balance[name][`t${tier}`]}`);
    if ((name === "spam" || name === "random") && tier >= 2 && winRate > 0.1) fail(`${name} room vs tier ${tier} wins ${w}/${N}`);
    if (name === "sloppy" && tier === 4 && winRate > 0.5) fail(`sloppy room beats tier 4 too often: ${w}/${N}`);
  }
}
report.balance = balance;

// every chant in the schedule sits inside the song and between kick-off and full time
{
  const cues = buildCues();
  report.cues = { count: cues.length, first: cues[0].t0.toFixed(2), last: cues[cues.length - 1].t1.toFixed(2), kinds: cues.map((c) => c.chant).join(",") };
  if (cues.length < 20) fail(`only ${cues.length} chants in a match`);
  if (cues[0].t0 < KICKOFF_T || cues[cues.length - 1].t1 > FULLTIME_T) fail("a chant falls outside the match");
}

// ------------------------------------------------------------------ end to end: room audio through the detector
// A whole match: a room clapping and shouting the chants (a little late or early, some quiet), a
// murmuring crowd and some music; the second time the song also leaks back from the speakers.
function endToEnd(label: string, bleedDb: number | null): void {
  const r = rng(2024);
  const m = new ClapMatch({ tier: 3, level: "ultras" });
  const len = FULLTIME_T + 2;
  const b = silence(len);
  let ref: SongRef | undefined;
  if (bleedDb !== null) {
    const s = makeSong(len, 140, 0.1204, rng(99));
    const g = Math.pow(10, bleedDb / 20);
    for (let i = 0; i < b.length; i++) b[i] = s[i] * g;
    ref = buildSongRef(s, FS);
  } else addMusic(b, 0.012, 140, r);
  addCrowd(b, 0.012, r);
  for (const cue of m.cues) {
    const def = CHANTS[cue.chant];
    if (def.hush) continue;
    if (def.roll) {
      for (let k = 0; k < 13; k++) addClap(b, cue.t0 + (k + 0.5) * ((cue.t1 - cue.t0) / 13), 0.3 + r() * 0.4, r);
      continue;
    }
    for (const c of cue.claps) addClap(b, c + gauss(r) * 0.02, 0.25 + r() * 0.5, r);
    for (const s of cue.shouts) addShout(b, s.t0 + gauss(r) * 0.02, (s.t1 - s.t0) * 0.85, 0.3, r);
  }
  const d = new ClapDetector({ sampleRate: FS, sensitivity: 0.6 });
  if (ref) d.setRef(ref, 0);
  let shoutsHeard = 0;
  let clapsHeard = 0;
  for (let i = 0; i < b.length; i += 128) {
    const tb = i / FS;
    for (const e of d.process(b.subarray(i, Math.min(b.length, i + 128)), tb)) {
      if (e.type === "clap") {
        m.clap(e.t);
        clapsHeard++;
      } else if (e.type === "shout") {
        m.shout(e.t, e.on);
        if (e.on) shoutsHeard++;
      } else if (e.type === "level") m.activity(e.t, e.hot);
    }
    if (i % (128 * 8) === 0) {
      m.update(tb);
      m.drain();
    }
  }
  m.update(len);
  const expectedClaps = m.cues.reduce((a, c) => a + (CHANTS[c.chant].roll ? 13 : c.claps.length), 0);
  const expectedShouts = m.cues.reduce((a, c) => a + c.shouts.length, 0);
  report[label] = { score: m.score, accuracy: +(m.accuracy * 100).toFixed(1), clapsHeard, expectedClaps, shoutsHeard, expectedShouts, stars: starsFor(m), bleedGain: ref ? d.bleed : undefined };
  if (m.score[0] <= m.score[1]) fail(`${label}: a room clapping in time drew or lost ${m.score.join("-")}`);
  if (m.accuracy < 0.8) fail(`${label}: accuracy only ${(m.accuracy * 100).toFixed(0)}%`);
  // (over the bleed, a clap landing right on a loud beat of the song can be taken for the song)
  const tol = bleedDb === null ? 0.03 : 0.08;
  if (Math.abs(clapsHeard - expectedClaps) > expectedClaps * tol) fail(`${label}: heard ${clapsHeard} claps, expected ${expectedClaps}`);
  if (shoutsHeard < expectedShouts * 0.9) fail(`${label}: heard ${shoutsHeard} shouts, expected ${expectedShouts}`);
}
endToEnd("endToEnd", null);
endToEnd("endToEndWithBleed", -16);

report.violations = violations;
report.runtimeSeconds = (Date.now() - t0) / 1000;
console.log(JSON.stringify(report, null, 1));
if (violations.length) process.exitCode = 1;
