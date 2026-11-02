import { describe, expect, it } from "vitest";

import type { Detection } from "../detectionRules";
import {
  EMPTY_FACE_SPOT,
  HEAD_DROP_OF_PERSON_WIDTH,
  STICKER_OF_PERSON_WIDTH,
  nextFaceSpot,
} from "../faceSpot";

const frame = { width: 1000, height: 500 };
const person: Detection = {
  label: "person",
  score: 0.9,
  box: { originX: 400, originY: 100, width: 200, height: 400 },
};
const base = {
  detections: [person],
  minPersonScore: 0.5,
  frame,
  face: undefined,
  faceModelReady: true,
};

describe("nextFaceSpot", () => {
  it("얼굴이 없으면 bbox 위쪽 가운데 아래를 머리로 어림한다", () => {
    const { spot } = nextFaceSpot(EMPTY_FACE_SPOT, base);
    expect(spot).toEqual({
      x: 0.5,
      y: (100 + 200 * HEAD_DROP_OF_PERSON_WIDTH) / 500,
      size: 0.2 * STICKER_OF_PERSON_WIDTH,
      aspect: 2,
      visible: true,
    });
  });

  it("사람이 기준 점수 아래면 자리를 비운다", () => {
    const low = { ...person, score: 0.4 };
    expect(nextFaceSpot(EMPTY_FACE_SPOT, { ...base, detections: [low] })).toBe(EMPTY_FACE_SPOT);
  });

  it("얼굴 프레임의 차이를 다음 bbox 프레임에 더한다", () => {
    // 고개를 숙여 얼굴이 어림보다 아래·오른쪽에 있다.
    const face = { minX: 0.52, minY: 0.5, maxX: 0.58, maxY: 0.62 };
    const withFace = nextFaceSpot(EMPTY_FACE_SPOT, { ...base, face });
    expect(withFace.spot?.x).toBeCloseTo(0.55);
    expect(withFace.spot?.y).toBeCloseTo(0.56);

    // bbox가 오른쪽으로 0.1 움직였다. 얼굴 차이를 유지한 채 따라간다.
    const moved = { ...person, box: { ...person.box, originX: 500 } };
    const next = nextFaceSpot(withFace, { ...base, detections: [moved] });
    expect(next.spot?.x).toBeCloseTo(0.65);
    expect(next.spot?.y).toBeCloseTo(0.56);
    // bbox가 넓어져도 얼굴로 잰 크기를 유지한다.
    const wide = { ...person, box: { ...person.box, width: 600 } };
    expect(nextFaceSpot(withFace, { ...base, detections: [wide] }).spot?.size).toBe(
      withFace.spot?.size,
    );
  });

  it("얼굴 없음이 두 번 이어져야 이모지를 내리고, 얼굴을 찾으면 다시 그린다", () => {
    const face = { minX: 0.45, minY: 0.3, maxX: 0.55, maxY: 0.5 };
    // 고개를 숙여 한 번 놓친 것은 무시한다.
    const missedOnce = nextFaceSpot(EMPTY_FACE_SPOT, { ...base, face: null });
    expect(missedOnce.spot?.visible).toBe(true);
    // 얼굴 모델이 돌지 않은 프레임은 판정을 바꾸지 않는다.
    const between = nextFaceSpot(missedOnce, base);
    expect(between.spot?.visible).toBe(true);
    const missedTwice = nextFaceSpot(between, { ...base, face: null });
    expect(missedTwice.spot?.visible).toBe(false);
    expect(nextFaceSpot(missedTwice, base).spot?.visible).toBe(false);
    const found = nextFaceSpot(missedTwice, { ...base, face });
    expect(found.spot?.visible).toBe(true);
    // 찾은 뒤에는 다시 한 번 놓쳐도 그대로 그린다.
    expect(nextFaceSpot(found, { ...base, face: null }).spot?.visible).toBe(true);
  });

  it("얼굴 모델을 쓸 수 없는 세션은 사람만 보고 그린다", () => {
    const spot = nextFaceSpot(EMPTY_FACE_SPOT, { ...base, face: null, faceModelReady: false });
    expect(spot.spot?.visible).toBe(true);
  });
});
