import { describe, expect, it } from "vitest";

import { sheetTimerTravel } from "@/features/study-session/sheetTimerTravel";

describe("sheetTimerTravel", () => {
  it("폰 세로는 타이머를 상태 필 아래까지 끌어올린다", () => {
    // 874 * 0.14 = 122.36
    expect(sheetTimerTravel(600, 85, 402, 874)).toBeCloseTo(600 - 122.36);
  });

  it("폰 세로는 타이머 높이와 상관없이 결과가 같다", () => {
    expect(sheetTimerTravel(600, 200, 402, 874)).toBeCloseTo(600 - 122.36);
    // 667 * 0.14 = 93.38
    expect(sheetTimerTravel(500, 85, 375, 667)).toBeCloseTo(500 - 93.38);
  });

  it("폰 가로(높이 480 미만)는 움직이지 않는다", () => {
    expect(sheetTimerTravel(300, 85, 874, 402)).toBe(0);
  });

  it("태블릿 가로는 큰 타이머가 시트 윗변 8px 위에 멈춘다", () => {
    // 820 * 0.27 - 135 - 8 = 78.4 가 820 * 0.14 = 114.8 보다 위다
    expect(sheetTimerTravel(600, 135, 1180, 820)).toBeCloseTo(600 - 78.4);
  });

  it("태블릿 세로는 비율 목표가 이미 시트 위라 비율을 그대로 쓴다", () => {
    // 1180 * 0.14 = 165.2, 1180 * 0.27 - 135 - 8 = 175.6
    expect(sheetTimerTravel(900, 135, 820, 1180)).toBeCloseTo(900 - 165.2);
  });

  it("상한은 폭 600부터 걸린다", () => {
    // 900 * 0.14 = 126, 900 * 0.27 - 135 - 8 = 100
    expect(sheetTimerTravel(600, 135, 599, 900)).toBeCloseTo(600 - 126);
    expect(sheetTimerTravel(600, 135, 600, 900)).toBeCloseTo(600 - 100);
  });

  it("경계 높이 480은 compact가 아니다", () => {
    expect(sheetTimerTravel(400, 0, 900, 480)).toBeCloseTo(400 - 67.2);
  });

  it("정사각 600x600은 compact가 아니다", () => {
    // 600 * 0.14 = 84
    expect(sheetTimerTravel(400, 0, 600, 600)).toBeCloseTo(316);
  });

  it("목표가 화면 위로 넘어가면 맨 위에서 멈춘다", () => {
    // 480 * 0.27 - 135 - 8 < 0
    expect(sheetTimerTravel(300, 135, 900, 480)).toBeCloseTo(300);
  });

  it("목표보다 이미 위에 있으면 0이다", () => {
    expect(sheetTimerTravel(50, 85, 402, 874)).toBe(0);
  });
});
