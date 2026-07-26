import { describe, expect, it } from "vitest";

import { DEFAULT_SESSION_TUNING, autoEndAfterPauseMs } from "../sessionTuning";

describe("SessionTuningConfig — 미확정 값을 코드에서 확정하지 않는다", () => {
  it("일시정지 자동 종료 N분은 값이 정해지지 않아 null이다", () => {
    // ai-wiki 어디에도 숫자가 없다. 임의의 기본값(5분·10분 …)을 지어내면 이 테스트가 깨진다 —
    // 값이 확정되면 스펙 근거와 함께 이 테스트도 같이 고친다.
    expect(DEFAULT_SESSION_TUNING.autoEndPauseMinutes).toBeNull();
  });
});

describe("autoEndAfterPauseMs — 감시 임계값 환산 (WG4)", () => {
  it("값이 미정(null)이면 감시하지 않는다", () => {
    expect(autoEndAfterPauseMs(DEFAULT_SESSION_TUNING)).toBeNull();
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
