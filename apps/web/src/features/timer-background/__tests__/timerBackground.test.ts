import { afterEach, describe, expect, it, vi } from "vitest";

import { readTimerBackground, writeTimerBackground } from "../timerBackground";
import { DEFAULT_FIT, panZoom } from "../photoFit";
import { clearWatcherAssets } from "../watcher/watcherAssets";

const videoSpaces = vi.hoisted(() => ({ open: true }));

vi.mock("../videoSpaces", () => ({
  get VIDEO_SPACES_OPEN() {
    return videoSpaces.open;
  },
}));

vi.mock("../watcher/watcherAssets", () => ({ clearWatcherAssets: vi.fn() }));

afterEach(() => {
  localStorage.clear();
  videoSpaces.open = true;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("타이머 배경 선택 저장", () => {
  it("저장된 값이 없으면 심플이다", () => {
    expect(readTimerBackground()).toEqual({ kind: "simple" });
  });

  it("고른 사진을 저장하고 다시 읽는다", () => {
    writeTimerBackground({ kind: "photo", photoId: "p1" });

    expect(readTimerBackground()).toEqual({ kind: "photo", photoId: "p1" });
  });

  it("독서실 감독관을 저장하고 다시 읽는다", () => {
    writeTimerBackground({ kind: "proctor" });

    expect(readTimerBackground()).toEqual({ kind: "proctor" });
  });

  it("영상 공간을 닫아 두면 저장된 감독관을 심플로 읽고 저장값도 심플로 바꾸며 받아 둔 소재를 지운다", () => {
    videoSpaces.open = false;
    localStorage.setItem("focusmakers.timerBackground", '{"kind":"proctor"}');

    expect(readTimerBackground()).toEqual({ kind: "simple" });
    expect(localStorage.getItem("focusmakers.timerBackground")).toBe('{"kind":"simple"}');
    expect(clearWatcherAssets).toHaveBeenCalledOnce();
  });

  it("영상 공간을 닫아 두었는데 심플을 저장하지 못해도 심플로 읽는다", () => {
    videoSpaces.open = false;
    localStorage.setItem("focusmakers.timerBackground", '{"kind":"proctor"}');
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(readTimerBackground()).toEqual({ kind: "simple" });
    expect(clearWatcherAssets).toHaveBeenCalledOnce();
  });

  it("영상 공간을 닫아 두어도 감독관이 아닌 저장값은 건드리지 않는다", () => {
    videoSpaces.open = false;
    writeTimerBackground({ kind: "photo", photoId: "p1" });

    expect(readTimerBackground()).toEqual({ kind: "photo", photoId: "p1" });
    expect(clearWatcherAssets).not.toHaveBeenCalled();
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
