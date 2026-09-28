// Clap for Seoul match: judges each chant from the claps and shouts the room made, and turns the
// results into momentum, chances and goals. DOM-free and deterministic: the same inputs always
// give the same match, so the headless suite can check that a room that claps well wins and a
// silent or spamming room does not.
import { CHANTS, DEFAULT_GRID, type ChantGrid, type Cue } from "./chants";

export type Judgment = "perfect" | "great" | "good" | "miss";
export const WINDOWS: Record<"casual" | "ultras", { perfect: number; great: number; good: number; shout: number }> = {
  casual: { perfect: 0.06, great: 0.11, good: 0.17, shout: 0.26 },
  ultras: { perfect: 0.045, great: 0.09, good: 0.135, shout: 0.2 },
};
const VALUE: Record<Judgment, number> = { perfect: 1, great: 0.75, good: 0.45, miss: 0 };
const EXTRA_COST = 0.25;
const ROLL_TARGET = 14; // claps in one bar for a full clap storm
// A crowd storm is one long roar of claps that the detector cannot split into single claps, so a
// storm also scores by how much of the bar the room's high band is lit up (microphone only).
const ROLL_HOT = 0.45; // fraction of 50 ms windows that must be lit for a full storm
const HOT_WINDOW = 0.05;

export type Tier = 1 | 2 | 3 | 4;

export interface CueResult {
  i: number;
  acc: number; // 0..1
  marks: { t: number; judgment: Judgment; offset: number }[];
  extras: number;
  claps: number;
}

export type MatchEvent =
  | { type: "judge"; t: number; judgment: Judgment; offset: number }
  | { type: "cue"; cue: number; acc: number }
  | { type: "chance"; side: "home" | "away"; t: number }
  | { type: "goal"; side: "home" | "away"; t: number; score: [number, number] }
  | { type: "save"; side: "home" | "away"; t: number }
  | { type: "clear"; side: "home" | "away"; t: number }
  | { type: "whistle"; t: number; what: "kickoff" | "half" | "full" };

export interface MatchOptions {
  tier: Tier;
  level: "casual" | "ultras";
  seed?: number;
  grid?: ChantGrid; // the song's chant timeline (default 서울의 노래)
}

export class ClapMatch {
  readonly cues: Cue[];
  readonly grid: ChantGrid;
  readonly win: (typeof WINDOWS)["casual"];
  momentum = 0;
  score: [number, number] = [0, 0];
  results: CueResult[] = [];
  chance: "home" | "away" | null = null;
  events: MatchEvent[] = [];
  done = false;
  private t: number;
  private next = 0; // next cue to judge
  private claps: number[] = [];
  private shouts: { t0: number; t1: number }[] = [];
  private shoutOpen: number | null = null;
  private halfDone = false;
  private kicked = false;
  private used = new Set<number>(); // clap indexes already judged
  private hot: number[] = []; // times of lit 50 ms windows (microphone level reports)
  private rnd: () => number;

  constructor(readonly opts: MatchOptions) {
    this.grid = opts.grid ?? DEFAULT_GRID;
    this.cues = this.grid.buildCues();
    this.t = this.grid.kickoffT;
    this.win = WINDOWS[opts.level];
    let s = (opts.seed ?? 20260928) >>> 0 || 1;
    this.rnd = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  /** A clap heard at song time t. */
  clap(t: number): void {
    this.claps.push(t);
    const cue = this.cues[this.next];
    // instant feedback for claps on the pattern
    if (cue && t > cue.t0 - this.win.good && t < cue.t1 + this.win.good) {
      let best = Infinity;
      for (const c of cue.claps) if (Math.abs(t - c) < Math.abs(best)) best = t - c;
      if (Math.abs(best) <= this.win.good) this.events.push({ type: "judge", t, judgment: this.judgeOffset(best), offset: best });
    }
  }

  /** A 50 ms loudness report from the microphone: `hot` when the high band was lit up. */
  activity(t: number, hot: boolean): void {
    if (hot) this.hot.push(t);
  }

  shout(t: number, on: boolean): void {
    if (on) this.shoutOpen = t;
    else if (this.shoutOpen !== null) {
      this.shouts.push({ t0: this.shoutOpen, t1: t });
      this.shoutOpen = null;
    }
  }

  private judgeOffset(d: number): Judgment {
    const a = Math.abs(d);
    return a <= this.win.perfect ? "perfect" : a <= this.win.great ? "great" : a <= this.win.good ? "good" : "miss";
  }

  /** Rival pressure per second: better clubs push harder and their crowds answer back. */
  private get drift(): number {
    return 0.012 + 0.006 * (this.opts.tier - 1);
  }

  /** Judge one chant from the claps and shouts inside its bar. */
  judge(cue: Cue): CueResult {
    const def = CHANTS[cue.chant];
    const lo = cue.t0 - this.win.good - 0.05;
    const hi = cue.t1 + 0.05;
    const inBar: number[] = [];
    this.claps.forEach((c, i) => {
      if (c >= lo && c <= hi && !this.used.has(i)) inBar.push(i);
    });
    const marks: CueResult["marks"] = [];
    let total = 0;
    let count = 0;
    let extras = 0;
    if (def.roll) {
      const n = inBar.length;
      inBar.forEach((i) => this.used.add(i));
      const lit = this.hot.filter((h) => h >= cue.t0 && h < cue.t1).length;
      const windows = Math.max(1, (cue.t1 - cue.t0) / HOT_WINDOW);
      return { i: cue.i, acc: Math.min(1, Math.max(n / ROLL_TARGET, lit / windows / ROLL_HOT)), marks, extras: 0, claps: n };
    }
    if (def.hush) {
      const noise = inBar.length + this.shouts.filter((s) => s.t1 > cue.t0 && s.t0 < cue.t1).length;
      inBar.forEach((i) => this.used.add(i));
      return { i: cue.i, acc: noise === 0 ? 1 : Math.max(0, 1 - noise * 0.34), marks, extras: noise, claps: inBar.length };
    }
    const free = new Set(inBar);
    for (const want of cue.claps) {
      let bi = -1;
      let bd = Infinity;
      for (const i of free) {
        const d = this.claps[i] - want;
        if (Math.abs(d) < Math.abs(bd)) {
          bd = d;
          bi = i;
        }
      }
      const j = bi >= 0 && Math.abs(bd) <= this.win.good ? this.judgeOffset(bd) : "miss";
      if (j !== "miss") {
        free.delete(bi);
        this.used.add(bi);
      }
      marks.push({ t: want, judgment: j, offset: j === "miss" ? 0 : bd });
      total += VALUE[j];
      count++;
    }
    // claps that belong to no beat of the pattern
    extras += free.size;
    free.forEach((i) => this.used.add(i));
    for (const want of cue.shouts) {
      const s = this.shouts.find((x) => Math.abs(x.t0 - want.t0) <= this.win.shout && x.t1 - x.t0 >= (want.t1 - want.t0) * 0.35);
      const d = s ? s.t0 - want.t0 : 0;
      const a = Math.abs(d);
      const j: Judgment = !s ? "miss" : a <= this.win.shout * 0.4 ? "perfect" : a <= this.win.shout * 0.7 ? "great" : "good";
      marks.push({ t: want.t0, judgment: j, offset: d });
      total += VALUE[j];
      count++;
    }
    const acc = count ? Math.max(0, Math.min(1, (total - extras * EXTRA_COST) / count)) : 0;
    return { i: cue.i, acc, marks, extras, claps: inBar.length };
  }

  /** Move the match on to song time t (call every frame). */
  update(t: number): void {
    if (this.done) return;
    if (!this.kicked && t >= this.grid.kickoffT) {
      this.kicked = true;
      this.events.push({ type: "whistle", t: this.grid.kickoffT, what: "kickoff" });
    }
    if (!this.kicked) return;
    const dt = Math.max(0, Math.min(0.25, t - this.t));
    this.t = Math.max(this.t, t);
    this.momentum = Math.max(-1, Math.min(1, this.momentum - this.drift * dt));
    // judge chants once their bar (plus the late window) is over
    while (this.next < this.cues.length && t > this.cues[this.next].t1 + this.win.good + 0.06) {
      const cue = this.cues[this.next++];
      const r = this.judge(cue);
      this.results.push(r);
      this.events.push({ type: "cue", cue: cue.i, acc: r.acc });
      this.resolve(r, cue.t1);
    }
    const mid = (this.grid.kickoffT + this.grid.fulltimeT) / 2;
    if (!this.halfDone && t >= mid) {
      this.halfDone = true;
      this.events.push({ type: "whistle", t: mid, what: "half" });
    }
    if (t >= this.grid.fulltimeT && this.next >= this.cues.length) {
      this.done = true;
      this.events.push({ type: "whistle", t: this.grid.fulltimeT, what: "full" });
    }
  }

  private get awayThreshold(): number {
    return -0.62 + 0.04 * (this.opts.tier - 1);
  }

  // A chance is decided by the chant that follows it: the room clapping well scores ours and
  // puts theirs off.
  private resolve(r: CueResult, t: number): void {
    const acc = r.acc;
    if (this.chance === "home") {
      this.chance = null;
      if (acc >= 0.72) {
        this.score[0]++;
        this.momentum = 0;
        this.events.push({ type: "goal", side: "home", t, score: [...this.score] as [number, number] });
      } else if (acc >= 0.45) {
        this.momentum = 0.25;
        this.events.push({ type: "save", side: "home", t });
      } else {
        this.momentum = 0;
        this.events.push({ type: "clear", side: "home", t });
      }
      return;
    }
    if (this.chance === "away") {
      this.chance = null;
      if (acc < 0.45) {
        this.score[1]++;
        this.momentum = 0;
        this.events.push({ type: "goal", side: "away", t, score: [...this.score] as [number, number] });
      } else if (acc < 0.75) {
        this.momentum = -0.2;
        this.events.push({ type: "save", side: "away", t });
      } else {
        this.momentum = 0.1;
        this.events.push({ type: "clear", side: "away", t });
      }
      return;
    }
    this.momentum = Math.max(-1, Math.min(1, this.momentum + 0.5 * acc - 0.2));
    // a quiet room invites counter-attacks, and better clubs find more of them
    const counter = this.rnd() < 0.05 + 0.05 * this.opts.tier - 0.28 * acc;
    if (this.momentum >= 0.6) {
      this.chance = "home";
      this.events.push({ type: "chance", side: "home", t });
    } else if (this.momentum <= this.awayThreshold || (counter && this.momentum < 0.3)) {
      this.chance = "away";
      this.events.push({ type: "chance", side: "away", t });
    }
  }

  /** Events since the last call. */
  drain(): MatchEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  get accuracy(): number {
    const judged = this.results;
    return judged.length ? judged.reduce((a, r) => a + r.acc, 0) / judged.length : 0;
  }
}

export function starsFor(m: ClapMatch): [boolean, boolean, boolean] {
  const win = m.score[0] > m.score[1];
  return [win, win && m.accuracy >= 0.72, win && m.accuracy >= 0.88 && m.score[0] - m.score[1] >= 2];
}
