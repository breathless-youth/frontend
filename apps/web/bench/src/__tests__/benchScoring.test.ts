import { describe, expect, it } from "vitest";

import { clipKey, labelAt, parseLabels, parseTimeMs } from "../labels";
import { aggregateMetrics, computeClipMetrics } from "../metrics";

describe("labels", () => {
  it("초·분:초·시:분:초를 읽는다", () => {
    expect(parseTimeMs("35.5")).toBe(35_500);
    expect(parseTimeMs("1:02.5")).toBe(62_500);
    expect(parseTimeMs("1:00:00")).toBe(3_600_000);
    expect(parseTimeMs("abc")).toBeNull();
  });

  it("파일 열이 있는 CSV를 클립별로 나누고 한글 라벨을 받는다", () => {
    const parsed = parseLabels(
      "file,start,end,label\nclip01.mp4,0,10,집중\nclip01.mp4,10,20,휴대폰\nclip02.webm,0:00,0:30,away",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.byClip.get("clip01")?.map((s) => s.label)).toEqual(["FOCUS", "PHONE"]);
    expect(parsed.byClip.get("clip02")?.[0]).toEqual({ startMs: 0, endMs: 30_000, label: "AWAY" });
  });

  it("파일 열 없는 줄은 빈 키로 모으고, 잘못된 줄은 오류로 남긴다", () => {
    const parsed = parseLabels("0,5,FOCUS\n5,3,SLEEP");
    expect(parsed.byClip.get("")).toHaveLength(1);
    expect(parsed.errors).toHaveLength(1);
  });

  it("라벨 파일 이름과 영상 이름이 같은 키가 된다", () => {
    expect(clipKey("dir/Clip01.MP4")).toBe("clip01");
    expect(clipKey("clip01.labels.csv")).toBe("clip01");
    expect(clipKey("clip01.json")).toBe("clip01");
  });

  it("라벨 없는 시각은 null", () => {
    expect(labelAt([{ startMs: 0, endMs: 1000, label: "FOCUS" }], 1500)).toBeNull();
  });
});

describe("metrics", () => {
  const gt = [
    { startMs: 0, endMs: 60_000, label: "FOCUS" as const },
    { startMs: 60_000, endMs: 90_000, label: "AWAY" as const },
  ];

  it("완벽한 예측은 정확도 1, 오차 0", () => {
    const m = computeClipMetrics(gt, gt, 90_000, { toleranceMs: 0, eventGraceMs: 0 });
    expect(m.accuracy).toBe(1);
    expect(m.overCountSec).toBe(0);
    expect(m.underCountSec).toBe(0);
    expect(m.events.find((e) => e.label === "AWAY")).toMatchObject({
      gtEvents: 1,
      detected: 1,
      meanLatencySec: 0,
    });
  });

  it("늦게 잡힌 자리 이탈은 과대 계상과 지연으로 나온다", () => {
    const pred = [
      { startMs: 0, endMs: 63_000, label: "FOCUS" as const },
      { startMs: 63_000, endMs: 90_000, label: "AWAY" as const },
    ];
    const m = computeClipMetrics(gt, pred, 90_000, { toleranceMs: 0, eventGraceMs: 0 });
    expect(m.overCountSec).toBeCloseTo(3, 5);
    expect(m.predFocusSec).toBeCloseTo(63, 5);
    expect(m.events.find((e) => e.label === "AWAY")?.meanLatencySec).toBeCloseTo(3, 5);
    // 경계 ±5초를 빼면 그 3초는 채점에서 빠진다.
    const tolerant = computeClipMetrics(gt, pred, 90_000, { toleranceMs: 5000, eventGraceMs: 0 });
    expect(tolerant.accuracy).toBe(1);
  });

  it("정답에 없는 휴대폰 판정은 오경보", () => {
    const pred = [
      { startMs: 0, endMs: 20_000, label: "FOCUS" as const },
      { startMs: 20_000, endMs: 25_000, label: "PHONE" as const },
      { startMs: 25_000, endMs: 60_000, label: "FOCUS" as const },
      { startMs: 60_000, endMs: 90_000, label: "AWAY" as const },
    ];
    const m = computeClipMetrics(gt, pred, 90_000, { toleranceMs: 0, eventGraceMs: 0 });
    expect(m.events.find((e) => e.label === "PHONE")?.falseAlarms).toBe(1);
    expect(m.underCountSec).toBeCloseTo(5, 5);
    expect(aggregateMetrics([m, m])?.underCountSec).toBeCloseTo(10, 5);
  });
});
