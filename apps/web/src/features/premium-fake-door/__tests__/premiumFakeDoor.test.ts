import { describe, expect, it } from "vitest";

import i18n from "@/lib/i18n";

import {
  assignPremiumPrice,
  dailyPremiumPrice,
  canShowPremiumCard,
  EMPTY_PREMIUM_RECORD,
  PREMIUM_FAKE_DOOR_ENDS_AT_MS,
  type PremiumCardContext,
  premiumQualifyingSec,
} from "../premiumFakeDoor";

describe("assignPremiumPrice", () => {
  it("같은 사용자는 늘 같은 가격이고, 여러 사용자에서 두 가격이 모두 나온다", () => {
    expect(assignPremiumPrice(1234)).toBe(assignPremiumPrice(1234));
    const prices = new Set(Array.from({ length: 50 }, (_, i) => assignPremiumPrice(i + 1)));
    expect(prices).toEqual(new Set([2900, 5900]));
  });
});

describe("canShowPremiumCard", () => {
  const base: PremiumCardContext = {
    nowMs: Date.parse("2026-11-25T12:00:00+09:00"),
    hasTokenSource: true,
    korean: true,
    record: EMPTY_PREMIUM_RECORD,
    qualifyingSec: 600,
  };

  it("결과 화면에는 보인다", () => {
    expect(canShowPremiumCard(base)).toBe(true);
  });

  it("방금 끝낸 세션의 기준 시간이 10분(600초) 이상일 때만 보인다", () => {
    expect(canShowPremiumCard({ ...base, qualifyingSec: 599 })).toBe(false);
    expect(canShowPremiumCard({ ...base, qualifyingSec: 600 })).toBe(true);
  });

  it("신청했으면 다시 보이지 않는다", () => {
    expect(
      canShowPremiumCard({ ...base, record: { ...EMPTY_PREMIUM_RECORD, applied: true } }),
    ).toBe(false);
  });

  it("닫으면 48시간 동안 숨기고, 48시간이 지나면 다시 보인다", () => {
    const dismissedAt = base.nowMs;
    const record = { ...EMPTY_PREMIUM_RECORD, dismissedAt };
    const hours = (h: number, m = 0) => dismissedAt + (h * 60 + m) * 60 * 1000;
    expect(canShowPremiumCard({ ...base, record, nowMs: hours(47, 59) })).toBe(false);
    expect(canShowPremiumCard({ ...base, record, nowMs: hours(48) })).toBe(true);
  });

  it("종료 시각(2026-12-03 23:59:59 KST)이 지나면 숨긴다", () => {
    expect(PREMIUM_FAKE_DOOR_ENDS_AT_MS).toBe(Date.parse("2026-12-03T23:59:59+09:00"));
    expect(canShowPremiumCard({ ...base, nowMs: PREMIUM_FAKE_DOOR_ENDS_AT_MS })).toBe(true);
    expect(canShowPremiumCard({ ...base, nowMs: PREMIUM_FAKE_DOOR_ENDS_AT_MS + 1 })).toBe(false);
  });

  it("토큰 출처가 없거나 한국어가 아니거나 실험이 꺼지면 숨긴다", () => {
    expect(canShowPremiumCard({ ...base, hasTokenSource: false })).toBe(false);
    expect(canShowPremiumCard({ ...base, korean: false })).toBe(false);
    expect(canShowPremiumCard({ ...base, enabled: false })).toBe(false);
  });
});

describe("dailyPremiumPrice", () => {
  it("월 가격을 30일로 나눠 반올림하고, 카탈로그 문장으로 하루 약 97원·197원이 된다", () => {
    expect(dailyPremiumPrice(2900)).toBe(97);
    expect(dailyPremiumPrice(5900)).toBe(197);
    expect(i18n.t("premium-fake-door:priceCard.perDay", { amount: dailyPremiumPrice(2900) })).toBe(
      "하루 약 97원",
    );
    expect(i18n.t("premium-fake-door:priceCard.perDay", { amount: dailyPremiumPrice(5900) })).toBe(
      "하루 약 197원",
    );
  });
});

describe("premiumQualifyingSec", () => {
  it("카메라 세션은 순공시간으로 판정한다", () => {
    expect(premiumQualifyingSec({ timer: false, focusSec: 600, studySec: 3000 })).toBe(600);
    expect(premiumQualifyingSec({ timer: false, focusSec: 599, studySec: 3000 })).toBe(599);
  });

  it("자율 모드 세션은 순공 대신 총 공부시간으로 판정한다", () => {
    expect(premiumQualifyingSec({ timer: true, focusSec: 0, studySec: 600 })).toBe(600);
    expect(premiumQualifyingSec({ timer: true, focusSec: 0, studySec: 599 })).toBe(599);
  });
});
