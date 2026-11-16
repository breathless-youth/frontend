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

/**
 * 두 눈 사이 가운데 점
 *
 * 그림 판에 대한 비율이며 얼굴을 기준으로 마스코트를 크게 잘라 넣는 화면이 쓴다.
 * 마스코트 그림을 바꾸면 눈 자리를 다시 측정해 맞춘다.
 */
export const MASCOT_EYE_CENTER: Record<MascotId, { x: number; y: number }> = {
  book: { x: 0.4978, y: 0.4122 },
  planner: { x: 0.5383, y: 0.4356 },
  pencil: { x: 0.498, y: 0.4917 },
  stopwatch: { x: 0.4952, y: 0.4705 },
  lamp: { x: 0.4984, y: 0.4066 },
  padlock: { x: 0.497, y: 0.5244 },
  camcorder: { x: 0.4492, y: 0.5073 },
};
