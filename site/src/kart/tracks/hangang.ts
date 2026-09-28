import type { TrackDef } from "../types";

// 2. Han River Night Run (한강 나이트 런): Yeouido at night. Out along the south bank past the 63
// Building, north over the river on a high bridge (Banpo style, with the rainbow fountain), west
// along the north bank, and back south on a low deck just above the water (Jamsu style).
export const HANGANG: TrackDef = {
  id: "hangang",
  laps: 3,
  theme: "hangang",
  verge: 5,
  wall: "rail",
  surface: "asphalt",
  points: [
    [30, 20, 0, 8.5],
    [110, 12, 0, 8.5],
    [165, 32, 0, 8],
    [205, 18, 0, 8],
    [246, 46, 0.6, 8],
    [256, 92, 5, 7.5],
    [256, 150, 8, 7.5],
    [256, 208, 8, 7.5],
    [251, 260, 4, 7.5],
    [226, 300, 0.4, 8],
    [170, 318, 0, 8],
    [112, 300, 0, 8],
    [62, 324, 0, 8],
    [12, 302, 0.6, 8],
    [-4, 256, 1.6, 7.5],
    [-4, 160, 1.6, 7.5],
    [-4, 92, 1.6, 7.5],
    [-8, 50, 0.6, 8],
    [2, 27, 0, 8.5],
  ],
  sections: [
    { from: 0.235, to: 0.405, bridge: true, wall: "rail", verge: 1.5 },
    { from: 0.735, to: 0.92, bridge: true, wall: "rail", verge: 1.5 },
    { from: 0.96, to: 0.08, wall: "boards" },
  ],
  bumps: [[0.47, 10, 1.2]],
  items: [0.1, 0.46, 0.7],
  pads: [
    [0.3, 0],
    [0.83, 2.5],
  ],
  start: 0.02,
  scenery: {
    landmark: true,
    span: [{ prop: "gantry", at: 0.02 }],
    chevrons: { minCurv: 0.02, every: 13 },
    scatter: [
      { prop: ["lamp", "lantern"], every: 28, dist: [0.2, 1.2], face: true, seed: 42 },
      { prop: ["tent", "stall"], every: 38, from: 0.96, to: 0.22, side: "right", dist: [3, 16], face: true, seed: 17 },
      { prop: ["apartment", "office"], every: 55, from: 0.45, to: 0.72, side: "right", dist: [18, 42], scale: [0.75, 1.15], face: true, seed: 5 },
      { prop: ["apartment", "office"], every: 55, from: 0.05, to: 0.22, side: "right", dist: [20, 48], scale: [0.75, 1.05], face: true, seed: 6 },
      { prop: ["boat", "buoy"], every: 45, from: 0.22, to: 0.95, side: "both", dist: [20, 70], scale: [0.9, 1.4], seed: 21 },
    ],
    along: [
      { prop: "stand", at: 0.018, side: -1, dist: 3 },
      { prop: "flag_eland", at: 0.045, side: -1, dist: 1 },
      { prop: "flag_red", at: 0.07, side: -1, dist: 1 },
    ],
    place: [
      { prop: "office", x: 112, z: -92, rot: 0, scale: 1.25 },
      { prop: "apartment", x: 172, z: -96, rot: 0.1 },
      { prop: "apartment", x: 214, z: 360, rot: Math.PI },
      { prop: "office", x: -72, z: 360, rot: Math.PI, scale: 1.1 },
      { prop: "boat", x: 112, z: 178, rot: Math.PI / 2, scale: 1.25 },
      { prop: "buoy", x: 72, z: 144 },
      { prop: "buoy", x: 156, z: 238 },
    ],
    water: [{ y: 0.02, points: [[-80, 66], [310, 66], [310, 250], [-80, 250]] }],
  },
};
