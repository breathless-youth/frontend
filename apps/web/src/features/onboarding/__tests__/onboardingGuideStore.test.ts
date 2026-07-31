import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  createMemoryOnboardingGuideStore,
  hasSeenOnboardingGuide,
  markOnboardingGuideSeen,
  resetOnboardingGuideStore,
  setOnboardingGuideStore,
} from "../onboardingGuideStore";

/**
 * 가이드 열람 플래그 (모바일판 동일 계약, 저장소만 localStorage로 교체 — BY-334).
 * 무게중심은 "조회·저장 실패가 세션 진행을 막지 않는다"에 있다.
 */

afterEach(() => {
  resetOnboardingGuideStore();
  localStorage.clear();
});

describe("hasSeenOnboardingGuide", () => {
  it("저장값이 없으면 false", async () => {
    await expect(hasSeenOnboardingGuide()).resolves.toBe(false);
  });

  it("기록한 뒤에는 true", async () => {
    await markOnboardingGuideSeen();

    await expect(hasSeenOnboardingGuide()).resolves.toBe(true);
  });

  it("localStorage에 모바일과 같은 키·값으로 저장한다", async () => {
    await markOnboardingGuideSeen();

    expect(localStorage.getItem("focuson.onboardingGuideSeen")).toBe("1");
  });

  it("두 번 기록해도 결과가 같다 (멱등)", async () => {
    await markOnboardingGuideSeen();
    await markOnboardingGuideSeen();

    await expect(hasSeenOnboardingGuide()).resolves.toBe(true);
  });

  it("다른 값이 들어 있으면 안 본 것으로 본다", async () => {
    localStorage.setItem("focuson.onboardingGuideSeen", "0");

    await expect(hasSeenOnboardingGuide()).resolves.toBe(false);
  });
});

describe("주입형 어댑터", () => {
  it("교체한 저장소를 쓴다", async () => {
    setOnboardingGuideStore(createMemoryOnboardingGuideStore(true));

    await expect(hasSeenOnboardingGuide()).resolves.toBe(true);
    // 인메모리라 실제 localStorage는 건드리지 않는다.
    expect(localStorage.getItem("focuson.onboardingGuideSeen")).toBeNull();
  });
});

describe("fail-safe — 실패해도 세션 진행을 막지 않는다", () => {
  let warn: MockInstance;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("조회에 실패하면 '아직 못 봤다'로 떨어진다 — 안내를 한 번 더 보는 쪽이 안전하다", async () => {
    setOnboardingGuideStore({
      hasSeenGuide: () => Promise.reject(new Error("저장소 없음")),
      markGuideSeen: () => Promise.resolve(),
    });

    await expect(hasSeenOnboardingGuide()).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("저장에 실패해도 reject하지 않는다 — '건너뛰어도 세션 시작'이 저장소 사정으로 깨지면 안 된다", async () => {
    setOnboardingGuideStore({
      hasSeenGuide: () => Promise.resolve(false),
      markGuideSeen: () => Promise.reject(new Error("쓰기 실패")),
    });

    await expect(markOnboardingGuideSeen()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
