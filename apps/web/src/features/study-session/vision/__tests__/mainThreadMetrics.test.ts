import { describe, expect, it } from "vitest";

import { summarizeMainThread } from "../mainThreadMetrics";

describe("summarizeMainThread", () => {
  it("① 문서 시작 뒤 30초 안에 끝난 rAF 간격 중 최댓값을 센다", () => {
    const summary = summarizeMainThread({
      frames: [100, 116, 900, 916, 932, 30_500],
      longTasks: [],
      readyAtMs: null,
      nowMs: 40_000,
    });

    // 116→900(784)이 최대다.
    // 932→30_500은 더 길지만 30초 뒤에 끝나 빠진다.
    expect(summary.startupMaxGapMs).toBe(784);
  });

  it("②③ 검출기 준비 뒤 60초 안의 Long Task 초과분·건수와 50 ms 넘는 rAF 간격만 센다", () => {
    const summary = summarizeMainThread({
      frames: [4_000, 5_000, 5_016, 5_100, 64_990, 65_200],
      longTasks: [
        { startTime: 4_500, duration: 300 }, // 준비 전이라 빠진다
        { startTime: 6_000, duration: 120 },
        { startTime: 7_000, duration: 60 },
        { startTime: 65_100, duration: 400 }, // 구간 뒤라 빠진다
      ],
      readyAtMs: 5_000,
      nowMs: 70_000,
    });

    expect(summary.longTaskExcessMs).toBe(80); // (120-50) + (60-50)
    expect(summary.longTaskCount).toBe(2);
    // 5_016→5_100(84)과 5_100→64_990만 구간 안이다.
    // 4_000→5_000은 준비 전에 시작했고, 64_990→65_200은 구간 뒤에 끝난다.
    expect(summary.frameGapsOver50).toBe(2);
    expect(summary.complete).toBe(true);
  });

  it("준비 전이면 ②③은 0이고 완료가 아니다", () => {
    const summary = summarizeMainThread({
      frames: [0, 200],
      longTasks: [{ startTime: 10, duration: 500 }],
      readyAtMs: null,
      nowMs: 1_000,
    });

    expect(summary).toMatchObject({
      longTaskExcessMs: 0,
      longTaskCount: 0,
      frameGapsOver50: 0,
      complete: false,
    });
  });

  it("안정 구간 60초가 다 차야 완료다", () => {
    const base = { frames: [], longTasks: [], readyAtMs: 5_000 };
    expect(summarizeMainThread({ ...base, nowMs: 64_999 }).complete).toBe(false);
    expect(summarizeMainThread({ ...base, nowMs: 65_000 }).complete).toBe(true);
  });

  it("Long Task를 지원하지 않는 엔진(WebKit)은 ②를 null로 둔다", () => {
    const summary = summarizeMainThread({
      frames: [],
      longTasks: null,
      readyAtMs: 5_000,
      nowMs: 70_000,
    });

    expect(summary.longTaskExcessMs).toBeNull();
    expect(summary.longTaskCount).toBeNull();
  });
});
