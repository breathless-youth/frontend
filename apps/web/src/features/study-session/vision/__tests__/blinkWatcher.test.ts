import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BlinkSample, EyeRegionSampler } from "../blinkWatcher";
import {
  boxesFromOutline,
  createBlinkWatcher,
  luminanceOf,
  meanAbsDiff,
  motionLevel,
} from "../blinkWatcher";
import {
  BLINK_DIFF_MIN,
  BLINK_SAMPLE_INTERVAL_MS,
  EYE_MOTION_LEVEL,
  EYE_MOTION_WINDOW_MS,
  EYE_REGION_SAMPLE,
} from "../visionConfig";

function pixels(value: number): Uint8ClampedArray {
  const count = EYE_REGION_SAMPLE.width * EYE_REGION_SAMPLE.height;
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i += 1) {
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return data;
}

const outline = {
  left: [
    { x: 0.4, y: 0.4 },
    { x: 0.46, y: 0.41 },
    { x: 0.43, y: 0.39 },
  ],
  right: [
    { x: 0.54, y: 0.4 },
    { x: 0.6, y: 0.41 },
    { x: 0.57, y: 0.39 },
  ],
  accepted: true,
};

/** 밝기 값이 `delta`만큼 오가면 평균 절대 변화가 `delta / 255`다. 문턱의 세 배로 흔든다. */
const LEVEL_DELTA = Math.ceil(EYE_MOTION_LEVEL * 255 * 3);

describe("눈 상자", () => {
  it("윤곽 폭 기준으로 상자를 잡는다 — 높이는 윤곽 높이가 아니라 폭에서 온다", () => {
    const boxes = boxesFromOutline(outline, 1000, 1000);
    expect(boxes).not.toBeNull();
    expect(boxes?.left.width).toBeCloseTo(60 * 1.4, 1);
    expect(boxes?.left.height).toBeCloseTo(60 * 0.7, 1);
  });

  it("프레임 크기를 모르면 null", () => {
    expect(boxesFromOutline(outline, 0, 0)).toBeNull();
  });
});

describe("밝기 차와 수준", () => {
  it("같은 화소면 0, 다르면 그 차의 평균이다", () => {
    const a = luminanceOf(pixels(100));
    expect(meanAbsDiff(a, luminanceOf(pixels(100)))).toBe(0);
    expect(meanAbsDiff(a, luminanceOf(pixels(200)))).toBeCloseTo(100 / 255, 3);
  });

  it("수준은 중앙값이다 — 튀는 표본 하나에 흔들리지 않는다", () => {
    expect(motionLevel([])).toBeNull();
    expect(motionLevel([0.004, 0.005, 0.2, 0.004, 0.005])).toBe(0.005);
  });
});

describe("감시기", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function watcher(frames: readonly number[]) {
    let index = 0;
    const samples: BlinkSample[] = [];
    const sample: EyeRegionSampler = (_video, box) => {
      const value = frames[Math.min(index, frames.length - 1)] ?? 0;
      // 두 눈을 한 프레임으로 본다 — 오른눈 표본 뒤에 다음 프레임으로 넘어간다.
      if (box.x > 500) {
        index += 1;
      }
      return pixels(value);
    };
    const created = createBlinkWatcher({
      video: () => ({ videoWidth: 1000, videoHeight: 1000 }) as HTMLVideoElement,
      sample,
      now: () => Date.now(),
      onSample: (s) => samples.push(s),
    });
    return { created, samples };
  }

  it("상자를 주면 초당 10번 비교하고, null을 주면 멈춘다", () => {
    const { created, samples } = watcher([100, 100, 100, 100]);
    created.update(boxesFromOutline(outline, 1000, 1000));
    expect(created.active).toBe(true);
    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS * 4);
    // 첫 표본은 비교 대상이 없어 내지 않는다.
    expect(samples).toHaveLength(3);
    created.update(null);
    expect(created.active).toBe(false);
    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS * 4);
    expect(samples).toHaveLength(3);
  });

  it("눈 자리 화소가 갑자기 크게 바뀌면 이벤트다 — 참고용", () => {
    const jump = Math.ceil(BLINK_DIFF_MIN * 255) + 5;
    const frames = [100, 100, 100, 100, 100 + jump, 100, 100];
    const { created, samples } = watcher(frames);
    created.update(boxesFromOutline(outline, 1000, 1000));
    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS * frames.length);
    expect(samples.some((s) => s.event)).toBe(true);
  });

  it("정지 시간 — 수준이 문턱 아래면 첫 표본부터 쌓이고, 계속 움직이면 되돌아간다", () => {
    // 앞 20틱은 정지(같은 화소), 그 뒤 40틱은 계속 흔들림(밝기가 오간다).
    const still = Array.from({ length: 20 }, () => 100);
    const moving = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 100 : 100 + LEVEL_DELTA));
    const { created, samples } = watcher([...still, ...moving, 100, 100]);
    expect(created.quietMs(Date.now())).toBeNull();
    created.update(boxesFromOutline(outline, 1000, 1000));

    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS * 20);
    const afterStill = created.quietMs(Date.now());
    expect(afterStill).not.toBeNull();
    expect(afterStill as number).toBeGreaterThanOrEqual(BLINK_SAMPLE_INTERVAL_MS * 15);

    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS * 40);
    const afterMoving = created.quietMs(Date.now());
    expect(afterMoving).not.toBeNull();
    expect(afterMoving as number).toBeLessThan(BLINK_SAMPLE_INTERVAL_MS * 3);
    expect(samples.at(-1)?.level).toBeGreaterThanOrEqual(EYE_MOTION_LEVEL);

    created.update(null);
    expect(created.quietMs(Date.now())).toBeNull();
  });

  it("튀는 표본 몇 개는 정지를 깨지 않는다 — 머리 흔들림 한두 번", () => {
    const frames = Array.from({ length: 120 }, (_, i) => (i === 50 || i === 90 ? 160 : 100));
    const { created } = watcher(frames);
    created.update(boxesFromOutline(outline, 1000, 1000));
    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS * 120);
    expect(created.quietMs(Date.now()) as number).toBeGreaterThan(EYE_MOTION_WINDOW_MS);
  });

  it("상자가 옮겨지면 그 직후 비교는 건너뛴다 — 옛 상자와 새 상자의 화소 차는 움직임이 아니다", () => {
    const { created, samples } = watcher([100, 100, 100, 100, 100, 100]);
    created.update(boxesFromOutline(outline, 1000, 1000));
    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS * 2);
    const before = samples.length;
    const shifted = { ...outline, left: outline.left.map((p) => ({ x: p.x + 0.01, y: p.y })) };
    created.update(boxesFromOutline(shifted, 1000, 1000));
    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS);
    expect(samples.length).toBe(before);
    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS);
    expect(samples.length).toBe(before + 1);
  });

  it("화소 밖으로는 숫자만 나간다", () => {
    const { created, samples } = watcher([100, 120]);
    created.update(boxesFromOutline(outline, 1000, 1000));
    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS * 2);
    const text = JSON.stringify(samples);
    for (const key of ["data", '"x"', '"y"', "width", "height"]) {
      expect(text).not.toContain(key);
    }
  });
});
