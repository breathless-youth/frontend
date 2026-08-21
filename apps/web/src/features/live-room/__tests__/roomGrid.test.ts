import { describe, expect, it } from "vitest";

import { formatStudyHhMm, roomGridSpec } from "../roomGrid";

describe("roomGridSpec", () => {
  it("1명은 풀스크린이다 — 타일 크롬 없음", () => {
    expect(roomGridSpec(1)).toEqual({ mode: "fullscreen" });
  });

  it("2명은 1열 2행이고 타일이 화면을 반씩 나눈다", () => {
    expect(roomGridSpec(2)).toEqual({ mode: "grid", cols: 1, rowUnit: 2 });
  });

  it("3~4명은 2열이고 타일 높이는 5~6명과 같다(1/3) — 그리드는 상단 시작", () => {
    expect(roomGridSpec(3)).toEqual({ mode: "grid", cols: 2, rowUnit: 3 });
    expect(roomGridSpec(4)).toEqual({ mode: "grid", cols: 2, rowUnit: 3 });
  });

  it("5~6명은 2열 3행이다", () => {
    expect(roomGridSpec(5)).toEqual({ mode: "grid", cols: 2, rowUnit: 3 });
    expect(roomGridSpec(6)).toEqual({ mode: "grid", cols: 2, rowUnit: 3 });
  });
});

describe("formatStudyHhMm", () => {
  it("초를 HH:MM으로 변환한다", () => {
    expect(formatStudyHhMm(12300)).toBe("03:25");
  });

  it("0초는 00:00이다", () => {
    expect(formatStudyHhMm(0)).toBe("00:00");
  });

  it("분 미만은 버린다", () => {
    expect(formatStudyHhMm(59)).toBe("00:00");
  });

  it("100시간 이상도 시간 자릿수를 늘려 표시한다", () => {
    expect(formatStudyHhMm(360000)).toBe("100:00");
  });
});
