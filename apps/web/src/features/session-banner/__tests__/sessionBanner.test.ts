import type { DailyStudyStat } from "@focusmakers/types";
import { describe, expect, it } from "vitest";

import {
  assignSessionBannerArm,
  canShowSessionBanner,
  isSessionBannerEligible,
  SESSION_BANNER_ENDS_AT_MS,
  sessionBannerStatsRange,
} from "../sessionBanner";

/** 프리미엄 가격 분배와 같은 식이다. 그 코드를 불러오지 않고 여기 다시 적어 두 실험이 함께 갈리는지 본다. */
function premiumPriceIndex(userId: number): number {
  const key = `premium-fake-door:${userId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 2;
}

const USER_IDS = Array.from({ length: 10_000 }, (_, i) => i + 1);

describe("assignSessionBannerArm", () => {
  it("같은 사용자는 늘 같은 군이다", () => {
    for (const userId of [1, 42, 1234, 98765]) {
      expect(assignSessionBannerArm(userId)).toBe(assignSessionBannerArm(userId));
    }
  });

  it("사용자 1만 명 중 68~72%가 배너를 본다", () => {
    const exposed = USER_IDS.filter((id) => assignSessionBannerArm(id) === "exposed").length;
    expect(exposed / USER_IDS.length).toBeGreaterThanOrEqual(0.68);
    expect(exposed / USER_IDS.length).toBeLessThanOrEqual(0.72);
  });

  it("배너를 보는 군과 안 보는 군 모두 프리미엄 가격이 47~53%로 나뉜다", () => {
    for (const arm of ["exposed", "control"] as const) {
      const members = USER_IDS.filter((id) => assignSessionBannerArm(id) === arm);
      const share = members.filter((id) => premiumPriceIndex(id) === 0).length / members.length;
      expect(share).toBeGreaterThanOrEqual(0.47);
      expect(share).toBeLessThanOrEqual(0.53);
    }
  });
});

const day = (date: string, focusSec: number): DailyStudyStat => ({
  date,
  studySec: focusSec,
  focusSec,
});

describe("isSessionBannerEligible", () => {
  it("순공 60초 이상인 날이 2일이면 대상이고 1일이면 아니다", () => {
    const one = [day("2026-11-10", 60), day("2026-11-11", 0), day("2026-11-12", 59)];
    expect(isSessionBannerEligible(one)).toBe(false);
    expect(isSessionBannerEligible([...one, day("2026-11-13", 3600)])).toBe(true);
  });

  it("59초인 날은 세지 않는다", () => {
    const days = [day("2026-11-10", 60), day("2026-11-11", 59), day("2026-11-12", 59)];
    expect(isSessionBannerEligible(days)).toBe(false);
  });
});

describe("sessionBannerStatsRange", () => {
  it("판정일 전 14일이고 판정일은 빠진다", () => {
    expect(sessionBannerStatsRange("2026-11-24")).toEqual({ from: "2026-11-10", to: "2026-11-23" });
  });
});

describe("canShowSessionBanner", () => {
  const base = {
    group: "exposed" as const,
    nowMs: Date.parse("2026-11-25T12:00:00+09:00"),
    applied: false,
  };

  it("배너를 보는 군에만 보인다", () => {
    expect(canShowSessionBanner(base)).toBe(true);
    expect(canShowSessionBanner({ ...base, group: "control" })).toBe(false);
    expect(canShowSessionBanner({ ...base, group: "not_eligible" })).toBe(false);
    expect(canShowSessionBanner({ ...base, group: null })).toBe(false);
  });

  it("사전 신청을 마쳤으면 숨긴다", () => {
    expect(canShowSessionBanner({ ...base, applied: true })).toBe(false);
  });

  it("종료 시각이 지났거나 스위치가 꺼지면 보이지 않는다", () => {
    expect(SESSION_BANNER_ENDS_AT_MS).toBe(Date.parse("2026-12-03T23:59:59+09:00"));
    expect(canShowSessionBanner({ ...base, nowMs: SESSION_BANNER_ENDS_AT_MS })).toBe(true);
    expect(canShowSessionBanner({ ...base, nowMs: SESSION_BANNER_ENDS_AT_MS + 1 })).toBe(false);
    expect(canShowSessionBanner({ ...base, enabled: false })).toBe(false);
  });

  it("사전 신청 실험이 꺼지면 누를 곳이 없어 보이지 않는다", () => {
    expect(canShowSessionBanner({ ...base, premiumEnabled: false })).toBe(false);
  });
});
