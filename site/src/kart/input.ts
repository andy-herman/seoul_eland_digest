// Mascot Kart controls. Keyboard like KartRider on PC: arrows or WASD drive, Shift or Space drifts,
// Ctrl, E or X fires the item (a stored booster in speed mode). Touch like KartRider Rush+: left and
// right on the left thumb, DRIFT and ITEM on the right, BRAKE small; the kart accelerates by itself,
// and holding ITEM through GO gives the start boost. A standard gamepad works too.
import type { Inputs } from "./types";

type Btn = "left" | "right" | "drift" | "item" | "brake";

const KEYS: Record<string, "up" | "down" | "left" | "right" | "drift" | "item"> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ShiftLeft: "drift",
  ShiftRight: "drift",
  Space: "drift",
  ControlLeft: "item",
  ControlRight: "item",
  KeyE: "item",
  KeyX: "item",
  KeyJ: "item",
};

export class KartControls {
  enabled = false;
  touchMode = false;
  countdown = true; // before GO the touch ITEM button revs for the start boost
  private keys = new Set<string>();
  private touch: Record<Btn, boolean> = { left: false, right: false, drift: false, item: false, brake: false };
  private pads: Record<Btn, Set<number>> = { left: new Set(), right: new Set(), drift: new Set(), item: new Set(), brake: new Set() };
  onPause: (() => void) | null = null;
  private padStart = false;

  constructor(root: HTMLElement) {
    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => this.reset());
    for (const btn of root.querySelectorAll<HTMLElement>("[data-kart-btn]")) {
      const b = btn.dataset.kartBtn as Btn;
      const down = (ev: PointerEvent) => {
        ev.preventDefault();
        btn.setPointerCapture?.(ev.pointerId);
        this.pads[b].add(ev.pointerId);
        this.touch[b] = true;
        btn.dataset.down = "true";
        this.touchMode = true;
      };
      const up = (ev: PointerEvent) => {
        this.pads[b].delete(ev.pointerId);
        if (this.pads[b].size === 0) {
          this.touch[b] = false;
          btn.dataset.down = "false";
        }
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("lostpointercapture", up);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }

  reset(): void {
    this.keys.clear();
    for (const b of Object.keys(this.touch) as Btn[]) {
      this.touch[b] = false;
      this.pads[b].clear();
    }
  }

  frame(): Inputs {
    const k = (name: string) => [...this.keys].some((c) => KEYS[c] === name);
    const out: Inputs = {
      steer: (k("right") || this.touch.right ? 1 : 0) - (k("left") || this.touch.left ? 1 : 0),
      throttle: k("up"),
      brake: k("down") || this.touch.brake,
      drift: k("drift") || this.touch.drift,
      item: k("item") || this.touch.item,
    };
    if (this.touchMode) {
      // auto-accelerate; before GO the ITEM button revs the engine for the start boost
      if (this.countdown) {
        out.throttle = out.throttle || this.touch.item;
        out.item = false;
      } else out.throttle = !out.brake;
    }
    this.gamepad(out);
    return out;
  }

  private gamepad(out: Inputs): void {
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);
    if (!pad) return;
    const press = (i: number) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.35;
    const ax = pad.axes[0] ?? 0;
    if (Math.abs(ax) > 0.15) out.steer = Math.max(-1, Math.min(1, (ax - Math.sign(ax) * 0.15) / 0.85));
    else if (press(14) || press(15)) out.steer = (press(15) ? 1 : 0) - (press(14) ? 1 : 0);
    out.throttle ||= press(0) || press(7);
    out.brake ||= press(1) || press(6);
    out.drift ||= press(2) || press(5);
    out.item ||= press(3) || press(4);
    const start = press(9);
    if (start && !this.padStart) this.onPause?.();
    this.padStart = start;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (e.code === "Escape" || e.code === "KeyP") {
      if (down && this.enabled) this.onPause?.();
      return;
    }
    if (!this.enabled) return;
    const action = KEYS[e.code];
    if (!action) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    e.preventDefault();
    this.touchMode = false;
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
  }
}
