import type { NormalizedPoint } from "@/features/timelapse/photoFrame";

import type { Detection, FrameSize } from "./detectionRules";
import { PERSON_LABEL } from "./detectionRules";

/**
 * 얼굴 가림 이모지 자리
 *
 * person bbox(1초마다)로 머리를 어림하고, 얼굴 랜드마크(2초마다)가 오면 그 값으로 바로잡는다.
 * 랜드마크가 없는 프레임에는 직전 얼굴 프레임에서 측정한 "얼굴 − 어림" 차이를 더해 고개를 숙인 자세도 따라간다.
 * 이 값은 화면에 그리거나 송신 영상을 합성하는 데만 쓴다.
 * 좌표라서 진단 로그·분석 이벤트로 보내면 안 된다.
 */

/** 프레임 기준 정규화 좌표. `x`·`y`는 이모지 가운데, `size`는 프레임 폭에 대한 비율이다. */
export interface FaceSpot {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /** 프레임 가로/세로. 화면이 `object-cover`로 자른 범위를 CSS로 다시 맞추는 데 쓴다. */
  readonly aspect: number;
  /**
   * 이모지를 그릴지. 사람은 있지만 얼굴 모델이 얼굴을 못 찾았으면 거짓이다.
   * 손·몸통만 보여도 사람으로 잡히므로, 그때 이모지가 몸 위에 떠 있지 않게 한다. 영상은 흐리지 않는다.
   */
  readonly visible: boolean;
}

/** 얼굴 랜드마크가 덮는 범위(정규화). */
export interface FaceBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

// 실기기에서 맞출 값들이다.
/** 머리 가운데가 bbox 위쪽에서 bbox 폭의 몇 배만큼 아래에 있다고 보는가. */
export const HEAD_DROP_OF_PERSON_WIDTH = 0.3;
/**
 * bbox 폭에 대한 이모지 크기. 첫 얼굴 프레임이 오기 전에만 쓴다.
 * bbox는 어깨·팔까지 잡혀 얼굴보다 훨씬 넓으므로 얼굴 크기를 측정하면 그쪽을 쓴다.
 */
export const STICKER_OF_PERSON_WIDTH = 0.5;
/** 랜드마크 범위의 긴 쪽에 대한 이모지 크기. 타임랩스(1.5)보다 조금 크게 잡아 움직임 여유를 둔다. */
export const STICKER_OF_FACE = 1.6;
/**
 * "얼굴 없음" 판정이 이만큼 이어져야 이모지를 내린다.
 * 고개를 숙이거나 돌리면 얼굴 모델이 한 번씩 놓치는데, 그때마다 내리면 얼굴이 드러난다.
 * 얼굴 판정은 2초마다라 몸만 보일 때 이모지가 사라지기까지 최대 4초 걸린다.
 */
export const NO_FACE_VERDICTS_TO_HIDE = 2;

export function faceBoundsOf(landmarks: readonly NormalizedPoint[] | undefined): FaceBounds | null {
  if (landmarks === undefined || landmarks.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of landmarks) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

interface Offset {
  readonly dx: number;
  readonly dy: number;
  readonly size: number;
}

export interface FaceSpotState {
  readonly spot: FaceSpot | null;
  /** 직전 얼굴 프레임에서 측정한 보정값. 사람이 사라지면 버린다. */
  readonly offset: Offset | null;
  /** 이어진 "얼굴 없음" 판정 수. 얼굴을 찾거나 사람이 사라지면 0이다. */
  readonly noFaceStreak: number;
}

export const EMPTY_FACE_SPOT: FaceSpotState = { spot: null, offset: null, noFaceStreak: 0 };

function topPerson(detections: readonly Detection[], minScore: number): Detection | null {
  let best: Detection | null = null;
  for (const detection of detections) {
    if (detection.label === PERSON_LABEL && detection.score >= minScore) {
      if (best === null || detection.score > best.score) {
        best = detection;
      }
    }
  }
  return best;
}

export function nextFaceSpot(
  previous: FaceSpotState,
  input: {
    readonly detections: readonly Detection[];
    readonly minPersonScore: number;
    readonly frame: FrameSize;
    /**
     * 이번 프레임의 얼굴 판정.
     * 범위면 얼굴을 찾았고, `null`이면 얼굴 모델이 돌았지만 얼굴이 없고, `undefined`면 이번 프레임에는 돌지 않았다.
     */
    readonly face: FaceBounds | null | undefined;
    /** 얼굴 모델을 쓸 수 없는 세션이면 거짓이다. 그때는 사람만 보고 이모지를 그린다. */
    readonly faceModelReady: boolean;
  },
): FaceSpotState {
  const { frame } = input;
  const person = topPerson(input.detections, input.minPersonScore);
  if (person === null || frame.width === 0 || frame.height === 0) {
    return EMPTY_FACE_SPOT;
  }
  const aspect = frame.width / frame.height;
  const box = person.box;
  const estimate = {
    x: (box.originX + box.width / 2) / frame.width,
    y: (box.originY + box.width * HEAD_DROP_OF_PERSON_WIDTH) / frame.height,
    size: (box.width / frame.width) * STICKER_OF_PERSON_WIDTH,
  };

  if (input.face != null) {
    const { minX, minY, maxX, maxY } = input.face;
    const x = (minX + maxX) / 2;
    const y = (minY + maxY) / 2;
    // 세로 범위를 프레임 폭 기준으로 바꿔 긴 쪽을 고른다.
    const faceSize = Math.max(maxX - minX, (maxY - minY) / aspect) * STICKER_OF_FACE;
    return {
      spot: { x, y, size: faceSize, aspect, visible: true },
      offset: { dx: x - estimate.x, dy: y - estimate.y, size: faceSize },
      noFaceStreak: 0,
    };
  }

  const offset = previous.offset;
  // 얼굴 판정이 없는 프레임은 직전 판정을 잇는다. 사람이 막 나타난 직후에는 일단 그린다.
  const noFaceStreak = previous.noFaceStreak + (input.face === null ? 1 : 0);
  const visible = !input.faceModelReady || noFaceStreak < NO_FACE_VERDICTS_TO_HIDE;
  return {
    spot: {
      x: estimate.x + (offset?.dx ?? 0),
      y: estimate.y + (offset?.dy ?? 0),
      // 몸을 기울이거나 팔을 벌려 bbox가 넓어져도 이모지가 따라 커지지 않게 얼굴로 측정한 크기를 유지한다.
      size: offset?.size ?? estimate.size,
      aspect,
      visible,
    },
    offset,
    noFaceStreak,
  };
}
