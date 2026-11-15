import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  qualifyOnboardingRepeat,
  startOnboardingRepeatTracking,
} from "../onboardingRepeatRetention";

const at = Date.parse("2026-11-06T10:00:00+09:00");
const day = 24 * 60 * 60 * 1000;

function endSession(
  userId: string,
  focusSec: number,
  endedAt: number,
  startedAt = endedAt - 300_000,
) {
  return qualifyOnboardingRepeat(userId, focusSec, endedAt, startedAt);
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("온보딩 기준 재순공 인정", () => {
  it("짧은 세션은 날짜별로도 합산하지 않고 300초부터 인정한다", () => {
    startOnboardingRepeatTracking("7", at);
    expect(endSession("7", 300, at)).toBeNull();
    for (const focus of [150, 150, 299, NaN, Infinity]) {
      expect(endSession("7", focus, at + day)).toBeNull();
    }
    expect(endSession("7", 300, at + day)).toEqual(expect.any(String));
  });

  it("168시간 직전까지 인정하고 정확히 168시간부터 만료한다", () => {
    for (const user of ["7", "8"]) {
      startOnboardingRepeatTracking(user, at);
      endSession(user, 300, at);
    }
    expect(endSession("7", 300, at + 7 * day - 1)).toEqual(expect.any(String));
    expect(endSession("8", 300, at + 7 * day)).toBeNull();
    expect(endSession("8", 300, at + 8 * day)).toBeNull();
  });

  it("앱 재실행 후 첫 인정 날짜와 완료 표시를 유지한다", async () => {
    startOnboardingRepeatTracking("7", at);
    endSession("7", 300, at);
    vi.resetModules();
    const restarted = await import("../onboardingRepeatRetention");
    expect(restarted.qualifyOnboardingRepeat("7", 300, at + day, at + day - 300_000)).toEqual(
      expect.any(String),
    );
    vi.resetModules();
    const restartedAgain = await import("../onboardingRepeatRetention");
    expect(
      restartedAgain.qualifyOnboardingRepeat("7", 300, at + 2 * day, at + 2 * day - 300_000),
    ).toBeNull();
  });

  it("한국 자정 직전과 직후를 다른 날짜로 센다", () => {
    const midnight = Date.parse("2026-11-07T00:00:00+09:00");
    startOnboardingRepeatTracking("7", at);
    expect(endSession("7", 300, midnight - 1)).toBeNull();
    expect(endSession("7", 300, midnight)).toEqual(expect.any(String));
  });

  it("같은 한국 날짜의 두 세션은 UTC 자정을 지나도 한 날이다", () => {
    startOnboardingRepeatTracking("7", at);
    expect(endSession("7", 300, Date.parse("2026-11-07T08:59:59+09:00"))).toBeNull();
    expect(endSession("7", 300, Date.parse("2026-11-07T09:00:00+09:00"))).toBeNull();
  });

  it("다시 온보딩을 완료해도 최초 기준 시각을 변경하지 않는다", () => {
    expect(startOnboardingRepeatTracking("7", at)).toBe(true);
    endSession("7", 300, at);
    expect(startOnboardingRepeatTracking("7", at + day)).toBe(false);
    expect(endSession("7", 300, at + 7 * day)).toBeNull();
  });

  it("첫날의 어느 세션을 다음 날 다시 종료해도 세지 않고 새 세션만 인정한다", () => {
    startOnboardingRepeatTracking("7", at);
    const firstStart = at;
    const secondStart = at + 600_000;
    expect(endSession("7", 300, at + 300_000, firstStart)).toBeNull();
    expect(endSession("7", 300, at + 900_000, secondStart)).toBeNull();
    expect(endSession("7", 300, at + day, firstStart)).toBeNull();
    expect(endSession("7", 300, at + day, secondStart)).toBeNull();
    expect(endSession("7", 300, at + day + 600_000, at + day)).toEqual(expect.any(String));
  });

  it("사용자 간 기록을 섞지 않고 온보딩 이전 세션도 제외한다", () => {
    startOnboardingRepeatTracking("7", at);
    expect(endSession("7", 300, at - day)).toBeNull();
    expect(endSession("8", 300, at)).toBeNull();
    expect(endSession("7", 300, at + day)).toBeNull();
    startOnboardingRepeatTracking("8", at + day);
    expect(endSession("8", 300, at + 2 * day)).toBeNull();
    expect(endSession("7", 300, at + 2 * day)).toEqual(expect.any(String));
  });

  it("저장소를 읽거나 쓰지 못하면 집계하지 않는다", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(startOnboardingRepeatTracking("7", at)).toBe(false);
    write.mockRestore();
    startOnboardingRepeatTracking("7", at);
    endSession("7", 300, at);
    const full = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(endSession("7", 300, at + day)).toBeNull();
    full.mockRestore();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(startOnboardingRepeatTracking("7", at)).toBe(false);
    expect(endSession("7", 300, at + 2 * day)).toBeNull();
  });

  it.each(["{", "null", "{}", '{"onboardedAt":null}', '"bad"'])(
    "손상된 기록 %s를 새 온보딩으로 초기화하지 않는다",
    (raw) => {
      startOnboardingRepeatTracking("7", at);
      const key = localStorage.key(0)!;
      localStorage.setItem(key, raw);
      expect(startOnboardingRepeatTracking("7", at + day)).toBe(false);
      expect(endSession("7", 300, at + 2 * day)).toBeNull();
    },
  );
});
