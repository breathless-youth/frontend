import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readTimerBackground,
  resolveSpace,
  spaceTrack,
  toSpaceSelection,
  writeTimerBackground,
} from "../timerBackground";
import { DEFAULT_FIT, panZoom } from "../photoFit";
import { clearWatcherAssets } from "../watcher/watcherAssets";
import { PROCTOR_SPACE, RAIN_SPACE } from "@/test/spaceFixtures";

vi.mock("../watcher/watcherAssets", () => ({ clearWatcherAssets: vi.fn() }));

afterEach(() => {
  localStorage.clear();
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

  it("깨진 값은 심플로 본다", () => {
    localStorage.setItem("focusmakers.timerBackground", "{oops");
    expect(readTimerBackground()).toEqual({ kind: "simple" });

    localStorage.setItem("focusmakers.timerBackground", JSON.stringify({ kind: "photo" }));
    expect(readTimerBackground()).toEqual({ kind: "simple" });
  });

  it("옛 독서실 감독관 값은 심플로 읽고 저장값도 심플로 바꾸며 받아 둔 감시 파일을 지운다", () => {
    localStorage.setItem("focusmakers.timerBackground", '{"kind":"proctor"}');

    expect(readTimerBackground()).toEqual({ kind: "simple" });
    expect(localStorage.getItem("focusmakers.timerBackground")).toBe('{"kind":"simple"}');
    expect(clearWatcherAssets).toHaveBeenCalledOnce();
  });

  it("옛 감독관 값을 심플로 저장하지 못해도 심플로 읽는다", () => {
    localStorage.setItem("focusmakers.timerBackground", '{"kind":"proctor"}');
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(readTimerBackground()).toEqual({ kind: "simple" });
    expect(clearWatcherAssets).toHaveBeenCalledOnce();
  });

  it("서버 공간 값을 저장하고 다시 읽는다", () => {
    writeTimerBackground(PROCTOR_SPACE);

    expect(readTimerBackground()).toEqual(PROCTOR_SPACE);
    expect(clearWatcherAssets).not.toHaveBeenCalled();
  });

  it("그릴 수 없는 공간 값은 심플로 읽는다", () => {
    for (const broken of [
      { ...PROCTOR_SPACE, videoMode: "SLIDESHOW" },
      { ...PROCTOR_SPACE, assetKey: "" },
      { ...PROCTOR_SPACE, itemId: "41" },
    ]) {
      localStorage.setItem("focusmakers.timerBackground", JSON.stringify(broken));
      expect(readTimerBackground()).toEqual({ kind: "simple" });
    }
  });
});

describe("toSpaceSelection", () => {
  const base = { itemId: 41, code: "SPACE_PROCTOR", assetKey: "watcher/9c8d9f19" };

  it("그림 공간은 영상 방식을 null로 둔다", () => {
    expect(
      toSpaceSelection({ ...base, assetType: "IMAGE", videoMode: "LOOP" })?.videoMode,
    ).toBeNull();
  });

  it("영상 공간은 LOOP·WATCH만 받는다", () => {
    expect(toSpaceSelection({ ...base, assetType: "VIDEO", videoMode: "LOOP" })).not.toBeNull();
    expect(toSpaceSelection({ ...base, assetType: "VIDEO", videoMode: "WATCH" })).toEqual(
      PROCTOR_SPACE,
    );
    expect(toSpaceSelection({ ...base, assetType: "VIDEO", videoMode: null })).toBeNull();
    expect(toSpaceSelection({ ...base, assetType: "VIDEO", videoMode: "SLIDESHOW" })).toBeNull();
    expect(toSpaceSelection({ ...base, assetType: "AUDIO", videoMode: null })).toBeNull();
    expect(
      toSpaceSelection({ itemId: 41, code: "X", assetType: "VIDEO", videoMode: "LOOP" }),
    ).toBeNull();
  });
});

describe("resolveSpace", () => {
  const photo = { kind: "photo", photoId: "p1" } as const;

  it("사진이 있으면 서버 값과 상관없이 사진을 그린다", () => {
    expect(resolveSpace(photo, PROCTOR_SPACE, true)).toBe(photo);
  });

  it("사진이 지워졌고 서버 공간이 있으면 서버 공간이다", () => {
    expect(resolveSpace(photo, PROCTOR_SPACE, false)).toBe(PROCTOR_SPACE);
  });

  it("서버 답 전이면 기기 값이다", () => {
    expect(resolveSpace(RAIN_SPACE, undefined, false)).toBe(RAIN_SPACE);
  });

  it("서버가 null이면 심플이다", () => {
    expect(resolveSpace(RAIN_SPACE, null, false)).toEqual({ kind: "simple" });
  });

  it("서버 공간이 기기 값과 다르면 서버 공간이다", () => {
    expect(resolveSpace(RAIN_SPACE, PROCTOR_SPACE, false)).toBe(PROCTOR_SPACE);
  });
});

describe("spaceTrack", () => {
  it("심플·사진이면 종류만, 서버 공간이면 상품 코드와 영상 방식을 더한다", () => {
    expect(spaceTrack({ kind: "simple" })).toEqual({ kind: "simple" });
    expect(spaceTrack({ kind: "photo", photoId: "p1" })).toEqual({ kind: "photo" });
    expect(spaceTrack(PROCTOR_SPACE)).toEqual({
      kind: "space",
      item: { itemCode: "SPACE_PROCTOR", videoMode: "WATCH" },
    });
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
