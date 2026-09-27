// Shared contract between the FC-style match engine (sim.ts / ai.ts, owned by the engine agent)
// and the renderer, input and UI (render.ts / input.ts / main.ts).
// Units are metres and seconds. x runs along the pitch: 0 is the Seoul E-Land goal line (left of the
// screen), PITCH_L the rival goal line. z runs across it: 0 is the near touchline (bottom of the
// screen), PITCH_W the far touchline. h is height above the grass.
import type { Kit, OpponentSlug, SquadPlayer } from "../data";

export const FC_STEP = 1 / 60;
export const PITCH_L = 64;
export const PITCH_W = 40;
export const GOAL_W = 6; // posts at z = PITCH_W / 2 +- GOAL_W / 2
export const GOAL_H = 2.2;
export const GOAL_DEPTH = 1.4;
export const BOX_DEPTH = 12; // penalty area depth from the goal line
export const BOX_W = 24; // penalty area width, centred on the goal
export const SIX_DEPTH = 4;
export const SIX_W = 12;
export const PEN_SPOT = 8;
export const CIRCLE_R = 6;
export const BALL_R = 0.11;
export const PLAYER_R = 0.4;
export const MATCH_SECONDS = 180; // real seconds for 90 game minutes
export const GOLDEN_GOAL_SECONDS = 60; // quick matches only, then the draw stands

export type Side = "home" | "away"; // home = Seoul E-Land (always attacks toward +x), away = the rival mascots
export type Role = "GK" | "DEF" | "MID" | "FWD";

export type Anim =
  | "idle"
  | "run"
  | "sprint"
  | "kick" // pass, shot, clearance, throw-in release
  | "tackle" // standing tackle lunge
  | "slide" // slide tackle, lying on the grass
  | "fallen" // knocked over after a foul or a missed slide
  | "header" // airborne header (h > 0)
  | "dive" // goalkeeper dive, see diveDir
  | "celebrate"
  | "sad"
  | "throw" // throw-in wind-up, ball above the head
  | "hold"; // goalkeeper holding the ball

export interface FcPlayer {
  side: Side;
  index: number; // 0 = goalkeeper, 1..4 outfield
  role: Role;
  num: number; // shirt number shown on the radar and name tags
  squadNum?: number; // home players: SquadPlayer.num, used to pick the sprite strip
  x: number;
  z: number; // feet position
  vx: number;
  vz: number;
  h: number; // jump height (headers, dives), 0 on the ground
  fx: number;
  fz: number; // facing unit vector; the renderer mirrors the side-view sprite when fx < 0
  anim: Anim;
  animT: number; // seconds since anim started
  diveDir: -1 | 0 | 1; // goalkeeper dive toward -z or +z while anim === "dive"
  stunT: number; // > 0 while recovering (no control)
}

export interface FcBall {
  x: number;
  z: number;
  h: number;
  vx: number;
  vz: number;
  vh: number;
  spin: number; // accumulated roll angle in radians, for drawing only
  owner: { side: Side; index: number } | null;
  lastTouch: Side | null;
}

export type RestartType = "kickoff" | "throwin" | "corner" | "goalkick" | "freekick" | "penalty";

export interface FcSetPiece {
  type: RestartType;
  side: Side; // team taking it
  taker: number; // player index on that side
  spotX: number;
  spotZ: number;
  aimX: number;
  aimZ: number; // current aim point; the user moves it with the stick on home set pieces
  direct: boolean; // true for a penalty or a free kick within shooting range
  waitT: number; // seconds since the restart was set up
}

export type FcPhase = "intro" | "play" | "restart" | "goal" | "halftime" | "ended";

export interface FcSideStats {
  shots: number;
  onTarget: number;
  passes: number; // attempted (ground, through, lob, cross)
  passesDone: number; // reached a teammate
  tackles: number; // won the ball
  fouls: number;
  corners: number;
  saves: number;
  possession: number; // seconds with a player of this side in control of the ball
  goals: string[]; // minute labels such as "34'" or "90+'"
}

export type FcEventType =
  | "kick"
  | "pass"
  | "through"
  | "lob"
  | "shot"
  | "header"
  | "save"
  | "catch"
  | "post"
  | "goal"
  | "tackle"
  | "foul"
  | "whistle"
  | "out"
  | "corner"
  | "throwin"
  | "goalkick"
  | "freekick"
  | "penalty"
  | "kickoff"
  | "halftime"
  | "fulltime"
  | "switch"
  | "bounce";

export interface FcEvent {
  type: FcEventType;
  side?: Side;
  index?: number;
  x?: number;
  z?: number;
}

export interface FcInput {
  mx: number; // stick, -1..1: +1 = toward +x (screen right)
  mz: number; // stick, -1..1: +1 = toward +z (screen up, far touchline)
  sprint: boolean;
  pass: boolean; // held states; the engine detects press and release edges itself
  shoot: boolean;
  lob: boolean;
  through: boolean;
}

export interface FcMatchOptions {
  home: SquadPlayer[]; // 5 players, [0] is the goalkeeper
  captain: number; // squad number of the user's featured player (a slight rating boost)
  opponent: OpponentSlug;
  kit: Kit;
  mode: "league" | "quick" | "ai";
  seed: number;
  tier?: 1 | 2 | 3 | 4; // defaults to AI_TIER[opponent]
  homeAiTier?: 1 | 2 | 3 | 4; // headless only: the AI also plays the home side, ignoring input
  seconds?: number; // defaults to MATCH_SECONDS
}

export interface FcState {
  phase: FcPhase;
  phaseT: number; // seconds since the phase started
  elapsed: number; // seconds of match clock used
  minute: number; // 0..90 display minute
  half: 1 | 2;
  goldenGoal: boolean;
  score: { home: number; away: number };
  players: FcPlayer[]; // 10 entries: home 0..4 then away 0..4 (players[5 + i] is away index i)
  ball: FcBall;
  controlled: number; // home index the user controls, 1..4
  passTarget: number | null; // home index that would receive a ground pass right now
  charge: number; // 0..1 while shoot or lob is held
  chargeKind: "shoot" | "lob" | null;
  setPiece: FcSetPiece | null;
  lastScorer: Side | null;
  stats: { home: FcSideStats; away: FcSideStats };
  events: FcEvent[]; // cleared at the start of every step
  banner: { key: FcEventType; t: number } | null; // latest headline event (goal, corner, foul...); the UI localizes it
}
