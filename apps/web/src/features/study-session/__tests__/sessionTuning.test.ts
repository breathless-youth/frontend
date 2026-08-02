import { describe, expect, it } from "vitest";

import { DEFAULT_SESSION_TUNING, autoEndAfterPauseMs } from "../sessionTuning";

describe("SessionTuningConfig — 확정값 20분", () => {
  it("일시정지 자동 종료 N분은 20분으로 확정됐다 (2026-07-26 리더 확정)", () => {
    expect(DEFAULT_SESSION_TUNING.autoEndPauseMinutes).toBe(20);
  });
});

describe("autoEndAfterPauseMs — 감시 임계값 환산 (WG4)", () => {
  it("확정값 20분은 1,200,000ms로 감시가 활성화된다", () => {
    expect(autoEndAfterPauseMs(DEFAULT_SESSION_TUNING)).toBe(1_200_000);
  });

  it("null이면 감시하지 않는다", () => {
    expect(autoEndAfterPauseMs({ autoEndPauseMinutes: null })).toBeNull();
  });

  it("분 → ms 환산은 이 한 곳에서만 한다", () => {
    expect(autoEndAfterPauseMs({ autoEndPauseMinutes: 1 })).toBe(60_000);
    expect(autoEndAfterPauseMs({ autoEndPauseMinutes: 10 })).toBe(600_000);
    expect(autoEndAfterPauseMs({ autoEndPauseMinutes: 0.05 })).toBe(3_000);
  });

  it("0 이하·비정상 값은 감시 비활성으로 떨어뜨린다 — 세션이 즉시 종료되는 사고를 막는다", () => {
    expect(autoEndAfterPauseMs({ autoEndPauseMinutes: 0 })).toBeNull();
    expect(autoEndAfterPauseMs({ autoEndPauseMinutes: -1 })).toBeNull();
    expect(autoEndAfterPauseMs({ autoEndPauseMinutes: Number.NaN })).toBeNull();
  });
});
