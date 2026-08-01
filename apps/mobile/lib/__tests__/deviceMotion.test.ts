import type { AccelerationSample, MotionWindow } from "../deviceMotion";
import {
  EMPTY_MOTION_WINDOW,
  MOTION_MIN_SAMPLES,
  MOTION_SAMPLE_INTERVAL_MS,
  MOTION_WINDOW_MS,
  accelerationMagnitude,
  isHandlingActive,
  pushSample,
  standardDeviation,
} from "../deviceMotion";

const T0 = 1_000_000;

/** 표본을 `MOTION_SAMPLE_INTERVAL_MS` 간격으로 흘려 넣는다(= 실제 20Hz 구독과 같은 리듬). */
function feed(samples: readonly Omit<AccelerationSample, "atMs">[]): MotionWindow {
  let window = EMPTY_MOTION_WINDOW;
  samples.forEach((sample, index) => {
    window = pushSample(window, { ...sample, atMs: T0 + index * MOTION_SAMPLE_INTERVAL_MS });
  });
  return window;
}

/** 거치된 기기 — 중력 1g가 한 축에 실리고 나머지는 센서 노이즈뿐이다. */
function resting(count: number, axis: "x" | "y" | "z" = "z") {
  return Array.from({ length: count }, (_, index) => {
    const noise = index % 2 === 0 ? 0.002 : -0.002;
    const base = { x: 0, y: 0, z: 0 };
    return { ...base, [axis]: 1 + noise };
  });
}

describe("accelerationMagnitude", () => {
  it("세 축의 유클리드 노름이다", () => {
    expect(accelerationMagnitude({ x: 3, y: 4, z: 0, atMs: T0 })).toBe(5);
  });
});

describe("standardDeviation", () => {
  it("모든 값이 같으면 0이다", () => {
    expect(standardDeviation([1, 1, 1, 1])).toBe(0);
  });

  it("빈 배열은 0이다", () => {
    expect(standardDeviation([])).toBe(0);
  });
});

describe("pushSample — 300ms 창", () => {
  it("20Hz로 채우면 창 안에 최소 표본 수만큼 남는다", () => {
    const window = feed(resting(20));
    expect(window.magnitudes.length).toBeGreaterThanOrEqual(MOTION_MIN_SAMPLES);
  });

  it("창을 벗어난 표본은 버린다", () => {
    const window = feed(resting(20));
    const oldest = window.timestamps[0];
    const newest = window.timestamps[window.timestamps.length - 1];
    expect(newest - oldest).toBeLessThan(MOTION_WINDOW_MS);
  });
});

describe("isHandlingActive", () => {
  it("거치된 기기는 조작으로 잡지 않는다", () => {
    expect(isHandlingActive(feed(resting(20)))).toBe(false);
  });

  it("표본이 모자라면 판정하지 않는다", () => {
    // 구독 직후 — 표본 한두 개로 계산한 편차는 값이 아니라 잡음이다.
    const window = feed([
      { x: 0, y: 0, z: 1 },
      { x: 0.9, y: 0.5, z: 1.4 },
    ]);
    expect(window.magnitudes.length).toBeLessThan(MOTION_MIN_SAMPLES);
    expect(isHandlingActive(window)).toBe(false);
  });

  it("기기를 만지면 잡는다", () => {
    // 화면을 톡톡 건드리는 정도의 흔들림 — 축마다 ±0.05g 안팎으로 출렁인다.
    const handled = Array.from({ length: 20 }, (_, index) => ({
      x: index % 2 === 0 ? 0.06 : -0.05,
      y: index % 3 === 0 ? 0.04 : -0.06,
      z: 1 + (index % 2 === 0 ? 0.08 : -0.07),
    }));
    expect(isHandlingActive(feed(handled))).toBe(true);
  });

  /**
   * 표준편차를 쓴 이유가 이것이다(설계 §5) — 거치 각도가 달라도 같은 임계가 통해야 한다.
   * "1g에서 벗어난 정도"로 판정했다면 축이 바뀔 때 기준선이 흔들려 기기마다 임계를 다시 잡아야 한다.
   */
  it("중력이 어느 축에 실리든 정지는 정지로 본다", () => {
    for (const axis of ["x", "y", "z"] as const) {
      expect(isHandlingActive(feed(resting(20, axis)))).toBe(false);
    }
  });

  it("기울여 놓기만 하고 가만히 두면 조작이 아니다", () => {
    // 45도로 거치 — 두 축에 중력이 나뉘어 실리지만 흔들리지는 않는다.
    const tilted = Array.from({ length: 20 }, (_, index) => {
      const noise = index % 2 === 0 ? 0.002 : -0.002;
      return { x: 0.707 + noise, y: 0, z: 0.707 };
    });
    expect(isHandlingActive(feed(tilted))).toBe(false);
  });
});
