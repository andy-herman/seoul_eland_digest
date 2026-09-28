import type { TrackDef } from "../types";
import { BUSAN } from "./busan";
import { DAEGU } from "./daegu";
import { GWANGYANG } from "./gwangyang";
import { HANGANG } from "./hangang";
import { JINHAE } from "./jinhae";
import { MOKDONG } from "./mokdong";
import { NAMSAN } from "./namsan";
import { SUWON } from "./suwon";

export const TRACKS: Record<string, TrackDef> = {
  mokdong: MOKDONG,
  hangang: HANGANG,
  namsan: NAMSAN,
  suwon: SUWON,
  busan: BUSAN,
  jinhae: JINHAE,
  gwangyang: GWANGYANG,
  daegu: DAEGU,
};
