import { describe, expect, it } from "vitest";

import { bestSquareGrid, formatStudyHhMm, roomGridSpec } from "../roomGrid";

describe("roomGridSpec", () => {
  it("1명은 풀스크린이다 — 타일 크롬 없음", () => {
    expect(roomGridSpec(1)).toEqual({ mode: "fullscreen" });
  });

  it("2명은 1열 2행이고 타일이 화면을 반씩 나눈다", () => {
    expect(roomGridSpec(2)).toEqual({ mode: "grid", cols: 1, rowUnit: 2 });
  });

  it("3~4명은 2열 2행으로 화면을 채운다 — 2026-08-25 A안(Zoom/Meet 방식)", () => {
    expect(roomGridSpec(3)).toEqual({ mode: "grid", cols: 2, rowUnit: 2 });
    expect(roomGridSpec(4)).toEqual({ mode: "grid", cols: 2, rowUnit: 2 });
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

describe("bestSquareGrid", () => {
  // 화면에서 위 16 · 좌우 16 · 아래 112(큰 태블릿은 136)를 뺀 격자 칸이다.
  const LANDSCAPE = [1148, 692] as const; // 1180×820
  const PORTRAIT = [788, 1052] as const; // 820×1180
  const LARGE = [1344, 880] as const; // 1376×1032
  const NARROW = [568, 772] as const; // 600×900

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
    [2, { cols: 1, rows: 2, size: 522 }],
    [3, { cols: 2, rows: 2, size: 390 }],
    [4, { cols: 2, rows: 2, size: 390 }],
    [5, { cols: 2, rows: 3, size: 345 }],
    [6, { cols: 2, rows: 3, size: 345 }],
  ])("세로 820×1180에서 %i명", (count, fit) => {
    expect(bestSquareGrid(count, ...PORTRAIT, 8)).toEqual(fit);
  });

  it("좁은 창 600×900에서는 2명이 위아래, 6명이 2열 3행이다", () => {
    expect(bestSquareGrid(2, ...NARROW, 8)).toEqual({ cols: 1, rows: 2, size: 382 });
    expect(bestSquareGrid(6, ...NARROW, 8)).toEqual({ cols: 2, rows: 3, size: 252 });
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
    // RoomGrid는 2↔3, 3↔4, 4↔5명 경계에서만 타일을 다시 마운트한다.
    for (const [width, height] of [LANDSCAPE, PORTRAIT, LARGE]) {
      expect(bestSquareGrid(6, width, height, 8)).toEqual(bestSquareGrid(5, width, height, 8));
    }
  });
});
