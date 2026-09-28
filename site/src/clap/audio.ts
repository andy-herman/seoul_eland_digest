// Clap for Seoul audio: the club song on the Web Audio clock (shared with Seoul Song Rhythm, so chants
// sit exactly on its beat), the microphone through the clap detector worklet, and crowd sounds.
import { SongAudio } from "../rhythm/audio";
import { buildSongRef, type DetEvent, type SongRef } from "./detector";

const REF_IDLE = 1e9; // a reference start so far away that no frame lines up with the song
import workletUrl from "./worklet.ts?worker&url";

export type MicState = "off" | "asking" | "on" | "denied" | "unsupported";

export class ClapAudio extends SongAudio {
  mic: MicState = "off";
  micOffset = 0.03; // seconds: extra input delay, set by calibration
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private srcNode: MediaStreamAudioSourceNode | null = null;
  private inputLatency = 0.02;
  private sink: GainNode | null = null;
  heardBlocks = 0; // messages received from the worklet (QA)
  private refSent = false;
  private useRef = true;
  bleedInfo: { high: number; voice: number } | null = null;
  onDetect: ((e: DetEvent[]) => void) | null = null;

  /** Ask for the microphone. Call from a user gesture after unlock(). */
  async startMic(sensitivity: number): Promise<MicState> {
    if (!navigator.mediaDevices?.getUserMedia || !this.ctx || !("audioWorklet" in this.ctx)) return (this.mic = "unsupported");
    if (this.mic === "on") return this.mic;
    this.mic = "asking";
    // iOS: allow the song and the microphone at the same time
    const nav = navigator as unknown as { audioSession?: { type: string } };
    try {
      if (nav.audioSession) nav.audioSession.type = "play-and-record";
    } catch {
      /* older Safari */
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch {
      return (this.mic = "denied");
    }
    try {
      await this.detectorNode(sensitivity);
      this.srcNode = this.ctx.createMediaStreamSource(this.stream);
      this.srcNode.connect(this.node!);
      const lat = (this.stream.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number }).latency;
      if (typeof lat === "number" && lat > 0 && lat < 0.3) this.inputLatency = lat;
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.mic = "on";
      this.syncRef();
      return this.mic;
    } catch {
      this.stopMic();
      return (this.mic = "unsupported");
    }
  }

  private async detectorNode(sensitivity: number): Promise<AudioWorkletNode> {
    const c = this.ctx!;
    await c.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(c, "clap-detector", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    node.port.postMessage({ sensitivity });
    node.port.onmessage = (e: MessageEvent<DetEvent[] | { bleed: { high: number; voice: number } }>) => {
      this.heardBlocks++;
      if (Array.isArray(e.data)) this.onDetect?.(e.data);
      else if (e.data?.bleed) this.bleedInfo = e.data.bleed;
    };
    this.refSent = false;
    // browsers only run nodes that lead to the speakers, so route it there through silence
    this.sink = c.createGain();
    this.sink.gain.value = 0;
    node.connect(this.sink);
    this.sink.connect(c.destination);
    this.node = node;
    return node;
  }

  /** QA only: feed a looping audio file into the detector as if it were the microphone. */
  async startFileInput(url: string, sensitivity: number): Promise<MicState> {
    if (!this.ctx || !("audioWorklet" in this.ctx)) return (this.mic = "unsupported");
    const node = this.node ?? (await this.detectorNode(sensitivity));
    const data = await (await fetch(url)).arrayBuffer();
    const buf = await this.ctx.decodeAudioData(data);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(node);
    src.start();
    return (this.mic = "on");
  }

  /**
   * Hand the detector the song and where it is playing, so the part of what the microphone hears
   * that the speakers explain (the song leaking back, if echo cancellation misses it) is ignored.
   * Call after every start, seek and calibration (a pause freezes both clocks, so it needs nothing).
   */
  syncRef(): void {
    const node = this.node;
    const buf = (this as unknown as { buffer: AudioBuffer | null }).buffer;
    if (!node || !buf || !this.ctx) return;
    if (!this.refSent && this.useRef) {
      const ch = buf.getChannelData(0);
      let mono = ch;
      if (buf.numberOfChannels > 1) {
        mono = new Float32Array(ch.length);
        const r = buf.getChannelData(1);
        for (let i = 0; i < ch.length; i++) mono[i] = 0.5 * (ch[i] + r[i]);
      }
      const ref: SongRef = buildSongRef(mono, buf.sampleRate);
      node.port.postMessage({ ref }, [ref.eh.buffer, ref.ev.buffer, ref.ehMax.buffer, ref.evMax.buffer]);
      this.refSent = true;
    }
    if (!(this as unknown as { src: AudioBufferSourceNode | null }).src) {
      node.port.postMessage({ refStart: REF_IDLE });
      return;
    }
    const c = this.ctx as AudioContext & { outputLatency?: number };
    const out = c.outputLatency || c.baseLatency || 0;
    // song sample 0 reaches the microphone (as the worklet clocks it) this long after startCtx
    node.port.postMessage({ refStart: this.songStartCtx + out + this.inputLatency + this.micOffset });
  }

  override stop(): void {
    super.stop();
    this.node?.port.postMessage({ refStart: REF_IDLE }); // no song playing: nothing to subtract
  }

  /**
   * QA: feed the song itself into the detector, `db` below full level, as if the speakers leaked
   * into the microphone and echo cancellation missed it. `alignMs` mistimes the reference.
   */
  async startBleedInput(db: number, sensitivity: number, alignMs = 0, useRef = true): Promise<MicState> {
    const music = (this as unknown as { music: GainNode | null }).music;
    if (!this.ctx || !music || !("audioWorklet" in this.ctx)) return (this.mic = "unsupported");
    if (!this.node) await this.detectorNode(sensitivity);
    this.useRef = useRef;
    const g = this.ctx.createGain();
    g.gain.value = Math.pow(10, db / 20);
    music.connect(g);
    g.connect(this.node!);
    const c = this.ctx as AudioContext & { outputLatency?: number };
    this.micOffset = -((c.outputLatency || c.baseLatency || 0) + this.inputLatency) + alignMs / 1000;
    this.mic = "on";
    this.syncRef();
    return this.mic;
  }

  setSensitivity(s: number): void {
    this.node?.port.postMessage({ sensitivity: s });
  }

  stopMic(): void {
    this.srcNode?.disconnect();
    this.node?.port.close();
    this.node?.disconnect();
    this.sink?.disconnect();
    this.sink = null;
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.srcNode = null;
    this.node = null;
    this.stream = null;
    if (this.mic === "on" || this.mic === "asking") this.mic = "off";
    const nav = navigator as unknown as { audioSession?: { type: string } };
    try {
      if (nav.audioSession) nav.audioSession.type = "playback";
    } catch {
      /* older Safari */
    }
  }

  /** Song time of a detector timestamp (audio context seconds when the block was processed). */
  songTimeOfMic(ctxTime: number): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    if (!c) return -1;
    const out = c.outputLatency || c.baseLatency || 0;
    return ctxTime - this.songStartCtx - out - this.inputLatency - this.micOffset;
  }

  /** The input delay the browser reports for the microphone (or a typical guess). */
  get inputDelay(): number {
    return this.inputLatency;
  }

  get songStartCtx(): number {
    return (this as unknown as { startCtx: number }).startCtx;
  }

  // ---------------------------------------------------------------- crowd sounds
  private crowdNoise(): AudioBuffer | null {
    const c = this.ctx;
    if (!c) return null;
    const self = this as unknown as { crowdBuf?: AudioBuffer };
    if (!self.crowdBuf) {
      const len = Math.floor(c.sampleRate * 2.5);
      const b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      let p = 0;
      for (let i = 0; i < len; i++) {
        p = 0.97 * p + (Math.random() * 2 - 1) * 0.3;
        d[i] = p;
      }
      self.crowdBuf = b;
    }
    return self.crowdBuf;
  }

  /** A crowd roar (goal) or groan (conceded), made from shaped noise. */
  crowd(kind: "roar" | "groan" | "ooh"): void {
    const c = this.ctx;
    const buf = this.crowdNoise();
    if (!c || !buf || c.state !== "running") return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.8;
    const g = c.createGain();
    const dur = kind === "roar" ? 2.4 : kind === "groan" ? 1.4 : 0.9;
    f.frequency.setValueAtTime(kind === "groan" ? 700 : 1100, t);
    f.frequency.linearRampToValueAtTime(kind === "groan" ? 380 : kind === "roar" ? 1500 : 900, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(kind === "roar" ? 0.9 : 0.45, t + (kind === "roar" ? 0.25 : 0.15));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  whistle(long = false): void {
    const c = this.ctx;
    if (!c || c.state !== "running") return;
    const t = c.currentTime;
    const n = long ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator();
      const g = c.createGain();
      const t0 = t + i * 0.42;
      o.type = "square";
      o.frequency.setValueAtTime(2900, t0);
      o.frequency.linearRampToValueAtTime(2700, t0 + 0.3);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i === n - 1 && long ? 0.6 : 0.3));
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + 0.7);
    }
  }
}
