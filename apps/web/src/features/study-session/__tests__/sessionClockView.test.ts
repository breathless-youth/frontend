import { afterEach, describe, expect, it, vi } from "vitest";

import { readSessionClockView, writeSessionClockView } from "../sessionClockView";

describe("sessionClockView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("저장한 값이 없으면 순공 보기다", () => {
    expect(readSessionClockView()).toBe("focus");
  });

  it("저장한 보기를 다시 읽는다", () => {
    writeSessionClockView("study");
    expect(readSessionClockView()).toBe("study");
  });

  it("저장소를 쓸 수 없으면 읽기는 순공 보기이고 쓰기는 오류를 내지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readSessionClockView()).toBe("focus");
    expect(() => writeSessionClockView("study")).not.toThrow();
  });
});
