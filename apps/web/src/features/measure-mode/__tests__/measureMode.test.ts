import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readMeasureMode, useMeasureMode, writeMeasureMode } from "../measureMode";

afterEach(() => {
  writeMeasureMode("camera");
  localStorage.clear();
});

describe("measure mode", () => {
  it("기본값은 카메라로 측정이다", () => {
    expect(readMeasureMode()).toBe("camera");
  });

  it("고른 방식을 기기에 저장하고 다시 읽는다", () => {
    writeMeasureMode("timer");
    expect(readMeasureMode()).toBe("timer");
    writeMeasureMode("camera");
    expect(readMeasureMode()).toBe("camera");
  });

  it("알 수 없는 저장값은 카메라로 읽는다", () => {
    localStorage.setItem("focusmakers:measure-mode", "screen");
    expect(readMeasureMode()).toBe("camera");
  });

  it("저장소를 읽을 수 없으면 카메라로 읽는다", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    try {
      expect(readMeasureMode()).toBe("camera");
    } finally {
      getItem.mockRestore();
    }
  });

  it("저장소가 쓰기를 거절해도 메모리 값으로 이어 간다", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      writeMeasureMode("timer");
      expect(readMeasureMode()).toBe("timer");
    } finally {
      setItem.mockRestore();
    }
  });

  it("값이 바뀌면 훅을 쓰는 화면이 다시 그린다", () => {
    const { result } = renderHook(() => useMeasureMode());
    expect(result.current[0]).toBe("camera");
    act(() => result.current[1]("timer"));
    expect(result.current[0]).toBe("timer");
  });
});
