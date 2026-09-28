// Seoul Song Rhythm judge engine: DOM-free, driven by song time in seconds, so the browser game and
// the headless suite share it. Taps are judged on press; holds are judged on the press (head) and
// again at the end (tail: keep holding until the end, or let go no earlier than the grace window).
import { CHARTS, SONG_STEP, SONG_T0 } from "./charts";

export type Difficulty = "easy" | "normal" | "hard";
export type Judgment = "perfect" | "great" | "good" | "miss";
export const LANES = 4;

// Judgement windows either side of the note, in seconds.
export const WINDOW = { perfect: 0.045, great: 0.09, good: 0.135 } as const;
// A hold may be released this long before its end and still count.
export const HOLD_GRACE = 0.14;
const VALUE: Record<Judgment, number> = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };
const POINTS: Record<Judgment, number> = { perfect: 300, great: 200, good: 100, miss: 0 };
const FEVER_GAIN: Record<Judgment, number> = { perfect: 0.034, great: 0.022, good: 0.006, miss: -0.14 };
export const FEVER_BEATS = 16;
const BEAT = SONG_STEP * 4;

export interface Note {
  id: number;
  lane: number;
  t: number; // head time (s)
  end: number; // tail time (s); equals t for taps
  hold: boolean;
  state: "pending" | "holding" | "done";
  head?: Judgment;
  tail?: Judgment;
  offset?: number; // press time minus note time, s (negative = early)
}

export type RhythmEvent =
  | { type: "judge"; lane: number; judgment: Judgment; offset: number; part: "tap" | "head" | "tail"; combo: number }
  | { type: "hold"; lane: number; on: boolean }
  | { type: "fever"; on: boolean };

export interface Result {
  score: number;
  accuracy: number; // 0..100
  grade: "S" | "A" | "B" | "C" | "D";
  maxCombo: number;
  counts: Record<Judgment, number>;
  total: number;
  fullCombo: boolean;
  allPerfect: boolean;
}

export function buildNotes(diff: Difficulty): Note[] {
  return CHARTS[diff].map(([k, lane, len], id) => {
    const t = SONG_T0 + k * SONG_STEP;
    return { id, lane, t, end: t + len * SONG_STEP, hold: len > 0, state: "pending" };
  });
}

export function gradeOf(accuracy: number): Result["grade"] {
  return accuracy >= 95 ? "S" : accuracy >= 90 ? "A" : accuracy >= 80 ? "B" : accuracy >= 70 ? "C" : "D";
}

export class RhythmEngine {
  readonly notes: Note[];
  readonly lanes: Note[][];
  readonly total: number; // judgeable parts: one per tap, two per hold
  private cursor = [0, 0, 0, 0];
  private holding: (Note | null)[] = [null, null, null, null];
  score = 0;
  combo = 0;
  maxCombo = 0;
  counts: Record<Judgment, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  judged = 0;
  valueSum = 0;
  fever = 0; // gauge 0..1
  feverUntil = -1; // song time the fever ends
  private tickT = [0, 0, 0, 0];
  events: RhythmEvent[] = [];

  constructor(readonly diff: Difficulty, notes?: Note[]) {
    this.notes = notes ?? buildNotes(diff);
    this.lanes = Array.from({ length: LANES }, (_, l) => this.notes.filter((n) => n.lane === l));
    this.total = this.notes.reduce((s, n) => s + (n.hold ? 2 : 1), 0);
  }

  get lastTime(): number {
    return this.notes.reduce((m, n) => Math.max(m, n.end), 0);
  }

  inFever(t: number): boolean {
    return this.feverUntil > 0 && t < this.feverUntil;
  }

  multiplier(t: number): number {
    const c = this.combo;
    return (c >= 50 ? 4 : c >= 30 ? 3 : c >= 10 ? 2 : 1) * (this.inFever(t) ? 2 : 1);
  }

  get accuracy(): number {
    return this.judged ? (this.valueSum / this.judged) * 100 : 100;
  }

  press(lane: number, t: number): Judgment | null {
    const list = this.lanes[lane];
    let i = this.cursor[lane];
    while (i < list.length && list[i].state !== "pending") i++;
    const n = list[i];
    if (!n) return null;
    const dt = t - n.t;
    if (dt < -WINDOW.good) return null; // too early: ignored, not punished
    if (dt > WINDOW.good) return null; // update() will mark it missed
    const ad = Math.abs(dt);
    const j: Judgment = ad <= WINDOW.perfect ? "perfect" : ad <= WINDOW.great ? "great" : "good";
    n.offset = dt;
    if (n.hold) {
      n.head = j;
      n.state = "holding";
      this.holding[lane] = n;
      this.tickT[lane] = n.t;
      this.record(lane, j, dt, "head", t);
      this.events.push({ type: "hold", lane, on: true });
    } else {
      n.head = j;
      n.state = "done";
      this.record(lane, j, dt, "tap", t);
    }
    this.cursor[lane] = i + (n.hold ? 0 : 1);
    return j;
  }

  release(lane: number, t: number): void {
    const n = this.holding[lane];
    if (!n) return;
    this.holding[lane] = null;
    n.state = "done";
    this.cursor[lane] = Math.max(this.cursor[lane], this.lanes[lane].indexOf(n) + 1);
    const ok = t >= n.end - HOLD_GRACE;
    n.tail = ok ? "perfect" : "miss";
    this.record(lane, n.tail, 0, "tail", t);
    this.events.push({ type: "hold", lane, on: false });
  }

  // Advance to song time t: misses for notes gone past the window, finished holds, hold ticks, fever.
  update(t: number): void {
    for (let l = 0; l < LANES; l++) {
      const h = this.holding[l];
      if (h) {
        // hold ticks: a little score every 16th while the hold is down
        while (this.tickT[l] + SONG_STEP <= Math.min(t, h.end)) {
          this.tickT[l] += SONG_STEP;
          this.score += 10 * this.multiplier(t);
        }
        if (t >= h.end) {
          this.holding[l] = null;
          h.state = "done";
          h.tail = "perfect";
          this.cursor[l] = Math.max(this.cursor[l], this.lanes[l].indexOf(h) + 1);
          this.record(l, "perfect", 0, "tail", h.end);
          this.events.push({ type: "hold", lane: l, on: false });
        }
      }
      const list = this.lanes[l];
      let i = this.cursor[l];
      while (i < list.length) {
        const n = list[i];
        if (n.state === "done") {
          i++;
          continue;
        }
        if (n.state === "holding") break;
        if (t - n.t <= WINDOW.good) break;
        n.state = "done";
        n.head = "miss";
        this.record(l, "miss", WINDOW.good, n.hold ? "head" : "tap", t);
        if (n.hold) {
          n.tail = "miss";
          this.record(l, "miss", 0, "tail", t);
        }
        i++;
      }
      this.cursor[l] = i;
    }
    if (this.feverUntil > 0 && t >= this.feverUntil) {
      this.fever = 0;
      this.feverUntil = -1;
      this.events.push({ type: "fever", on: false });
    }
  }

  isHolding(lane: number): boolean {
    return this.holding[lane] !== null;
  }

  get finished(): boolean {
    return this.judged >= this.total;
  }

  result(): Result {
    const accuracy = this.total ? (this.valueSum / this.total) * 100 : 0;
    return {
      score: this.score,
      accuracy: Math.round(accuracy * 100) / 100,
      grade: gradeOf(accuracy),
      maxCombo: this.maxCombo,
      counts: { ...this.counts },
      total: this.total,
      fullCombo: this.counts.miss === 0 && this.judged === this.total,
      allPerfect: this.counts.perfect === this.total,
    };
  }

  drainEvents(): RhythmEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private record(lane: number, j: Judgment, offset: number, part: "tap" | "head" | "tail", t: number): void {
    this.counts[j]++;
    this.judged++;
    this.valueSum += VALUE[j];
    if (j === "miss") this.combo = 0;
    else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    this.score += POINTS[j] * this.multiplier(t);
    if (!this.inFever(t)) {
      this.fever = Math.max(0, Math.min(1, this.fever + FEVER_GAIN[j]));
      if (this.fever >= 1) {
        this.feverUntil = t + FEVER_BEATS * BEAT;
        this.events.push({ type: "fever", on: true });
      }
    }
    this.events.push({ type: "judge", lane, judgment: j, offset, part, combo: this.combo });
  }
}

// Perfect inputs for a chart: a press on every head and a release on every tail. Used by the QA
// autoplay and the headless suite.
export function perfectInputs(notes: Note[]): { t: number; lane: number; down: boolean }[] {
  const out: { t: number; lane: number; down: boolean }[] = [];
  for (const n of notes) {
    out.push({ t: n.t, lane: n.lane, down: true });
    out.push({ t: n.hold ? n.end : n.t + 0.03, lane: n.lane, down: false });
  }
  return out.sort((a, b) => a.t - b.t || (a.down === b.down ? 0 : a.down ? 1 : -1));
}
