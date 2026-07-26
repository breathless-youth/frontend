import { describe, expect, it } from "vitest";

import { DEFAULT_SESSION_TUNING } from "../sessionTuning";

describe("SessionTuningConfig — 미확정 값을 코드에서 확정하지 않는다", () => {
  it("일시정지 자동 종료 N분은 값이 정해지지 않아 null이다", () => {
    // ai-wiki 어디에도 숫자가 없다. 임의의 기본값(5분·10분 …)을 지어내면 이 테스트가 깨진다 —
    // 값이 확정되면 스펙 근거와 함께 이 테스트도 같이 고친다.
    expect(DEFAULT_SESSION_TUNING.autoEndPauseMinutes).toBeNull();
  });
});
