import { describe, expect, it } from "vitest";

import { sheetTimerTravel } from "@/features/study-session/sheetTimerTravel";

describe("sheetTimerTravel", () => {
  it("폰 세로는 타이머를 상태 필 아래까지 끌어올린다", () => {
    // 874 * 0.14 = 122.36
    expect(sheetTimerTravel(600, 402, 874)).toBeCloseTo(600 - 122.36);
  });

  it("폰 가로(높이 480 미만)는 움직이지 않는다", () => {
    expect(sheetTimerTravel(300, 874, 402)).toBe(0);
  });

  it("태블릿 가로는 세로 배치라 폰 세로처럼 따라 올라온다", () => {
    // 820 * 0.14 = 114.8
    expect(sheetTimerTravel(600, 1180, 820)).toBeCloseTo(600 - 114.8);
  });

  it("경계 높이 480은 compact가 아니다", () => {
    expect(sheetTimerTravel(400, 900, 480)).toBeCloseTo(400 - 67.2);
  });

  it("정사각 600x600은 compact가 아니다", () => {
    // 600 * 0.14 = 84
    expect(sheetTimerTravel(400, 600, 600)).toBeCloseTo(316);
  });

  it("목표보다 이미 위에 있으면 0이다", () => {
    expect(sheetTimerTravel(50, 402, 874)).toBe(0);
  });
});
