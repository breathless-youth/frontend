import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readTimerBackground, useTimerBackground, writeTimerBackground } from "../timerBackground";
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

describe("타이머 배경 선택 구독", () => {
  it("저장하면 같은 탭의 구독자가 바로 새 값을 받는다", () => {
    const { result } = renderHook(() => useTimerBackground());
    expect(result.current).toEqual({ kind: "simple" });

    act(() => {
      writeTimerBackground({ kind: "photo", photoId: "p1" });
    });

    expect(result.current).toEqual({ kind: "photo", photoId: "p1" });
  });

  it("다른 탭이 저장하면 storage 이벤트로 새 값을 받는다", () => {
    const { result } = renderHook(() => useTimerBackground());

    act(() => {
      localStorage.setItem(
        "focusmakers.timerBackground",
        JSON.stringify({ kind: "photo", photoId: "p2" }),
      );
      window.dispatchEvent(new StorageEvent("storage", { key: "focusmakers.timerBackground" }));
    });

    expect(result.current).toEqual({ kind: "photo", photoId: "p2" });
  });

  it("값이 그대로면 같은 객체를 돌려줘 다시 그리지 않는다", () => {
    writeTimerBackground({ kind: "photo", photoId: "p1" });
    const { result } = renderHook(() => useTimerBackground());
    const first = result.current;

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    });

    expect(result.current).toBe(first);
  });

  it("저장소가 막혀 저장하지 못하면 구독자에게 알리지 않는다", () => {
    const { result } = renderHook(() => useTimerBackground());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    act(() => {
      expect(writeTimerBackground({ kind: "photo", photoId: "p1" })).toBe(false);
    });

    expect(result.current).toEqual({ kind: "simple" });
  });

  it("감독관을 심플로 되돌리는 읽기는 변경 알림을 보내지 않는다", () => {
    videoSpaces.open = false;
    localStorage.setItem("focusmakers.timerBackground", JSON.stringify({ kind: "proctor" }));
    const listener = vi.fn();
    window.addEventListener("timer-background-change", listener);

    expect(readTimerBackground()).toEqual({ kind: "simple" });

    window.removeEventListener("timer-background-change", listener);
    expect(listener).not.toHaveBeenCalled();
  });
});
