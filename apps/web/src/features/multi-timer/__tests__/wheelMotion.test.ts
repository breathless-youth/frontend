import { afterEach, describe, expect, it } from "vitest";

import {
  LOW_FRAME_RATE_MOTION,
  SMOOTH_MOTION,
  __resetFrameIntervalsForTests,
  medianFrameInterval,
  motionForFrameInterval,
  probeFrameInterval,
  recordFrameInterval,
  rubberBand,
  settleDuration,
} from "../wheelMotion";

afterEach(() => {
  __resetFrameIntervalsForTests();
});

describe("wheelMotion", () => {
  it("unknown_or_60fps_keeps_smooth_motion", () => {
    expect(motionForFrameInterval(null)).toBe(SMOOTH_MOTION);
    expect(motionForFrameInterval(16.7)).toBe(SMOOTH_MOTION);
    expect(motionForFrameInterval(8.3)).toBe(SMOOTH_MOTION);
  });

  it("30fps_switches_to_short_motion", () => {
    expect(motionForFrameInterval(33.3)).toBe(LOW_FRAME_RATE_MOTION);
  });

  it("low_frame_rate_motion_is_shorter_and_rolls_less", () => {
    expect(LOW_FRAME_RATE_MOTION.settleMaxMs).toBeLessThan(SMOOTH_MOTION.settleMaxMs);
    expect(LOW_FRAME_RATE_MOTION.maxFlingRows).toBeLessThan(SMOOTH_MOTION.maxFlingRows);
    expect(settleDuration(LOW_FRAME_RATE_MOTION, 1)).toBeLessThan(settleDuration(SMOOTH_MOTION, 1));
  });

  it("settle_duration_grows_with_rows_and_caps", () => {
    expect(settleDuration(SMOOTH_MOTION, 2)).toBeGreaterThan(settleDuration(SMOOTH_MOTION, 1));
    expect(settleDuration(SMOOTH_MOTION, 100)).toBe(SMOOTH_MOTION.settleMaxMs);
  });

  it("median_ignores_gaps_from_backgrounding", () => {
    expect(medianFrameInterval()).toBeNull();
    for (const ms of [33.3, 33.4, 33.2, 900, 33.3]) recordFrameInterval(ms);
    expect(medianFrameInterval()).toBeCloseTo(33.3, 0);
  });

  it("probe_records_intervals_from_animation_frames", () => {
    let now = 0;
    const queue: FrameRequestCallback[] = [];
    const raf = (cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    };
    const stop = probeFrameInterval(4, raf, () => {});
    while (queue.length > 0) {
      now += 33.3;
      queue.shift()?.(now);
    }
    stop();

    expect(medianFrameInterval()).toBeCloseTo(33.3, 0);
  });

  it("범위 안의 위치는 그대로 두고 끝을 넘은 거리는 넘을수록 덜 따라온다", () => {
    expect(rubberBand(3, 23)).toBe(3);
    expect(rubberBand(0, 23)).toBe(0);
    expect(rubberBand(23, 23)).toBe(23);

    const one = rubberBand(-1, 23);
    const two = rubberBand(-2, 23);
    expect(one).toBeLessThan(0);
    expect(one).toBeGreaterThan(-1);
    expect(Math.abs(two - one)).toBeLessThan(Math.abs(one));
    expect(rubberBand(25, 23) - 23).toBeCloseTo(-two);
  });
});
