// Mascot Kart race simulation: DOM-free, deterministic for a seed, fixed 60 Hz steps.
// KartRider-style driving: drift to fill the booster gauge (speed mode), fire stored boosters,
// instant boost on a clean drift exit or a throttle re-tap, slipstream draft, start boost at GO,
// boost pads, jumps off crests, walls and bumps. Item mode swaps the gauge for item boxes.
import { AI_TIERS, Brain } from "./ai";
import { angleDiff, buildTrack, frame, gridSlot, groundY, headingAt, nearestLocal, pointAt, wrap, type Track } from "./track";
import {
  GRAVITY,
  ITEM_KINDS,
  ITEM_SLOTS,
  KART_R,
  KART_STEP,
  PHYS,
  type Inputs,
  type ItemBox,
  type ItemKind,
  type Kart,
  type Pad,
  type Projectile,
  type RaceEvent,
  type RaceOptions,
  type RaceState,
} from "./types";

export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const NO_INPUT: Inputs = Object.freeze({ steer: 0, throttle: false, brake: false, drift: false, item: false }) as Inputs;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const BOOSTS: Record<Exclude<Kart["boostKind"], "">, [number, number]> = {
  nitro: [PHYS.boostTime, PHYS.boostGain],
  instant: [PHYS.instantTime, PHYS.instantGain],
  draft: [PHYS.draftTime, PHYS.draftGain],
  start: [PHYS.startTime, PHYS.startGain],
  pad: [1.0, 0.28],
  item: [2.2, 0.36],
  magnet: [0.3, 0.14],
};

// Item odds by race position: weights for booster, ball, balloon, banana, gloves, magnet, redcard, roar.
const ODDS_FRONT = [5, 18, 16, 34, 22, 0, 0, 5];
const ODDS_MID = [18, 22, 18, 12, 10, 12, 2, 6];
const ODDS_BACK = [28, 14, 8, 2, 4, 24, 12, 8];

export const STATUS_TIME = { spin: 1.1, roar: 0.9, tumble: 1.3, redcard: 1.8, trapped: 2.4 };

export class Race {
  readonly track: Track;
  readonly opts: RaceOptions;
  readonly state: RaceState;
  readonly laps: number;
  readonly humanIndex: number;
  private events: RaceEvent[] = [];
  private readonly rand: () => number;
  private readonly brains: Brain[];
  private readonly padCd: number[];
  private readonly sPrev: number[];
  private pid = 1;
  private lastCount = 4;
  private lastPress: number[];
  private finishCount = 0;

  constructor(opts: RaceOptions, track?: Track) {
    this.opts = opts;
    this.track = track ?? buildTrack(opts.track);
    this.laps = opts.laps ?? this.track.laps;
    this.rand = rng(opts.seed);
    const tier = AI_TIERS[opts.difficulty];
    this.humanIndex = opts.racers.findIndex((r) => r.human);
    const karts = opts.racers.map((r, i) => this.makeKart(r.id, i, r.human));
    this.brains = opts.racers.map((r, i) => new Brain(i, tier, r.skill ?? 0, rng(opts.seed * 31 + i * 977 + 7), r.style ?? "clean"));
    this.padCd = karts.map(() => 0);
    this.lastPress = karts.map(() => -99);
    this.sPrev = karts.map((k) => this.track.samples[k.si].s);
    const boxes: ItemBox[] = [];
    if (opts.mode === "item" && !opts.timeTrial) {
      for (const f of opts.track.items ?? []) {
        const i = wrap(Math.round(f * this.track.n), this.track.n);
        const hw = this.track.samples[i].hw;
        const count = hw >= 8 ? 5 : 4;
        for (let c = 0; c < count; c++) {
          const p = pointAt(this.track, i, (c - (count - 1) / 2) * 3.3);
          boxes.push({ x: p.x, z: p.z, y: p.y, si: i, respawnT: 0 });
        }
      }
    }
    const pads: Pad[] = (opts.track.pads ?? []).map(([f, off]) => {
      const i = wrap(Math.round(f * this.track.n), this.track.n);
      const p = pointAt(this.track, i, off);
      return { x: p.x, z: p.z, y: p.y, si: i, theta: headingAt(this.track, i) };
    });
    this.state = {
      time: -(opts.countdown ?? 3.6),
      phase: "countdown",
      karts,
      projectiles: [],
      boxes,
      pads,
      winnerTime: Infinity,
      order: karts.map((k) => k.index),
      retireAt: Infinity,
    };
    this.rank();
  }

  private makeKart(id: string, index: number, human: boolean): Kart {
    const tr = this.track;
    const slot = gridSlot(tr, index);
    const p = pointAt(tr, slot.i, slot.lat);
    const theta = headingAt(tr, slot.i);
    return {
      id,
      index,
      human,
      x: p.x,
      z: p.z,
      y: p.y,
      vx: 0,
      vz: 0,
      vy: 0,
      theta,
      phi: theta,
      yawRate: 0,
      grounded: true,
      airT: 0,
      si: slot.i,
      lat: slot.lat,
      dist: -wrap(tr.startIndex - slot.i, tr.n) * tr.ds,
      lap: 0,
      finished: false,
      finishTime: Infinity,
      lapTimes: [],
      lapStart: 0,
      rank: index + 1,
      wrongWayT: 0,
      offroad: false,
      speed: 0,
      steerSmooth: 0,
      drifting: false,
      driftDir: 0,
      driftT: 0,
      driftEndT: 9,
      lastDriftLen: 0,
      slip: 0,
      gauge: 0,
      boosters: 0,
      boostT: 0,
      boostGain: 0,
      boostKind: "",
      draftT: 0,
      draftTarget: -1,
      bonkT: 0,
      items: [],
      rouletteT: 0,
      status: "none",
      statusT: 0,
      spinAngle: 0,
      shieldT: 0,
      graceT: 0,
      magnetT: 0,
      magnetTarget: -1,
      prevThrottle: false,
      prevDrift: false,
      prevItem: false,
      startPressT: -99,
      respawnT: 0,
      stuckT: 0,
      lastProgress: -1e9,
      hits: 0,
      itemsUsed: 0,
    };
  }

  drainEvents(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(e: RaceEvent): void {
    this.events.push(e);
  }

  get human(): Kart | null {
    return this.humanIndex >= 0 ? this.state.karts[this.humanIndex] : null;
  }

  // Inputs for AI karts, and for the player's kart after the finish (autopilot).
  private inputsFor(k: Kart, humanInput: Inputs | null): Inputs {
    if (k.human && !k.finished) return humanInput ?? NO_INPUT;
    return this.brains[k.index].think(k, this.state, this.track, this.opts.mode);
  }

  step(humanInput: Inputs | null = null): void {
    const st = this.state;
    const dt = KART_STEP;
    if (st.phase === "done") return;
    st.time += dt;
    if (st.phase === "countdown") {
      const c = Math.ceil(-st.time);
      if (c < this.lastCount && c >= 1 && c <= 3) {
        this.lastCount = c;
        this.emit({ type: "countdown", n: c });
      }
      for (const k of st.karts) {
        const inp = this.inputsFor(k, humanInput);
        if (inp.throttle && !k.prevThrottle) this.lastPress[k.index] = st.time;
        k.prevThrottle = inp.throttle;
        k.startPressT = this.lastPress[k.index];
      }
      if (st.time >= 0) {
        st.phase = "race";
        this.emit({ type: "go" });
        for (const k of st.karts) {
          if (k.prevThrottle && -k.startPressT <= PHYS.startWindow && k.startPressT <= 0) this.boost(k, "start");
        }
      }
      return;
    }
    const human = this.human;
    for (const k of st.karts) {
      const inp = this.inputsFor(k, humanInput);
      const mul = k.human && !k.finished ? 1 : k.finished ? 0.62 : this.brains[k.index].topSpeedMul(k, human);
      this.drive(k, inp, mul);
      this.constrain(k);
    }
    this.collide();
    this.draft();
    this.pickups();
    this.projectiles();
    for (const k of st.karts) this.progress(k, humanInput);
    this.rank();
    if (st.karts.every((k) => k.finished) || st.time > st.retireAt) {
      for (const k of st.karts) {
        if (!k.finished) {
          k.finished = true;
          k.finishTime = Infinity;
        }
      }
      this.rank();
      st.phase = "done";
    }
  }

  // ---------------------------------------------------------------- driving

  private drive(k: Kart, inp: Inputs, topMul: number): void {
    const dt = KART_STEP;
    const tr = this.track;
    const speedMode = this.opts.mode === "speed";
    k.boostT = Math.max(0, k.boostT - dt);
    if (k.boostT <= 0) k.boostKind = "";
    k.bonkT = Math.max(0, k.bonkT - dt);
    k.graceT = Math.max(0, k.graceT - dt);
    k.shieldT = Math.max(0, k.shieldT - dt);
    k.rouletteT = Math.max(0, k.rouletteT - dt);
    this.padCd[k.index] = Math.max(0, this.padCd[k.index] - dt);
    if (k.status !== "none") {
      k.statusT -= dt;
      k.spinAngle += dt * (k.status === "trapped" ? 1.5 : 12);
      if (k.status === "trapped" && inp.drift && !k.prevDrift) k.statusT -= 0.12; // wiggle free faster
      if (k.statusT <= 0) {
        k.status = "none";
        k.spinAngle = 0;
        k.graceT = 0.8;
      }
    }
    const control = k.status === "none";
    const thrPress = inp.throttle && !k.prevThrottle;
    const itemPress = inp.item && !k.prevItem;
    if (itemPress && control && !k.finished) {
      if (speedMode) {
        if (k.boosters > 0) {
          k.boosters--;
          this.boost(k, "nitro");
          this.emit({ type: "gauge", kart: k.index, boosters: k.boosters });
        }
      } else this.useItem(k);
    }
    k.steerSmooth += (inp.steer - k.steerSmooth) * Math.min(1, dt * 11);
    let steer = control ? clamp(k.steerSmooth, -1, 1) : 0;
    // magnet: pulled toward the kart ahead
    if (k.magnetT > 0) {
      k.magnetT -= dt;
      const t = this.state.karts[k.magnetTarget];
      if (!t || t.finished || k.dist > t.dist + 2) k.magnetT = 0;
      else {
        const err = angleDiff(Math.atan2(t.z - k.z, t.x - k.x), k.theta);
        steer = clamp(steer * 0.4 + err * 2.2, -1, 1);
        if (k.boostT < 0.1) this.boost(k, "magnet");
      }
    }
    let top = PHYS.topSpeed * topMul;
    if (k.boostT > 0) top *= 1 + k.boostGain;
    if (k.offroad) top *= k.boostT > 0 ? PHYS.offroadBoost : PHYS.offroad;
    if (!control) {
      const damp = k.status === "trapped" ? 6 : k.status === "tumble" ? 3.2 : 2.2;
      k.speed *= Math.exp(-damp * dt);
    } else if (inp.brake && k.speed > 0.5) {
      k.speed = Math.max(0, k.speed - PHYS.brake * dt);
    } else if (inp.brake) {
      k.speed = Math.max(-PHYS.reverseSpeed, k.speed - 10 * dt);
    } else if (inp.throttle && k.bonkT <= 0) {
      if (k.speed < 0) k.speed += 20 * dt;
      else if (k.speed < top) k.speed = Math.min(top, k.speed + (PHYS.accel * (1 - k.speed / top) + (k.boostT > 0 ? 16 : 0)) * dt);
      else k.speed -= (k.speed - top) * 1.6 * dt;
    } else {
      k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), PHYS.coast * dt);
      if (k.speed > top) k.speed -= (k.speed - top) * 1.6 * dt;
    }
    // drift
    if (!k.drifting && control && k.grounded && inp.drift && Math.abs(steer) > 0.25 && k.speed > PHYS.driftMinSpeed) {
      k.drifting = true;
      k.driftDir = steer > 0 ? 1 : -1;
      k.driftT = 0;
      k.yawRate += k.driftDir * 0.9;
      this.emit({ type: "drift", kart: k.index, on: true });
    }
    if (k.drifting) {
      k.driftT += dt;
      if (!inp.drift || !control || k.speed < PHYS.driftMinSpeed * 0.7 || (!k.grounded && k.airT > 0.6)) this.endDrift(k);
      else k.speed *= 1 - PHYS.driftLoss * dt;
    }
    const v = Math.abs(k.speed);
    let yawTarget: number;
    if (k.drifting) yawTarget = k.driftDir * PHYS.driftTurn * (0.55 + 0.45 * steer * k.driftDir); // counter-steer holds the angle
    else {
      const turn = lerp(PHYS.turnLow, PHYS.turnHigh, clamp(v / PHYS.topSpeed, 0, 1)) * Math.max(clamp(v / PHYS.turnMinSpeed, 0, 1), inp.throttle || inp.brake ? 0.55 : 0);
      yawTarget = steer * turn * (k.speed >= 0 ? 1 : -1);
    }
    if (!k.grounded) yawTarget *= PHYS.airTurn;
    if (!control) yawTarget = 0;
    k.yawRate += (yawTarget - k.yawRate) * Math.min(1, dt * (k.drifting ? 7 : 11));
    k.theta += k.yawRate * dt;
    // travel heading follows the body: fast with grip, slowly while drifting
    const recover = k.driftEndT < 0.25 ? 0.45 + 2.2 * k.driftEndT : 1;
    const g = k.drifting ? PHYS.driftGrip : k.grounded ? PHYS.grip * recover : 0.4;
    let slip = angleDiff(k.theta, k.phi) * Math.exp(-g * dt);
    if (Math.abs(slip) > PHYS.maxSlip) slip = Math.sign(slip) * PHYS.maxSlip;
    k.phi = k.theta - slip;
    k.slip = slip;
    if (k.drifting && speedMode) {
      const q = clamp(Math.abs(slip) / PHYS.maxSlip, 0, 1);
      if (q > 0.25) k.gauge += PHYS.gaugeRate * dt * (0.55 + 0.45 * q) * clamp(v / PHYS.topSpeed, 0.3, 1.1);
      if (k.gauge >= 1) {
        if (k.boosters < PHYS.maxBoosters) {
          k.boosters++;
          k.gauge -= 1;
          this.emit({ type: "gauge", kart: k.index, boosters: k.boosters });
        } else k.gauge = 1;
      }
    }
    k.driftEndT += dt;
    if (!k.drifting && thrPress && control && k.driftEndT < PHYS.instantWindow && k.lastDriftLen >= PHYS.instantMinDrift) {
      k.lastDriftLen = 0;
      this.boost(k, "instant");
    }
    k.vx = Math.cos(k.phi) * k.speed;
    k.vz = Math.sin(k.phi) * k.speed;
    k.x += k.vx * dt;
    k.z += k.vz * dt;
    k.prevThrottle = inp.throttle;
    k.prevDrift = inp.drift;
    k.prevItem = inp.item;
    void tr;
  }

  private endDrift(k: Kart): void {
    k.drifting = false;
    k.lastDriftLen = k.driftT;
    k.driftEndT = 0;
    this.emit({ type: "drift", kart: k.index, on: false });
    // clean exit: the kart was straightened before letting go
    if (k.driftT >= PHYS.instantMinDrift && Math.abs(k.slip) < 0.45 && k.status === "none") {
      k.lastDriftLen = 0;
      this.boost(k, "instant");
    }
  }

  private boost(k: Kart, kind: Exclude<Kart["boostKind"], "">): void {
    const [t, gain] = BOOSTS[kind];
    k.boostGain = k.boostT > 0 ? Math.max(k.boostGain, gain) : gain;
    k.boostT = Math.max(k.boostT, t);
    if (kind !== "magnet") {
      k.boostKind = kind;
      k.speed = Math.max(k.speed, 0) + 1.5;
      this.emit({ type: "boost", kart: k.index, kind });
    } else if (!k.boostKind) k.boostKind = "magnet";
  }

  // Rebuild speed and travel heading from the world velocity after a collision.
  private rebuild(k: Kart): void {
    const sp = Math.hypot(k.vx, k.vz);
    if (sp < 0.3) {
      k.speed = 0;
      k.phi = k.theta;
      return;
    }
    const fwd = k.vx * Math.cos(k.theta) + k.vz * Math.sin(k.theta);
    k.speed = fwd >= 0 ? sp : -sp;
    k.phi = fwd >= 0 ? Math.atan2(k.vz, k.vx) : Math.atan2(-k.vz, -k.vx);
    const d = angleDiff(k.theta, k.phi);
    if (Math.abs(d) > PHYS.maxSlip) k.theta = k.phi + Math.sign(d) * PHYS.maxSlip;
    k.slip = angleDiff(k.theta, k.phi);
  }

  // Walls, off-road, ground and air.
  private constrain(k: Kart): void {
    const tr = this.track;
    const dt = KART_STEP;
    k.si = nearestLocal(tr, k.x, k.z, k.si, 8);
    let f = frame(tr, k.si, k.x, k.z);
    const s = tr.samples[k.si];
    const limit = s.hw + s.verge - KART_R;
    if (Math.abs(f.lat) > limit) {
      const side = Math.sign(f.lat);
      const nx = -s.tz * side;
      const nz = s.tx * side;
      const over = Math.abs(f.lat) - limit;
      k.x -= nx * over;
      k.z -= nz * over;
      const vn = k.vx * nx + k.vz * nz;
      if (vn > 0) {
        k.vx -= (1 + PHYS.wallBounce) * vn * nx;
        k.vz -= (1 + PHYS.wallBounce) * vn * nz;
        const scrape = Math.min(0.3, vn * 0.018);
        k.vx *= 1 - scrape;
        k.vz *= 1 - scrape;
        this.rebuild(k);
        // glance off: turn the body toward the wall's direction so karts slide along instead of pinning
        const along = Math.atan2(s.tz, s.tx);
        const off = angleDiff(along, k.theta);
        if (Math.abs(off) < 2.2) {
          const turn = Math.max(-0.35, Math.min(0.35, off)) * Math.max(0.3, Math.min(1, vn / 10));
          k.theta += turn;
          k.phi += turn;
        }
        if (vn > 5) {
          k.bonkT = 0.16;
          this.emit({ type: "wall", kart: k.index, power: vn });
          if (k.drifting && vn > 9) {
            k.gauge = Math.max(0, k.gauge - PHYS.wallGaugeLoss);
            this.endDrift(k);
          }
        }
      }
      f = frame(tr, k.si, k.x, k.z);
    }
    k.lat = f.lat;
    k.offroad = Math.abs(f.lat) > s.hw + 0.9;
    const gy = groundY(tr, k.si, f.along);
    if (k.grounded) {
      const vy = (gy - k.y) / dt;
      if (vy < k.vy - GRAVITY * dt * 1.35 && Math.abs(k.speed) > 8) {
        k.grounded = false;
        k.airT = 0;
        k.vy -= GRAVITY * dt;
        k.y += k.vy * dt;
      } else {
        k.vy = vy;
        k.y = gy;
      }
    } else {
      k.airT += dt;
      k.vy -= GRAVITY * dt;
      k.y += k.vy * dt;
      if (k.y <= gy) {
        const power = -k.vy;
        k.y = gy;
        k.vy = 0;
        k.grounded = true;
        if (k.airT > 0.25) this.emit({ type: "land", kart: k.index, power });
      }
    }
  }

  private collide(): void {
    const K = this.state.karts;
    for (let i = 0; i < K.length; i++) {
      for (let j = i + 1; j < K.length; j++) {
        const a = K[i];
        const b = K[j];
        if (Math.abs(a.y - b.y) > 1.6) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= (2 * KART_R) ** 2 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const push = (2 * KART_R - d) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rel > 0) {
          const imp = ((1 + PHYS.kartBounce) * rel) / 2;
          a.vx -= imp * nx;
          a.vz -= imp * nz;
          b.vx += imp * nx;
          b.vz += imp * nz;
          this.rebuild(a);
          this.rebuild(b);
          if (rel > 3) this.emit({ type: "bump", a: i, b: j, power: rel });
        }
      }
    }
  }

  private draft(): void {
    const dt = KART_STEP;
    const K = this.state.karts;
    for (const a of K) {
      if (a.status !== "none" || !a.grounded || a.speed < 20 || a.finished) {
        a.draftT = a.draftT > 0 ? Math.max(0, a.draftT - 2 * dt) : a.draftT + dt;
        continue;
      }
      const c = Math.cos(a.theta);
      const s = Math.sin(a.theta);
      let target = -1;
      for (const b of K) {
        if (b === a || Math.abs(b.y - a.y) > 2) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const along = dx * c + dz * s;
        const lat = -dx * s + dz * c;
        if (along > 3 && along < PHYS.draftRange && Math.abs(lat) < 1.6 && b.speed > 18 && Math.abs(angleDiff(a.theta, b.theta)) < 0.3) {
          target = b.index;
          break;
        }
      }
      a.draftTarget = target;
      if (target >= 0) {
        a.draftT += dt;
        if (a.draftT >= PHYS.draftCharge) {
          a.draftT = -4; // cooldown before the next slipstream charge
          this.boost(a, "draft");
        }
      } else a.draftT = a.draftT > 0 ? Math.max(0, a.draftT - 2 * dt) : a.draftT + dt;
    }
  }

  // ---------------------------------------------------------------- items

  private pickups(): void {
    const dt = KART_STEP;
    const st = this.state;
    for (const box of st.boxes) {
      if (box.respawnT > 0) {
        box.respawnT = Math.max(0, box.respawnT - dt);
        continue;
      }
      for (const k of st.karts) {
        if (k.finished || Math.abs(k.y - box.y - 0.6) > 2.2) continue;
        if ((k.x - box.x) ** 2 + (k.z - box.z) ** 2 > 2.2 * 2.2) continue;
        box.respawnT = 2.8;
        if (k.items.length < ITEM_SLOTS) {
          const item = this.rollItem(k);
          k.items.push(item);
          k.rouletteT = 0.9;
          this.emit({ type: "itemGet", kart: k.index, item });
        }
        break;
      }
    }
    for (const pad of st.pads) {
      const c = Math.cos(pad.theta);
      const s = Math.sin(pad.theta);
      for (const k of st.karts) {
        if (!k.grounded || this.padCd[k.index] > 0 || k.status !== "none") continue;
        const dx = k.x - pad.x;
        const dz = k.z - pad.z;
        if (Math.abs(dx * c + dz * s) < 2.4 && Math.abs(-dx * s + dz * c) < 2) {
          this.padCd[k.index] = 0.7;
          this.boost(k, "pad");
        }
      }
    }
  }

  private rollItem(k: Kart): ItemKind {
    const n = this.state.karts.length;
    const p = n > 1 ? (k.rank - 1) / (n - 1) : 0.5;
    const w = p < 0.5 ? ODDS_FRONT.map((a, i) => lerp(a, ODDS_MID[i], p * 2)) : ODDS_MID.map((a, i) => lerp(a, ODDS_BACK[i], (p - 0.5) * 2));
    const total = w.reduce((a, b) => a + b, 0);
    let r = this.rand() * total;
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) return ITEM_KINDS[i];
    }
    return "booster";
  }

  private spawn(kind: Projectile["kind"], owner: number, x: number, z: number, y: number, vx: number, vz: number, vy: number, target: number, life: number, r: number, si: number): Projectile {
    const p: Projectile = { id: this.pid++, kind, owner, target, x, z, y, vx, vz, vy, si, t: 0, life, r, alive: true };
    this.state.projectiles.push(p);
    return p;
  }

  private kartAhead(k: Kart, maxGap: number): number {
    let best = -1;
    let gap = Infinity;
    for (const o of this.state.karts) {
      if (o === k || o.finished) continue;
      const d = o.dist - k.dist;
      if (d > 0.5 && d < gap && d < maxGap) {
        gap = d;
        best = o.index;
      }
    }
    return best;
  }

  private useItem(k: Kart): void {
    if (!k.items.length || k.rouletteT > 0) return;
    const item = k.items.shift()!;
    k.itemsUsed++;
    this.emit({ type: "itemUse", kart: k.index, item });
    const c = Math.cos(k.theta);
    const s = Math.sin(k.theta);
    const tr = this.track;
    switch (item) {
      case "booster":
        this.boost(k, "item");
        break;
      case "ball": {
        const target = this.kartAhead(k, 140);
        const sp = Math.max(44, k.speed + 14);
        this.spawn("ball", k.index, k.x + c * 2.6, k.z + s * 2.6, k.y + 0.6, c * sp, s * sp, 0, target, 4.2, 1.5, k.si);
        break;
      }
      case "balloon": {
        const sp = Math.max(24, k.speed + 6);
        this.spawn("balloon", k.index, k.x + c * 2.2, k.z + s * 2.2, k.y + 1.4, c * sp, s * sp, 6.5, -1, 3, 1.5, k.si);
        break;
      }
      case "banana": {
        const back = pointAt(tr, wrap(k.si - Math.round(2.6 / tr.ds), tr.n), k.lat);
        this.spawn("banana", k.index, back.x, back.z, back.y, 0, 0, 0, -1, 30, 1.25, wrap(k.si - 3, tr.n));
        break;
      }
      case "gloves":
        k.shieldT = 5;
        break;
      case "magnet": {
        const target = this.kartAhead(k, 85);
        if (target >= 0) {
          k.magnetT = 3.2;
          k.magnetTarget = target;
        } else this.boost(k, "item");
        break;
      }
      case "redcard": {
        let target = -1;
        for (const idx of this.state.order) {
          const o = this.state.karts[idx];
          if (o !== k && !o.finished) {
            target = idx;
            break;
          }
        }
        if (target >= 0) this.spawn("redcard", k.index, k.x, k.z, k.y + 4, 0, 0, 0, target, 14, 2, k.si);
        break;
      }
      case "roar": {
        for (const o of this.state.karts) {
          if (o === k || o.finished || Math.abs(o.y - k.y) > 3) continue;
          if ((o.x - k.x) ** 2 + (o.z - k.z) ** 2 < 11 * 11) this.hit(o, "roar", k.index);
        }
        for (const p of this.state.projectiles) {
          if (p.alive && p.owner !== k.index && (p.x - k.x) ** 2 + (p.z - k.z) ** 2 < 12 * 12) p.alive = false;
        }
        break;
      }
    }
  }

  private hit(k: Kart, what: ItemKind | "puddle", by: number): boolean {
    if (k.finished || k.graceT > 0 || k.status !== "none") return false;
    if (k.shieldT > 0) {
      k.shieldT = 0;
      k.graceT = 0.5;
      this.emit({ type: "hit", kart: k.index, by, what, blocked: true });
      return true;
    }
    if (what === "banana") this.setStatus(k, "spin", STATUS_TIME.spin);
    else if (what === "roar") this.setStatus(k, "spin", STATUS_TIME.roar);
    else if (what === "ball") this.setStatus(k, "tumble", STATUS_TIME.tumble);
    else if (what === "redcard") this.setStatus(k, "tumble", STATUS_TIME.redcard);
    else this.setStatus(k, "trapped", STATUS_TIME.trapped);
    k.hits++;
    this.emit({ type: "hit", kart: k.index, by, what, blocked: false });
    return true;
  }

  private setStatus(k: Kart, status: Kart["status"], t: number): void {
    k.status = status;
    k.statusT = t;
    k.spinAngle = 0;
    k.boostT = 0;
    k.boostKind = "";
    k.magnetT = 0;
    if (k.drifting) {
      k.drifting = false;
      k.driftEndT = 9;
      this.emit({ type: "drift", kart: k.index, on: false });
    }
    if (status === "trapped") k.speed *= 0.35;
  }

  private projectiles(): void {
    const dt = KART_STEP;
    const tr = this.track;
    const st = this.state;
    for (const p of st.projectiles) {
      if (!p.alive) continue;
      p.t += dt;
      if (p.t > p.life) {
        p.alive = false;
        continue;
      }
      if (p.kind === "ball") {
        const t = p.target >= 0 ? st.karts[p.target] : null;
        let desired: number;
        if (t && !t.finished) desired = Math.atan2(t.z + t.vz * 0.1 - p.z, t.x + t.vx * 0.1 - p.x);
        else {
          const ahead = pointAt(tr, wrap(p.si + 14, tr.n), tr.line[wrap(p.si + 14, tr.n)]);
          desired = Math.atan2(ahead.z - p.z, ahead.x - p.x);
        }
        const sp = Math.hypot(p.vx, p.vz);
        const cur = Math.atan2(p.vz, p.vx);
        const turn = clamp(angleDiff(desired, cur), -5.5 * dt, 5.5 * dt);
        p.vx = Math.cos(cur + turn) * sp;
        p.vz = Math.sin(cur + turn) * sp;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        this.keepOnTrack(p, 0.6);
      } else if (p.kind === "balloon") {
        p.vy -= GRAVITY * 0.8 * dt;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.y += p.vy * dt;
        p.si = nearestLocal(tr, p.x, p.z, p.si, 8);
        const f = frame(tr, p.si, p.x, p.z);
        const gy = groundY(tr, p.si, f.along);
        if (p.y <= gy + 0.2) this.splash(p, gy);
      } else if (p.kind === "redcard") {
        const t = st.karts[p.target];
        if (!t || t.finished) {
          p.alive = false;
          continue;
        }
        const gap = t.dist - (p.si * tr.ds);
        void gap;
        const step = Math.max(1, Math.round((62 * dt) / tr.ds));
        const toTarget = wrap(t.si - p.si, tr.n);
        if (toTarget <= step + 4 || Math.hypot(t.x - p.x, t.z - p.z) < 7) {
          p.x = t.x;
          p.z = t.z;
          p.y = t.y + 1;
          this.hit(t, "redcard", p.owner);
          p.alive = false;
          continue;
        }
        p.si = wrap(p.si + step, tr.n);
        const q = pointAt(tr, p.si, tr.line[p.si]);
        p.x = q.x;
        p.z = q.z;
        p.y = q.y + 4;
        continue;
      }
      // hits against karts
      for (const k of st.karts) {
        if (k.finished || (k.index === p.owner && p.t < 0.6)) continue;
        const r = p.kind === "puddle" ? p.r : p.r + 0.3;
        if (Math.abs(k.y - p.y) > (p.kind === "puddle" ? 1.6 : 2.2)) continue;
        if ((k.x - p.x) ** 2 + (k.z - p.z) ** 2 > r * r) continue;
        if (p.kind === "puddle") {
          this.hit(k, "puddle", p.owner);
          continue;
        }
        if (p.kind === "balloon") {
          this.splash(p, k.y);
          break;
        }
        if (this.hit(k, p.kind === "ball" ? "ball" : "banana", p.owner) || k.status !== "none") {
          p.alive = false;
          break;
        }
      }
    }
    // hazards cancel each other: a ball hitting a banana
    for (const a of st.projectiles) {
      if (!a.alive || a.kind !== "ball") continue;
      for (const b of st.projectiles) {
        if (!b.alive || b === a || b.kind !== "banana") continue;
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 2.2) {
          a.alive = false;
          b.alive = false;
        }
      }
    }
    if (st.projectiles.length > 64) st.projectiles = st.projectiles.filter((p) => p.alive);
  }

  private splash(p: Projectile, y: number): void {
    p.kind = "puddle";
    p.y = y;
    p.vx = p.vz = p.vy = 0;
    p.t = 0;
    p.life = 5;
    p.r = 3.2;
  }

  private keepOnTrack(p: Projectile, lift: number): void {
    const tr = this.track;
    p.si = nearestLocal(tr, p.x, p.z, p.si, 8);
    const f = frame(tr, p.si, p.x, p.z);
    const s = tr.samples[p.si];
    const lim = s.hw + s.verge - 0.6;
    if (Math.abs(f.lat) > lim) {
      const side = Math.sign(f.lat);
      const nx = -s.tz * side;
      const nz = s.tx * side;
      p.x -= nx * (Math.abs(f.lat) - lim);
      p.z -= nz * (Math.abs(f.lat) - lim);
      const vn = p.vx * nx + p.vz * nz;
      if (vn > 0) {
        p.vx -= 2 * vn * nx;
        p.vz -= 2 * vn * nz;
      }
    }
    p.y = groundY(tr, p.si, f.along) + lift;
  }

  // ---------------------------------------------------------------- race progress

  private progress(k: Kart, humanInput: Inputs | null): void {
    const tr = this.track;
    const st = this.state;
    const dt = KART_STEP;
    const L = tr.length;
    const along = tr.samples[k.si].s + frame(tr, k.si, k.x, k.z).along;
    let d = along - this.sPrev[k.index];
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    this.sPrev[k.index] = along;
    k.dist += d;
    if (!k.finished) {
      const lapNow = k.dist < 0 ? 0 : Math.floor(k.dist / L) + 1;
      if (lapNow > k.lap) {
        if (lapNow >= 2 && lapNow <= this.laps) {
          k.lapTimes.push(st.time - k.lapStart);
          k.lapStart = st.time;
          this.emit({ type: "lap", kart: k.index, lap: lapNow, time: k.lapTimes[k.lapTimes.length - 1] });
          if (lapNow === this.laps) this.emit({ type: "finalLap", kart: k.index });
        }
        k.lap = Math.min(lapNow, this.laps);
      }
      if (k.dist >= this.laps * L) {
        k.finished = true;
        const over = (k.dist - this.laps * L) / Math.max(5, Math.abs(k.speed));
        k.finishTime = st.time - over;
        k.lapTimes.push(k.finishTime - k.lapStart);
        this.finishCount++;
        if (this.finishCount === 1) {
          st.winnerTime = k.finishTime;
          st.retireAt = k.finishTime + PHYS.retireAfter;
        }
        this.emit({ type: "finish", kart: k.index, rank: this.finishCount, time: k.finishTime });
      }
      // wrong way
      const s = tr.samples[k.si];
      const cosT = Math.cos(k.phi) * s.tx + Math.sin(k.phi) * s.tz;
      const wrong = k.speed > 4 ? cosT < -0.35 : k.speed < -4 ? cosT > 0.35 : false;
      const was = k.wrongWayT > 1.2;
      k.wrongWayT = wrong ? k.wrongWayT + dt : Math.max(0, k.wrongWayT - 2 * dt);
      if (k.human && was !== k.wrongWayT > 1.2) this.emit({ type: "wrongWay", kart: k.index, on: !was });
      // stuck: respawn on the track
      const trying = !k.human || !!humanInput?.throttle;
      if (k.dist > k.lastProgress + 3) {
        k.lastProgress = k.dist;
        k.stuckT = 0;
      } else if (k.status === "none" && trying) k.stuckT += dt;
      const lost = k.y < tr.minY - 8 || Math.abs(k.lat) > s.hw + s.verge + 4;
      if (k.stuckT > 4.5 || lost) this.respawn(k);
    }
  }

  private respawn(k: Kart): void {
    const tr = this.track;
    const i = wrap(k.si - 2, tr.n);
    const p = pointAt(tr, i, tr.line[i] * 0.5);
    k.x = p.x;
    k.z = p.z;
    k.y = p.y;
    k.vx = k.vz = k.vy = 0;
    k.theta = k.phi = headingAt(tr, i);
    k.yawRate = 0;
    k.speed = 0;
    k.si = i;
    k.grounded = true;
    k.drifting = false;
    k.status = "none";
    k.statusT = 0;
    k.graceT = 1.5;
    k.stuckT = 0;
    k.lastProgress = k.dist;
    k.respawnT = 1;
    this.sPrev[k.index] = tr.samples[i].s;
    this.emit({ type: "respawn", kart: k.index });
  }

  private rank(): void {
    const st = this.state;
    const order = st.karts
      .map((k) => k.index)
      .sort((a, b) => {
        const A = st.karts[a];
        const B = st.karts[b];
        if (A.finished && B.finished) return A.finishTime - B.finishTime || B.dist - A.dist;
        if (A.finished) return -1;
        if (B.finished) return 1;
        return B.dist - A.dist;
      });
    order.forEach((idx, r) => {
      const k = st.karts[idx];
      if (k.human && k.rank !== r + 1 && st.phase === "race") this.emit({ type: "overtake", kart: idx, rank: r + 1 });
      k.rank = r + 1;
    });
    st.order = order;
  }
}

// Convenience for tests: run a whole race with an optional input function for the human kart.
export function runRace(opts: RaceOptions, input?: (race: Race) => Inputs, maxSeconds = 600): Race {
  const race = new Race(opts);
  const steps = Math.ceil(maxSeconds / KART_STEP);
  for (let i = 0; i < steps && race.state.phase !== "done"; i++) {
    race.step(input ? input(race) : null);
    race.drainEvents();
  }
  return race;
}
