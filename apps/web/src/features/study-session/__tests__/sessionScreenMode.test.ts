import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearSessionScreenMode,
  readSessionCameraExpanded,
  readSessionSimpleMode,
  writeSessionCameraExpanded,
  writeSessionSimpleMode,
} from "../sessionScreenMode";

describe("세션 화면 모드 기억", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("저장한 적이 없으면 심플 모드와 카메라 크게 보기 모두 꺼져 있다", () => {
    expect(readSessionSimpleMode()).toBe(false);
    expect(readSessionCameraExpanded()).toBe(false);
  });

  it("저장한 값을 그대로 읽는다", () => {
    writeSessionSimpleMode(true);
    writeSessionCameraExpanded(true);
    expect(readSessionSimpleMode()).toBe(true);
    expect(readSessionCameraExpanded()).toBe(true);

    writeSessionSimpleMode(false);
    writeSessionCameraExpanded(false);
    expect(readSessionSimpleMode()).toBe(false);
    expect(readSessionCameraExpanded()).toBe(false);
  });

  it("지우면 둘 다 꺼진 상태로 읽힌다", () => {
    writeSessionSimpleMode(true);
    writeSessionCameraExpanded(true);

    clearSessionScreenMode();

    expect(readSessionSimpleMode()).toBe(false);
    expect(readSessionCameraExpanded()).toBe(false);
  });

  it("저장소가 오류를 내면 꺼진 것으로 보고 저장 실패도 넘어간다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => writeSessionSimpleMode(true)).not.toThrow();
    expect(readSessionSimpleMode()).toBe(false);
    expect(readSessionCameraExpanded()).toBe(false);
  });
});
