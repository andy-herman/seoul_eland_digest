import type { TrackDef } from "../types";

// 4. Suwon Hwaseong Fortress (수원 화성): a brick boulevard north through Janganmun, along the
// fortress wall, up and down Paldalsan, over the Suwoncheon on stone bridges, a narrow market
// alley, and a half lap round the Paldalmun gate before the line.
export const SUWON: TrackDef = {
  id: "suwon",
  laps: 2,
  theme: "suwon",
  verge: 4,
  wall: "stone",
  surface: "brick",
  points: [
    [150, -150, 0, 9],
    [156, -60, 0, 9],
    [150, 30, 0, 9],
    [145, 110, 0, 8.5],
    [124, 168, 1, 8],
    [60, 186, 3, 8],
    [0, 166, 5, 8],
    [-60, 186, 7, 8],
    [-122, 160, 9, 8],
    [-162, 110, 11, 7.5],
    [-150, 62, 11, 7.5],
    [-186, 20, 9, 7.5],
    [-160, -22, 6, 7.5],
    [-108, -30, 3, 8],
    [-60, -10, 1.5, 8],
    [-18, -42, 0.5, 7],
    [-30, -92, 0, 6.5],
    [10, -122, 0, 6.5],
    [0, -170, 0, 6.5],
    [40, -202, 0, 8],
    [80, -250, 0, 8],
    [122, -256, 0, 8],
    [142, -214, 0, 8.5],
  ],
  sections: [
    { from: 0.0, to: 0.2, wall: "boards", verge: 5 },
    { from: 0.255, to: 0.3, bridge: true, wall: "stone", verge: 1.5 },
    { from: 0.585, to: 0.625, bridge: true, wall: "stone", verge: 1.5 },
    { from: 0.64, to: 0.78, wall: "wood", verge: 2 },
  ],
  bumps: [[0.165, 12, 1.4]],
  items: [0.12, 0.44, 0.74],
  pads: [
    [0.06, -3],
    [0.36, 0],
  ],
  start: 0.03,
  scenery: {
    landmark: true,
    span: [{ prop: "gantry", at: 0.03 }],
    chevrons: { minCurv: 0.02, every: 12 },
    scatter: [
      { prop: ["tree_autumn", "tree_autumn", "tree_round"], every: 12, dist: [2, 20], scale: [0.85, 1.25], seed: 44 },
      { prop: ["shop", "shop2", "stall"], every: 18, from: 0.64, to: 0.78, side: "both", dist: [1, 8], face: true, seed: 9 },
      { prop: "lamp", every: 34, dist: [0.2, 0.8], face: true, seed: 18 },
      { prop: "flowers", every: 30, dist: [0.5, 4], seed: 27 },
    ],
    along: [
      { prop: "stand", at: 0.015, side: -1, dist: 4 },
      { prop: "flag_eland", at: 0.055, side: -1, dist: 1 },
      { prop: "flag_red", at: 0.085, side: -1, dist: 1 },
    ],
    place: [
      { prop: "hanok", x: -74, z: 216, y: 8, rot: Math.PI, scale: 1.1 },
      { prop: "stall", x: -52, z: -72, rot: 1.4 },
      { prop: "shop", x: -4, z: -82, rot: 1.2 },
      { prop: "shop2", x: 28, z: -190, rot: -0.3 },
    ],
    water: [{ y: 0.02, points: [[84, 170], [18, 166], [8, 204], [88, 206], [108, 188]] }, { y: 0.02, points: [[-170, -42], [-86, -42], [-86, -16], [-172, -10]] }],
  },
};
