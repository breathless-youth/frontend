import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isIPad,
  markStartGuideSeen,
  requestStartGuideReplay,
  shouldShowStartGuide,
  startGuideState,
} from "@/features/home/startGuide";

const base = {
  firstVisit: true,
  isToday: true,
  popupFree: true,
  state: null,
  tabBarPlay: false,
  iPad: false,
} as const;

describe("startGuide 저장", () => {
  afterEach(() => localStorage.clear());

  it("기록이 없으면 null이다", () => {
    expect(startGuideState(7)).toBeNull();
  });

  it("닫으면 seen으로 남고 다시 보기는 replay로 덮는다", () => {
    markStartGuideSeen(7);
    expect(startGuideState(7)).toBe("seen");
    requestStartGuideReplay(7);
    expect(startGuideState(7)).toBe("replay");
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

  it("쓰기가 throw해도 닫기·다시 보기가 화면을 깨뜨리지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => markStartGuideSeen(7)).not.toThrow();
    expect(() => requestStartGuideReplay(7)).not.toThrow();
  });
});

describe("shouldShowStartGuide", () => {
  it("첫 방문·오늘·팝업 없음·기록 없음이면 띄운다", () => {
    expect(shouldShowStartGuide(base)).toBe(true);
  });
  it("과목을 만든 적 있으면 안 띄운다", () => {
    expect(shouldShowStartGuide({ ...base, firstVisit: false })).toBe(false);
  });
  it("다시 보기면 과목이 있어도 띄운다", () => {
    expect(shouldShowStartGuide({ ...base, firstVisit: false, state: "replay" })).toBe(true);
  });
  it("이미 봤으면 안 띄운다", () => {
    expect(shouldShowStartGuide({ ...base, state: "seen" })).toBe(false);
  });
  it("오늘이 아니거나 팝업이 떴으면 안 띄운다", () => {
    expect(shouldShowStartGuide({ ...base, isToday: false })).toBe(false);
    expect(shouldShowStartGuide({ ...base, popupFree: false })).toBe(false);
  });
  it("재생 원 앱의 iPad에서는 안 띄우고 폴백 버튼 앱의 iPad에서는 띄운다", () => {
    expect(shouldShowStartGuide({ ...base, tabBarPlay: true, iPad: true })).toBe(false);
    expect(shouldShowStartGuide({ ...base, tabBarPlay: false, iPad: true })).toBe(true);
  });
});

describe("isIPad", () => {
  it("UA의 iPad, 터치 되는 Macintosh만 iPad다", () => {
    expect(isIPad("Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X)", 5)).toBe(true);
    expect(isIPad("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIPad("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIPad("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", 5)).toBe(false);
  });
});
