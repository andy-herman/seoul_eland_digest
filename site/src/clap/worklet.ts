// AudioWorklet that runs the clap detector on the microphone, one 128-sample block at a time, and
// posts claps, shouts and levels (stamped with the audio context clock) to the page.
import { ClapDetector, type SongRef } from "./detector";

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

class ClapProcessor extends AudioWorkletProcessor {
  private det = new ClapDetector({ sampleRate, sensitivity: 0.6 });
  private lastBleed = 0;
  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const d = e.data ?? {};
      if (typeof d.sensitivity === "number") this.det.sensitivity = d.sensitivity;
      if ("ref" in d) this.det.setRef((d.ref as SongRef) ?? null);
      if (typeof d.refStart === "number") this.det.setRefStart(d.refStart);
    };
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    void outputs; // silent: the output only keeps the node in the rendering graph
    const ch = inputs[0]?.[0];
    if (ch && ch.length) {
      const ev = this.det.process(ch, currentTime);
      if (ev.length) this.port.postMessage(ev);
      if (currentTime - this.lastBleed > 1) {
        this.lastBleed = currentTime;
        this.port.postMessage({ bleed: this.det.bleed });
      }
    }
    return true;
  }
}

registerProcessor("clap-detector", ClapProcessor);
