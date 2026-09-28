import { GameAudio } from "../game/audio";

export class YutAudio extends GameAudio {
  clack(power = 1): void {
    this.tone("triangle", 210 + power * 120, 95, 0, 0.13, 0.34 * power);
    this.burst("bandpass", 1050, 0, 0.11, 0.22 * power);
  }

  tackle(): void {
    this.kick();
    this.tone("sawtooth", 180, 70, 0.03, 0.18, 0.22);
  }

  stack(): void {
    [520, 660, 880].forEach((f, i) => this.tone("triangle", f, f * 1.02, i * 0.055, 0.13, 0.12));
  }

  shortcut(): void {
    [740, 980].forEach((f, i) => this.tone("sine", f, f * 1.04, i * 0.08, 0.18, 0.13));
  }

  throwAgain(): void {
    this.save();
  }
}
