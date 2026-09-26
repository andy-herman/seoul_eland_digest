// Camera and projection exported from the Blender scene that rendered the
// pitch (game-work/blender/build_pitch.py). World units are metres with Z up:
// the goal line runs along X at y = 0, the goal mouth faces -Y and the
// penalty spot is at (0, -11, 0). Screen space is the 960 x 1200 logical canvas.

export const VIEW_W = 960;
export const VIEW_H = 1200;

const CAM_Y = -17;
const CAM_Z = 1.7;
const UP_Y = 0.06340157985687256;
const UP_Z = 0.9979881644248962;
const FOCAL = 1648.4864516727735;

export const GOAL_HALF_WIDTH = 3.66;
export const GOAL_HEIGHT = 2.44;
export const SPOT_Y = -11;

export interface ScreenPoint {
  x: number;
  y: number;
  /** Screen pixels per world metre at this depth. */
  scale: number;
  depth: number;
}

export function project(x: number, y: number, z: number): ScreenPoint {
  const dy = y - CAM_Y;
  const dz = z - CAM_Z;
  const up = dy * UP_Y + dz * UP_Z;
  const depth = dy * UP_Z - dz * UP_Y;
  const scale = FOCAL / depth;
  return { x: VIEW_W / 2 + x * scale, y: VIEW_H / 2 - up * scale, scale, depth };
}

/** Goal-plane coordinates: u runs 0..1 post to post, v runs 0..1 ground to bar. */
export function goalX(u: number): number {
  return -GOAL_HALF_WIDTH + 2 * GOAL_HALF_WIDTH * u;
}

export function goalZ(v: number): number {
  return GOAL_HEIGHT * v;
}
