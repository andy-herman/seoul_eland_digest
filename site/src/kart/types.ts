// Mascot Kart: shared types and tuning for the DOM-free race simulation.
// World units are metres and seconds. The track lies in the x-z plane with y up (three.js axes).
// A kart heading theta drives along F = (cos theta, sin theta) in (x, z); its right-hand side is
// R = (-sin theta, cos theta), so steering right increases theta. The renderer turns a model that
// faces +Z with rotation.y = PI / 2 - theta.

export const KART_STEP = 1 / 60;
export const GRAVITY = 21;
export const KART_R = 1.05; // collision radius
export const MAX_RACERS = 9;
export const ITEM_SLOTS = 2;

export type Mode = "speed" | "item";
export type Difficulty = "rookie" | "l1" | "pro";
export type ItemKind = "booster" | "ball" | "balloon" | "banana" | "gloves" | "magnet" | "redcard" | "roar";
export const ITEM_KINDS: ItemKind[] = ["booster", "ball", "balloon", "banana", "gloves", "magnet", "redcard", "roar"];

// Driving model. Speeds in m/s: 30 m/s top speed shows as 216 on the speedometer (km/h x 2, KartRider-style numbers).
export const PHYS = {
  topSpeed: 30,
  reverseSpeed: 8,
  accel: 21, // m/s^2 from rest, falling linearly to 0 at top speed
  brake: 28,
  coast: 4.5,
  turnLow: 2.05, // rad/s at the speed of best turning
  turnHigh: 1.42, // rad/s at top speed
  turnMinSpeed: 7,
  grip: 13, // travel heading follows the body heading this fast (1/s)
  driftGrip: 2.3, // travel heading follows the body this fast while drifting (1/s)
  maxSlip: 0.74, // rad, about 42 degrees
  driftTurn: 2.35,
  driftMinSpeed: 11,
  driftLoss: 0.045, // share of speed lost per second while drifting
  gaugeRate: 0.44, // booster gauge per second of a solid drift (speed mode): about 2 to 4 drifts per booster
  maxBoosters: 2,
  boostTime: 2.4, // KartRider boosters last about 3 s
  boostGain: 0.35,
  instantTime: 0.5,
  instantGain: 0.14,
  instantWindow: 0.3, // seconds after a drift ends in which a throttle re-press fires an instant boost (KartRider: 0.2 to 0.3 s)
  instantMinDrift: 0.4,
  draftCharge: 1.3,
  draftTime: 1.6,
  draftGain: 0.13,
  draftRange: 10,
  startWindow: 0.4, // throttle pressed within this many seconds before GO and held
  startTime: 1.8,
  startGain: 0.3,
  offroad: 0.56, // top-speed factor on grass
  offroadBoost: 0.88,
  wallBounce: 0.28,
  kartBounce: 0.5,
  airTurn: 0.3,
  wallGaugeLoss: 0.2, // share of the gauge lost on a hard wall hit while drifting
  retireAfter: 20, // seconds after the leader finishes before the rest retire (KartRider: 10)
} as const;

export interface TrackSample {
  x: number;
  z: number;
  y: number;
  tx: number; // unit tangent
  tz: number;
  hw: number; // road half width
  verge: number; // off-road width beyond each road edge, then the wall
  curv: number; // signed curvature of the centre line (1/m), positive turning right
  slope: number; // dy/ds
  s: number;
  bridge: boolean;
  wall: string; // wall style id for the renderer
  surface: string; // road surface id for the renderer
}

export interface TrackDef {
  id: string;
  laps: number;
  points: [number, number, number, number][]; // x, z, y, half width
  verge?: number;
  wall?: string;
  surface?: string;
  sections?: { from: number; to: number; verge?: number; wall?: string; surface?: string; bridge?: boolean }[];
  bumps?: [number, number, number][]; // lap fraction, length m, height m (smooth hump added to the elevation)
  items?: number[]; // lap fractions of item-box rows
  pads?: [number, number][]; // boost pads: lap fraction, lateral offset (m, + right)
  theme: string;
  scenery?: unknown; // renderer only
  start?: number; // lap fraction of the start line (default 0)
}

export interface Inputs {
  steer: number; // -1 left .. 1 right
  throttle: boolean;
  brake: boolean;
  drift: boolean;
  item: boolean; // use item (item mode) or fire a stored booster (speed mode)
}

export type Status = "none" | "spin" | "trapped" | "tumble" | "stun";

export interface Kart {
  id: string; // mascot slug
  index: number;
  human: boolean;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  theta: number; // body heading
  phi: number; // travel heading (differs from theta while drifting)
  yawRate: number;
  grounded: boolean;
  airT: number;
  // track tracking
  si: number; // nearest sample index
  lat: number; // lateral offset from the centre line (+ right)
  dist: number; // unwrapped distance along the track from the start line
  lap: number; // 1-based lap being driven (0 before the line)
  finished: boolean;
  finishTime: number;
  lapTimes: number[];
  lapStart: number;
  rank: number;
  wrongWayT: number;
  offroad: boolean;
  // driving state
  speed: number; // forward speed
  steerSmooth: number;
  drifting: boolean;
  driftDir: -1 | 0 | 1;
  driftT: number;
  driftEndT: number; // time since the last drift ended (for the instant boost)
  lastDriftLen: number;
  slip: number; // angle between heading and velocity (rad)
  gauge: number; // 0..1 booster gauge (speed mode)
  boosters: number; // stored boosters (speed mode)
  boostT: number;
  boostGain: number;
  boostKind: "" | "nitro" | "instant" | "draft" | "start" | "pad" | "item" | "magnet";
  draftT: number;
  draftTarget: number;
  bonkT: number; // wall hit: no throttle for a moment
  // items and effects
  items: ItemKind[];
  rouletteT: number; // > 0 while the newest item is still spinning
  status: Status;
  statusT: number;
  spinAngle: number; // visual spin for status effects
  shieldT: number;
  graceT: number; // immune to hits for a moment after an effect ends
  magnetT: number;
  magnetTarget: number;
  // bookkeeping for input edges and UI events
  prevThrottle: boolean;
  prevDrift: boolean;
  prevItem: boolean;
  startPressT: number; // race time of the first throttle press (can be negative: before GO)
  respawnT: number;
  stuckT: number;
  lastProgress: number;
  hits: number;
  itemsUsed: number;
}

export type ProjectileKind = "ball" | "balloon" | "banana" | "puddle" | "redcard";

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  owner: number;
  target: number; // kart index or -1
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  si: number;
  t: number; // age
  life: number;
  r: number; // hit radius
  alive: boolean;
}

export interface ItemBox {
  x: number;
  z: number;
  y: number;
  si: number;
  respawnT: number; // 0 when available
}

export interface Pad {
  x: number;
  z: number;
  y: number;
  si: number;
  theta: number;
}

export type RaceEvent =
  | { type: "countdown"; n: number }
  | { type: "go" }
  | { type: "lap"; kart: number; lap: number; time: number }
  | { type: "finalLap"; kart: number }
  | { type: "finish"; kart: number; rank: number; time: number }
  | { type: "boost"; kart: number; kind: Kart["boostKind"] }
  | { type: "gauge"; kart: number; boosters: number }
  | { type: "drift"; kart: number; on: boolean }
  | { type: "wall"; kart: number; power: number }
  | { type: "bump"; a: number; b: number; power: number }
  | { type: "land"; kart: number; power: number }
  | { type: "itemGet"; kart: number; item: ItemKind }
  | { type: "itemUse"; kart: number; item: ItemKind }
  | { type: "hit"; kart: number; by: number; what: ItemKind | "puddle"; blocked: boolean }
  | { type: "overtake"; kart: number; rank: number }
  | { type: "respawn"; kart: number }
  | { type: "wrongWay"; kart: number; on: boolean };

export interface RacerSpec {
  id: string;
  human: boolean;
  skill?: number; // AI: -1..1 personal offset
  style?: "clean" | "aggressive" | "tricky";
}

export interface RaceOptions {
  track: TrackDef;
  racers: RacerSpec[]; // grid order, pole first
  mode: Mode;
  difficulty: Difficulty;
  seed: number;
  laps?: number;
  countdown?: number; // seconds before GO (default 3.6)
  headless?: boolean;
  timeTrial?: boolean;
}

export interface RaceState {
  time: number; // race clock, negative during the countdown
  phase: "countdown" | "race" | "done";
  karts: Kart[];
  projectiles: Projectile[];
  boxes: ItemBox[];
  pads: Pad[];
  winnerTime: number;
  order: number[]; // kart indices by rank
  retireAt: number;
}
