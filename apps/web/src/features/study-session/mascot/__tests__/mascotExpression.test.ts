import { describe, expect, it } from "vitest";

import {
  BLINK_FRAMES,
  MASCOT_CELL,
  canBlink,
  mascotCellFor,
  nextBlinkDelayMs,
  shouldJump,
} from "../mascotExpression";
import { BREAK_STATE, distractionState, pauseState } from "../../sessionState";

const FOCUS = { kind: "FOCUS" } as const;

describe("mascotCellFor", () => {
  it("집중은 집중 칸이다", () => {
    expect(mascotCellFor(FOCUS)).toBe(MASCOT_CELL.focus);
  });
  it("졸음은 졸림, 폰·기기는 정색, 자리 비움은 놀람 칸이다", () => {
    expect(mascotCellFor(distractionState("SLEEP"))).toBe(MASCOT_CELL.sleepy);
    expect(mascotCellFor(distractionState("PHONE"))).toBe(MASCOT_CELL.blank);
    expect(mascotCellFor(distractionState("DEVICE"))).toBe(MASCOT_CELL.blank);
    expect(mascotCellFor(distractionState("AWAY"))).toBe(MASCOT_CELL.surprised);
  });
  it("모든 일시정지는 기본 칸이다", () => {
    expect(mascotCellFor(BREAK_STATE)).toBe(MASCOT_CELL.base);
    expect(mascotCellFor(pauseState("MANUAL"))).toBe(MASCOT_CELL.base);
    expect(mascotCellFor(pauseState("BACKGROUND"))).toBe(MASCOT_CELL.base);
  });
});

describe("shouldJump", () => {
  it("집중이 아닌 상태에서 집중으로 바뀌면 튄다", () => {
    expect(shouldJump(distractionState("PHONE"), FOCUS)).toBe(true);
    expect(shouldJump(BREAK_STATE, FOCUS)).toBe(true);
  });
  it("첫 렌더와 집중에서 집중은 튀지 않는다", () => {
    expect(shouldJump(null, FOCUS)).toBe(false);
    expect(shouldJump(FOCUS, FOCUS)).toBe(false);
  });
  it("집중에서 딴짓으로 바뀌면 튀지 않는다", () => {
    expect(shouldJump(FOCUS, distractionState("AWAY"))).toBe(false);
  });
});

describe("깜빡임", () => {
  it("기본과 집중 칸에서만 깜빡인다", () => {
    expect(canBlink(MASCOT_CELL.base)).toBe(true);
    expect(canBlink(MASCOT_CELL.focus)).toBe(true);
    expect(canBlink(MASCOT_CELL.sleepy)).toBe(false);
    expect(canBlink(MASCOT_CELL.jump)).toBe(false);
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
