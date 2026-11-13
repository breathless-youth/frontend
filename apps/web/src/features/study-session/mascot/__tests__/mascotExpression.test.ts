import { describe, expect, it } from "vitest";

import {
  BLINK_FRAMES,
  MASCOT_CELL,
  canBlink,
  mascotCellFor,
  nextBlinkDelayMs,
  transitionFramesTo,
} from "../mascotExpression";
import { BREAK_STATE, distractionState, pauseState } from "../../sessionState";

const FOCUS = { kind: "FOCUS" } as const;

describe("mascotCellFor", () => {
  it("집중은 집중 칸이다", () => {
    expect(mascotCellFor(FOCUS)).toBe(MASCOT_CELL.focus);
  });
  it("졸음은 졸림 칸이다", () => {
    expect(mascotCellFor(distractionState("SLEEP"))).toBe(MASCOT_CELL.sleepy);
  });
  it("폰·기기는 정색 칸이다", () => {
    expect(mascotCellFor(distractionState("PHONE"))).toBe(MASCOT_CELL.blank);
    expect(mascotCellFor(distractionState("DEVICE"))).toBe(MASCOT_CELL.blank);
  });
  it("자리 비움은 실루엣 칸이다", () => {
    expect(MASCOT_CELL.silhouette).toBe(8);
    expect(mascotCellFor(distractionState("AWAY"))).toBe(MASCOT_CELL.silhouette);
  });
  it("모든 일시정지는 기본 칸이다", () => {
    expect(mascotCellFor(BREAK_STATE)).toBe(MASCOT_CELL.base);
    expect(mascotCellFor(pauseState("MANUAL"))).toBe(MASCOT_CELL.base);
    expect(mascotCellFor(pauseState("BACKGROUND"))).toBe(MASCOT_CELL.base);
  });
  it("점프 칸은 어떤 상태에도 쓰지 않는다", () => {
    const states = [
      FOCUS,
      BREAK_STATE,
      pauseState("MANUAL"),
      pauseState("BACKGROUND"),
      distractionState("SLEEP"),
      distractionState("PHONE"),
      distractionState("DEVICE"),
      distractionState("AWAY"),
    ];
    expect(states.map(mascotCellFor)).not.toContain(MASCOT_CELL.jump);
  });
});

describe("깜빡임", () => {
  it("기본과 집중 칸에서만 깜빡인다", () => {
    expect(canBlink(MASCOT_CELL.base)).toBe(true);
    expect(canBlink(MASCOT_CELL.focus)).toBe(true);
    expect(canBlink(MASCOT_CELL.sleepy)).toBe(false);
    expect(canBlink(MASCOT_CELL.blank)).toBe(false);
  });
  it("화남, 정색, 화남 순서로 3f·4f·3f에 맞춘 오프셋을 쓴다", () => {
    expect(BLINK_FRAMES).toEqual([
      { cell: MASCOT_CELL.angry, offset: 0 },
      { cell: MASCOT_CELL.blank, offset: 0.3 },
      { cell: MASCOT_CELL.angry, offset: 0.7 },
    ]);
  });
  it("간격은 4~6초 사이다", () => {
    expect(nextBlinkDelayMs(() => 0)).toBe(4000);
    expect(nextBlinkDelayMs(() => 0.999)).toBeLessThan(6000);
  });
});

describe("transitionFramesTo", () => {
  it("한 번만 눈을 감았다가 새 칸을 끝까지 보인다", () => {
    expect(transitionFramesTo(MASCOT_CELL.sleepy)).toEqual([
      { cell: MASCOT_CELL.angry, offset: 0 },
      { cell: MASCOT_CELL.blank, offset: 0.3 },
      { cell: MASCOT_CELL.sleepy, offset: 0.7 },
      { cell: MASCOT_CELL.sleepy, offset: 1 },
    ]);
  });
  it("실루엣으로 갈 때도 같은 순서를 쓴다", () => {
    expect(transitionFramesTo(MASCOT_CELL.silhouette)).toEqual([
      { cell: MASCOT_CELL.angry, offset: 0 },
      { cell: MASCOT_CELL.blank, offset: 0.3 },
      { cell: MASCOT_CELL.silhouette, offset: 0.7 },
      { cell: MASCOT_CELL.silhouette, offset: 1 },
    ]);
  });
  it("새 칸이 정색이면 눈을 감은 채 정색에서 끝난다", () => {
    expect(transitionFramesTo(MASCOT_CELL.blank)).toEqual([
      { cell: MASCOT_CELL.angry, offset: 0 },
      { cell: MASCOT_CELL.blank, offset: 0.3 },
      { cell: MASCOT_CELL.blank, offset: 1 },
    ]);
  });
});
