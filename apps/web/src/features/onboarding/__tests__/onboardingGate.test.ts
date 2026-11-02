import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetOnboardingGateForTests,
  decideOnboarding,
  isNewUserLaunch,
  markOnboardingPending,
  markOnboardingSettled,
  onboardingRecord,
} from "@/features/onboarding/onboardingGate";

describe("onboardingGate 기기 기록", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("처음에는 기록이 없다", () => {
    expect(onboardingRecord(7)).toBeNull();
  });

  it("진행 중과 끝남을 계정별로 남긴다", () => {
    markOnboardingPending(7);
    expect(onboardingRecord(7)).toBe("pending");
    expect(onboardingRecord(8)).toBeNull();

    markOnboardingSettled(7);
    expect(onboardingRecord(7)).toBe("settled");
  });

  it("저장소를 쓸 수 없는 기기에서는 기록이 없는 것으로 보고 쓰기도 실패하지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(onboardingRecord(11)).toBeNull();
    expect(() => markOnboardingPending(11)).not.toThrow();
  });

  it("끝남을 저장하지 못해도 이번 실행에서는 끝난 것으로 본다 — 새 계정 표시가 남아 온보딩으로 되돌아가지 않게", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    markOnboardingSettled(9);

    expect(onboardingRecord(9)).toBe("settled");
  });
});

describe("isNewUserLaunch", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    __resetOnboardingGateForTests();
  });

  it("앱이 웹뷰 주소에 newUser=1을 붙였을 때만 참이다", () => {
    expect(isNewUserLaunch()).toBe(false);

    window.history.replaceState(null, "", "/home?newUser=1");
    __resetOnboardingGateForTests();

    expect(isNewUserLaunch()).toBe(true);
  });
});

describe("decideOnboarding", () => {
  it("이번 실행에서 새로 가입한 계정은 온보딩이다", () => {
    expect(decideOnboarding({ record: null, newUser: true })).toBe("onboarding");
  });

  it("기록이 없는 기존 계정은 홈이다", () => {
    expect(decideOnboarding({ record: null, newUser: false })).toBe("home");
  });

  it("온보딩을 중간에 끈 계정은 다음 실행에서도 온보딩이다", () => {
    expect(decideOnboarding({ record: "pending", newUser: false })).toBe("onboarding");
  });

  it("온보딩을 끝낸 계정은 홈이다", () => {
    expect(decideOnboarding({ record: "settled", newUser: true })).toBe("home");
  });
});
