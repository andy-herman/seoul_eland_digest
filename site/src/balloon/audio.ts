// Balloon Battle sounds: the shared soundtrack player plus synthesized
// cartoon water effects (no audio files beyond the club song).

import { GameAudio } from "../game/audio";

export class BalloonAudio extends GameAudio {
  place(): void {
    this.tone("sine", 520, 300, 0, 0.12, 0.35);
  }

  splash(): void {
    // a bright splash: filtered noise + a falling bloop
    this.burst("bandpass", 1300, 0, 0.32, 0.55, 0.005);
    this.burst("highpass", 3200, 0.02, 0.22, 0.2, 0.01);
    this.tone("sine", 420, 130, 0, 0.22, 0.4);
  }

  trapped(): void {
    this.tone("sine", 300, 700, 0, 0.18, 0.35);
    this.tone("triangle", 700, 500, 0.16, 0.3, 0.25);
  }

  enemyTrapped(): void {
    this.tone("triangle", 380, 820, 0, 0.16, 0.22);
  }

  pop(): void {
    this.tone("square", 900, 1400, 0, 0.05, 0.18);
    this.burst("highpass", 2600, 0, 0.18, 0.35, 0.002);
    this.tone("sine", 1200, 1800, 0.05, 0.12, 0.2);
  }

  playerPop(): void {
    this.burst("bandpass", 900, 0, 0.4, 0.5, 0.002);
    this.tone("sawtooth", 500, 110, 0.05, 0.6, 0.18);
  }

  item(): void {
    this.tone("triangle", 880, 880, 0, 0.08, 0.25);
    this.tone("triangle", 1320, 1320, 0.07, 0.12, 0.22);
  }

  rare(): void {
    [880, 1109, 1319, 1760].forEach((f, i) => this.tone("triangle", f, f, i * 0.06, 0.12, 0.2));
  }

  curse(): void {
    this.tone("square", 400, 200, 0, 0.15, 0.12);
    this.tone("square", 300, 150, 0.15, 0.2, 0.12);
  }

  kick(): void {
    this.tone("sine", 160, 60, 0, 0.14, 0.7);
  }

  push(): void {
    this.burst("lowpass", 500, 0, 0.16, 0.3, 0.02);
  }

  clang(): void {
    this.tone("square", 1400, 1300, 0, 0.1, 0.12);
    this.tone("triangle", 2100, 1900, 0, 0.2, 0.12);
  }

  bossHit(): void {
    this.tone("sawtooth", 260, 120, 0, 0.18, 0.2);
    this.burst("bandpass", 700, 0, 0.2, 0.35, 0.005);
  }

  bossDown(): void {
    this.burst("bandpass", 900, 0, 1.2, 0.45, 0.02);
    [523, 659, 784, 1047].forEach((f, i) => this.tone("triangle", f, f, 0.2 + i * 0.12, 0.25, 0.25));
  }

  warn(): void {
    this.tone("square", 880, 880, 0, 0.06, 0.08);
  }

  roar(): void {
    this.burst("lowpass", 420, 0, 0.6, 0.55, 0.06);
    this.tone("sawtooth", 140, 90, 0, 0.55, 0.16);
  }

  lob(): void {
    this.tone("sine", 300, 900, 0, 0.22, 0.18);
  }

  teleport(): void {
    this.tone("sine", 1500, 400, 0, 0.3, 0.14);
  }

  summon(): void {
    this.tone("triangle", 330, 660, 0, 0.2, 0.2);
    this.tone("triangle", 440, 880, 0.12, 0.2, 0.2);
  }

  breath(): void {
    this.burst("highpass", 1800, 0, 0.45, 0.22, 0.08);
  }

  dash(): void {
    this.burst("bandpass", 600, 0, 0.3, 0.35, 0.03);
  }

  needle(): void {
    this.tone("square", 1800, 2400, 0, 0.06, 0.15);
    this.burst("highpass", 3000, 0.02, 0.15, 0.3, 0.002);
  }

  shield(): void {
    this.tone("sine", 600, 1200, 0, 0.3, 0.2);
  }

  heart(): void {
    [659, 784, 988].forEach((f, i) => this.tone("sine", f, f, i * 0.08, 0.14, 0.25));
  }

  readyBeep(): void {
    this.tone("square", 660, 660, 0, 0.12, 0.12);
  }

  go(): void {
    this.tone("square", 990, 990, 0, 0.3, 0.14);
    this.tone("triangle", 1320, 1320, 0, 0.3, 0.12);
  }

  hurry(): void {
    for (let i = 0; i < 3; i++) this.tone("square", 1200, 900, i * 0.2, 0.15, 0.12);
  }

  clear(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone("triangle", f, f, i * 0.11, 0.2 + (i === 4 ? 0.4 : 0), 0.26));
  }

  over(): void {
    [523, 440, 349, 262].forEach((f, i) => this.tone("triangle", f, f * 0.98, i * 0.18, 0.24, 0.24));
  }
}
