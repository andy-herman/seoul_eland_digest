// Mascot Kart sound: the club song as music (GameAudio), synthesised effects, and a continuous
// engine and drift-screech voice for the player's kart.
import { GameAudio } from "../game/audio";
import type { ItemKind } from "./types";

export class KartAudio extends GameAudio {
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; screech: GainNode; screechSrc: AudioBufferSourceNode } | null = null;

  engineStart(): void {
    const a = this.ready();
    if (!a || this.engine || !this.noise) return;
    const { ctx, out } = a;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = "sawtooth";
    osc2.type = "square";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(out);
    const screechSrc = ctx.createBufferSource();
    screechSrc.buffer = this.noise;
    screechSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2100;
    bp.Q.value = 3;
    const screech = ctx.createGain();
    screech.gain.value = 0;
    screechSrc.connect(bp).connect(screech).connect(out);
    osc.start();
    osc2.start();
    screechSrc.start();
    this.engine = { osc, osc2, filter, gain, screech, screechSrc };
  }

  engineUpdate(speed: number, throttle: boolean, boosting: boolean, drifting: boolean, slip: number): void {
    const e = this.engine;
    const a = this.ready();
    if (!e || !a) {
      if (e && !a) e.gain.gain.value = 0;
      return;
    }
    const t = a.ctx.currentTime;
    const v = Math.abs(speed);
    const f = 48 + v * 3.1 + (boosting ? 26 : 0);
    e.osc.frequency.setTargetAtTime(f, t, 0.05);
    e.osc2.frequency.setTargetAtTime(f * 1.505, t, 0.05);
    e.filter.frequency.setTargetAtTime(420 + v * 42 + (boosting ? 900 : 0), t, 0.08);
    e.gain.gain.setTargetAtTime(0.028 + (throttle ? 0.028 : 0) + (boosting ? 0.02 : 0), t, 0.08);
    e.screech.gain.setTargetAtTime(drifting ? 0.035 + Math.min(0.08, Math.abs(slip) * 0.12) : 0, t, 0.05);
  }

  engineStop(): void {
    const e = this.engine;
    if (!e) return;
    try {
      e.osc.stop();
      e.osc2.stop();
      e.screechSrc.stop();
    } catch {
      // already stopped
    }
    e.gain.disconnect();
    e.screech.disconnect();
    this.engine = null;
  }

  countdown(n: number): void {
    this.tone("sine", 660, 660, 0, 0.22, 0.28);
    if (n === 1) this.tone("sine", 990, 990, 0, 0.1, 0.08);
  }

  go(): void {
    this.tone("square", 1320, 1320, 0, 0.5, 0.16);
    this.tone("sine", 660, 1320, 0, 0.4, 0.2);
  }

  boost(kind: string): void {
    if (kind === "instant") {
      this.tone("triangle", 880, 1760, 0, 0.18, 0.18);
      this.burst("highpass", 3000, 0, 0.18, 0.14);
      return;
    }
    this.burst("bandpass", 900, 0, 0.7, 0.32, 0.05);
    this.tone("sawtooth", 180, 520, 0, 0.55, 0.12);
  }

  gauge(): void {
    [988, 1319].forEach((f, i) => this.tone("triangle", f, f, i * 0.06, 0.12, 0.16));
  }

  itemGet(): void {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone("square", f, f, i * 0.045, 0.08, 0.05));
  }

  itemUse(item: ItemKind): void {
    if (item === "balloon") this.tone("sine", 520, 260, 0, 0.25, 0.25);
    else if (item === "ball") this.kick();
    else if (item === "banana") this.tone("triangle", 400, 200, 0, 0.2, 0.2);
    else if (item === "roar") {
      this.tone("sawtooth", 140, 70, 0, 0.7, 0.3);
      this.burst("lowpass", 500, 0, 0.7, 0.4);
    } else if (item === "redcard") this.whistle();
    else this.tone("sine", 700, 1100, 0, 0.18, 0.18);
  }

  hit(what: string, blocked: boolean): void {
    if (blocked) {
      this.tone("triangle", 1500, 1400, 0, 0.3, 0.2);
      return;
    }
    if (what === "puddle" || what === "balloon") {
      this.burst("lowpass", 900, 0, 0.5, 0.45);
      this.tone("sine", 300, 900, 0, 0.3, 0.15);
    } else if (what === "banana" || what === "roar") this.tone("triangle", 900, 180, 0, 0.5, 0.22);
    else {
      this.tone("sine", 160, 60, 0, 0.3, 0.6);
      this.burst("lowpass", 1200, 0, 0.2, 0.4);
    }
  }

  wall(power: number): void {
    this.burst("lowpass", 380, 0, 0.14, Math.min(0.5, 0.12 + power * 0.02));
  }

  land(): void {
    this.tone("sine", 120, 60, 0, 0.14, 0.35);
  }

  lap(final: boolean): void {
    if (final) [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone("square", f, f, i * 0.09, 0.14, 0.07));
    else [784, 1175].forEach((f, i) => this.tone("triangle", f, f, i * 0.08, 0.16, 0.18));
  }

  finish(win: boolean): void {
    const notes = win ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 659];
    notes.forEach((f, i) => this.tone("triangle", f, f, i * 0.1, 0.22, 0.2));
  }

  click(): void {
    this.tone("sine", 1200, 900, 0, 0.05, 0.12);
  }
}
