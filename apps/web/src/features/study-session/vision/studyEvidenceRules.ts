import type { Detection, FrameSize } from "./detectionRules";
import { PHONE_LABEL } from "./detectionRules";
import type { EyeScores } from "./sleepRules";
import {
  GAZE_TOOL,
  HAND_MOVE_RANGE,
  HAND_PHONE_MARGIN,
  HAND_TOOL_MARGIN,
  HEAD_PITCH_DOWN_DEG,
  SCORE_THRESHOLDS,
  SCREEN_GAZE,
  TOOL_LABELS,
} from "./visionConfig";

/**
 * 공부 증거 판정 — 순수 함수만 있다.
 *
 * 얼굴이 보이면 공부 도구 쪽 시선이 핵심 증거이고 도구 위 손이 보조 증거다.
 * 도구를 보지 않을 때는 시선이 화면에 고정됐는지도 본다. 도구가 보여도 마찬가지다.
 * 전면 카메라에 잡히는 도구는 사용자 앞이나 옆 책상 위에 있어 그쪽을 볼 때 카메라 정면을 보지 않는다.
 * 도구를 오검출한 화면에서도 휴대폰 화면 응시를 놓치지 않으려는 것이다.
 * 얼굴이 안 보이면 손이 도구 위에서 움직이는지(필기·타이핑)로 본다. 몸통(사람 박스)까지 없으면 자리이탈이다.
 *
 * 여기서 나온 boolean 뒤의 유예·확정 시간은 `../detection.ts`가 잰다.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 손 하나에서 판정이 쓰는 네 점. 프레임 대비 0~1 좌표다. 손바닥은 가운데 손가락 뿌리 관절이다. */
export interface HandPose {
  readonly wrist: Point;
  readonly thumbTip: Point;
  readonly indexTip: Point;
  readonly palm: Point;
}

/** 프레임 대비 0~1로 맞춘 박스. */
export interface NormalizedBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface GazeReading {
  /** 양수가 아래다. */
  readonly pitchDeg: number | null;
  readonly yawDeg: number | null;
  /** 양쪽 눈 아래 보기 점수의 평균. 눈 판정을 못 했으면 null이다. */
  readonly eyeLookDown: number | null;
  /** 고개를 돌린 방향. 프레임 오른쪽이 +다. `faceLandmarker.ts`의 `FaceMetrics.noseOffsetX`. */
  readonly noseOffsetX: number | null;
}

export function eyeLookDownOf(eye: EyeScores | null): number | null {
  const left = eye?.eyeLookDownLeft;
  const right = eye?.eyeLookDownRight;
  if (left === undefined || right === undefined) {
    return null;
  }
  return (left + right) / 2;
}

/** 공부 도구 박스. 점수가 도구 임계를 넘은 laptop·book만 프레임 대비 좌표로 바꾼다. */
export function toolBoxesOf(detections: readonly Detection[], frame: FrameSize): NormalizedBox[] {
  return boxesOf(detections, frame, TOOL_LABELS, SCORE_THRESHOLDS.tool);
}

/** 휴대폰 박스. 휴대폰 임계를 넘은 것만 프레임 대비 좌표로 바꾼다. */
export function phoneBoxesOf(detections: readonly Detection[], frame: FrameSize): NormalizedBox[] {
  return boxesOf(detections, frame, [PHONE_LABEL], SCORE_THRESHOLDS.phone);
}

function boxesOf(
  detections: readonly Detection[],
  frame: FrameSize,
  labels: readonly string[],
  threshold: number,
): NormalizedBox[] {
  if (frame.width <= 0 || frame.height <= 0) {
    return [];
  }
  return detections
    .filter((detection) => labels.includes(detection.label) && detection.score >= threshold)
    .map(({ box }) => ({
      minX: box.originX / frame.width,
      minY: box.originY / frame.height,
      maxX: (box.originX + box.width) / frame.width,
      maxY: (box.originY + box.height) / frame.height,
    }));
}

function lookingDown(gaze: GazeReading): boolean {
  return (
    (gaze.pitchDeg !== null && gaze.pitchDeg >= HEAD_PITCH_DOWN_DEG) ||
    (gaze.eyeLookDown !== null && gaze.eyeLookDown >= GAZE_TOOL.eyeLookDownMin)
  );
}

/**
 * 도구 쪽 시선. 근거는 `GAZE_TOOL` 주석.
 *
 * 앞쪽 도구는 내려다보면, 옆 도구는 그쪽으로 고개를 돌리면 본다고 본다.
 * 얼굴 박스가 없으면 앞뒤를 가를 수 없어 내려다보는지만 본다.
 */
export function gazeOnTool(
  gaze: GazeReading,
  face: NormalizedBox | null,
  tools: readonly NormalizedBox[],
): boolean {
  if (tools.length === 0) {
    return false;
  }
  if (face === null) {
    return lookingDown(gaze);
  }
  const faceCenter = (face.minX + face.maxX) / 2;
  const faceWidth = face.maxX - face.minX;
  return tools.some((tool) => {
    const dx = (tool.minX + tool.maxX) / 2 - faceCenter;
    if (Math.abs(dx) <= faceWidth * GAZE_TOOL.frontRangeFaceWidths) {
      return lookingDown(gaze);
    }
    return (
      gaze.yawDeg !== null &&
      Math.abs(gaze.yawDeg) >= GAZE_TOOL.sideYawDeg &&
      gaze.noseOffsetX !== null &&
      Math.sign(gaze.noseOffsetX) === Math.sign(dx)
    );
  });
}

/**
 * 화면 응시 — 고개가 카메라 정면이다. 근거는 `SCREEN_GAZE` 주석.
 * 각도를 모르면 판단하지 않는다. 모르는 것을 비집중 쪽으로 몰지 않는다.
 */
export function gazeOnScreen(gaze: GazeReading): boolean {
  if (gaze.pitchDeg === null || gaze.yawDeg === null) {
    return false;
  }
  return (
    Math.abs(gaze.yawDeg) <= SCREEN_GAZE.maxYawDeg &&
    gaze.pitchDeg < SCREEN_GAZE.maxPitchDeg &&
    gaze.pitchDeg >= SCREEN_GAZE.minPitchDeg
  );
}

function inside(point: Point, box: NormalizedBox, margin = HAND_TOOL_MARGIN): boolean {
  const marginX = (box.maxX - box.minX) * margin;
  const marginY = (box.maxY - box.minY) * margin;
  return (
    point.x >= box.minX - marginX &&
    point.x <= box.maxX + marginX &&
    point.y >= box.minY - marginY &&
    point.y <= box.maxY + marginY
  );
}

/** 손목이나 검지 끝이 도구 박스(여유 포함) 안에 있는 손이 하나라도 있는가. */
export function handsAtTool(hands: readonly HandPose[], tools: readonly NormalizedBox[]): boolean {
  return hands.some((hand) =>
    tools.some((tool) => inside(hand.wrist, tool) || inside(hand.indexTip, tool)),
  );
}

/** 휴대폰을 쥔 손이 있는가 — 손목·엄지 끝·검지 끝·손바닥 중 하나가 휴대폰 박스(여유 포함) 안에 있다. */
export function handsHoldingPhone(
  hands: readonly HandPose[],
  phones: readonly NormalizedBox[],
): boolean {
  return hands.some((hand) =>
    phones.some((phone) =>
      [hand.wrist, hand.thumbTip, hand.indexTip, hand.palm].some((point) =>
        inside(point, phone, HAND_PHONE_MARGIN),
      ),
    ),
  );
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 손 틱 사이에 검지 끝이 필기·타이핑만큼 움직였는가.
 * 손목이 가장 가까운 손끼리 짝지어 비교한다. 두 틱의 손 수가 달라도 짝이 되는 손만 본다.
 */
export function handsMoving(previous: readonly HandPose[], current: readonly HandPose[]): boolean {
  return current.some((hand) => {
    let nearest: HandPose | null = null;
    for (const candidate of previous) {
      if (
        nearest === null ||
        distance(candidate.wrist, hand.wrist) < distance(nearest.wrist, hand.wrist)
      ) {
        nearest = candidate;
      }
    }
    if (nearest === null) {
      return false;
    }
    const moved = distance(nearest.indexTip, hand.indexTip);
    return moved >= HAND_MOVE_RANGE.min && moved <= HAND_MOVE_RANGE.max;
  });
}

export interface EvidenceInput {
  /** 사람 박스(몸통)가 보이는가. 없으면 자리이탈이 맡으므로 여기서는 증거를 묻지 않는다. */
  readonly personPresent: boolean;
  /** 얼굴 판정 결과. null이면 얼굴 모델이 없거나 아직 한 번도 돌지 않았다. */
  readonly face: {
    readonly present: boolean;
    readonly gaze: GazeReading;
    /** 얼굴 박스. 도구가 얼굴 앞쪽인지 옆인지 가를 때만 쓴다. */
    readonly bounds: NormalizedBox | null;
  } | null;
  readonly tools: readonly NormalizedBox[];
  /** 최근 손 판정. null이면 손 모델이 안 돌았다. */
  readonly hands: { readonly atTool: boolean; readonly moving: boolean } | null;
}

export interface EvidenceSignals {
  /** 공부 증거가 없다. 유예까지만 간다. */
  readonly noEvidence: boolean;
  /** 도구를 보지 않고 시선이 화면에 고정돼 있다. */
  readonly screenGaze: boolean;
  /** 손 판정이 있으면 결론이 바뀐다. 손 모델은 이때만 돈다. */
  readonly wantHands: boolean;
}

export const NO_EVIDENCE_SIGNALS: EvidenceSignals = {
  noEvidence: false,
  screenGaze: false,
  wantHands: false,
};

export function evaluateEvidence(input: EvidenceInput): EvidenceSignals {
  const { face, tools, hands } = input;
  if (!input.personPresent || face === null) {
    return NO_EVIDENCE_SIGNALS;
  }
  if (!face.present) {
    // 얼굴이 안 보이면 먼저 유예다. 손이 도구 위에서 움직이면 얼굴 없이도 공부로 본다.
    const working = hands?.atTool === true && hands.moving;
    return { noEvidence: !working, screenGaze: false, wantHands: tools.length > 0 };
  }
  if (gazeOnTool(face.gaze, face.bounds, tools)) {
    return NO_EVIDENCE_SIGNALS;
  }
  const screenGaze = gazeOnScreen(face.gaze);
  if (tools.length === 0 || screenGaze) {
    // 도구가 없으면 화면 응시만 본다. 화면을 보고 있으면 손이 도구 위여도 화면 응시로 유예에 둔다.
    return { noEvidence: false, screenGaze, wantHands: false };
  }
  return { noEvidence: hands?.atTool !== true, screenGaze: false, wantHands: true };
}
