// Mascot Kart AI drivers. Each rival follows the precomputed racing line with a speed-dependent
// look-ahead, brakes against the speed profile, drifts through tight corners (straightening before
// the release to earn the instant boost), dodges hazards, overtakes, and uses items by simple rules.
// Rubber-banding keeps the pack near the player without teleporting anyone.
import { type Track, angleDiff, frame, pointAt, wrap } from "./track";
import { KART_STEP, PHYS, type Difficulty, type Inputs, type Kart, type Mode, type RaceState } from "./types";

export interface AiTier {
  speed: number; // top speed factor
  corner: number; // cornering confidence against the speed profile
  noise: number; // metres of lane wander
  drift: number; // 0..1 drift skill (clean exits, timing)
  items: number; // 0..1 item sharpness
  rbAhead: number; // top speed given up at 180 m ahead of the player
  rbBehind: number; // top speed gained at 180 m behind the player
  mistake: number; // wobbles per minute
}

export const AI_TIERS: Record<Difficulty, AiTier> = {
  rookie: { speed: 0.87, corner: 0.9, noise: 1.5, drift: 0.45, items: 0.45, rbAhead: 0.12, rbBehind: 0.03, mistake: 2.2 },
  l1: { speed: 0.94, corner: 0.97, noise: 0.9, drift: 0.72, items: 0.75, rbAhead: 0.07, rbBehind: 0.05, mistake: 1.1 },
  pro: { speed: 0.985, corner: 1.02, noise: 0.45, drift: 0.95, items: 1, rbAhead: 0.035, rbBehind: 0.075, mistake: 0.4 },
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Brain {
  private lane = 0;
  private laneGoal = 0;
  private laneT = 0;
  private prevErr = 0;
  private wobbleT = 0;
  private wobble = 0;
  private itemHold = 0;
  private itemCd = 0;
  private exitT = 0;
  private driftCd = 0;
  private lowT = 0;
  private reverseT = 0;

  constructor(
    readonly index: number,
    readonly tier: AiTier,
    readonly skill: number, // -1..1
    private readonly rand: () => number,
    readonly style: "clean" | "aggressive" | "tricky",
  ) {
    this.laneGoal = (rand() - 0.5) * tier.noise * 2;
  }

  topSpeedMul(k: Kart, human: Kart | null): number {
    let m = this.tier.speed * (1 + this.skill * 0.018);
    if (human && !human.finished && !k.finished) {
      const gap = k.dist - human.dist;
      if (gap > 0) m *= 1 - this.tier.rbAhead * clamp(gap / 180, 0, 1);
      else m *= 1 + this.tier.rbBehind * clamp(-gap / 180, 0, 1);
    }
    return m;
  }

  think(k: Kart, st: RaceState, tr: Track, mode: Mode): Inputs {
    const dt = KART_STEP;
    const out: Inputs = { steer: 0, throttle: true, brake: false, drift: false, item: false };
    if (st.phase === "countdown") {
      // good drivers time the start boost, rookies sometimes jump it
      out.throttle = st.time > -PHYS.startWindow * (0.3 + 0.6 * this.tier.drift) - (this.rand() < 0.02 ? 1 : 0);
      return out;
    }
    const n = tr.n;
    const v = Math.abs(k.speed);
    // stuck against something: back out, steering the other way
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      const s = tr.samples[k.si];
      const e = angleDiff(Math.atan2(s.tz, s.tx), k.theta);
      return { steer: e > 0 ? -1 : 1, throttle: false, brake: true, drift: false, item: false };
    }
    this.lowT = v < 2.5 && k.status === "none" && !k.finished ? this.lowT + dt : 0;
    if (this.lowT > 0.7) {
      this.lowT = 0;
      this.reverseT = 0.9;
    }
    this.updateLane(k, st, tr, dt);
    // mistakes: a short wobble now and then
    this.wobbleT -= dt;
    if (this.wobbleT <= 0 && this.rand() < (this.tier.mistake / 60) * dt) {
      this.wobbleT = 0.35 + this.rand() * 0.4;
      this.wobble = (this.rand() - 0.5) * 1.4;
    }
    const look = 6 + v * 0.42;
    const ti = wrap(k.si + Math.round(look / tr.ds), n);
    const hw = tr.samples[ti].hw;
    const lat = clamp(tr.line[ti] + this.lane, -(hw - 1.3), hw - 1.3);
    const p = pointAt(tr, ti, lat);
    const desired = Math.atan2(p.z - k.z, p.x - k.x);
    const ref = k.drifting ? k.phi : k.theta;
    const err = angleDiff(desired, ref);
    let steer = clamp(err * 2.7 + (err - this.prevErr) * 7, -1, 1);
    this.prevErr = err;
    if (this.wobbleT > 0) steer = clamp(steer + this.wobble, -1, 1);

    // speed: stay under the profile, with braking room
    const corner = this.tier.corner * (1 + this.skill * 0.02);
    for (let d = 0; d <= 70; d += 5) {
      const j = wrap(k.si + Math.round(d / tr.ds), n);
      const lim = Math.sqrt((tr.vmax[j] * corner) ** 2 + 2 * 15 * d);
      if (v > lim + 1.5) out.throttle = false;
      if (v > lim + 6 && v > 8) out.brake = true;
    }

    // drifting
    let kNear = 0; // curvature ahead in the direction of the current drift
    let kFar = 0;
    let dir = 0;
    for (let d = 2; d <= 34; d += 2) {
      const c = tr.lineCurv[wrap(k.si + Math.round(d / tr.ds), n)];
      if (d <= 24) kNear = Math.max(kNear, k.drifting ? c * k.driftDir : Math.abs(c));
      if (d >= 8 && Math.abs(c) > kFar) {
        kFar = Math.abs(c);
        dir = Math.sign(c);
      }
    }
    this.driftCd -= dt;
    const threshold = 0.032 + (1 - this.tier.drift) * 0.012;
    const trackHeading = Math.atan2(tr.samples[k.si].tz, tr.samples[k.si].tx);
    const overTurned = Math.abs(angleDiff(k.phi, trackHeading)) > 0.75;
    if (k.drifting) {
      const cornerLeft = (k.driftT < 0.35 || kNear > 0.02) && k.driftT < 2.6 && !overTurned;
      if (cornerLeft) {
        out.drift = true;
        this.exitT = 0;
        this.driftCd = 0.45;
      } else {
        // straighten first (counter-steer), then release for a clean exit
        this.exitT += dt;
        const wait = 0.42 * this.tier.drift;
        const straight = Math.abs(k.slip) < 0.36;
        out.drift = !straight && this.exitT < wait && !overTurned;
        if (out.drift) steer = clamp(-k.driftDir * 0.9 + err * 1.5, -1, 1);
      }
    } else if (k.grounded && v > 16 && kFar > threshold && k.status === "none" && !overTurned && this.driftCd <= 0) {
      out.drift = true;
      steer = dir * Math.max(0.6, Math.abs(steer));
    }

    // boosters (speed mode) and items
    this.itemCd -= dt;
    if (mode === "speed") {
      if (k.boosters > 0 && k.boostT <= 0.05 && this.itemCd <= 0 && !k.drifting && Math.abs(k.slip) < 0.2) {
        let straight = true;
        for (let d = 0; d <= 50; d += 5) if (Math.abs(tr.lineCurv[wrap(k.si + Math.round(d / tr.ds), n)]) > 0.022) straight = false;
        if (straight || (k.boosters >= PHYS.maxBoosters && k.gauge > 0.8)) {
          out.item = true;
          this.itemCd = 0.5;
        }
      }
    } else if (k.items.length && k.rouletteT <= 0 && k.status === "none" && this.itemCd <= 0) {
      this.itemHold += dt;
      if (this.wantItem(k, st, tr)) {
        out.item = true;
        this.itemHold = 0;
        this.itemCd = 0.6 + (1 - this.tier.items) * 0.8;
      }
    } else if (!k.items.length) this.itemHold = 0;
    out.steer = steer;
    return out;
  }

  private updateLane(k: Kart, st: RaceState, tr: Track, dt: number): void {
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneT = 1.2 + this.rand() * 2;
      this.laneGoal = (this.rand() - 0.5) * this.tier.noise * 2;
    }
    let goal = this.laneGoal;
    // hazards on the road ahead: bananas and puddles
    for (const pr of st.projectiles) {
      if (!pr.alive || (pr.kind !== "banana" && pr.kind !== "puddle")) continue;
      const ahead = wrap(pr.si - k.si, tr.n) * tr.ds;
      if (ahead < 3 || ahead > 26) continue;
      const hz = frame(tr, pr.si, pr.x, pr.z).lat;
      const mine = tr.line[pr.si] + this.lane;
      if (Math.abs(hz - mine) < pr.r + 1.8) goal += hz > mine ? -3.2 : 3.2;
    }
    // a slower kart right ahead: pick a side
    for (const o of st.karts) {
      if (o === k || o.finished) continue;
      const ahead = o.dist - k.dist;
      if (ahead < 1.5 || ahead > 9 || Math.abs(o.y - k.y) > 2) continue;
      if (Math.abs(o.speed) > Math.abs(k.speed) + 1) continue;
      goal += o.lat > k.lat ? -2.6 : 2.6;
    }
    const hw = tr.samples[k.si].hw;
    goal = clamp(goal, -(hw - 1.5) - tr.line[k.si], hw - 1.5 - tr.line[k.si]);
    this.lane += (goal - this.lane) * Math.min(1, dt * 2.5);
  }

  private wantItem(k: Kart, st: RaceState, tr: Track): boolean {
    const it = k.items[0];
    const sharp = this.tier.items;
    const late = this.itemHold > 9 - sharp * 4;
    const others = st.karts.filter((o) => o !== k && !o.finished);
    const ahead = others.filter((o) => o.dist > k.dist).sort((a, b) => a.dist - b.dist);
    const behind = others.filter((o) => o.dist <= k.dist).sort((a, b) => b.dist - a.dist);
    const gapAhead = ahead.length ? ahead[0].dist - k.dist : Infinity;
    const gapBehind = behind.length ? k.dist - behind[0].dist : Infinity;
    const incoming = st.projectiles.some((p) => p.alive && p.target === k.index && Math.hypot(p.x - k.x, p.z - k.z) < 30);
    switch (it) {
      case "booster": {
        let straight = true;
        for (let d = 0; d <= 40; d += 5) if (Math.abs(tr.lineCurv[wrap(k.si + Math.round(d / tr.ds), tr.n)]) > 0.022) straight = false;
        return straight || late;
      }
      case "ball":
        return (gapAhead > 4 && gapAhead < 95) || late;
      case "balloon":
        return (gapAhead > 7 && gapAhead < 34 && Math.abs(ahead[0].lat - k.lat) < 4.5) || late;
      case "banana":
        return (gapBehind > 2.5 && gapBehind < 16) || late;
      case "gloves":
        return incoming || late;
      case "magnet":
        return (gapAhead > 12 && gapAhead < 75) || late;
      case "redcard":
        return k.rank > 1 || this.itemHold > 3;
      case "roar":
        return incoming || others.some((o) => Math.hypot(o.x - k.x, o.z - k.z) < 9 && Math.abs(o.y - k.y) < 3) || late;
    }
  }
}
