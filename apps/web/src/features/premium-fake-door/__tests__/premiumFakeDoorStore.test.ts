import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadPremiumRecord, updatePremiumRecord } from "../premiumFakeDoorStore";

const KEY = "focusmakers.premiumFakeDoor.v1.7";
const NOW = Date.parse("2026-11-26T12:00:00+09:00");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("premiumFakeDoorStore", () => {
  it("예전 기록의 dismissed: true는 처음 읽은 때 닫은 것으로 옮기고, 그 시각을 저장해 다시 읽어도 같다", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ dismissed: true, applied: false, viewedSent: true }),
    );

    expect(loadPremiumRecord(7)).toEqual({ dismissedAt: NOW, applied: false, viewedSent: true });

    vi.setSystemTime(NOW + 60_000);
    expect(loadPremiumRecord(7)?.dismissedAt).toBe(NOW);
  });

  it("닫은 시각을 저장하고 읽는다", () => {
    updatePremiumRecord(7, { dismissedAt: NOW });
    expect(loadPremiumRecord(7)).toEqual({ dismissedAt: NOW, applied: false, viewedSent: false });
  });

  it("기록이 없으면 닫은 적이 없다", () => {
    expect(loadPremiumRecord(7)?.dismissedAt).toBeNull();
  });
});
