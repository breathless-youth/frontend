import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canShowPremiumCard } from "../premiumFakeDoor";
import {
  loadPremiumRecord,
  migrateLegacyDismissal,
  updatePremiumRecord,
} from "../premiumFakeDoorStore";

const KEY = "focusmakers.premiumFakeDoor.v1.7";
const NOW = Date.parse("2026-11-26T12:00:00+09:00");
const HOUR = 60 * 60 * 1000;
const LEGACY = JSON.stringify({ dismissed: true, applied: false, viewedSent: true });

function shows(nowMs: number) {
  const record = loadPremiumRecord(7);
  return (
    record !== null &&
    canShowPremiumCard({ nowMs, hasTokenSource: true, korean: true, record, qualifyingSec: 600 })
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("premiumFakeDoorStore", () => {
  it("읽기는 저장소를 바꾸지 않는다. 예전 닫은 기록은 시각 없이 그대로 읽혀 카드를 숨긴다", () => {
    localStorage.setItem(KEY, LEGACY);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    expect(loadPremiumRecord(7)).toEqual({
      dismissedAt: null,
      legacyDismissed: true,
      applied: false,
      viewedSent: true,
    });
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe(LEGACY);
    expect(shows(NOW)).toBe(false);
  });

  it("예전 닫은 기록은 한 번 옮겨 그 시각을 저장하고, 48시간 뒤 다시 보인다", () => {
    localStorage.setItem(KEY, LEGACY);

    migrateLegacyDismissal(7, NOW);

    expect(loadPremiumRecord(7)).toEqual({
      dismissedAt: NOW,
      legacyDismissed: false,
      applied: false,
      viewedSent: true,
    });
    // 다시 불러도 시각은 처음 옮긴 때 그대로다.
    migrateLegacyDismissal(7, NOW + HOUR);
    expect(loadPremiumRecord(7)?.dismissedAt).toBe(NOW);
    expect(shows(NOW + 47 * HOUR)).toBe(false);
    expect(shows(NOW + 48 * HOUR)).toBe(true);
  });

  it("옮기다 저장에 실패하면 예전 기록으로 남아 계속 숨기고, 읽을 때마다 48시간이 다시 시작되지 않는다", () => {
    localStorage.setItem(KEY, LEGACY);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    migrateLegacyDismissal(7, NOW);

    expect(loadPremiumRecord(7)).toEqual({
      dismissedAt: null,
      legacyDismissed: true,
      applied: false,
      viewedSent: true,
    });
    expect(shows(NOW + 100 * HOUR)).toBe(false);
  });

  it("닫은 시각을 저장하고 읽는다", () => {
    updatePremiumRecord(7, { dismissedAt: NOW });
    expect(loadPremiumRecord(7)).toEqual({
      dismissedAt: NOW,
      legacyDismissed: false,
      applied: false,
      viewedSent: false,
    });
  });

  it("기록이 없으면 닫은 적이 없다", () => {
    expect(loadPremiumRecord(7)?.dismissedAt).toBeNull();
  });
});
