import type { TrackDef } from "../types";

// 5. Busan Gwangan Bridge (부산 광안대교): east along the Gwangalli beach road, up onto the bridge
// over the sea, a long sweeping deck with the main span on top, down to the west shore, and back
// through the Haeundae high-rises.
export const BUSAN: TrackDef = {
  id: "busan",
  laps: 3,
  theme: "busan",
  verge: 5,
  wall: "rail",
  surface: "asphalt",
  points: [
    [-120, 0, 0, 8.5],
    [0, 6, 0, 8.5],
    [110, 0, 0, 8.5],
    [190, 22, 0, 8.5],
    [236, 72, 2, 8],
    [226, 132, 7, 8],
    [180, 172, 11, 8],
    [90, 192, 15, 8],
    [0, 198, 17, 8],
    [-90, 192, 15, 8],
    [-180, 174, 10, 8],
    [-250, 142, 5, 8],
    [-286, 86, 1, 8],
    [-272, 20, 0, 8],
    [-236, -46, 0, 8],
    [-180, -76, 0, 8],
    [-150, -52, 0, 8],
    [-126, -24, 0, 8.5],
  ],
  sections: [
    { from: 0.215, to: 0.66, bridge: true, wall: "rail", verge: 2 },
    { from: 0.72, to: 0.95, wall: "boards" },
  ],
  bumps: [[0.09, 10, 1.1]],
  items: [0.12, 0.43, 0.8],
  pads: [
    [0.44, 0],
    [0.62, 0],
  ],
  start: 0.03,
  scenery: {
    landmark: true,
    span: [{ prop: "gantry", at: 0.03 }],
    chevrons: { minCurv: 0.02, every: 13 },
    scatter: [
      { prop: ["tree_palm", "parasol", "parasol2"], every: 16, from: 0.0, to: 0.23, side: "right", dist: [4, 22], scale: [0.9, 1.3], seed: 51 },
      { prop: ["office", "apartment"], every: 44, from: 0.72, to: 0.98, side: "right", dist: [12, 42], scale: [0.8, 1.25], face: true, seed: 52 },
      { prop: ["boat", "buoy"], every: 45, from: 0.25, to: 0.7, side: "both", dist: [18, 70], scale: [0.9, 1.3], seed: 53 },
      { prop: "lamp", every: 32, dist: [0.2, 1.0], face: true, seed: 54 },
    ],
    along: [
      { prop: "stand", at: 0.015, side: -1, dist: 4 },
      { prop: "flag_eland", at: 0.045, side: -1, dist: 1 },
      { prop: "lifeguard", at: 0.11, side: 1, dist: 12, scale: 1.2 },
    ],
    place: [
      { prop: "office", x: -238, z: -118, rot: 0, scale: 1.35 },
      { prop: "office", x: -200, z: -122, rot: 0.1, scale: 1.1 },
      { prop: "parasol", x: -10, z: -42, rot: 0 },
      { prop: "parasol2", x: 32, z: -44, rot: 0 },
      { prop: "boat", x: 12, z: 250, rot: Math.PI / 2, scale: 1.3 },
    ],
    water: [{ y: 0.02, points: [[-340, 32], [280, 32], [280, 260], [-340, 260]] }],
  },
};
