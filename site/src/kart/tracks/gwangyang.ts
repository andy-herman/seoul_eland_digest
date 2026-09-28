import type { TrackDef } from "../types";

// 7. Gwangyang Dragon Harbor (광양 드래곤 하버): from the Dragons' stadium plaza and its dragon
// statue, through the steelworks, a container-yard slalom by the port cranes, and up onto the
// Yi Sun-sin Bridge high over the bay.
export const GWANGYANG: TrackDef = {
  id: "gwangyang",
  laps: 2,
  theme: "gwangyang",
  verge: 4.5,
  wall: "rail",
  surface: "concrete",
  points: [
    [-150, -100, 0, 8.5],
    [-40, -110, 0, 8.5],
    [60, -96, 0, 8],
    [120, -60, 0, 8],
    [116, -10, 0, 8],
    [150, 30, 0, 8],
    [210, 26, 0, 7.5],
    [242, 60, 0, 7],
    [212, 96, 0, 7],
    [242, 132, 0, 7],
    [216, 172, 1, 7.5],
    [150, 192, 6, 8],
    [60, 202, 14, 8],
    [-40, 206, 20, 8],
    [-140, 200, 20, 8],
    [-230, 186, 14, 8],
    [-290, 140, 7, 8],
    [-302, 70, 2, 8],
    [-272, 0, 0, 8.5],
    [-222, -70, 0, 8.5],
  ],
  sections: [
    { from: 0.5, to: 0.8, bridge: true, wall: "rail", verge: 2 },
    { from: 0.3, to: 0.46, wall: "tires", verge: 3 },
    { from: 0.0, to: 0.1, wall: "boards" },
  ],
  bumps: [[0.865, 11, 1.3]],
  items: [0.1, 0.4, 0.7],
  pads: [
    [0.6, 0],
    [0.9, 0],
  ],
  start: 0.03,
  scenery: {
    landmark: true,
    span: [{ prop: "gantry", at: 0.03 }],
    chevrons: { minCurv: 0.02, every: 12 },
    scatter: [
      { prop: ["container0", "container1", "container2", "container3"], every: 18, from: 0.28, to: 0.45, side: "right", dist: [5, 24], scale: [0.9, 1.25], face: true, seed: 71 },
      { prop: ["chimney", "tank"], every: 55, from: 0.15, to: 0.5, side: "right", dist: [28, 72], scale: [0.85, 1.15], seed: 72 },
      { prop: ["boat", "buoy"], every: 50, from: 0.5, to: 0.85, side: "both", dist: [18, 70], seed: 73 },
      { prop: "lamp", every: 34, dist: [0.2, 1.0], face: true, seed: 74 },
    ],
    along: [
      { prop: "stand", at: 0.015, side: -1, dist: 4 },
      { prop: "flag_eland", at: 0.055, side: -1, dist: 1 },
      { prop: "crane", at: 0.36, side: 1, dist: 20, scale: 1.15 },
      { prop: "crane", at: 0.41, side: 1, dist: 24, scale: 1.05 },
    ],
    place: [
      { prop: "tank", x: 252, z: 170, rot: -0.5 },
      { prop: "chimney", x: 272, z: 88, rot: 0.2 },
      { prop: "container0", x: 252, z: -42, rot: 1.4 },
      { prop: "container1", x: 268, z: -28, rot: 1.4 },
    ],
    water: [{ y: 0.02, points: [[-340, 100], [260, 100], [260, 260], [-340, 260]] }],
  },
};
