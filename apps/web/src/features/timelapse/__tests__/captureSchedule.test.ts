import { describe, expect, it } from "vitest";

import {
  CAPTURE_START_INTERVAL_MS,
  FINAL_PHOTO_COUNT,
  THIN_AT_COUNT,
  isCaptureDue,
  nextAnchorMs,
  selectEvenly,
  thinningDrops,
} from "../captureSchedule";

describe("isCaptureDue", () => {
  it("아직 찍은 적이 없으면 바로 찍는다", () => {
    expect(isCaptureDue(5_000, null, CAPTURE_START_INTERVAL_MS)).toBe(true);
  });

  it("마지막 촬영에서 간격만큼 지나야 다음 차례다", () => {
    expect(isCaptureDue(19_999, 10_000, 10_000)).toBe(false);
    expect(isCaptureDue(20_000, 10_000, 10_000)).toBe(true);
  });
});

describe("nextAnchorMs", () => {
  const TICK_MS = 1_100;

  /** 감지기처럼 일정 틱마다 차례를 묻고 찍은 시각을 모은다. */
  function simulate(untilMs: number, intervalAt: (shots: number) => number): number[] {
    const shots: number[] = [];
    let anchor: number | null = null;
    for (let nowMs = 0; nowMs <= untilMs; nowMs += TICK_MS) {
      const intervalMs = intervalAt(shots.length);
      if (isCaptureDue(nowMs, anchor, intervalMs)) {
        shots.push(nowMs);
        anchor = nextAnchorMs(nowMs, anchor, intervalMs);
      }
    }
    return shots;
  }

  it("첫 촬영은 찍은 시각이 기준이다", () => {
    expect(nextAnchorMs(5_000, null, 10_000)).toBe(5_000);
  });

  it("틱이 늦어 밀린 만큼은 다음 차례에 되돌린다", () => {
    expect(nextAnchorMs(11_000, 0, 10_000)).toBe(10_000);
  });

  it("틱이 1.1초마다 와도 60초 동안 10초마다 찍는다", () => {
    const shots = simulate(60_000, () => 10_000);

    expect(shots.length).toBeGreaterThanOrEqual(6);
    shots.forEach((shotMs, index) => {
      expect(shotMs - index * 10_000).toBeGreaterThanOrEqual(0);
      expect(shotMs - index * 10_000).toBeLessThan(TICK_MS);
    });
  });

  it("오래 멈췄다 돌아오면 한 장만 찍고 다시 간격대로 간다", () => {
    expect(nextAnchorMs(65_000, 10_000, 10_000)).toBe(65_000);
    expect(isCaptureDue(66_100, 65_000, 10_000)).toBe(false);
    expect(isCaptureDue(75_000, 65_000, 10_000)).toBe(true);
  });

  it("간격이 두 배로 늘면 그 뒤로는 20초마다 찍는다", () => {
    const shots = simulate(90_000, (count) => (count < 3 ? 10_000 : 20_000));

    expect(shots.map((shotMs) => Math.floor(shotMs / 10_000) * 10)).toEqual([
      0, 10, 20, 40, 60, 80,
    ]);
  });
});

describe("thinningDrops", () => {
  it("첫 장부터 한 장 걸러 지울 것을 고른다", () => {
    expect(thinningDrops([0, 1, 2, 3, 4, 5])).toEqual([1, 3, 5]);
  });

  it("720장을 솎으면 360장이 남는다", () => {
    const photos = Array.from({ length: THIN_AT_COUNT }, (_, index) => index);
    expect(photos.length - thinningDrops(photos).length).toBe(FINAL_PHOTO_COUNT);
  });
});

describe("selectEvenly", () => {
  it("개수 이하면 그대로 둔다", () => {
    const photos = Array.from({ length: 200 }, (_, index) => index);
    expect(selectEvenly(photos, FINAL_PHOTO_COUNT)).toEqual(photos);
  });

  it("처음과 끝을 포함해 고르게 고른다", () => {
    expect(selectEvenly([0, 1, 2, 3, 4, 5, 6, 7, 8], 3)).toEqual([0, 4, 8]);
  });

  it("540장에서 360장을 고르면 앞뒤 어느 쪽에도 몰리지 않는다", () => {
    const photos = Array.from({ length: 540 }, (_, index) => index);
    const picked = selectEvenly(photos, FINAL_PHOTO_COUNT);

    expect(picked).toHaveLength(FINAL_PHOTO_COUNT);
    expect(new Set(picked).size).toBe(FINAL_PHOTO_COUNT);
    // 앞쪽 절반과 뒤쪽 절반에서 고른 수가 같다.
    expect(picked.filter((index) => index < 270)).toHaveLength(180);
    const gaps = picked.slice(1).map((index, at) => index - (picked[at] ?? 0));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });
});
