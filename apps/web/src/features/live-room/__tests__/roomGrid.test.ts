import { describe, expect, it } from "vitest";

import { bestSquareGrid, formatStudyHhMm } from "../roomGrid";

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

describe("bestSquareGrid", () => {
  // 가로는 위 16 · 좌우 16 · 아래 112(큰 태블릿은 136)를 뺀 격자 칸이다.
  // 세로는 위 122 · 아래 112(큰 태블릿은 위 148 · 아래 136)를 뺀다.
  const LANDSCAPE = [1148, 692] as const; // 1180×820
  const PORTRAIT = [788, 946] as const; // 820×1180
  const LARGE = [1344, 880] as const; // 1376×1032
  const LARGE_PORTRAIT = [1000, 1092] as const; // 1032×1376
  const NARROW = [568, 666] as const; // 600×900

  it.each([
    [2, { cols: 2, rows: 1, size: 570 }],
    [3, { cols: 3, rows: 1, size: 377 }],
    [4, { cols: 2, rows: 2, size: 342 }],
    [5, { cols: 3, rows: 2, size: 342 }],
    [6, { cols: 3, rows: 2, size: 342 }],
  ])("가로 1180×820에서 %i명", (count, fit) => {
    expect(bestSquareGrid(count, ...LANDSCAPE, 8)).toEqual(fit);
  });

  it.each([
    [2, { cols: 1, rows: 2, size: 469 }],
    [3, { cols: 2, rows: 2, size: 390 }],
    [4, { cols: 2, rows: 2, size: 390 }],
    [5, { cols: 2, rows: 3, size: 310 }],
    [6, { cols: 2, rows: 3, size: 310 }],
  ])("세로 820×1180에서 %i명", (count, fit) => {
    expect(bestSquareGrid(count, ...PORTRAIT, 8)).toEqual(fit);
  });

  it("큰 태블릿 세로 1032×1376에서 6명은 2열 3행 358px이다", () => {
    expect(bestSquareGrid(6, ...LARGE_PORTRAIT, 8)).toEqual({ cols: 2, rows: 3, size: 358 });
  });

  it("좁은 창 600×900에서는 2명이 위아래, 6명이 2열 3행이다", () => {
    expect(bestSquareGrid(2, ...NARROW, 8)).toEqual({ cols: 1, rows: 2, size: 329 });
    expect(bestSquareGrid(6, ...NARROW, 8)).toEqual({ cols: 2, rows: 3, size: 216 });
  });

  it("1명은 칸의 짧은 변이다", () => {
    expect(bestSquareGrid(1, ...LANDSCAPE, 8)).toEqual({ cols: 1, rows: 1, size: 692 });
  });

  it("크기가 같으면 열이 적은 쪽을 고른다", () => {
    // 가로 4명은 2열과 3열이 모두 342px이다.
    expect(bestSquareGrid(4, ...LANDSCAPE, 8).cols).toBe(2);
  });

  it("내림 전 크기로 열 수를 고른다", () => {
    // 1열은 280, 2열은 280.5라 2열이 더 크다.
    expect(bestSquareGrid(2, 569, 568, 8)).toEqual({ cols: 2, rows: 1, size: 280 });
  });

  it("칸이 없으면 한 변이 0이다", () => {
    expect(bestSquareGrid(4, 0, 0, 8).size).toBe(0);
  });

  it("5명에서 6명으로 늘 때는 배치가 같아 타일을 다시 만들 필요가 없다", () => {
    // RoomGrid는 1↔2, 2↔3, 3↔4, 4↔5명 경계에서만 타일을 다시 마운트한다.
    for (const [width, height] of [LANDSCAPE, PORTRAIT, LARGE, LARGE_PORTRAIT]) {
      expect(bestSquareGrid(6, width, height, 8)).toEqual(bestSquareGrid(5, width, height, 8));
    }
  });
});
