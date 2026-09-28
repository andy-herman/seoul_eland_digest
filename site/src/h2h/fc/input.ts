// FC match controls: keyboard (WASD + J K L I, or arrows + Z X C V), a standard gamepad and a
// floating touch joystick with four action buttons. Buttons are reported as held states; the
// engine detects presses and releases itself, so very short taps are held for a few frames.
// On touch there is no sprint button: pushing the stick to its rim sprints (like FC Mobile's auto sprint).
import type { FcInput } from "./types";

type Action = "pass" | "shoot" | "lob" | "through" | "sprint";

const MIN_HOLD_MS = 70;
const STICK_R = 52; // CSS px from the base centre to full tilt
const SPRINT_ON = 0.8; // share of full tilt that starts an auto sprint
const SPRINT_OFF = 0.72; // and the share that ends it, so it does not flicker at the edge

const KEYS: Record<string, Action | "up" | "down" | "left" | "right"> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyJ: "pass",
  KeyZ: "pass",
  KeyK: "shoot",
  KeyX: "shoot",
  Space: "shoot",
  KeyL: "lob",
  KeyC: "lob",
  KeyI: "through",
  KeyV: "through",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
};

export class FcControls {
  enabled = false;
  private keys = new Set<string>();
  private touch: Record<Action, boolean> = { pass: false, shoot: false, lob: false, through: false, sprint: false };
  private downAt: Record<Action, number> = { pass: 0, shoot: 0, lob: 0, through: 0, sprint: 0 };
  private releaseAt: Record<Action, number> = { pass: 0, shoot: 0, lob: 0, through: 0, sprint: 0 };
  private stick = { x: 0, z: 0, id: -1, ox: 0, oy: 0, sprint: false };
  private padStart = false;
  private labels = new Map<Action, HTMLElement>();
  private labelText = new Map<Action, string>();
  onPause: (() => void) | null = null;

  constructor(root: HTMLElement) {
    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => this.reset());
    for (const btn of root.querySelectorAll<HTMLElement>("[data-fc-btn]")) {
      const action = btn.dataset.fcBtn as Action;
      const label = btn.querySelector<HTMLElement>("[data-fc-label]");
      if (label) this.labels.set(action, label);
      const down = (ev: PointerEvent) => {
        ev.preventDefault();
        btn.setPointerCapture?.(ev.pointerId);
        this.touch[action] = true;
        this.downAt[action] = performance.now();
        this.releaseAt[action] = 0;
        btn.dataset.down = "true";
      };
      const up = (ev: PointerEvent) => {
        ev.preventDefault();
        if (!this.touch[action]) return;
        this.releaseAt[action] = Math.max(performance.now(), this.downAt[action] + MIN_HOLD_MS);
        btn.dataset.down = "false";
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("lostpointercapture", up);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    const zone = root.querySelector<HTMLElement>("[data-fc-stick]");
    const base = root.querySelector<HTMLElement>("[data-fc-base]");
    const knob = root.querySelector<HTMLElement>("[data-fc-knob]");
    if (zone && base && knob) {
      const place = (x: number, y: number) => {
        const r = zone.getBoundingClientRect();
        base.style.left = `${x - r.left}px`;
        base.style.top = `${y - r.top}px`;
      };
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== this.stick.id) return;
        ev.preventDefault();
        let dx = ev.clientX - this.stick.ox;
        let dy = ev.clientY - this.stick.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_R) {
          dx *= STICK_R / d;
          dy *= STICK_R / d;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        const m = Math.min(1, d / STICK_R);
        const sprint = m >= (this.stick.sprint ? SPRINT_OFF : SPRINT_ON);
        if (sprint !== this.stick.sprint) {
          this.stick.sprint = sprint;
          zone.dataset.sprint = String(sprint);
        }
        // full length while sprinting, so the rim gives top speed; otherwise a dead zone, then analogue
        const k = sprint ? 1 / Math.max(1e-6, m) : m < 0.14 ? 0 : (m - 0.14) / 0.86 / Math.max(1e-6, m);
        this.stick.x = (dx / STICK_R) * k;
        this.stick.z = (-dy / STICK_R) * k;
      };
      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== this.stick.id) return;
        this.stick = { x: 0, z: 0, id: -1, ox: 0, oy: 0, sprint: false };
        knob.style.transform = "";
        zone.dataset.active = "false";
        zone.dataset.sprint = "false";
        base.style.left = "";
        base.style.top = "";
      };
      zone.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        if (this.stick.id !== -1) return;
        zone.setPointerCapture?.(ev.pointerId);
        this.stick.id = ev.pointerId;
        this.stick.ox = ev.clientX;
        this.stick.oy = ev.clientY;
        zone.dataset.active = "true";
        place(ev.clientX, ev.clientY);
      });
      zone.addEventListener("pointermove", move);
      zone.addEventListener("pointerup", end);
      zone.addEventListener("pointercancel", end);
      zone.addEventListener("lostpointercapture", end);
    }
  }

  reset(): void {
    this.keys.clear();
    for (const a of Object.keys(this.touch) as Action[]) {
      this.touch[a] = false;
      this.releaseAt[a] = 0;
    }
  }

  // Context labels for the four touch buttons; only touches the DOM when a label changes.
  setLabels(next: Record<Exclude<Action, "sprint">, string>): void {
    for (const [action, text] of Object.entries(next) as [Action, string][]) {
      if (this.labelText.get(action) === text) continue;
      this.labelText.set(action, text);
      const el = this.labels.get(action);
      if (el) {
        el.textContent = text;
        const btn = el.closest<HTMLElement>("[data-fc-btn]");
        if (btn) btn.dataset.off = String(text === "-");
      }
    }
  }

  frame(): FcInput {
    const now = performance.now();
    for (const a of Object.keys(this.touch) as Action[]) {
      if (this.touch[a] && this.releaseAt[a] && now >= this.releaseAt[a]) {
        this.touch[a] = false;
        this.releaseAt[a] = 0;
      }
    }
    const k = (name: string) => [...this.keys].some((code) => KEYS[code] === name);
    let mx = (k("right") ? 1 : 0) - (k("left") ? 1 : 0);
    let mz = (k("up") ? 1 : 0) - (k("down") ? 1 : 0);
    const kl = Math.hypot(mx, mz);
    if (kl > 1) {
      mx /= kl;
      mz /= kl;
    }
    const input: FcInput = {
      mx,
      mz,
      sprint: k("sprint") || this.touch.sprint,
      pass: k("pass") || this.touch.pass,
      shoot: k("shoot") || this.touch.shoot,
      lob: k("lob") || this.touch.lob,
      through: k("through") || this.touch.through,
    };
    if (this.stick.id !== -1) {
      input.mx = this.stick.x;
      input.mz = this.stick.z;
      input.sprint ||= this.stick.sprint;
    }
    this.gamepad(input);
    return input;
  }

  private gamepad(input: FcInput): void {
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);
    if (!pad) return;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const m = Math.hypot(ax, ay);
    const pressed = (i: number) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.35;
    if (m > 0.18) {
      const k = Math.min(1, (m - 0.18) / 0.82) / m;
      input.mx = ax * k;
      input.mz = -ay * k;
    } else if (pressed(12) || pressed(13) || pressed(14) || pressed(15)) {
      input.mx = (pressed(15) ? 1 : 0) - (pressed(14) ? 1 : 0);
      input.mz = (pressed(12) ? 1 : 0) - (pressed(13) ? 1 : 0);
    }
    input.pass ||= pressed(0);
    input.shoot ||= pressed(1);
    input.lob ||= pressed(2);
    input.through ||= pressed(3);
    input.sprint ||= pressed(7) || pressed(5);
    const start = pressed(9);
    if (start && !this.padStart) this.onPause?.();
    this.padStart = start;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (!this.enabled) return;
    const action = KEYS[e.code];
    if (!action) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    e.preventDefault();
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
  }
}
