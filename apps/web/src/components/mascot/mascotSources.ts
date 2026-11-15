import book from "@/assets/points/mascot-book.png";
import camcorder from "@/assets/points/mascot-camcorder.png";
import lamp from "@/assets/points/mascot-lamp.png";
import padlock from "@/assets/points/mascot-padlock.png";
import pencil from "@/assets/points/mascot-pencil.png";
import planner from "@/assets/points/mascot-planner.png";
import stopwatch from "@/assets/points/mascot-stopwatch.png";

import type { MascotId } from "./types";

/** 마스코트의 기본 정지 그림이며 소품 그림은 이 그림과 같은 판 크기로 만든다. */
export const MASCOT_SRC: Record<MascotId, string> = {
  book,
  planner,
  pencil,
  stopwatch,
  lamp,
  padlock,
  camcorder,
};
