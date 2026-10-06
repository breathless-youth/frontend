import { describe, expect, it } from "vitest";

import {
  MODAL_INTERVAL_MS,
  REVISIT_GAP_MS,
  afterApplied,
  afterCardShown,
  afterModalNeverAgain,
  afterModalShown,
  canShowInterviewCard,
  canShowInterviewModal,
  isRevisit,
  localDateKey,
} from "../interviewGate";
import { INITIAL_INTERVIEW_STATE as S0 } from "../interviewStore";

// 2026-10-06 09:00 기기 로컬 시각
const NOW = new Date(2026, 9, 6, 9, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

describe("localDateKey", () => {
  it("기기 로컬 날짜를 YYYY-MM-DD로 만든다", () => {
    expect(localDateKey(NOW)).toBe("2026-10-06");
    expect(localDateKey(new Date(2026, 0, 2, 23, 59).getTime())).toBe("2026-01-02");
  });
});

describe("isRevisit", () => {
  it("기록이 없으면 첫 방문이다", () => {
    expect(isRevisit(null, NOW)).toBe(false);
  });
  it("정확히 30분이면 재방문이 아니다", () => {
    expect(isRevisit(NOW - REVISIT_GAP_MS, NOW)).toBe(false);
  });
  it("30분을 넘으면 재방문이다", () => {
    expect(isRevisit(NOW - REVISIT_GAP_MS - 1, NOW)).toBe(true);
  });
});

describe("canShowInterviewModal", () => {
  it("처음이면 띄운다", () => {
    expect(canShowInterviewModal(S0, NOW)).toBe(true);
  });
  it("신청했으면 띄우지 않는다", () => {
    expect(canShowInterviewModal(afterApplied(S0), NOW)).toBe(false);
  });
  it("다시 보지 않기 뒤에는 띄우지 않는다", () => {
    expect(canShowInterviewModal(afterModalNeverAgain(S0), NOW)).toBe(false);
  });
  it("오늘 이미 안내했으면 띄우지 않는다", () => {
    expect(canShowInterviewModal({ ...S0, lastPromptDate: "2026-10-06" }, NOW)).toBe(false);
  });
  it("첫 노출 뒤 7일이 안 됐으면 두 번째를 띄우지 않는다", () => {
    const once = afterModalShown(S0, NOW - MODAL_INTERVAL_MS + 1);
    expect(canShowInterviewModal(once, NOW)).toBe(false);
  });
  it("첫 노출 뒤 정확히 7일이면 두 번째를 띄운다", () => {
    const once = afterModalShown(S0, NOW - MODAL_INTERVAL_MS);
    expect(canShowInterviewModal(once, NOW)).toBe(true);
  });
  it("한 번 띄웠는데 첫 노출 시각이 없으면 간격을 알 수 없어 띄우지 않는다", () => {
    expect(canShowInterviewModal({ ...S0, modalCount: 1, firstModalAt: null }, NOW)).toBe(false);
  });
  it("두 번 띄웠으면 더 띄우지 않는다", () => {
    const twice = afterModalShown(afterModalShown(S0, NOW - 30 * DAY), NOW - 20 * DAY);
    expect(canShowInterviewModal(twice, NOW)).toBe(false);
  });
});

describe("canShowInterviewCard", () => {
  it("처음이면 띄운다", () => {
    expect(canShowInterviewCard(S0, NOW)).toBe(true);
  });
  it("오늘 카드를 띄웠으면 같은 날 다시 띄우지 않는다", () => {
    expect(canShowInterviewCard(afterCardShown(S0, NOW), NOW + 60_000)).toBe(false);
  });
  it("다음 날에는 다시 띄운다", () => {
    expect(canShowInterviewCard(afterCardShown(S0, NOW), NOW + DAY)).toBe(true);
  });
  it("오늘 모달을 띄웠으면 카드를 띄우지 않는다", () => {
    expect(canShowInterviewCard(afterModalShown(S0, NOW), NOW)).toBe(false);
  });
  it("모달 다시 보지 않기와 무관하게 카드는 띄운다", () => {
    expect(canShowInterviewCard(afterModalNeverAgain(S0), NOW)).toBe(true);
  });
  it("신청했으면 띄우지 않는다", () => {
    expect(canShowInterviewCard(afterApplied(S0), NOW)).toBe(false);
  });
});

describe("상태 전이", () => {
  it("afterModalShown은 횟수·첫 시각·오늘 날짜를 남긴다", () => {
    const once = afterModalShown(S0, NOW);
    expect(once).toMatchObject({ modalCount: 1, firstModalAt: NOW, lastPromptDate: "2026-10-06" });
    const twice = afterModalShown(once, NOW + 8 * DAY);
    expect(twice).toMatchObject({ modalCount: 2, firstModalAt: NOW });
  });
  it("afterCardShown은 카드 횟수와 날짜를 남긴다", () => {
    expect(afterCardShown(S0, NOW)).toMatchObject({
      cardShownCount: 1,
      cardShownDate: "2026-10-06",
      lastPromptDate: "2026-10-06",
    });
  });
});
