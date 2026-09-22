import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BlinkSample, EyeRegionSampler } from "../blinkWatcher";
import {
  boxesFromOutline,
  createBlinkDetector,
  createBlinkWatcher,
  luminanceOf,
  meanAbsDiff,
} from "../blinkWatcher";
import {
  BLINK_DIFF_MIN,
  BLINK_REFRACTORY_MS,
  BLINK_SAMPLE_INTERVAL_MS,
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

describe("밝기 차", () => {
  it("같은 화소면 0, 다르면 그 차의 평균이다", () => {
    const a = luminanceOf(pixels(100));
    expect(meanAbsDiff(a, luminanceOf(pixels(100)))).toBe(0);
    expect(meanAbsDiff(a, luminanceOf(pixels(200)))).toBeCloseTo(100 / 255, 3);
  });
});

describe("깜빡임 이벤트 규칙", () => {
  it("배경보다 크게 튀면 이벤트이고, 불응기 안의 두 번째 튐은 세지 않는다", () => {
    const detector = createBlinkDetector();
    for (let i = 0; i < 10; i += 1) {
      expect(detector.push(0.005, i * 100)).toBe(false);
    }
    expect(detector.push(BLINK_DIFF_MIN * 3, 1000)).toBe(true);
    expect(detector.push(BLINK_DIFF_MIN * 3, 1000 + BLINK_REFRACTORY_MS / 2)).toBe(false);
    expect(detector.push(BLINK_DIFF_MIN * 3, 1000 + BLINK_REFRACTORY_MS * 3)).toBe(true);
  });

  it("첫 표본은 배경을 세우는 데 쓰고 이벤트로 세지 않는다", () => {
    const detector = createBlinkDetector();
    expect(detector.push(1, 0)).toBe(false);
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
    const sample: EyeRegionSampler = () => {
      const value = frames[Math.min(index, frames.length - 1)] ?? 0;
      return pixels(value);
    };
    const samples: BlinkSample[] = [];
    const created = createBlinkWatcher({
      video: () => ({ videoWidth: 1000, videoHeight: 1000 }) as HTMLVideoElement,
      sample: (video, box) => {
        const data = sample(video, box);
        // 두 눈을 한 프레임으로 본다 — 오른눈 표본 뒤에 다음 프레임으로 넘어간다.
        if (box.x > 500) {
          index += 1;
        }
        return data;
      },
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

  it("눈 자리 화소가 갑자기 바뀌면 이벤트다", () => {
    const frames = [100, 100, 100, 100, 100, 100, 200, 100, 100];
    const { created, samples } = watcher(frames);
    created.update(boxesFromOutline(outline, 1000, 1000));
    vi.advanceTimersByTime(BLINK_SAMPLE_INTERVAL_MS * frames.length);
    expect(samples.some((s) => s.event)).toBe(true);
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
