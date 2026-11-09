import { afterEach, describe, expect, it } from "vitest";

import { readTimerBackground, writeTimerBackground } from "../timerBackground";
import { DEFAULT_FIT, panZoom } from "../photoFit";

afterEach(() => {
  localStorage.clear();
});

describe("타이머 배경 선택 저장", () => {
  it("저장된 값이 없으면 심플이다", () => {
    expect(readTimerBackground()).toEqual({ kind: "simple" });
  });

  it("고른 사진을 저장하고 다시 읽는다", () => {
    writeTimerBackground({ kind: "photo", photoId: "p1" });

    expect(readTimerBackground()).toEqual({ kind: "photo", photoId: "p1" });
  });

  it("깨진 값은 심플로 본다", () => {
    localStorage.setItem("focusmakers.timerBackground", "{oops");
    expect(readTimerBackground()).toEqual({ kind: "simple" });

    localStorage.setItem("focusmakers.timerBackground", JSON.stringify({ kind: "photo" }));
    expect(readTimerBackground()).toEqual({ kind: "simple" });
  });
});

describe("사진 크기·위치 조정", () => {
  // 390×844 화면에 1:1 사진은 높이를 맞춰 844×844로 덮고 좌우로 454px 넘친다.
  const frame = { width: 390, height: 844 };
  const square = { width: 1000, height: 1000 };

  it("한 손가락으로 끌면 넘친 방향으로만 위치가 바뀐다", () => {
    const next = panZoom(
      { fit: DEFAULT_FIT, cx: 200, cy: 400, dist: 0 },
      { cx: 200 - 227, cy: 500, dist: 0 },
      frame,
      square,
    );

    expect(next).toEqual({ scale: 1, x: 100, y: 50 });
  });

  it("두 손가락을 벌리면 키우고 1~3배 안에서 멈춘다", () => {
    const base = { fit: DEFAULT_FIT, cx: 200, cy: 400, dist: 100 };

    expect(panZoom(base, { cx: 200, cy: 400, dist: 200 }, frame, square).scale).toBe(2);
    expect(panZoom(base, { cx: 200, cy: 400, dist: 500 }, frame, square).scale).toBe(3);
    expect(panZoom(base, { cx: 200, cy: 400, dist: 50 }, frame, square).scale).toBe(1);
  });
});
