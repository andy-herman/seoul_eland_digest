// Balloon Battle controls: keyboard (last pressed direction wins, the other
// held one helps round corners), a floating touch joystick with two buttons,
// and gamepads.

import type { Dir } from "./data";
import type { InputState } from "./sim";

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};
const BOMB_KEYS = new Set(["Space"]);
const ITEM_KEYS = new Set(["KeyX", "KeyZ", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "KeyE"]);

export interface ControlHandlers {
  pause(): void;
  mute(): void;
  isPlaying(): boolean;
}

export class Controls {
  private held: Dir[] = [];
  private joy: Dir | null = null;
  private joyAlt: Dir | null = null;
  private bomb = false;
  private item = false;
  private padPrev: boolean[] = [];
  touchSeen = false;

  constructor(private readonly handlers: ControlHandlers) {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
    window.addEventListener("blur", () => this.reset());
  }

  reset(): void {
    this.held = [];
    this.joy = null;
    this.joyAlt = null;
    this.bomb = false;
    this.item = false;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    const playing = this.handlers.isPlaying();
    if (down && (code === "KeyP" || code === "Escape")) {
      if (playing || code === "KeyP") this.handlers.pause();
      return;
    }
    if (down && code === "KeyM" && !e.metaKey && !e.ctrlKey) {
      this.handlers.mute();
      return;
    }
    if (!playing) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    const dir = KEY_DIR[code];
    if (dir) {
      e.preventDefault();
      this.held = this.held.filter((d) => d !== dir);
      if (down) this.held.push(dir);
      return;
    }
    if (BOMB_KEYS.has(code)) {
      e.preventDefault();
      if (down && !e.repeat) this.bomb = true;
      return;
    }
    if (ITEM_KEYS.has(code)) {
      if (down && !e.repeat) this.item = true;
    }
  }

  /** Floating joystick: touch anywhere in the zone, drag to steer. */
  attachJoystick(zone: HTMLElement, base: HTMLElement, knob: HTMLElement): void {
    let id: number | null = null;
    let ox = 0;
    let oy = 0;
    const radius = () => Math.max(28, base.offsetWidth * 0.42);
    const place = (x: number, y: number) => {
      const r = zone.getBoundingClientRect();
      base.style.left = `${x - r.left}px`;
      base.style.top = `${y - r.top}px`;
    };
    const update = (x: number, y: number) => {
      const dx = x - ox;
      const dy = y - oy;
      const dist = Math.hypot(dx, dy);
      const max = radius();
      const k = dist > max ? max / dist : 1;
      knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
      if (dist < 10) {
        this.joy = null;
        this.joyAlt = null;
        return;
      }
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const horiz: Dir = dx > 0 ? "right" : "left";
      const vert: Dir = dy > 0 ? "down" : "up";
      // hysteresis: keep the current axis until the other one clearly wins
      const cur = this.joy;
      const curHoriz = cur === "left" || cur === "right";
      let main: Dir;
      if (cur && curHoriz && ax * 1.25 >= ay) main = horiz;
      else if (cur && !curHoriz && ay * 1.25 >= ax) main = vert;
      else main = ax >= ay ? horiz : vert;
      this.joy = main;
      const minor = main === horiz ? ay : ax;
      this.joyAlt = minor > 14 ? (main === horiz ? vert : horiz) : null;
    };
    zone.addEventListener("pointerdown", (e) => {
      if (id !== null) return;
      this.touchSeen = true;
      id = e.pointerId;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        // synthetic or already-released pointers cannot be captured
      }
      ox = e.clientX;
      oy = e.clientY;
      place(ox, oy);
      base.dataset.active = "true";
      update(ox, oy);
      e.preventDefault();
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      update(e.clientX, e.clientY);
      e.preventDefault();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      this.joy = null;
      this.joyAlt = null;
      knob.style.transform = "translate(-50%, -50%)";
      base.dataset.active = "false";
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
  }

  attachButton(el: HTMLElement, kind: "bomb" | "item"): void {
    el.addEventListener("pointerdown", (e) => {
      this.touchSeen = true;
      if (kind === "bomb") this.bomb = true;
      else this.item = true;
      el.dataset.pressed = "true";
      e.preventDefault();
    });
    const up = () => (el.dataset.pressed = "false");
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private pollPad(): { dir: Dir | null; bomb: boolean; item: boolean; start: boolean } {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const b = pad.buttons.map((x) => x.pressed);
      const edge = (i: number) => !!b[i] && !this.padPrev[i];
      let dir: Dir | null = null;
      if (b[12]) dir = "up";
      else if (b[13]) dir = "down";
      else if (b[14]) dir = "left";
      else if (b[15]) dir = "right";
      else {
        const [x = 0, y = 0] = pad.axes;
        if (Math.abs(x) > 0.45 || Math.abs(y) > 0.45) dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
      }
      const res = { dir, bomb: edge(0), item: edge(1) || edge(2), start: edge(9) };
      this.padPrev = b;
      return res;
    }
    return { dir: null, bomb: false, item: false, start: false };
  }

  /** Read and clear this frame's input. */
  poll(into: InputState): void {
    const pad = this.pollPad();
    if (pad.start) this.handlers.pause();
    const key = this.held[this.held.length - 1] ?? null;
    const keyAlt = this.held.length > 1 ? this.held[this.held.length - 2] : null;
    into.dir = this.joy ?? key ?? pad.dir;
    into.alt = this.joy ? this.joyAlt : keyAlt;
    if (this.bomb || pad.bomb) into.bomb = true;
    if (this.item || pad.item) into.item = true;
    this.bomb = false;
    this.item = false;
  }
}
