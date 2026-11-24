import { describe, expect, it } from "vitest";

import i18n from "@/lib/i18n";

import {
  assignPremiumPrice,
  dailyPremiumPrice,
  canShowPremiumCard,
  EMPTY_PREMIUM_RECORD,
  type PremiumCardContext,
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
  };

  it("결과 화면에는 보인다", () => {
    expect(canShowPremiumCard(base)).toBe(true);
  });

  it("닫았거나 신청했으면 숨긴다", () => {
    expect(
      canShowPremiumCard({ ...base, record: { ...EMPTY_PREMIUM_RECORD, dismissed: true } }),
    ).toBe(false);
    expect(
      canShowPremiumCard({ ...base, record: { ...EMPTY_PREMIUM_RECORD, applied: true } }),
    ).toBe(false);
  });

  it("종료 시각(2026-11-30 23:59:59 KST)이 지나면 숨긴다", () => {
    expect(canShowPremiumCard({ ...base, nowMs: Date.parse("2026-11-30T23:59:59+09:00") })).toBe(
      true,
    );
    expect(canShowPremiumCard({ ...base, nowMs: Date.parse("2026-12-01T00:00:00+09:00") })).toBe(
      false,
    );
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
