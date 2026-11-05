import { afterEach, describe, expect, it, vi } from "vitest";

import { markSessionGuideSeen, sessionGuideState } from "@/features/study-session/sessionGuide";

describe("sessionGuide 저장", () => {
  afterEach(() => localStorage.clear());

  it("기록이 없으면 null이고, 끝까지 보면 seen이다", () => {
    expect(sessionGuideState(7)).toBeNull();
    markSessionGuideSeen(7);
    expect(sessionGuideState(7)).toBe("seen");
  });

  it("seen이 아닌 값은 기록 없음으로 읽는다", () => {
    localStorage.setItem("focusmakers:session-guide:7", "pending");
    expect(sessionGuideState(7)).toBeNull();
  });

  it("계정별로 따로 남긴다", () => {
    markSessionGuideSeen(7);
    expect(sessionGuideState(8)).toBeNull();
  });
});

describe("sessionGuide 저장 — 저장소를 쓸 수 없는 기기", () => {
  afterEach(() => vi.restoreAllMocks());

  it("읽기가 throw하면 null, 쓰기가 throw해도 깨지지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(sessionGuideState(7)).toBeNull();
    expect(() => markSessionGuideSeen(7)).not.toThrow();
  });

  it("저장하지 못해도 이 문서가 살아 있는 동안은 본 것으로 기억한다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    markSessionGuideSeen(99);

    expect(sessionGuideState(99)).toBe("seen");
    expect(sessionGuideState(98)).toBeNull();
  });
});
