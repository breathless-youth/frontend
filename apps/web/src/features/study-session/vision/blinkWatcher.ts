import type { EyeOutline } from "./faceLandmarker";
import {
  BLINK_DIFF_MIN,
  BLINK_DIFF_RATIO,
  BLINK_REFRACTORY_MS,
  BLINK_SAMPLE_INTERVAL_MS,
  EYE_REGION_SAMPLE,
  EYE_REGION_SCALE,
} from "./visionConfig";

/**
 * 깜빡임 감시 — **BY-704 측정용 계측이다. 판정에는 쓰지 않는다.**
 *
 * 내려다봄 게이트에 걸린 동안(카메라 기준 고개 15° 이상) 눈이 감김으로 읽히는 것이 실제 감김인지
 * 내려다본 뜬 눈인지를 눈 점수로는 가를 수 없다(스펙 "확정: 절대 각도 게이트"). 리더 제안: 그 구간에서
 * **깜빡임이 이어지면 깨어 있는 것이고, 같은 각도에서 깜빡임이 끊기면 잠**이다. 이 모듈은 그 신호가
 * 실제로 잡히는지를 재기 위해, 게이트에 걸린 동안만 눈 자리 화소를 초당 10번 비교해 순간 변화를 남긴다.
 *
 * 얼굴 모델을 초당 10번 돌리면 CPU 듀티가 54%p 늘어 발열을 잡던 방향과 반대라, 모델 없이 **랜드마크가
 * 잡아 둔 눈 자리(2초에 한 번 갱신)의 화소만 비교**한다. 48×24 화소 두 조각의 뺄셈이라 비용은 사실상
 * 없다. 화소는 그 자리에서 숫자 하나(평균 절대 변화)로 줄고 버려진다 — `frontend/CLAUDE.md`의 원본
 * 프레임·얼굴 이미지 저장·전송 금지에 걸리지 않는다.
 *
 * 앞서 눈 영역의 **정적** 대비·어둠 비율은 뜬 눈과 감은 눈을 가르지 못해 뺐다(넷째 회차). 이번 것은
 * 눈꺼풀이 움직이는 **순간 변화**라 다른 신호이고, 검증은 이 계측이 한다.
 */

export interface EyeRegionBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EyeBoxes {
  readonly left: EyeRegionBox;
  readonly right: EyeRegionBox;
}

/** 프레임의 눈 상자를 표본 크기로 떠서 RGBA 화소를 돌려준다. 못 뜨면 null. 테스트는 합성 화소를 넣는다. */
export type EyeRegionSampler = (
  video: HTMLVideoElement,
  box: EyeRegionBox,
) => Uint8ClampedArray | null;

/**
 * 기본 화소 표본기 — 작은 캔버스 하나를 재사용한다. 캔버스가 없거나(SSR·jsdom) 비디오가 보안
 * 오염(cross-origin)이면 null.
 */
export function createCanvasEyeSampler(): EyeRegionSampler {
  const { width, height } = EYE_REGION_SAMPLE;
  let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  function ensureContext() {
    if (context !== null) {
      return context;
    }
    if (typeof OffscreenCanvas !== "undefined") {
      context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
    } else if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      context = canvas.getContext("2d", { willReadFrequently: true });
    }
    return context;
  }
  return (video, box) => {
    try {
      const target = ensureContext();
      if (target === null) {
        return null;
      }
      target.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, width, height);
      return target.getImageData(0, 0, width, height).data;
    } catch {
      return null;
    }
  };
}

function boxOf(
  points: readonly { readonly x: number; readonly y: number }[],
  frameWidth: number,
  frameHeight: number,
): EyeRegionBox | null {
  if (points.length === 0) {
    return null;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    sumX += point.x;
    sumY += point.y;
  }
  const eyeWidth = (maxX - minX) * frameWidth;
  if (eyeWidth <= 0) {
    return null;
  }
  // 높이는 윤곽 폭 기준이다 — 위에서 본 뜬 눈은 윤곽이 선으로 찌그러져 높이가 0에 가깝다.
  const boxWidth = eyeWidth * EYE_REGION_SCALE.width;
  const boxHeight = eyeWidth * EYE_REGION_SCALE.height;
  const x = Math.max(0, (sumX / points.length) * frameWidth - boxWidth / 2);
  const y = Math.max(0, (sumY / points.length) * frameHeight - boxHeight / 2);
  const width = Math.min(frameWidth - x, boxWidth);
  const height = Math.min(frameHeight - y, boxHeight);
  return width < 2 || height < 2 ? null : { x, y, width, height };
}

/** 눈 윤곽(정규화) → 프레임 픽셀 상자 둘. 한쪽이라도 못 잡으면 null. */
export function boxesFromOutline(
  outline: EyeOutline,
  frameWidth: number,
  frameHeight: number,
): EyeBoxes | null {
  if (!frameWidth || !frameHeight) {
    return null;
  }
  const left = boxOf(outline.left, frameWidth, frameHeight);
  const right = boxOf(outline.right, frameWidth, frameHeight);
  return left === null || right === null ? null : { left, right };
}

/** RGBA → 밝기(0~1). 배열은 여기서 끝난다. */
export function luminanceOf(data: Uint8ClampedArray): Float32Array {
  const pixels = Math.floor(data.length / 4);
  const out = new Float32Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    out[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  return out;
}

/** 두 밝기 배열의 평균 절대 차(0~1). 길이가 다르면 짧은 쪽까지만 본다. */
export function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return sum / length;
}

export interface BlinkSample {
  /** 두 눈 중 큰 쪽의 평균 절대 변화(0~1). 깜빡임이면 튄다. */
  readonly diff: number;
  /** 이 표본을 깜빡임 이벤트로 셌는가(잠정 규칙). */
  readonly event: boolean;
  readonly atMs: number;
}

export interface BlinkDetector {
  /** 변화량 하나를 넣고 이벤트인지 돌려준다. */
  push(diff: number, atMs: number): boolean;
  reset(): void;
}

/**
 * 잠정 이벤트 규칙 — 배경 변화의 지수이동평균보다 `BLINK_DIFF_RATIO`배 크고 `BLINK_DIFF_MIN` 이상이면
 * 이벤트, 그 뒤 `BLINK_REFRACTORY_MS` 동안은 다시 세지 않는다(감았다 뜨는 두 번의 튐을 하나로).
 * 튜닝은 덩어리의 `blink.diff` 분포로 한다 — 그래서 이벤트 여부와 별개로 변화량을 전부 남긴다.
 */
export function createBlinkDetector(): BlinkDetector {
  let baseline: number | null = null;
  let lastEventAtMs: number | null = null;
  return {
    push(diff, atMs) {
      const floor = Math.max(BLINK_DIFF_MIN, (baseline ?? 0) * BLINK_DIFF_RATIO);
      const refractory = lastEventAtMs !== null && atMs - lastEventAtMs < BLINK_REFRACTORY_MS;
      const event = !refractory && baseline !== null && diff >= floor;
      if (event) {
        lastEventAtMs = atMs;
      } else {
        // 이벤트가 아닌 표본만 배경에 섞는다. 이벤트를 섞으면 배경이 올라가 다음 깜빡임을 놓친다.
        baseline = baseline === null ? diff : baseline * 0.9 + diff * 0.1;
      }
      return event;
    },
    reset() {
      baseline = null;
      lastEventAtMs = null;
    },
  };
}

export interface BlinkWatcherOptions {
  readonly video: () => HTMLVideoElement | null;
  readonly onSample: (sample: BlinkSample) => void;
  readonly sample?: EyeRegionSampler;
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export interface BlinkWatcher {
  readonly active: boolean;
  /** 눈 상자를 준다. null이면 멈춘다. 상자가 있으면 초당 10번 비교를 이어 간다. */
  update(boxes: EyeBoxes | null): void;
  stop(): void;
}

export function createBlinkWatcher(options: BlinkWatcherOptions): BlinkWatcher {
  const {
    video,
    onSample,
    sample = createCanvasEyeSampler(),
    now = () => performance.now(),
    setTimer = (callback, ms) => setInterval(callback, ms),
    clearTimer = (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  } = options;
  const detector = createBlinkDetector();
  let boxes: EyeBoxes | null = null;
  let timer: unknown = null;
  let previous: { left: Float32Array; right: Float32Array } | null = null;

  function tick(): void {
    const element = video();
    if (element === null || boxes === null) {
      return;
    }
    const left = sample(element, boxes.left);
    const right = sample(element, boxes.right);
    if (left === null || right === null) {
      return;
    }
    const current = { left: luminanceOf(left), right: luminanceOf(right) };
    if (previous !== null) {
      const diff = Math.max(
        meanAbsDiff(previous.left, current.left),
        meanAbsDiff(previous.right, current.right),
      );
      const atMs = now();
      onSample({ diff, event: detector.push(diff, atMs), atMs });
    }
    previous = current;
  }

  function stop(): void {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    boxes = null;
    previous = null;
    detector.reset();
  }

  return {
    get active() {
      return timer !== null;
    },
    update(next) {
      if (next === null) {
        stop();
        return;
      }
      boxes = next;
      if (timer === null) {
        timer = setTimer(tick, BLINK_SAMPLE_INTERVAL_MS);
      }
    },
    stop,
  };
}
