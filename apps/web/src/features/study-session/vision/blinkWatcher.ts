import type { EyeOutline } from "./faceLandmarker";
import {
  BLINK_DIFF_MIN,
  BLINK_REFRACTORY_MS,
  BLINK_SAMPLE_INTERVAL_MS,
  EYE_MOTION_LEVEL,
  EYE_MOTION_WINDOW_MS,
  EYE_REGION_SAMPLE,
  EYE_REGION_SCALE,
} from "./visionConfig";

/**
 * 눈 움직임 감시 — 고개 10~15° 구간(`headPitchGate.ts`의 `quiet`)에서 감김을 셀지 정하는 근거다.
 *
 * 카메라가 눈을 위에서 보는 자세에서는 뜬 눈이 감김으로 읽히고, 눈 점수로는 감김과 내려다봄을 가를 수
 * 없다(스펙 "확정: 절대 각도 게이트"). 리더 결정: 그 구간에서는 **눈이 움직이면 깨어 있는 것이고, 눈이
 * 정지해 있을 때만 감김을 센다.** 깨어 있는 눈은 읽든 보든 시선이 옮겨 다니고 깜빡이며, 자는 눈은
 * 움직이지 않는다.
 *
 * 얼굴 모델을 초당 10번 돌리면 CPU 듀티가 54%p 늘어 발열을 잡던 방향과 반대라, 모델 없이 **랜드마크가
 * 잡아 둔 눈 자리(2초에 한 번 갱신)의 화소만 비교**한다. 48×24 화소 두 조각의 뺄셈이라 비용은 사실상
 * 없다. 화소는 그 자리에서 숫자 하나(평균 절대 변화)로 줄고 버려진다 — `frontend/CLAUDE.md`의 원본
 * 프레임·얼굴 이미지 저장·전송 금지에 걸리지 않는다.
 *
 * ## 정지는 "수준"으로 잰다, 튐이 아니라
 *
 * 처음엔 튀는 표본(깜빡임)을 이벤트로 세고 "60초 무이벤트"를 정지로 봤다. 열둘째 회차에서 그것이 두 방향
 * 모두 틀렸다 — 읽는 동안은 눈이 **계속** 움직여 배경 변화가 올라가고, 배경 대비로 문턱을 잡던 규칙이
 * 문턱을 상위 5% 위로 밀어 이벤트가 0이 됐다(깨어 있다는 증거가 증거를 지웠다). 감은 눈은 배경이 5분의
 * 1인데 머리 흔들림 한두 번이 이벤트로 잡혀 정지가 성립하지 않았다.
 *
 * 두 회차 다 변화량의 **중앙값**은 읽을 때 0.013~0.022, 감았을 때 0.004~0.005로 3~5배 갈렸고 튐에
 * 흔들리지 않는다. 그래서 최근 `EYE_MOTION_WINDOW_MS`(10초)의 중앙값이 `EYE_MOTION_LEVEL` 이상이면
 * "움직임"으로 보고 정지 시계를 되돌린다. 이벤트 카운트는 참고용으로만 남긴다.
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

/** 최근 창의 중앙값. 비어 있으면 null. */
export function motionLevel(diffs: readonly number[]): number | null {
  if (diffs.length === 0) {
    return null;
  }
  const sorted = [...diffs].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

export interface BlinkSample {
  /** 두 눈 중 큰 쪽의 평균 절대 변화(0~1). */
  readonly diff: number;
  /** 최근 `EYE_MOTION_WINDOW_MS` 변화량의 중앙값. 정지 판정은 이 값으로 한다. */
  readonly level: number;
  /** 튀는 표본(`BLINK_DIFF_MIN` 이상, 불응기 밖). 참고용이다 — 정지 판정에 쓰지 않는다. */
  readonly event: boolean;
  readonly atMs: number;
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
  /**
   * 마지막 움직임(최근 창 중앙값이 `EYE_MOTION_LEVEL` 이상이었던 때, 없으면 계측 시작) 이후 지난
   * 시간(ms). 계측이 돌고 있지 않거나 아직 표본이 없으면 null — 모르는 것을 "정지"로 치지 않는다.
   */
  quietMs(atMs: number): number | null;
  stop(): void;
}

function sameBox(a: EyeRegionBox, b: EyeRegionBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function sameBoxes(a: EyeBoxes, b: EyeBoxes): boolean {
  return sameBox(a.left, b.left) && sameBox(a.right, b.right);
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
  let boxes: EyeBoxes | null = null;
  let timer: unknown = null;
  let previous: { left: Float32Array; right: Float32Array } | null = null;
  /** 최근 창의 변화량. 창 길이만큼만 든다. */
  let recent: { diff: number; atMs: number }[] = [];
  let firstSampleAtMs: number | null = null;
  let lastMotionAtMs: number | null = null;
  let lastEventAtMs: number | null = null;

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
      recent = [
        ...recent.filter((entry) => atMs - entry.atMs < EYE_MOTION_WINDOW_MS),
        { diff, atMs },
      ];
      const level = motionLevel(recent.map((entry) => entry.diff)) ?? diff;
      if (firstSampleAtMs === null) {
        firstSampleAtMs = atMs;
      }
      if (level >= EYE_MOTION_LEVEL) {
        lastMotionAtMs = atMs;
      }
      const refractory = lastEventAtMs !== null && atMs - lastEventAtMs < BLINK_REFRACTORY_MS;
      const event = !refractory && diff >= BLINK_DIFF_MIN;
      if (event) {
        lastEventAtMs = atMs;
      }
      onSample({ diff, level, event, atMs });
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
    recent = [];
    firstSampleAtMs = null;
    lastMotionAtMs = null;
    lastEventAtMs = null;
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
      if (boxes === null || !sameBoxes(boxes, next)) {
        // 상자가 옮겨졌다(2초마다 새 랜드마크). 옛 상자의 화소와 새 상자의 화소를 비교하면 상자가
        // 몇 픽셀만 움직여도 크게 튄다 — 열한째 회차에서 감은 눈의 최대 변화량 0.236이 그것이다.
        // 다음 비교는 새 상자의 두 표본으로 한다.
        previous = null;
      }
      boxes = next;
      if (timer === null) {
        timer = setTimer(tick, BLINK_SAMPLE_INTERVAL_MS);
      }
    },
    quietMs(atMs) {
      if (timer === null || firstSampleAtMs === null) {
        return null;
      }
      return atMs - (lastMotionAtMs ?? firstSampleAtMs);
    },
    stop,
  };
}
