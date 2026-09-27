import type { InputState } from "./sim";

export class H2HControls {
  input: InputState = { left: false, right: false, jump: false, kick: false, power: false };
  private kickLatch = false;
  private powerLatch = false;

  constructor(root: HTMLElement) {
    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    for (const btn of [...root.querySelectorAll<HTMLElement>("[data-h2h-btn]")]) {
      const key = btn.dataset.h2hBtn as keyof InputState;
      const down = (ev: Event) => {
        ev.preventDefault();
        this.input[key] = true;
      };
      const up = (ev: Event) => {
        ev.preventDefault();
        this.input[key] = false;
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("pointerleave", up);
    }
  }

  frame(): InputState {
    const out = { ...this.input };
    if (out.kick && this.kickLatch) out.kick = false;
    if (out.power && this.powerLatch) out.power = false;
    this.kickLatch = this.input.kick;
    this.powerLatch = this.input.power;
    return out;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (e.repeat && down) return;
    const k = e.key.toLowerCase();
    if (k === "a" || k === "arrowleft") this.input.left = down;
    else if (k === "d" || k === "arrowright") this.input.right = down;
    else if (k === "w" || k === "arrowup") this.input.jump = down;
    else if (k === "s" || k === "arrowdown" || k === " ") this.input.kick = down;
    else if (k === "f" || k === "shift") this.input.power = down;
    else return;
    e.preventDefault();
  }
}
