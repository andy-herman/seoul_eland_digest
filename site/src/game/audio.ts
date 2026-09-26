// Background music (the club's 서울의 노래, streamed on first play) plus
// sound effects synthesised with Web Audio, so there is nothing else to load.

const PREFS_KEY = "pp-audio-v1";
const MUSIC_VOLUME = 0.42;

interface AudioPrefs {
  muted: boolean;
  music: boolean;
}

function loadPrefs(): AudioPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return { muted: raw.muted === true, music: raw.music !== false };
  } catch {
    return { muted: false, music: true };
  }
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly music: HTMLAudioElement;
  private musicWanted = false;
  private musicRouted = false;
  private prefs: AudioPrefs;

  constructor(private readonly musicUrl: string) {
    this.prefs = loadPrefs();
    this.music = new Audio();
    this.music.preload = "none";
    this.music.loop = true;
    this.music.volume = MUSIC_VOLUME;
  }

  get muted(): boolean {
    return this.prefs.muted;
  }

  get musicEnabled(): boolean {
    return this.prefs.music;
  }

  /** Call from a user gesture: creates the AudioContext and allows playback. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.55;
      this.out.connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * 1.2);
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    // iOS ignores HTMLMediaElement.volume (it always reads back as 1), so there
    // the music goes through a gain node to sit under the sound effects.
    if (!this.musicRouted && Math.abs(this.music.volume - MUSIC_VOLUME) > 0.01) {
      try {
        const source = this.ctx.createMediaElementSource(this.music);
        const gain = this.ctx.createGain();
        gain.gain.value = MUSIC_VOLUME;
        source.connect(gain).connect(this.ctx.destination);
        this.musicRouted = true;
      } catch {
        // Leave the element playing at full volume.
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  startMusic(): void {
    this.musicWanted = true;
    this.syncMusic();
  }

  stopMusic(): void {
    this.musicWanted = false;
    this.music.pause();
  }

  /** Pause or resume for tab visibility without forgetting what was wanted. */
  suspend(hidden: boolean): void {
    if (hidden) {
      this.music.pause();
      if (this.ctx?.state === "running") void this.ctx.suspend();
    } else {
      if (this.ctx?.state === "suspended") void this.ctx.resume();
      this.syncMusic();
    }
  }

  setMuted(muted: boolean): void {
    this.prefs.muted = muted;
    this.persist();
    this.syncMusic();
  }

  setMusicEnabled(enabled: boolean): void {
    this.prefs.music = enabled;
    this.persist();
    this.syncMusic();
  }

  private syncMusic(): void {
    const play = this.musicWanted && this.prefs.music && !this.prefs.muted && !document.hidden;
    if (play) {
      if (!this.music.src) this.music.src = this.musicUrl;
      void this.music.play().catch(() => {
        // Autoplay was blocked; the next user gesture calls startMusic again.
      });
    } else {
      this.music.pause();
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      // Not fatal.
    }
  }

  private ready(): { ctx: AudioContext; out: GainNode } | null {
    if (this.prefs.muted || !this.ctx || !this.out || this.ctx.state !== "running") return null;
    return { ctx: this.ctx, out: this.out };
  }

  private tone(type: OscillatorType, from: number, to: number, start: number, duration: number, volume: number): void {
    const audio = this.ready();
    if (!audio) return;
    const { ctx, out } = audio;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(out);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  private burst(filterType: BiquadFilterType, frequency: number, start: number, duration: number, volume: number, attack = 0.01): void {
    const audio = this.ready();
    if (!audio || !this.noise) return;
    const { ctx, out } = audio;
    const t0 = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  kick(): void {
    this.tone("sine", 150, 45, 0, 0.18, 0.9);
    this.burst("lowpass", 1400, 0, 0.07, 0.5);
  }

  whistle(): void {
    for (const start of [0, 0.19]) {
      this.tone("sine", 2850, 2750, start, 0.14, 0.18);
      this.tone("square", 2870, 2760, start, 0.14, 0.035);
    }
  }

  goal(): void {
    this.burst("bandpass", 900, 0, 1.6, 0.42, 0.25);
    this.burst("highpass", 2400, 0.05, 1.2, 0.16, 0.2);
    [523, 659, 784, 1047].forEach((f, i) => this.tone("triangle", f, f, 0.05 + i * 0.09, 0.22, 0.2));
  }

  save(): void {
    this.tone("sine", 220, 90, 0, 0.16, 0.6);
    this.burst("lowpass", 700, 0, 0.1, 0.35);
    [784, 988, 1319].forEach((f, i) => this.tone("sine", f, f, 0.08 + i * 0.07, 0.18, 0.16));
  }

  post(): void {
    this.tone("triangle", 1180, 1100, 0, 0.5, 0.35);
    this.tone("sine", 2350, 2300, 0, 0.35, 0.12);
  }

  miss(): void {
    this.tone("sawtooth", 330, 180, 0, 0.35, 0.08);
    this.burst("bandpass", 500, 0.05, 0.6, 0.12, 0.15);
  }

  levelUp(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone("square", f, f, i * 0.07, 0.12, 0.06));
  }

  card(): void {
    [1319, 1568, 2093].forEach((f, i) => this.tone("sine", f, f * 1.01, i * 0.08, 0.25, 0.14));
  }

  click(): void {
    this.tone("sine", 900, 700, 0, 0.05, 0.12);
  }

  // Dribble Dash sounds.

  jump(): void {
    this.tone("sine", 320, 760, 0, 0.16, 0.22);
    this.tone("triangle", 640, 1300, 0.01, 0.12, 0.06);
  }

  slide(): void {
    this.burst("bandpass", 1800, 0, 0.28, 0.2, 0.02);
    this.tone("sine", 260, 140, 0, 0.2, 0.12);
  }

  treat(): void {
    [988, 1319].forEach((f, i) => this.tone("square", f, f, i * 0.06, 0.1, 0.07));
  }

  dodge(): void {
    this.tone("sine", 700, 1050, 0, 0.09, 0.07);
  }

  crash(): void {
    this.tone("sine", 180, 50, 0, 0.3, 0.9);
    this.burst("lowpass", 900, 0, 0.35, 0.6);
    [660, 523, 392].forEach((f, i) => this.tone("triangle", f, f * 0.97, 0.18 + i * 0.12, 0.16, 0.12));
  }

  milestone(): void {
    [784, 1175].forEach((f, i) => this.tone("sine", f, f, i * 0.07, 0.12, 0.09));
  }
}
