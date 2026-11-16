import { MASCOT_SRC } from "./mascotSources";
import type { MascotId } from "./types";

/**
 * 마스코트 표정 그림의 이름
 *
 * 기본, 정색, 눈 감음, 기본 자세에 웃는 눈은 기본 정지 그림과 몸이 같은 자리에 있다.
 * 소품을 기본 그림에 맞춰 그려서, 표정 그림의 몸 실루엣을 기본 그림에 맞춰 크기(±2% 안)와 자리를 고친 그림을 쓴다.
 * 점프는 몸이 판 안에서 이미 기울고 위로 올라가 있어 소품을 함께 맞추려면 MASCOT_JUMP_TILT만큼 움직인다.
 */
export type MascotExpression = "idle" | "squint" | "closed" | "jump" | "joy";

const EXPRESSIONS: readonly MascotExpression[] = ["idle", "squint", "closed", "jump", "joy"];

// 그림 주소만 모으고 그림은 화면이 그 마스코트를 그릴 때 받아 온다.
const FILES = import.meta.glob<string>("../../assets/mascot/expressions/*.png", {
  eager: true,
  import: "default",
});

function expressionsOf(id: MascotId): Record<MascotExpression, string> {
  return Object.fromEntries(
    EXPRESSIONS.map((expression) => [
      expression,
      // 그림이 빠지면 화면이 깨지지 않게 기본 정지 그림으로 그리고, 빠진 그림은 테스트가 잡는다.
      FILES[`../../assets/mascot/expressions/${id}-${expression}.png`] ?? MASCOT_SRC[id],
    ]),
  ) as Record<MascotExpression, string>;
}

/** 마스코트별 표정 그림이며 기본 정지 그림과 같은 판 크기다. */
export const MASCOT_EXPRESSION_SRC: Record<MascotId, Record<MascotExpression, string>> = {
  book: expressionsOf("book"),
  planner: expressionsOf("planner"),
  pencil: expressionsOf("pencil"),
  stopwatch: expressionsOf("stopwatch"),
  lamp: expressionsOf("lamp"),
  padlock: expressionsOf("padlock"),
  camcorder: expressionsOf("camcorder"),
};

/**
 * 점프 그림의 몸이 기본 자리에서 움직인 정도
 *
 * 판 한 변을 1024로 본 이동 거리와 반시계 방향 회전 각도이며 판 가운데가 회전축이다.
 * 점프 그림과 기본 정지 그림의 몸 윤곽을 맞춰 측정한 값이라 그림을 바꾸면 다시 측정한다.
 * 점프 그림도 서 있는 표정과 같은 크기 보정을 한 뒤, 접은 다리와 얼굴 줄을 빼고 몸 윤곽이 가장 잘 겹치는 값을 다시 측정했다.
 */
export const MASCOT_JUMP_TILT: Record<MascotId, { angle: number; x: number; y: number }> = {
  book: { angle: 6, x: 3, y: -52 },
  planner: { angle: 5.9, x: 15, y: -50 },
  pencil: { angle: 6, x: 2, y: -32 },
  stopwatch: { angle: 5.5, x: 5, y: -51 },
  lamp: { angle: 5.9, x: 2, y: -49 },
  padlock: { angle: 6.3, x: 0, y: -39 },
  camcorder: { angle: 6.2, x: 2, y: -39 },
};

/**
 * 기본 표정에서 발끝이 닿는 높이
 *
 * 판 위쪽부터의 비율이며 320 판에서 가장 아래 불투명한 줄 바로 아래 자리다.
 * 마스코트를 바닥 그림자에 세우는 화면이 캐릭터마다 다른 발 높이를 맞출 때 쓴다.
 */
export const MASCOT_FOOT_Y: Record<MascotId, number> = {
  book: 255 / 320,
  planner: 270 / 320,
  pencil: 287 / 320,
  stopwatch: 286 / 320,
  lamp: 259 / 320,
  padlock: 289 / 320,
  camcorder: 249 / 320,
};

/** 점프 그림의 몸에 소품을 맞추는 CSS transform이며 판 크기 상자에 판 가운데를 축으로 건다. */
export function jumpTiltTransform(id: MascotId): string {
  const { angle, x, y } = MASCOT_JUMP_TILT[id];
  const percent = (value: number) => `${Number(((value / 1024) * 100).toFixed(4))}%`;
  return `translate(${percent(x)}, ${percent(y)}) rotate(${-angle}deg)`;
}
