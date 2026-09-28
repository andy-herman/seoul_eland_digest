// Clap for Seoul: clap and shout detection from raw microphone samples. DOM-free, so the headless
// suite can feed it synthetic rooms (single claps, groups clapping together, shouting, singing,
// talking, crowd noise, the club song leaking from the speakers) and the browser runs the same code
// inside an AudioWorklet.
//
// Claps are broadband and short: a sharp rise in high-frequency energy that dies within a few tens
// of milliseconds. A group clapping together lands within about 90 ms, so bursts inside that window
// are one clap, timed at their energy-weighted onset. Shouts ("Seoul!") are loud, voiced and
// sustained, with most of their energy in the voice band. Both are measured against noise floors
// that follow the room, and, when the song reference is set, against the song itself: the part of
// what the microphone hears that the speakers explain is not the room cheering.

export type DetEvent =
  | { type: "clap"; t: number; strength: number }
  | { type: "shout"; t: number; on: boolean }
  | { type: "level"; t: number; db: number; hot: boolean };

/** Second-order IIR section (RBJ cookbook biquad), direct form I. */
class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(
    private readonly b0: number,
    private readonly b1: number,
    private readonly b2: number,
    private readonly a1: number,
    private readonly a2: number,
  ) {}
  static highpass(fs: number, f: number, q = 0.707): Biquad {
    const w = (2 * Math.PI * f) / fs;
    const a = Math.sin(w) / (2 * q);
    const c = Math.cos(w);
    const a0 = 1 + a;
    return new Biquad((1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - a) / a0);
  }
  static bandpass(fs: number, f: number, q: number): Biquad {
    const w = (2 * Math.PI * f) / fs;
    const a = Math.sin(w) / (2 * q);
    const c = Math.cos(w);
    const a0 = 1 + a;
    return new Biquad(a / a0, 0, -a / a0, (-2 * c) / a0, (1 - a) / a0);
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Two filter banks, identical for the microphone and the song reference. */
class Bands {
  private readonly h1: Biquad;
  private readonly h2: Biquad;
  private readonly v1: Biquad;
  private readonly v2: Biquad;
  constructor(fs: number) {
    this.h1 = Biquad.highpass(fs, 1800);
    this.h2 = Biquad.highpass(fs, 1800);
    this.v1 = Biquad.bandpass(fs, 450, 0.7);
    this.v2 = Biquad.bandpass(fs, 450, 0.7);
  }
  high(x: number): number {
    return this.h2.run(this.h1.run(x));
  }
  voice(x: number): number {
    return this.v2.run(this.v1.run(x));
  }
}

export const FRAME = 64; // samples per analysis frame (1.3 ms at 48 kHz)
const MERGE = 0.11; // bursts within this of the first onset are one clap (a group clapping together)
const QUIET_CLOSE = 0.012; // a clap is over once its energy has stayed low this long
const VOWEL_AT = 0.075; // when to look for the vowel that follows a consonant
const MAX_BURST = 0.15; // longer than this is a sustained noise (a hiss, a cymbal), not a clap
const REF_WIN = 0.045; // latency estimates are not exact: compare with the song over +-45 ms
const BLOCK = 0.05; // level reports and bleed-gain tracking
const VOICE_SMOOTH = 0.02;
// Until the gain is learned (the song has to be loud for a moment first), assume the speakers leak this
// much: enough to hide a loud song leaking at -12 dB during a quiet intro, gone once the real gain is known.
const PRIOR_GAIN = 0.06;
const GAIN_Q = 0.35; // bleed gain = 35th percentile of mic/song energy ratio (the room only adds)
const BLEED_CLAP = 4; // a clap must be this much louder than the loudest song transient nearby
const BLEED_SHOUT = 2.5; // a shout must be this much louder than the song's voice band

/** The club song's own band energies, computed once from the decoded song for bleed rejection. */
export interface SongRef {
  fs: number;
  eh: Float32Array; // high band, per frame
  ev: Float32Array; // voice band, smoothed like the microphone's
  ehMax: Float32Array; // sliding maximum of eh over +-REF_WIN
  evMax: Float32Array; // sliding maximum of ev over +-REF_WIN
  loudH: number; // blocks louder than this are used to learn the bleed gain
  loudV: number;
}

function slidingMax(a: Float32Array, w: number): Float32Array {
  // monotonic deque, O(n)
  const n = a.length;
  const out = new Float32Array(n);
  const dq = new Int32Array(n + 2 * w + 1);
  let head = 0;
  let tail = 0;
  let j = 0; // next index to push
  for (let i = 0; i < n; i++) {
    const hi = Math.min(n - 1, i + w);
    while (j <= hi) {
      while (tail > head && a[dq[tail - 1]] <= a[j]) tail--;
      dq[tail++] = j++;
    }
    while (dq[head] < i - w) head++;
    out[i] = a[dq[head]];
  }
  return out;
}

export function buildSongRef(x: Float32Array, fs: number): SongRef {
  const bands = new Bands(fs);
  const n = Math.floor(x.length / FRAME);
  const eh = new Float32Array(n);
  const ev = new Float32Array(n);
  const a = Math.min(1, FRAME / fs / VOICE_SMOOTH);
  let evS = 0;
  for (let f = 0; f < n; f++) {
    let sh = 0;
    let sv = 0;
    const o = f * FRAME;
    for (let k = 0; k < FRAME; k++) {
      const s = x[o + k];
      const h = bands.high(s);
      const v = bands.voice(s);
      sh += h * h;
      sv += v * v;
    }
    eh[f] = sh / FRAME;
    evS += (sv / FRAME - evS) * a;
    ev[f] = evS;
  }
  const w = Math.round((REF_WIN * fs) / FRAME);
  const bl = Math.max(1, Math.round((BLOCK * fs) / FRAME));
  const blocksH: number[] = [];
  const blocksV: number[] = [];
  for (let f = 0; f + bl <= n; f += bl) {
    let sh = 0;
    let sv = 0;
    for (let k = 0; k < bl; k++) {
      sh += eh[f + k];
      sv += ev[f + k];
    }
    blocksH.push(sh / bl);
    blocksV.push(sv / bl);
  }
  const p = (arr: number[], q: number) => {
    const s = [...arr].sort((u, v) => u - v);
    return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
  };
  return { fs, eh, ev, ehMax: slidingMax(eh, w), evMax: slidingMax(ev, w), loudH: p(blocksH, 0.6), loudV: p(blocksV, 0.6) };
}

export interface DetectorOptions {
  sampleRate: number;
  /** 0 (only very loud claps) .. 1 (quiet claps count); default 0.6 */
  sensitivity?: number;
}

interface Burst {
  t0: number;
  peak: number;
  tPeak: number;
  lastAbove: number;
  sumT: number; // energy-weighted onset times
  sumW: number;
  onsets: number;
  sumE: number; // high-band energy summed over the burst so far
  nE: number;
  sumAtLast: number; // ... up to the last frame above a quarter of the peak
  nAtLast: number;
  evStart: number;
  evPeak: number; // voice band at the burst's peak
  evAfter: number; // voice and high band 45 ms after the first onset (-1 until then)
  ehAfter: number;
}

export class ClapDetector {
  readonly fs: number;
  sensitivity: number;
  private readonly bands: Bands;
  private readonly frameDur: number;
  private acc = 0;
  private accV = 0;
  private accF = 0;
  private n = 0;
  private t = 0; // time of the next sample, s
  private floorH = 1e-7;
  private recent = new Float32Array(8); // last few high-band frame energies
  private recentI = 0;
  private recentN = 0;
  private burst: Burst | null = null;
  private evS = 0; // voice band energy smoothed over about 20 ms (a pitch period is 4 to 7 ms)
  private ehS = 0; // high band, smoothed the same way
  // the voice floor is the quietest the voice band has been over the last few seconds, so steady
  // music or commentary becomes the floor and only shouting above it counts
  private floorV = 1e-9;
  private segMin: number[] = [];
  private segT = 0;
  private segCur = Infinity;
  private heard = 0; // seconds of audio seen; no shouts until the floor has settled
  private shoutOn = false;
  private shoutRun = 0; // seconds the voice band has stayed loud
  private quietRun = 0;
  private levelAcc = 0;
  private levelN = 0;
  private levelT = 0;
  private levelHot = false;
  // song reference (optional): where song frame 0 reaches the microphone, on this detector's clock
  private ref: SongRef | null = null;
  private refT0 = 0;
  private gH = NaN; // log bleed gains, NaN until learned
  private gV = NaN;
  private gUpdates = 0;
  private blkMicH = 0;
  private blkMicV = 0;
  private blkSongH = 0;
  private blkSongV = 0;
  private blkN = 0;
  private blkT = 0;
  private blkBusy = false;

  constructor(opts: DetectorOptions) {
    this.fs = opts.sampleRate;
    this.sensitivity = opts.sensitivity ?? 0.6;
    this.bands = new Bands(this.fs);
    this.frameDur = FRAME / this.fs;
  }

  /** Give the detector the song so speaker bleed can be told apart from the room. */
  setRef(ref: SongRef | null, t0 = this.refT0): void {
    this.ref = ref && ref.fs === this.fs ? ref : null;
    this.refT0 = t0;
  }

  /** Detector-clock time at which the first sample of the song reaches the microphone. */
  setRefStart(t0: number): void {
    this.refT0 = t0;
  }

  /** Learned bleed gains (energy ratios), for QA. */
  get bleed(): { high: number; voice: number } {
    return { high: Number.isNaN(this.gH) ? 0 : Math.exp(this.gH), voice: Number.isNaN(this.gV) ? 0 : Math.exp(this.gV) };
  }

  /** Absolute high-band energy a clap must reach, from the sensitivity setting. */
  private get minClap(): number {
    // sensitivity 1 -> about -52 dB, 0 -> about -26 dB (high band mean square)
    return Math.pow(10, (-26 - 26 * this.sensitivity) / 10);
  }

  /** Feed consecutive samples starting at time `t0` (seconds on the caller's clock). */
  process(block: Float32Array, t0: number): DetEvent[] {
    const out: DetEvent[] = [];
    if (Math.abs(t0 - this.t) > 0.05) this.t = t0; // a gap in the stream: resync the clock
    for (let i = 0; i < block.length; i++) {
      const x = block[i];
      const h = this.bands.high(x);
      const v = this.bands.voice(x);
      this.acc += h * h;
      this.accV += v * v;
      this.accF += x * x;
      if (++this.n === FRAME) {
        const tf = this.t + (i + 1 - FRAME) / this.fs;
        this.frame(this.acc / FRAME, this.accV / FRAME, this.accF / FRAME, tf, out);
        this.acc = 0;
        this.accV = 0;
        this.accF = 0;
        this.n = 0;
      }
    }
    this.t += block.length / this.fs;
    return out;
  }

  private quantile(lg: number, r: number): number {
    const lr = Math.log(Math.max(1e-14, r));
    if (Number.isNaN(lg)) return lr;
    const step = this.gUpdates < 40 ? 0.4 : 0.1; // big steps for the first two seconds or so
    return lg + (lr > lg ? GAIN_Q * step : -(1 - GAIN_Q) * step);
  }

  private frame(eh: number, ev: number, ef: number, t: number, out: DetEvent[]): void {
    const dt = this.frameDur;
    this.heard += dt;
    const a = Math.min(1, dt / VOICE_SMOOTH);
    this.evS += (ev - this.evS) * a;
    this.ehS += (eh - this.ehS) * a;

    // --- the song reference: how much of this the speakers explain
    let bleedH = 0;
    let bleedV = 0;
    const ref = this.ref;
    if (ref) {
      const j = Math.round(((t - this.refT0) * this.fs) / FRAME);
      if (j >= 0 && j < ref.eh.length) {
        bleedH = (Number.isNaN(this.gH) ? PRIOR_GAIN : Math.exp(this.gH)) * ref.ehMax[j];
        bleedV = (Number.isNaN(this.gV) ? PRIOR_GAIN : Math.exp(this.gV)) * ref.evMax[j];
        this.blkMicH += eh;
        this.blkMicV += this.evS;
        this.blkSongH += ref.eh[j];
        this.blkSongV += ref.ev[j];
        this.blkN++;
      }
    }
    if (this.burst) this.blkBusy = true;
    if (t - this.blkT >= BLOCK) {
      if (ref && this.blkN > 8) {
        const sh = this.blkSongH / this.blkN;
        const sv = this.blkSongV / this.blkN;
        let used = false;
        if (sh > ref.loudH && !this.blkBusy) {
          this.gH = this.quantile(this.gH, this.blkMicH / this.blkSongH);
          used = true;
        }
        if (sv > ref.loudV) {
          this.gV = this.quantile(this.gV, this.blkMicV / this.blkSongV);
          used = true;
        }
        if (used) this.gUpdates++;
      }
      this.blkMicH = this.blkMicV = this.blkSongH = this.blkSongV = 0;
      this.blkN = 0;
      this.blkBusy = false;
      this.blkT = t;
    }

    // --- loudness meter at about 20 Hz, with "hot": the high band is lit up (a clap storm)
    const hotNow = eh > Math.max(this.minClap, this.floorH * 12, bleedH * BLEED_CLAP);
    this.levelHot = this.levelHot || hotNow;
    this.levelAcc += ef;
    this.levelN++;
    if (t - this.levelT >= BLOCK) {
      const db = 10 * Math.log10(this.levelAcc / this.levelN + 1e-12);
      out.push({ type: "level", t, db, hot: this.levelHot });
      this.levelAcc = 0;
      this.levelN = 0;
      this.levelT = t;
      this.levelHot = false;
    }

    // --- claps
    let before = eh;
    if (this.recentN) {
      let s = 0;
      for (let k = 0; k < this.recentN; k++) s += this.recent[k];
      before = s / this.recentN;
    }
    this.recent[this.recentI] = eh;
    this.recentI = (this.recentI + 1) % this.recent.length;
    this.recentN = Math.min(this.recent.length, this.recentN + 1);
    const k = 7 - 3 * this.sensitivity; // how far above the floor
    const onset = eh > 3 * before && eh > this.minClap && eh > this.floorH * k && eh > bleedH * BLEED_CLAP;
    const b = this.burst;
    if (!b) {
      if (onset) this.burst = { t0: t, peak: eh, tPeak: t, lastAbove: t, sumT: t * eh, sumW: eh, onsets: 1, sumE: eh, nE: 1, sumAtLast: eh, nAtLast: 1, evStart: this.evS, evPeak: this.evS, evAfter: -1, ehAfter: -1 };
    } else {
      if (onset && t - b.t0 < MERGE) {
        b.sumT += t * eh;
        b.sumW += eh;
        b.onsets++;
      }
      if (eh > b.peak) {
        b.peak = eh;
        b.tPeak = t;
        b.evPeak = this.evS;
      }
      b.sumE += eh;
      b.nE++;
      if (b.evAfter < 0 && t - b.t0 >= VOWEL_AT) {
        b.evAfter = this.evS;
        b.ehAfter = this.ehS;
      }
      if (eh > 0.25 * b.peak) {
        b.lastAbove = t;
        b.sumAtLast = b.sumE;
        b.nAtLast = b.nE;
      }
      const age = t - b.t0;
      if (age >= MERGE && t - b.lastAbove >= QUIET_CLOSE) {
        this.burst = null;
        const dur = b.lastAbove - b.t0;
        // a syllable starts with a burst too ("t", "k"), but a vowel follows it: the voice band is
        // still up once the burst has gone. After a clap it has died away with the clap.
        // (looked at 75 ms after the burst: by then a syllable's vowel is sounding, while someone
        // who happens to start talking just after a clap usually has not yet)
        const vowel = b.evAfter > this.floorV * 8 && b.evAfter > 3 * b.ehAfter && b.evAfter > 2.5 * b.evStart;
        // people are talking or singing: consonants are about, so a clap must clear the high-band
        // floor by more
        const voiceOn = Math.max(b.evStart, b.evAfter) > this.floorV * 16;
        const clearsFloor = !voiceOn || b.peak > this.floorH * 60;
        // a long burst is either a group clapping (a run of impulses: lumpy) or a hiss like "s"
        // (smooth): the peak of a group towers over its average
        const crest = b.peak / (b.sumAtLast / b.nAtLast);
        const impulsive = dur <= 0.04 || crest > 2.6;
        // a consonant's high band is well below the voice band around it (the vowel before or the
        // one after); a clap is about level with it or above, even while people sing or shout
        const overVoice = b.peak > 0.63 * Math.max(b.evStart, b.evAfter, this.evS);
        this.debug?.push({ t: b.sumT / b.sumW, onsets: b.onsets, crest, clearsFloor, impulsive, peak: b.peak, evStart: b.evStart, evPeak: b.evPeak, evEnd: this.evS, floorV: this.floorV, floorH: this.floorH, dur, vowel, overVoice, shout: this.shoutOn });
        if (dur <= MAX_BURST && !vowel && overVoice && clearsFloor && impulsive) {
          out.push({ type: "clap", t: b.sumT / b.sumW, strength: Math.min(1, Math.sqrt(b.peak / (this.minClap * 40))) });
        }
      } else if (age > MERGE + MAX_BURST) this.burst = null;
    }
    // the floor follows quiet stretches quickly and loud ones slowly
    if (!this.burst) this.floorH += (eh - this.floorH) * (eh < this.floorH ? 0.02 : 0.0015);

    // --- shouts: the voice band stays well above its floor (and above the song) for a while
    if (this.heard > 0.2) this.segCur = Math.min(this.segCur, this.evS);
    if (t - this.segT >= 0.1 && this.segCur < Infinity) {
      this.segMin.push(this.segCur);
      if (this.segMin.length > 30) this.segMin.shift();
      this.segCur = Infinity;
      this.segT = t;
      let m = Infinity;
      for (const s of this.segMin) m = Math.min(m, s);
      this.floorV = Math.max(1e-9, m);
    }
    // voiced: most of the energy sits in the voice band, unlike a clap
    const voiced = this.evS > this.ehS * 3;
    const loudV =
      voiced &&
      this.evS > this.floorV * 8 &&
      this.evS > Math.pow(10, -4.6 + 0.8 * (0.6 - this.sensitivity)) &&
      this.evS > bleedV * BLEED_SHOUT;
    if (loudV) {
      this.shoutRun += dt;
      this.quietRun = 0;
    } else {
      this.quietRun += dt;
      if (this.quietRun > 0.06) this.shoutRun = 0;
    }
    if (this.heard < 0.5) this.shoutRun = 0;
    if (!this.shoutOn && this.shoutRun >= 0.16) {
      this.shoutOn = true;
      out.push({ type: "shout", t: t - this.shoutRun, on: true });
    } else if (this.shoutOn && this.quietRun > 0.1) {
      this.shoutOn = false;
      out.push({ type: "shout", t: t - this.quietRun, on: false });
    }
  }

  /** QA: when set, every closed burst's features are recorded here. */
  debug: Record<string, number | boolean>[] | null = null;

  get shouting(): boolean {
    return this.shoutOn;
  }
}
