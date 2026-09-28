import type { TrackDef } from "../types";

// 6. Jinhae Cherry Blossom Stream (진해 벚꽃길): weaves back and forth across the Yeojwacheon on
// four little bridges under the blossoms, hairpins by the Romance Bridge, and runs the old
// Gyeonghwa Station railway straight home.
export const JINHAE: TrackDef = {
  id: "jinhae",
  laps: 3,
  theme: "jinhae",
  verge: 4,
  wall: "wood",
  surface: "asphalt",
  points: [
    [-160, -46, 0, 7.5],
    [-60, -50, 0, 7.5],
    [10, -36, 0, 7],
    [50, -4, 0.8, 7],
    [96, 20, 0, 7],
    [136, 16, 0, 7],
    [166, -4, 0.8, 7],
    [202, -34, 0, 7],
    [252, -44, 0, 7.5],
    [290, -20, 0, 7.5],
    [300, 20, 0.8, 7.5],
    [280, 60, 0, 7.5],
    [220, 82, 0, 8],
    [150, 92, 0, 8],
    [108, 68, 0, 7.5],
    [58, 96, 0, 7.5],
    [0, 78, 0, 8],
    [-62, 94, 0, 8],
    [-130, 80, 0, 8],
    [-200, 56, 0, 7.5],
    [-216, 10, 0.8, 7.5],
    [-200, -30, 0, 7.5],
  ],
  sections: [
    { from: 0.13, to: 0.165, bridge: true, wall: "rail", verge: 1.5 },
    { from: 0.255, to: 0.29, bridge: true, wall: "rail", verge: 1.5 },
    { from: 0.455, to: 0.495, bridge: true, wall: "rail", verge: 1.5 },
    { from: 0.905, to: 0.945, bridge: true, wall: "rail", verge: 1.5 },
    { from: 0.55, to: 0.84, wall: "fence", verge: 5 },
  ],
  bumps: [[0.7, 10, 1.1]],
  items: [0.2, 0.52, 0.8],
  pads: [
    [0.6, 0],
    [0.98, -2],
  ],
  start: 0.03,
  scenery: {
    landmark: true,
    span: [{ prop: "gantry", at: 0.03 }],
    chevrons: { minCurv: 0.02, every: 12 },
    scatter: [
      { prop: ["tree_cherry", "tree_cherry", "tree_cherry", "flowers"], every: 8, dist: [1.5, 18], scale: [0.9, 1.35], seed: 61 },
      { prop: "lantern", every: 24, from: 0.12, to: 0.52, side: "both", dist: [0.5, 2.5], face: true, seed: 62 },
      { prop: ["shop", "shop2"], every: 42, from: 0.55, to: 0.84, side: "right", dist: [8, 20], face: true, seed: 63 },
      { prop: "bush", every: 12, dist: [0.5, 8], seed: 64 },
    ],
    along: [
      { prop: "stand", at: 0.015, side: -1, dist: 4 },
      { prop: "flag_eland", at: 0.055, side: -1, dist: 1 },
      { prop: "lantern", at: 0.925, side: 1, dist: 2 },
    ],
    place: [
      { prop: "shop", x: -178, z: 126, rot: Math.PI },
      { prop: "shop2", x: -134, z: 126, rot: Math.PI },
      { prop: "flowers", x: 324, z: 22, scale: 2 },
    ],
    water: [{ y: 0.02, points: [[-236, -70], [326, -70], [326, -58], [-236, -58]] }, { y: 0.02, points: [[-236, 108], [326, 108], [326, 120], [-236, 120]] }],
  },
};
