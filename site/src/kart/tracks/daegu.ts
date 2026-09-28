import type { TrackDef } from "../types";

// 8. Daegu "Daefrica" Heat (대구 대프리카): past DGB Daegu Bank Park, up E-World hill to a lap round
// 83 Tower, down a run of fried-egg jumps, through the apple orchard hairpin and the Seomun
// market chicane.
export const DAEGU: TrackDef = {
  id: "daegu",
  laps: 3,
  theme: "daegu",
  verge: 5,
  wall: "tires",
  surface: "asphalt",
  points: [
    [-160, -140, 0, 8.5],
    [-60, -150, 0, 8.5],
    [40, -140, 0, 8.5],
    [110, -110, 1, 8],
    [140, -50, 5, 8],
    [136, 20, 10, 8],
    [150, 80, 15, 7.5],
    [122, 140, 20, 7.5],
    [72, 202, 24, 7.5],
    [10, 192, 25, 7.5],
    [0, 140, 25, 7.5],
    [20, 90, 21, 7.5],
    [-10, 40, 16, 8],
    [-60, 0, 10, 8],
    [-62, -50, 5, 8],
    [-110, -72, 2, 7.5],
    [-150, -40, 0, 7.5],
    [-200, -60, 0, 7.5],
    [-216, -110, 0, 7.5],
  ],
  sections: [
    { from: 0.0, to: 0.14, wall: "boards" },
    { from: 0.84, to: 1.0, wall: "wood", verge: 3 },
  ],
  bumps: [
    [0.66, 10, 1.3],
    [0.695, 10, 1.3],
  ],
  items: [0.14, 0.45, 0.76],
  pads: [
    [0.3, 0],
    [0.56, 0],
  ],
  start: 0.03,
  scenery: {
    landmark: true,
    span: [{ prop: "gantry", at: 0.03 }],
    chevrons: { minCurv: 0.02, every: 11 },
    scatter: [
      { prop: ["tree_apple", "tree_apple", "tree_autumn"], every: 10, from: 0.72, to: 0.86, side: "both", dist: [3, 20], scale: [0.85, 1.25], seed: 81 },
      { prop: ["stall", "shop", "shop2", "lantern"], every: 17, from: 0.84, to: 1.0, side: "both", dist: [1.5, 10], face: true, seed: 82 },
      { prop: ["cactus", "rock"], every: 24, from: 0.56, to: 0.72, side: "both", dist: [3, 18], scale: [0.8, 1.3], seed: 83 },
      { prop: ["tree_cherry", "flowers"], every: 18, from: 0.34, to: 0.55, side: "both", dist: [3, 22], seed: 84 },
      { prop: "lamp", every: 34, dist: [0.2, 1.0], face: true, seed: 85 },
    ],
    along: [
      { prop: "stand", at: 0.015, side: -1, dist: 4 },
      { prop: "flag_eland", at: 0.055, side: -1, dist: 1 },
      { prop: "flag_red", at: 0.085, side: -1, dist: 1 },
    ],
    place: [
      { prop: "stall", x: -186, z: -28, rot: -0.6 },
      { prop: "stall", x: -206, z: -92, rot: 1.4 },
      { prop: "cactus", x: 34, z: 164, y: 24, scale: 1.3 },
      { prop: "tree_apple", x: -104, z: -22, scale: 1.4 },
    ],
  },
};
