export class YutAudio {
  private ctx: AudioContext | null = null;
  private enabled = true;
  unlock(): void { if (!this.ctx) this.ctx = new AudioContext(); void this.ctx.resume(); }
  hit(power = 1): void {
    if (!this.enabled) return; this.unlock(); const ctx = this.ctx!; const t = ctx.currentTime;
    const osc = ctx.createOscillator(); const gain = ctx.createGain(); const filt = ctx.createBiquadFilter();
    osc.type = "triangle"; osc.frequency.setValueAtTime(170 + power * 80, t); filt.type = "bandpass"; filt.frequency.value = 950; gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.18 * power, t + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(filt).connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t + 0.13);
  }
  cheer(): void {
    if (!this.enabled) return; this.unlock(); const ctx = this.ctx!; const t = ctx.currentTime; const gain = ctx.createGain(); gain.gain.value = 0.12; gain.connect(ctx.destination);
    for (let i = 0; i < 9; i++) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 300 + i * 37; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + i * 0.018); g.gain.exponentialRampToValueAtTime(0.045, t + 0.04 + i * 0.018); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4 + i * 0.018); o.connect(g).connect(gain); o.start(t + i * 0.018); o.stop(t + 0.5 + i * 0.018); }
  }
}
