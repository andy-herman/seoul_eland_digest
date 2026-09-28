// Synthetic room audio for the Clap for Seoul headless suite: claps, a crowd, shouting and music
// bleed, mixed at 48 kHz. Seeded, so every run of the suite hears exactly the same room.

export const FS = 48000;

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function silence(sec: number): Float32Array {
  return new Float32Array(Math.round(sec * FS));
}

/** One hand clap: a burst of shaped noise with a very fast attack and a 4 to 10 ms decay. */
export function addClap(buf: Float32Array, t: number, amp: number, r: () => number): void {
  const i0 = Math.round(t * FS);
  const tau = (0.004 + r() * 0.006) * FS;
  const len = Math.round(tau * 7);
  // a clap is a few overlapping micro-bursts; a two-pole resonance around 1 to 3 kHz colours it
  const f = 1100 + r() * 1900;
  const w = (2 * Math.PI * f) / FS;
  const rr = 0.94;
  let y1 = 0;
  let y2 = 0;
  for (let k = 0; k < len && i0 + k < buf.length; k++) {
    const env = (k < 0.0006 * FS ? k / (0.0006 * FS) : 1) * Math.exp(-k / tau);
    const n = r() * 2 - 1;
    const y = n + 2 * rr * Math.cos(w) * y1 - rr * rr * y2;
    y2 = y1;
    y1 = y;
    if (i0 + k >= 0) buf[i0 + k] += amp * env * (0.55 * n + 0.1 * y);
  }
}

/** Crowd hum: pink-ish noise plus slow swells, at a given RMS. */
export function addCrowd(buf: Float32Array, rms: number, r: () => number): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let sum = 0;
  const tmp = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    const swell = 0.75 + 0.25 * Math.sin((i / FS) * 0.9 + 1.3) * Math.sin((i / FS) * 0.37);
    tmp[i] = (b0 + b1 + b2 + w * 0.1848) * swell;
    sum += tmp[i] * tmp[i];
  }
  const k = rms / Math.sqrt(sum / buf.length);
  for (let i = 0; i < buf.length; i++) buf[i] += tmp[i] * k;
}

/** A shouted word: a voiced tone (150 to 260 Hz) with vowel formants, with a soft attack and release. */
export function addShout(buf: Float32Array, t: number, dur: number, amp: number, r: () => number): void {
  const i0 = Math.round(t * FS);
  const n = Math.round(dur * FS);
  const f0 = 150 + r() * 110;
  const formants = [
    [700, 0.9],
    [1150, 0.45],
    [2600, 0.12],
  ];
  let ph = 0;
  for (let k = 0; k < n && i0 + k < buf.length; k++) {
    const tt = k / FS;
    const env = Math.min(1, tt / 0.03) * Math.min(1, (dur - tt) / 0.06);
    const f = f0 * (1 + 0.04 * Math.sin(tt * 9));
    ph += (2 * Math.PI * f) / FS;
    let s = 0;
    for (let h = 1; h <= 18; h++) {
      const fh = f * h;
      let g = 0;
      for (const [ff, gg] of formants) g += gg / (1 + ((fh - ff) / 120) ** 2);
      s += (g / h) * Math.sin(ph * h);
    }
    // breath noise
    s += (r() * 2 - 1) * 0.04;
    if (i0 + k >= 0) buf[i0 + k] += amp * env * s;
  }
}

/** Music leaking back from the speakers after echo cancellation: soft chords and a kick drum. */
export function addMusic(buf: Float32Array, rms: number, bpm: number, r: () => number): void {
  const tmp = new Float32Array(buf.length);
  const beat = 60 / bpm;
  const chords = [
    [220, 277.2, 329.6],
    [196, 246.9, 293.7],
    [174.6, 220, 261.6],
    [196, 246.9, 311.1],
  ];
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const t = i / FS;
    const bar = t / (beat * 4);
    const c = chords[Math.floor(bar) % chords.length];
    // each chord swells in and out so changes do not click
    const sw = 0.65 + 0.35 * Math.sin(Math.PI * (bar % 1)) ** 0.5;
    let s = 0;
    for (const f of c) s += sw * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t));
    const bt = t % beat;
    s += 2.2 * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-bt * 30)) * bt) * Math.exp(-bt * 12);
    tmp[i] = s;
    sum += s * s;
  }
  void r;
  const k = rms / Math.sqrt(sum / buf.length);
  for (let i = 0; i < buf.length; i++) buf[i] += tmp[i] * k;
}

export function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
}

/** A group clapping together: n people whose claps spread around t (standard deviation `spread`). */
export function addGroupClap(buf: Float32Array, t: number, n: number, spread: number, amp: number, r: () => number): void {
  for (let i = 0; i < n; i++) addClap(buf, t + gauss(r) * spread, amp * (0.35 + 0.65 * r()), r);
}

// Shaped noise for consonants: a two-pole band around f, with the given attack and decay.
function addNoiseBurst(buf: Float32Array, t: number, f: number, dur: number, decay: number, amp: number, r: () => number): void {
  const i0 = Math.round(t * FS);
  const n = Math.round(dur * FS);
  const w = (2 * Math.PI * f) / FS;
  const rr = 0.9;
  let y1 = 0;
  let y2 = 0;
  for (let k = 0; k < n && i0 + k < buf.length; k++) {
    const tt = k / FS;
    const env = Math.min(1, tt / 0.003) * Math.exp(-tt / decay);
    const x = r() * 2 - 1;
    const y = x + 2 * rr * Math.cos(w) * y1 - rr * rr * y2;
    y2 = y1;
    y1 = y;
    if (i0 + k >= 0) buf[i0 + k] += amp * env * y * 0.12;
  }
}

// One voiced note with vowel formants.
function addVowel(buf: Float32Array, t: number, dur: number, f0: number, amp: number, r: () => number): void {
  const vowels = [
    [700, 1150, 2600],
    [300, 2300, 3000],
    [500, 900, 2500],
    [400, 1900, 2600],
    [350, 800, 2400],
  ];
  const fm = vowels[Math.floor(r() * vowels.length)];
  const i0 = Math.round(t * FS);
  const n = Math.round(dur * FS);
  let ph = 0;
  for (let k = 0; k < n && i0 + k < buf.length; k++) {
    const tt = k / FS;
    const env = Math.min(1, tt / 0.025) * Math.min(1, (dur - tt) / 0.04);
    const f = f0 * (1 + 0.02 * Math.sin(tt * 30));
    ph += (2 * Math.PI * f) / FS;
    let s = 0;
    for (let h = 1; h <= 16; h++) {
      const fh = f * h;
      let g = 0;
      g += 0.9 / (1 + ((fh - fm[0]) / 110) ** 2);
      g += 0.45 / (1 + ((fh - fm[1]) / 130) ** 2);
      g += 0.12 / (1 + ((fh - fm[2]) / 160) ** 2);
      s += (g / h) * Math.sin(ph * h);
    }
    if (i0 + k >= 0) buf[i0 + k] += amp * env * s;
  }
}

/** A room singing along: legato notes with consonants between some of them. */
export function addSinging(buf: Float32Array, t: number, dur: number, amp: number, r: () => number): void {
  let tt = t;
  const end = t + dur;
  while (tt < end) {
    const d = 0.18 + r() * 0.35;
    if (r() < 0.35) addNoiseBurst(buf, tt - 0.01, 3000 + r() * 3000, 0.04, 0.008, amp * 0.8, r); // "t", "k"
    if (r() < 0.25) addNoiseBurst(buf, tt - 0.07, 5000 + r() * 2000, 0.09, 0.05, amp * 0.5, r); // "s"
    addVowel(buf, tt, Math.min(d + 0.03, end - tt), 180 + r() * 150, amp, r);
    tt += d;
  }
}

/** People talking near the microphone: syllables with plosives, fricatives and pauses. */
export function addTalk(buf: Float32Array, t: number, dur: number, amp: number, r: () => number): void {
  let tt = t;
  const end = t + dur;
  while (tt < end) {
    const words = 2 + Math.floor(r() * 6);
    for (let w = 0; w < words && tt < end; w++) {
      const syl = 1 + Math.floor(r() * 3);
      for (let s = 0; s < syl; s++) {
        if (r() < 0.5) addNoiseBurst(buf, tt, 2500 + r() * 3500, 0.03, 0.006, amp * (0.8 + r()), r);
        if (r() < 0.3) addNoiseBurst(buf, tt, 4500 + r() * 2500, 0.12, 0.06, amp * 0.6, r);
        const d = 0.12 + r() * 0.12;
        addVowel(buf, tt + 0.02, d, 110 + r() * 120, amp, r);
        tt += d + 0.02;
      }
      tt += 0.05 + r() * 0.1;
    }
    tt += 0.3 + r() * 0.8;
  }
}

/**
 * A pop song like the club's: a kick on every beat, a snare layered with a hand clap on 2 and 4
 * (the hardest thing to tell from a real clap), hi-hats on the eighths, and a sung melody.
 * Normalised to a peak of 0.9, so it can be the song reference and, scaled down, the speaker bleed.
 */
export function makeSong(sec: number, bpm: number, t0: number, r: () => number): Float32Array {
  const b = silence(sec);
  const beat = 60 / bpm;
  for (let k = 0; t0 + k * beat < sec - 0.2; k++) {
    const t = t0 + k * beat;
    // kick
    const i0 = Math.round(t * FS);
    for (let i = 0; i < 0.25 * FS && i0 + i < b.length; i++) {
      const tt = i / FS;
      b[i0 + i] += 0.9 * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-tt * 35)) * tt) * Math.exp(-tt * 14);
    }
    // snare with a clap layer on 2 and 4
    if (k % 2 === 1) {
      addClap(b, t + 0.002, 0.7, r);
      addClap(b, t + 0.011, 0.5, r);
      addNoiseBurst(b, t, 3500, 0.18, 0.05, 2.4, r);
    }
    // hi-hats on the eighths
    for (const h of [0, 0.5]) addNoiseBurst(b, t + h * beat, 8000, 0.05, 0.012, 1.2, r);
  }
  // the melody: phrases of sung notes with gaps
  for (let t = t0; t < sec - 2; ) {
    const len = 2 + r() * 3;
    addSinging(b, t, len, 0.22, r);
    t += len + 0.4 + r() * 1.2;
  }
  let peak = 0;
  for (let i = 0; i < b.length; i++) peak = Math.max(peak, Math.abs(b[i]));
  const g = 0.9 / (peak || 1);
  for (let i = 0; i < b.length; i++) b[i] *= g;
  return b;
}

/** Room reverb (Freeverb-style: parallel damped combs, then allpasses), mixed in place. */
export function addReverb(buf: Float32Array, rt60: number, wet: number): void {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => Math.round((d * FS) / 44100));
  const aps = [556, 441, 341, 225].map((d) => Math.round((d * FS) / 44100));
  const out = new Float32Array(buf.length);
  for (const d of combs) {
    const g = Math.pow(10, (-3 * d) / FS / rt60);
    const line = new Float32Array(d);
    let idx = 0;
    let lp = 0;
    for (let i = 0; i < buf.length; i++) {
      const y = line[idx];
      lp = y * 0.6 + lp * 0.4; // damping: highs die faster, as in a furnished room
      line[idx] = buf[i] + lp * g;
      idx = (idx + 1) % d;
      out[i] += y;
    }
  }
  for (const d of aps) {
    const line = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const bi = line[idx];
      const x = out[i];
      line[idx] = x + bi * 0.5;
      out[i] = bi - x * 0.5;
      idx = (idx + 1) % d;
    }
  }
  let e = 0;
  let eo = 0;
  for (let i = 0; i < buf.length; i++) {
    e += buf[i] * buf[i];
    eo += out[i] * out[i];
  }
  const k = eo > 0 ? wet * Math.sqrt(e / eo) : 0;
  for (let i = 0; i < buf.length; i++) buf[i] += out[i] * k;
}
