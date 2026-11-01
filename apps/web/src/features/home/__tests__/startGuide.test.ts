import { afterEach, describe, expect, it, vi } from "vitest";

import {
  markStartGuideSeen,
  shouldShowStartGuide,
  startGuideState,
} from "@/features/home/startGuide";

describe("startGuide 저장", () => {
  afterEach(() => localStorage.clear());

  it("기록이 없으면 null이다", () => {
    expect(startGuideState(7)).toBeNull();
  });

  it("본 계정은 seen으로 남는다", () => {
    markStartGuideSeen(7);
    expect(startGuideState(7)).toBe("seen");
  });

  it("계정별로 따로 남긴다", () => {
    markStartGuideSeen(7);
    expect(startGuideState(8)).toBeNull();
  });
});

describe("startGuide 저장 — 저장소를 쓸 수 없는 기기", () => {
  afterEach(() => vi.restoreAllMocks());

  it("읽기가 throw하면 본 적 없는 것(null)으로 본다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(startGuideState(7)).toBeNull();
  });

  it("쓰기가 throw해도 화면을 깨뜨리지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => markStartGuideSeen(7)).not.toThrow();
  });
});

describe("shouldShowStartGuide", () => {
  const base = { state: null, popupOpen: false, userId: 7 } as const;

  it("신원이 있고 안 봤고 팝업이 없으면 띄운다", () => {
    expect(shouldShowStartGuide(base)).toBe(true);
  });
  it("이미 봤으면 안 띄운다", () => {
    expect(shouldShowStartGuide({ ...base, state: "seen" })).toBe(false);
  });
  it("팝업이 떴으면 안 띄운다", () => {
    expect(shouldShowStartGuide({ ...base, popupOpen: true })).toBe(false);
  });
  it("신원이 없으면 기록할 수 없어 안 띄운다", () => {
    expect(shouldShowStartGuide({ ...base, userId: null })).toBe(false);
  });
});
