// Take Five levels. Coordinates: x across the pitch (0..40, goal centre at 20), y from the goal line
// (0) out toward halfway (34). Every level carries a reference solution (a scripted set of takes)
// that the headless suite replays: a level ships only if its solution scores with all three stars.
import type { LevelDef } from "./engine";

export type Chapter = "school" | "fives" | "moments";

export interface CampaignLevel extends LevelDef {
  chapter: Chapter;
  n: number; // number within the campaign, from 1
}

const GK = (x = 20, y = 1.4) => ({ role: "gk" as const, x, y });

export const LEVELS: CampaignLevel[] = [
  // ------------------------------------------------------------ chapter 1: overdub school
  {
    id: "l1",
    chapter: "school",
    n: 1,
    seconds: 6,
    slots: [{ num: 7, x: 20, y: 21 }],
    defenders: [GK()],
    opponent: "paju-frontier",
    tier: 1,
    ball: { slot: 0 },
    stars: [{ kind: "time", value: 4 }, { kind: "time", value: 2.6 }],
    solution: [
      {
        slot: 0,
        keys: [{ t: 1.25, x: 17.8, y: 12.6 }],
        acts: [{ t: 1.3, kind: "shot", tx: 23, ty: 0, th: 0.3, power: 0.9 }],
      },
    ],
  },
  {
    id: "l2",
    chapter: "school",
    n: 2,
    seconds: 8,
    slots: [
      { num: 10, x: 12, y: 19 },
      { num: 7, x: 29, y: 18 },
    ],
    defenders: [GK(), { role: "zone", x: 15, y: 11, radius: 3 }],
    opponent: "yongin-fc",
    tier: 1,
    ball: { slot: 0 },
    stars: [{ kind: "time", value: 5 }, { kind: "oneTouch" }],
    solution: [
      {
        slot: 0,
        keys: [{ t: 0.7, x: 14, y: 17 }],
        acts: [{ t: 0.75, kind: "pass", tx: 25.5, ty: 10 }],
      },
      {
        slot: 1,
        keys: [{ t: 1.75, x: 25.5, y: 10.3 }],
        acts: [{ t: 1.85, kind: "shot", tx: 17, ty: 0, th: 0.3, power: 0.85 }],
      },
    ],
  },
  {
    id: "l3",
    chapter: "school",
    n: 3,
    seconds: 8,
    slots: [
      { num: 22, x: 20, y: 22 },
      { num: 77, x: 31, y: 24 },
    ],
    defenders: [GK(), { role: "press", x: 20, y: 14 }],
    opponent: "gimhae-fc",
    tier: 1,
    ball: { slot: 0 },
    stars: [{ kind: "time", value: 5.5 }, { kind: "passes", value: 2 }],
    solution: [
      {
        slot: 0,
        keys: [
          { t: 0.6, x: 21, y: 19.5 },
          { t: 2.55, x: 19.2, y: 9.2 },
        ],
        acts: [{ t: 0.65, kind: "pass", tx: 30, ty: 13.4 }],
      },
      {
        slot: 1,
        keys: [
          { t: 1.5, x: 30, y: 13.4 },
          { t: 2.1, x: 29.2, y: 11.6 },
        ],
        acts: [{ t: 1.6, kind: "pass", tx: 19.3, ty: 9.2 }],
      },
      {
        slot: 0,
        keys: [
          { t: 0.6, x: 21, y: 19.5 },
          { t: 2.55, x: 19.2, y: 9.2 },
        ],
        acts: [
          { t: 0.65, kind: "pass", tx: 30, ty: 13.4 },
          { t: 2.6, kind: "shot", tx: 23, ty: 0, th: 0.3, power: 0.85 },
        ],
      },
    ],
  },
  {
    id: "l4",
    chapter: "school",
    n: 4,
    seconds: 8,
    slots: [
      { num: 8, x: 15, y: 21 },
      { num: 90, x: 23, y: 15 },
    ],
    defenders: [GK(), { role: "mark", x: 15.5, y: 17.2, mark: 0 }, { role: "zone", x: 25, y: 9, radius: 3 }],
    opponent: "ansan-greeners",
    tier: 1,
    ball: { slot: 0 },
    stars: [{ kind: "scorer", value: 0 }, { kind: "oneTouch" }],
    solution: [
      {
        slot: 0,
        keys: [
          { t: 0.25, x: 15.3, y: 20.6 },
          { t: 2.05, x: 18.6, y: 9.7 },
        ],
        acts: [{ t: 0.2, kind: "pass", tx: 22.3, ty: 15.5 }],
      },
      {
        slot: 1,
        keys: [{ t: 0.9, x: 22.3, y: 15.3 }],
        acts: [{ t: 1.35, kind: "pass", tx: 18.6, ty: 9.7 }],
      },
      {
        slot: 0,
        keys: [
          { t: 0.25, x: 15.3, y: 20.6 },
          { t: 2.05, x: 18.6, y: 9.7 },
        ],
        acts: [
          { t: 0.2, kind: "pass", tx: 22.3, ty: 15.5 },
          { t: 2.1, kind: "shot", tx: 23, ty: 0, th: 0.3, power: 0.85 },
        ],
      },
    ],
  },
  // ------------------------------------------------------------ chapter 2: five-a-side
  {
    id: "l5",
    chapter: "fives",
    n: 5,
    seconds: 8,
    slots: [
      { num: 6, x: 20, y: 24 },
      { num: 7, x: 11, y: 17 },
      { num: 16, x: 29, y: 17 },
    ],
    defenders: [GK(), { role: "zone", x: 14, y: 11, radius: 3 }, { role: "zone", x: 26, y: 11, radius: 3 }],
    opponent: "suwon-fc",
    tier: 2,
    ball: { slot: 0 },
    stars: [{ kind: "time", value: 5.5 }, { kind: "scorer", value: 0 }],
    solution: [
      {
        slot: 0,
        keys: [{ t: 0.5, x: 19, y: 22.5 }, { t: 3.8, x: 21, y: 8.6 }],
        acts: [{ t: 0.5, kind: "pass", tx: 12.5, ty: 16 }],
      },
      {
        slot: 1,
        keys: [{ t: 1.2, x: 12.5, y: 16.2 }, { t: 1.7, x: 13.5, y: 15 }],
        acts: [{ t: 1.5, kind: "lob", tx: 31.5, ty: 7 }],
      },
      {
        slot: 2,
        keys: [{ t: 1.4, x: 31, y: 13 }, { t: 2.9, x: 31.5, y: 7.3 }],
        acts: [{ t: 2.95, kind: "pass", tx: 21, ty: 8.6 }],
      },
      {
        slot: 0,
        keys: [{ t: 0.5, x: 19, y: 22.5 }, { t: 3.8, x: 21, y: 8.6 }],
        acts: [
          { t: 0.5, kind: "pass", tx: 12.5, ty: 16 },
          { t: 3.85, kind: "shot", tx: 16.9, ty: 0, th: 0.3, power: 0.9 },
        ],
      },
    ],
  },
  {
    id: "l6",
    chapter: "fives",
    n: 6,
    seconds: 9,
    slots: [
      { num: 22, x: 8, y: 22 },
      { num: 77, x: 34, y: 19 },
      { num: 7, x: 19, y: 19 },
    ],
    defenders: [GK(), { role: "mark", x: 19, y: 16, mark: 2 }, { role: "zone", x: 12, y: 13, radius: 4 }, { role: "zone", x: 27, y: 12, radius: 3 }],
    opponent: "cheonan-city",
    tier: 2,
    ball: { slot: 0 },
    stars: [{ kind: "time", value: 6.5 }, { kind: "header" }],
    solution: [
      {
        slot: 0,
        keys: [{ t: 0.4, x: 8.5, y: 21.5 }],
        acts: [{ t: 0.45, kind: "lob", tx: 33, ty: 12 }],
      },
      {
        slot: 1,
        keys: [{ t: 2.25, x: 33, y: 12.2 }, { t: 3.1, x: 34.5, y: 7.5 }],
        acts: [{ t: 3.1, kind: "lob", tx: 18, ty: 4.5 }],
      },
      {
        slot: 2,
        keys: [{ t: 2.0, x: 22, y: 14 }, { t: 3.2, x: 23, y: 11 }, { t: 4.3, x: 18.5, y: 5 }],
        acts: [{ t: 4.3, kind: "shot", tx: 22.5, ty: 0, th: 0.4, power: 0.9 }],
      },
    ],
  },
  {
    id: "l7",
    chapter: "fives",
    n: 7,
    seconds: 8,
    slots: [
      { num: 77, x: 35, y: 16 },
      { num: 10, x: 18, y: 19 },
      { num: 16, x: 26, y: 21 },
    ],
    defenders: [GK(), { role: "zone", x: 31, y: 9, radius: 3 }, { role: "mark", x: 18.5, y: 16, mark: 1 }, { role: "zone", x: 17, y: 6, radius: 2.5 }],
    opponent: "hwaseong-fc",
    tier: 2,
    ball: { slot: 0 },
    stars: [{ kind: "time", value: 5 }, { kind: "oneTouch" }],
    solution: [
      {
        slot: 0,
        keys: [{ t: 1.8, x: 37, y: 3 }],
        acts: [{ t: 1.9, kind: "pass", tx: 23, ty: 11.5 }],
      },
      {
        slot: 1,
        keys: [{ t: 1.6, x: 16, y: 9 }, { t: 2.6, x: 14.5, y: 4.5 }],
        acts: [],
      },
      {
        slot: 2,
        keys: [{ t: 1.5, x: 25, y: 15 }, { t: 2.85, x: 23, y: 11.8 }],
        acts: [{ t: 2.9, kind: "shot", tx: 16.9, ty: 0, th: 0.3, power: 0.9 }],
      },
    ],
  },
  {
    id: "l8",
    chapter: "fives",
    n: 8,
    seconds: 9,
    slots: [
      { num: 6, x: 20, y: 24 },
      { num: 22, x: 12, y: 20 },
      { num: 7, x: 28, y: 19 },
      { num: 10, x: 20, y: 16 },
    ],
    defenders: [GK(), { role: "zone", x: 15, y: 12, radius: 3 }, { role: "zone", x: 25, y: 12, radius: 3 }, { role: "press", x: 20, y: 19 }],
    opponent: "gimpo-fc",
    tier: 2,
    ball: { slot: 0 },
    stars: [{ kind: "time", value: 6 }, { kind: "passes", value: 4 }],
    solution: [
      {
        slot: 0,
        keys: [{ t: 0.3, x: 19.5, y: 23.5 }, { t: 1.6, x: 18.5, y: 21.5 }],
        acts: [{ t: 0.3, kind: "pass", tx: 13, ty: 19.5 }],
      },
      {
        slot: 1,
        keys: [{ t: 1.0, x: 13, y: 19.7 }],
        acts: [{ t: 1.15, kind: "pass", tx: 18.5, ty: 21.5 }],
      },
      {
        slot: 0,
        keys: [{ t: 0.3, x: 19.5, y: 23.5 }, { t: 1.6, x: 18.5, y: 21.5 }],
        acts: [
          { t: 0.3, kind: "pass", tx: 13, ty: 19.5 },
          { t: 1.75, kind: "pass", tx: 28.5, ty: 16 },
        ],
      },
      {
        slot: 2,
        keys: [{ t: 2.6, x: 28.5, y: 16.2 }, { t: 3.0, x: 29, y: 15 }],
        acts: [{ t: 2.8, kind: "lob", tx: 22, ty: 8 }],
      },
      {
        slot: 3,
        keys: [{ t: 2.4, x: 21, y: 13 }, { t: 3.75, x: 22, y: 8.3 }],
        acts: [{ t: 3.85, kind: "shot", tx: 16.9, ty: 0, th: 0.3, power: 0.9 }],
      },
    ],
  },
  // ------------------------------------------------------------ chapter 3: big moments
  {
    id: "l9",
    chapter: "moments",
    n: 9,
    seconds: 7,
    slots: [
      { num: 10, x: 39.4, y: 0.6 },
      { num: 7, x: 24, y: 12 },
      { num: 16, x: 16, y: 11 },
      { num: 5, x: 21, y: 17 },
    ],
    defenders: [GK(20.5, 1.2), { role: "zone", x: 23.8, y: 3, radius: 1.5 }, { role: "mark", x: 23.5, y: 10, mark: 1 }, { role: "mark", x: 16.5, y: 9.5, mark: 2 }],
    opponent: "chungbuk-cheongju",
    tier: 2,
    ball: { slot: 0 },
    stars: [{ kind: "header" }, { kind: "scorer", value: 3 }],
    solution: [
      {
        slot: 0,
        keys: [{ t: 0.3, x: 39.2, y: 0.8 }],
        acts: [{ t: 0.5, kind: "lob", tx: 20.5, ty: 9.2, th: 1.5 }],
      },
      {
        slot: 1,
        keys: [{ t: 1.3, x: 26, y: 3.5 }],
        acts: [],
      },
      {
        slot: 2,
        keys: [{ t: 1.4, x: 14.5, y: 3.5 }],
        acts: [],
      },
      {
        slot: 3,
        keys: [{ t: 1.4, x: 20.7, y: 12 }, { t: 1.95, x: 20.5, y: 9.5 }],
        acts: [{ t: 2.0, kind: "shot", tx: 17.2, ty: 0, th: 0.4, power: 0.9 }],
      },
    ],
  },
  {
    id: "l10",
    chapter: "moments",
    n: 10,
    seconds: 7,
    slots: [
      { num: 10, x: 20, y: 21 },
      { num: 7, x: 16, y: 20.5 },
      { num: 16, x: 24.5, y: 20.5 },
    ],
    defenders: [GK(), { role: "wall", x: 19.3, y: 15.5 }, { role: "wall", x: 20.7, y: 15.5 }, { role: "zone", x: 25, y: 9, radius: 3 }],
    opponent: "chungnam-asan",
    tier: 3,
    ball: { slot: 0 },
    stars: [{ kind: "oneTouch" }, { kind: "time", value: 2.6 }],
    solution: [
      {
        slot: 0,
        keys: [],
        acts: [{ t: 0.55, kind: "lob", tx: 18, ty: 9 }],
      },
      {
        slot: 1,
        keys: [{ t: 0.6, x: 16.8, y: 17 }, { t: 1.75, x: 18, y: 9.3 }],
        acts: [{ t: 1.8, kind: "shot", tx: 23, ty: 0, th: 0.3, power: 0.9 }],
      },
      {
        slot: 2,
        keys: [{ t: 1.2, x: 26, y: 14 }],
        acts: [],
      },
    ],
  },
  {
    id: "l11",
    chapter: "moments",
    n: 11,
    seconds: 10,
    slots: [
      { num: 77, x: 30, y: 31 },
      { num: 7, x: 20, y: 29 },
      { num: 16, x: 10, y: 31 },
      { num: 6, x: 24, y: 33 },
    ],
    defenders: [GK(), { role: "zone", x: 15, y: 15, radius: 3 }, { role: "zone", x: 25, y: 15, radius: 3 }],
    opponent: "daegu-fc",
    tier: 3,
    ball: { slot: 0 },
    stars: [{ kind: "time", value: 7 }, { kind: "passes", value: 3 }],
    solution: [
      {
        slot: 0,
        keys: [{ t: 1.0, x: 29.6, y: 25 }, { t: 3.9, x: 22, y: 8.3 }],
        acts: [{ t: 1.05, kind: "pass", tx: 21, ty: 20.3 }],
      },
      {
        slot: 1,
        keys: [{ t: 1.9, x: 21, y: 20.5 }],
        acts: [{ t: 2.0, kind: "pass", tx: 12, ty: 13 }],
      },
      {
        slot: 2,
        keys: [{ t: 2.95, x: 12, y: 13.3 }],
        acts: [{ t: 3.05, kind: "pass", tx: 22, ty: 8 }],
      },
      {
        slot: 0,
        keys: [{ t: 1.0, x: 29.6, y: 25 }, { t: 3.9, x: 22, y: 8.3 }],
        acts: [
          { t: 1.05, kind: "pass", tx: 21, ty: 20.3 },
          { t: 4.0, kind: "shot", tx: 17, ty: 0, th: 0.3, power: 0.9 },
        ],
      },
    ],
  },
  {
    id: "l12",
    chapter: "moments",
    n: 12,
    seconds: 10,
    slots: [
      { num: 6, x: 20, y: 27 },
      { num: 22, x: 10, y: 22 },
      { num: 77, x: 33, y: 21 },
      { num: 7, x: 20, y: 19 },
      { num: 10, x: 26, y: 25 },
    ],
    defenders: [GK(), { role: "mark", x: 20, y: 16, mark: 3 }, { role: "mark", x: 31, y: 17, mark: 2 }, { role: "zone", x: 14, y: 12, radius: 3 }, { role: "press", x: 20, y: 23 }],
    opponent: "busan-ipark",
    tier: 3,
    ball: { slot: 0 },
    stars: [{ kind: "passes", value: 4 }, { kind: "allTouch" }],
    solution: [
      {
        slot: 0,
        keys: [{ t: 0.3, x: 19.6, y: 26.5 }],
        acts: [{ t: 0.3, kind: "pass", tx: 11, ty: 21 }],
      },
      {
        slot: 1,
        keys: [{ t: 0.95, x: 11, y: 21.2 }],
        acts: [{ t: 1.15, kind: "pass", tx: 15.5, ty: 18.5 }],
      },
      {
        slot: 3,
        keys: [{ t: 1.55, x: 15.5, y: 18.7 }],
        acts: [{ t: 1.62, kind: "pass", tx: 10, ty: 18.2 }],
      },
      {
        slot: 1,
        keys: [{ t: 0.95, x: 11, y: 21.2 }, { t: 2.15, x: 10, y: 18.4 }],
        acts: [
          { t: 1.15, kind: "pass", tx: 15.5, ty: 18.5 },
          { t: 2.3, kind: "lob", tx: 24.5, ty: 21.5 },
        ],
      },
      {
        slot: 4,
        keys: [{ t: 3.3, x: 24.5, y: 21.7 }],
        acts: [{ t: 3.72, kind: "pass", tx: 28.6, ty: 22 }],
      },
      {
        slot: 2,
        keys: [{ t: 3.3, x: 32.6, y: 21, hold: true }, { t: 4.15, x: 28.6, y: 22.1 }],
        acts: [{ t: 4.2, kind: "pass", tx: 22, ty: 11 }],
      },
      {
        slot: 0,
        keys: [{ t: 0.3, x: 19.6, y: 26.5 }, { t: 3.6, x: 22, y: 19 }, { t: 5.2, x: 22, y: 11.2 }],
        acts: [
          { t: 0.3, kind: "pass", tx: 11, ty: 21 },
          { t: 5.15, kind: "shot", tx: 23.2, ty: 0, th: 0.3, power: 0.9 },
        ],
      },
    ],
  },
];

export const ALL_LEVELS: LevelDef[] = [...LEVELS];
