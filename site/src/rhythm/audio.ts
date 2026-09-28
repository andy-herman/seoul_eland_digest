// Seoul Song Rhythm audio: the song is decoded into Web Audio and started on the audio clock, so the
// notes can be placed against the exact sample being heard. Input times come from event timestamps
// mapped onto that clock. Hit drums and the calibration click are synthesised.

export class SongAudio {
  ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private loading: Promise<AudioBuffer> | null = null;
  private src: AudioBufferSourceNode | null = null;
  private startCtx = 0; // ctx time at which song time 0 is heard
  hitSounds = true;
  offset = 0; // seconds; positive means the player hits late, so their presses are pulled earlier

  private url: string;
  constructor(url: string) {
    this.url = url;
  }

  /** Switch to another song. The next load() fetches it; a load still running for the old song is dropped. */
  setUrl(url: string): void {
    if (url === this.url) return;
    this.stop();
    this.url = url;
    this.buffer = null;
    this.loading = null;
  }

  get songUrl(): string {
    return this.url;
  }

  /** Call from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      // iOS: play through the silent switch like a music app (Safari 17+)
      const nav = navigator as unknown as { audioSession?: { type: string } };
      try {
        if (nav.audioSession) nav.audioSession.type = "playback";
      } catch {
        /* older Safari */
      }
      this.ctx = new Ctor({ latencyHint: "interactive" });
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.85;
      this.music.connect(this.out);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.5;
      this.sfx.connect(this.out);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.buffer;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  load(onProgress?: (f: number) => void): Promise<AudioBuffer> {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (this.loading) return this.loading;
    const url = this.url;
    const loading = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`song ${res.status}`);
      const total = Number(res.headers.get("content-length")) || 2.7e6;
      let bytes: ArrayBuffer;
      if (res.body && onProgress) {
        const reader = res.body.getReader();
        const parts: Uint8Array[] = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
          got += value.length;
          onProgress(Math.min(0.95, got / total));
        }
        const all = new Uint8Array(got);
        let o = 0;
        for (const p of parts) {
          all.set(p, o);
          o += p.length;
        }
        bytes = all.buffer;
      } else bytes = await res.arrayBuffer();
      if (!this.ctx) throw new Error("audio locked");
      const buf = await new Promise<AudioBuffer>((resolve, reject) => {
        const p = this.ctx!.decodeAudioData(bytes, resolve, reject);
        if (p && typeof (p as Promise<AudioBuffer>).then === "function") (p as Promise<AudioBuffer>).then(resolve, reject);
      });
      if (this.url === url) this.buffer = buf; // unless the player picked another song meanwhile
      onProgress?.(1);
      return buf;
    })();
    this.loading = loading;
    loading.catch(() => {
      if (this.loading === loading) this.loading = null;
    });
    return loading;
  }

  /** Start the song so that song time `from` is heard `lead` seconds from now. */
  start(from = 0, lead = 0): void {
    if (!this.ctx || !this.buffer || !this.music) return;
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.music);
    this.music.gain.cancelScheduledValues(this.ctx.currentTime);
    this.music.gain.value = 0.85;
    const when = this.ctx.currentTime + lead;
    if (from >= 0) src.start(when, from);
    else src.start(when - from, 0);
    this.startCtx = when - from;
    this.src = src;
  }

  stop(): void {
    if (this.src) {
      try {
        this.src.stop();
      } catch {
        /* already stopped */
      }
      this.src.disconnect();
      this.src = null;
    }
  }

  /** Fade the song out over `sec` seconds, then stop it. */
  fadeOut(sec: number): void {
    if (!this.ctx || !this.music || !this.src) return;
    const now = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setValueAtTime(this.music.gain.value, now);
    this.music.gain.linearRampToValueAtTime(0, now + sec);
    const src = this.src;
    this.src = null;
    try {
      src.stop(now + sec + 0.05);
    } catch {
      /* already stopped */
    }
  }

  pause(): void {
    if (this.ctx?.state === "running") void this.ctx.suspend();
  }

  resume(): Promise<void> {
    return this.ctx && this.ctx.state !== "running" ? this.ctx.resume() : Promise.resolve();
  }

  // The audio clock as heard: getOutputTimestamp gives the context time leaving the speakers now.
  private heardAt(perfMs: number): number {
    const c = this.ctx!;
    const lat = (c as AudioContext & { outputLatency?: number }).outputLatency || c.baseLatency || 0;
    const fallback = c.currentTime - lat + (perfMs - performance.now()) / 1000;
    const ts = (c as AudioContext & { getOutputTimestamp?: () => AudioTimestamp }).getOutputTimestamp?.();
    if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
      const v = ts.contextTime + (perfMs - ts.performanceTime) / 1000;
      // a fresh or just-resumed context can report a stale pair; trust it only near the fallback
      if (Math.abs(v - fallback) < 0.25) return v;
    }
    return fallback;
  }

  /** Song time now, for drawing. */
  now(): number {
    if (!this.ctx) return -1;
    if (this.ctx.state !== "running") return this.frozen;
    const t = this.heardAt(performance.now()) - this.startCtx;
    this.frozen = t;
    return t;
  }
  private frozen = -1;

  /** Song time at which an input event happened, corrected by the player's offset. */
  at(eventTimeStamp: number): number {
    if (!this.ctx || this.ctx.state !== "running") return this.frozen - this.offset;
    return this.heardAt(eventTimeStamp) - this.startCtx - this.offset;
  }

  // A small drum: a pitched thump plus a click of noise.
  hit(lane: number, strong = false): void {
    if (!this.hitSounds || !this.ctx || !this.sfx || this.ctx.state !== "running") return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    const f = [150, 185, 185, 150][lane] * (strong ? 1.1 : 1);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(strong ? 0.55 : 0.4, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.18);
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf();
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2400;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.16, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    n.connect(hp).connect(ng).connect(this.sfx);
    n.start(t);
    n.stop(t + 0.05);
  }

  private noise: AudioBuffer | null = null;
  private noiseBuf(): AudioBuffer {
    if (!this.noise && this.ctx) {
      const len = Math.floor(this.ctx.sampleRate * 0.1);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise!;
  }

  click(when: number, accent: boolean): void {
    if (!this.ctx || !this.sfx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = accent ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.5, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    o.connect(g).connect(this.sfx);
    o.start(when);
    o.stop(when + 0.08);
  }

  // Calibration: a click every beat at the song's tempo; returns the context times of the clicks,
  // which is when heard() will report them reaching the speakers.
  metronome(beats: number, bpm: number, lead = 0.6): number[] {
    if (!this.ctx) return [];
    const T = 60 / bpm;
    const t0 = this.ctx.currentTime + lead;
    const times: number[] = [];
    for (let i = 0; i < beats; i++) {
      this.click(t0 + i * T, i % 4 === 0);
      times.push(t0 + i * T);
    }
    return times;
  }

  /** Context time (as heard) of an input event, for calibration. */
  heard(eventTimeStamp: number): number {
    return this.ctx ? this.heardAt(eventTimeStamp) : 0;
  }

  get state(): AudioContextState | "none" {
    return this.ctx?.state ?? "none";
  }
}
