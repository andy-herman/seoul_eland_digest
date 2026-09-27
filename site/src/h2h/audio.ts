import { GameAudio } from "../game/audio";

export class H2HAudio extends GameAudio {
  boot(): void {
    this.tone("sine", 180, 70, 0, 0.14, 0.55);
    this.burst("lowpass", 1100, 0, 0.08, 0.35);
  }
  powerShot(): void {
    this.tone("sawtooth", 180, 620, 0, 0.28, 0.2);
    this.burst("bandpass", 900, 0, 0.42, 0.32);
  }
  pickup(): void {
    [659, 988, 1319].forEach((f, i) => this.tone("triangle", f, f, i * 0.055, 0.12, 0.17));
  }
}
