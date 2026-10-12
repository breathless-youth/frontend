import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_HOME_OVERTAKEN } from "@/lib/rankingFixtures";

import {
  afterUnseen,
  loadRankingPopupDays,
  markMedalShown,
  markOvertakeChecked,
  overtakeToShow,
  rankingPopupAllowed,
} from "../homePopup";

/** KST 10월 12일 오전 10시. */
const NOW = Date.parse("2026-10-12T01:00:00Z");
/** KST 10월 11일 오후 11시. */
const HIDDEN_AT = Date.parse("2026-10-11T14:00:00Z");
const NO_DAYS = { overtakeCheckedOn: null, medalShownOn: null };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("rankingPopupAllowed", () => {
  it("공지·인터뷰·복구 창 중 하나라도 뜬 실행이면 쉰다", () => {
    expect(rankingPopupAllowed({ noticeShown: true, recoveryShown: false })).toBe(false);
    expect(rankingPopupAllowed({ noticeShown: false, recoveryShown: true })).toBe(false);
    expect(rankingPopupAllowed({ noticeShown: false, recoveryShown: false })).toBe(true);
  });
});

describe("afterUnseen", () => {
  it("안 본 메달이 있으면 그날 추월을 이미 확인했어도 메달 모달이다", () => {
    expect(
      afterUnseen({
        unseenCount: 2,
        nowMs: NOW,
        lastHiddenAtMs: HIDDEN_AT,
        days: { overtakeCheckedOn: "2026-10-12", medalShownOn: null },
      }),
    ).toEqual({ kind: "medal", dayKey: "2026-10-12" });
  });

  it("메달이 없으면 그날 첫 확인에 마지막으로 가려진 시각부터 추월을 묻는다", () => {
    expect(
      afterUnseen({ unseenCount: 0, nowMs: NOW, lastHiddenAtMs: HIDDEN_AT, days: NO_DAYS }),
    ).toEqual({ kind: "overtake", dayKey: "2026-10-12", since: "2026-10-11T14:00:00.000Z" });
  });

  it("같은 날 두 번째 확인은 쉰다", () => {
    expect(
      afterUnseen({
        unseenCount: 0,
        nowMs: NOW,
        lastHiddenAtMs: HIDDEN_AT,
        days: { overtakeCheckedOn: "2026-10-12", medalShownOn: null },
      }),
    ).toEqual({ kind: "rest" });
  });

  it("메달 모달을 띄운 날은 추월을 묻지 않는다", () => {
    expect(
      afterUnseen({
        unseenCount: 0,
        nowMs: NOW,
        lastHiddenAtMs: HIDDEN_AT,
        days: { overtakeCheckedOn: null, medalShownOn: "2026-10-12" },
      }),
    ).toEqual({ kind: "rest" });
  });

  it("마지막으로 가려진 시각이 없으면 묻지 않지만 그날 확인한 것으로 적게 한다", () => {
    expect(
      afterUnseen({ unseenCount: 0, nowMs: NOW, lastHiddenAtMs: null, days: NO_DAYS }),
    ).toEqual({ kind: "overtake", dayKey: "2026-10-12", since: null });
  });

  it("가려진 시각 기록이 깨져 날짜로 바꿀 수 없으면 없는 것과 같이 다룬다", () => {
    for (const broken of [Number.NaN, Number.POSITIVE_INFINITY, 1e20]) {
      expect(
        afterUnseen({ unseenCount: 0, nowMs: NOW, lastHiddenAtMs: broken, days: NO_DAYS }),
      ).toEqual({ kind: "overtake", dayKey: "2026-10-12", since: null });
    }
  });

  it("날짜 기록을 읽지 못하면 하루 한 번을 지킬 수 없어 쉰다", () => {
    expect(
      afterUnseen({ unseenCount: 0, nowMs: NOW, lastHiddenAtMs: HIDDEN_AT, days: null }),
    ).toEqual({ kind: "rest" });
  });

  it("날짜는 KST 자정에 바뀐다", () => {
    const days = { overtakeCheckedOn: "2026-10-11", medalShownOn: null };

    expect(
      afterUnseen({
        unseenCount: 0,
        nowMs: Date.parse("2026-10-11T14:59:59Z"),
        lastHiddenAtMs: HIDDEN_AT,
        days,
      }),
    ).toEqual({ kind: "rest" });
    expect(
      afterUnseen({
        unseenCount: 0,
        nowMs: Date.parse("2026-10-11T15:00:00Z"),
        lastHiddenAtMs: HIDDEN_AT,
        days,
      }),
    ).toMatchObject({ kind: "overtake", dayKey: "2026-10-12" });
  });
});

describe("overtakeToShow", () => {
  const overtaken = FIXTURE_HOME_OVERTAKEN.overtaken!;

  it("순위가 내려간 추월은 그대로 띄운다", () => {
    expect(overtakeToShow(overtaken)).toBe(overtaken);
  });

  it("인원이 없거나 순위가 내려가지 않은 값은 띄우지 않는다", () => {
    expect(overtakeToShow(null)).toBeNull();
    expect(overtakeToShow({ ...overtaken, count: 0 })).toBeNull();
    expect(overtakeToShow({ ...overtaken, toRank: overtaken.fromRank })).toBeNull();
  });
});

describe("날짜 기록", () => {
  it("추월 확인한 날과 메달 띄운 날을 따로 적는다", () => {
    expect(loadRankingPopupDays()).toEqual(NO_DAYS);

    markOvertakeChecked("2026-10-12");
    markMedalShown("2026-10-11");

    expect(loadRankingPopupDays()).toEqual({
      overtakeCheckedOn: "2026-10-12",
      medalShownOn: "2026-10-11",
    });
  });

  it("읽지 못하면 null이고 쓰지 못해도 throw하지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(loadRankingPopupDays()).toBeNull();
    expect(() => markOvertakeChecked("2026-10-12")).not.toThrow();
    expect(() => markMedalShown("2026-10-12")).not.toThrow();
  });
});
