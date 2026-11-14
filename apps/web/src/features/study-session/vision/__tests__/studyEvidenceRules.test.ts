import { describe, expect, it } from "vitest";

import type { Detection } from "../detectionRules";
import { handPosesOf } from "../handLandmarker";
import type { GazeReading, HandPose, NormalizedBox } from "../studyEvidenceRules";
import {
  evaluateEvidence,
  gazeOnScreen,
  gazeOnTool,
  handsAtTool,
  handsHoldingPhone,
  handsMoving,
  NO_EVIDENCE_SIGNALS,
  phoneBoxesOf,
  toolBoxesOf,
} from "../studyEvidenceRules";

const FRAME = { width: 1000, height: 500 };
/** 얼굴 아래 가운데 책과 얼굴 오른쪽 노트북. 얼굴은 x 0.4~0.6이다. */
const BOOK: NormalizedBox = { minX: 0.3, minY: 0.6, maxX: 0.7, maxY: 0.95 };
const SIDE_LAPTOP: NormalizedBox = { minX: 0.8, minY: 0.4, maxX: 1, maxY: 0.8 };
const FACE: NormalizedBox = { minX: 0.4, minY: 0.2, maxX: 0.6, maxY: 0.5 };
const LOOKING_DOWN: GazeReading = { pitchDeg: 25, yawDeg: 9, eyeLookDown: 0.6, noseOffsetX: 0.05 };
/** 아이폰 실측의 폰 화면 응시 — 좌우 18도, 숙임 6도, 눈은 아래로 흔들린다. */
const LOOKING_AT_SCREEN: GazeReading = {
  pitchDeg: 6,
  yawDeg: 18,
  eyeLookDown: 0.8,
  noseOffsetX: 0.12,
};
/** 오른쪽으로 고개를 크게 돌렸다(실측 노트북 응시 40~58도). */
const TURNED_RIGHT: GazeReading = { pitchDeg: 2, yawDeg: 50, eyeLookDown: 0.2, noseOffsetX: 0.4 };
const TURNED_LEFT: GazeReading = { pitchDeg: 2, yawDeg: -50, eyeLookDown: 0.2, noseOffsetX: -0.4 };

function hand(x: number, y: number): HandPose {
  return {
    wrist: { x, y: y + 0.05 },
    thumbTip: { x: x - 0.02, y: y + 0.01 },
    indexTip: { x, y },
    palm: { x, y: y + 0.03 },
  };
}

function detection(label: string, score: number): Detection {
  return { label, score, box: { originX: 300, originY: 300, width: 400, height: 175 } };
}

describe("toolBoxesOf", () => {
  it("임계를 넘은 laptop·book만 프레임 대비 좌표로 바꾼다", () => {
    const boxes = toolBoxesOf(
      [detection("book", 0.5), detection("laptop", 0.2), detection("person", 0.9)],
      FRAME,
    );
    expect(boxes).toEqual([{ minX: 0.3, minY: 0.6, maxX: 0.7, maxY: 0.95 }]);
  });
});

describe("시선", () => {
  it("앞쪽 도구는 내려다보면 도구 응시다", () => {
    expect(gazeOnTool(LOOKING_DOWN, FACE, [BOOK])).toBe(true);
    expect(gazeOnTool({ ...LOOKING_DOWN, pitchDeg: 2, eyeLookDown: 0.6 }, FACE, [BOOK])).toBe(true);
    expect(gazeOnTool(TURNED_RIGHT, FACE, [BOOK])).toBe(false);
  });

  it("옆 도구는 그쪽으로 고개를 돌려야 도구 응시다", () => {
    expect(gazeOnTool(TURNED_RIGHT, FACE, [SIDE_LAPTOP])).toBe(true);
    expect(gazeOnTool(TURNED_LEFT, FACE, [SIDE_LAPTOP])).toBe(false);
    expect(gazeOnTool(LOOKING_AT_SCREEN, FACE, [SIDE_LAPTOP])).toBe(false);
  });

  it("도구가 없으면 도구 응시가 아니고, 얼굴 박스가 없으면 내려다보는지만 본다", () => {
    expect(gazeOnTool(LOOKING_DOWN, FACE, [])).toBe(false);
    expect(gazeOnTool(LOOKING_DOWN, null, [SIDE_LAPTOP])).toBe(true);
  });

  it("정면이면 눈이 아래로 흔들려도 화면 응시다", () => {
    expect(gazeOnScreen(LOOKING_AT_SCREEN)).toBe(true);
    expect(gazeOnScreen({ ...LOOKING_AT_SCREEN, pitchDeg: -19 })).toBe(true);
  });

  it("책상을 내려다보거나 옆으로 돌면 화면 응시가 아니다", () => {
    expect(gazeOnScreen(LOOKING_DOWN)).toBe(false);
    expect(gazeOnScreen(TURNED_RIGHT)).toBe(false);
  });

  it("각도를 모르면 화면 응시로 몰지 않는다", () => {
    expect(gazeOnScreen({ ...LOOKING_AT_SCREEN, yawDeg: null })).toBe(false);
  });
});

describe("손", () => {
  it("손목이나 검지 끝이 도구 박스 안이면 도구 위 손이다", () => {
    expect(handsAtTool([hand(0.5, 0.7)], [BOOK])).toBe(true);
    expect(handsAtTool([hand(0.1, 0.2)], [BOOK])).toBe(false);
  });

  it("박스 가장자리를 조금 벗어난 손도 도구 위로 본다", () => {
    expect(handsAtTool([hand(0.72, 0.7)], [BOOK])).toBe(true);
  });

  it("검지 끝이 필기만큼 움직이면 손을 쓰는 중이다", () => {
    expect(handsMoving([hand(0.5, 0.7)], [hand(0.52, 0.7)])).toBe(true);
    expect(handsMoving([hand(0.5, 0.7)], [hand(0.5, 0.7)])).toBe(false);
  });

  it("크게 휘두른 손은 필기로 보지 않는다", () => {
    expect(handsMoving([hand(0.2, 0.7)], [hand(0.6, 0.7)])).toBe(false);
  });

  it("손목이 가장 가까운 손끼리 비교한다", () => {
    const before = [hand(0.2, 0.7), hand(0.8, 0.7)];
    const after = [hand(0.8, 0.7), hand(0.21, 0.7)];
    expect(handsMoving(before, after)).toBe(true);
  });

  it("모델 결과에서 손목·엄지 끝·검지 끝·손바닥만 뽑는다", () => {
    const points = Array.from({ length: 21 }, (_, index) => ({ x: index / 100, y: index / 50 }));
    expect(handPosesOf({ landmarks: [points] })).toEqual([
      {
        wrist: { x: 0, y: 0 },
        thumbTip: { x: 0.04, y: 0.08 },
        indexTip: { x: 0.08, y: 0.16 },
        palm: { x: 0.09, y: 0.18 },
      },
    ]);
  });
});

describe("휴대폰을 쥔 손", () => {
  const PHONE: NormalizedBox = { minX: 0.45, minY: 0.5, maxX: 0.55, maxY: 0.7 };

  it("손의 한 점이라도 휴대폰 박스(여유 포함) 안이면 쥔 것이다", () => {
    expect(handsHoldingPhone([hand(0.5, 0.6)], [PHONE])).toBe(true);
    expect(handsHoldingPhone([hand(0.58, 0.6)], [PHONE])).toBe(true);
  });

  it("손이 휴대폰에서 떨어져 있으면 쥔 것이 아니다", () => {
    expect(handsHoldingPhone([hand(0.85, 0.3)], [PHONE])).toBe(false);
    expect(handsHoldingPhone([], [PHONE])).toBe(false);
  });

  it("휴대폰 박스는 휴대폰 임계를 넘은 것만 쓴다", () => {
    expect(phoneBoxesOf([detection("cell phone", 0.5)], FRAME)).toEqual([]);
    expect(phoneBoxesOf([detection("cell phone", 0.7)], FRAME)).toHaveLength(1);
  });
});

describe("evaluateEvidence", () => {
  const base = { personPresent: true, tools: [BOOK], hands: null };
  const face = (gaze: GazeReading) => ({ present: true, gaze, bounds: FACE });

  it("사람이 없거나 얼굴 판정이 아직 없으면 증거를 묻지 않는다", () => {
    expect(evaluateEvidence({ ...base, personPresent: false, face: null })).toEqual(
      NO_EVIDENCE_SIGNALS,
    );
    expect(evaluateEvidence({ ...base, face: null })).toEqual(NO_EVIDENCE_SIGNALS);
  });

  it("도구를 보면 공부다. 손 모델은 돌리지 않는다", () => {
    expect(evaluateEvidence({ ...base, face: face(LOOKING_DOWN) })).toEqual(NO_EVIDENCE_SIGNALS);
    expect(evaluateEvidence({ ...base, tools: [SIDE_LAPTOP], face: face(TURNED_RIGHT) })).toEqual(
      NO_EVIDENCE_SIGNALS,
    );
  });

  it("옆 도구가 보여도 정면을 보면 화면 응시다. 손이 도구 위여도 마찬가지다", () => {
    const expected = { noEvidence: false, screenGaze: true, wantHands: false };
    const side = { ...base, tools: [SIDE_LAPTOP], face: face(LOOKING_AT_SCREEN) };
    expect(evaluateEvidence(side)).toEqual(expected);
    expect(evaluateEvidence({ ...side, hands: { atTool: true, moving: true } })).toEqual(expected);
  });

  it("앞쪽 책이 있을 때 고개는 정면이고 눈만 내리면 책을 읽는 것으로 본다", () => {
    // 폰 화면이 책 너머에 있으면 둘을 가를 수 없다. 애매하면 순공을 깎지 않는 쪽으로 둔다.
    expect(evaluateEvidence({ ...base, face: face(LOOKING_AT_SCREEN) })).toEqual(
      NO_EVIDENCE_SIGNALS,
    );
  });

  it("도구도 화면도 안 보면 손을 확인하고, 손도 도구 위에 없으면 증거 없음이다", () => {
    const away = face(TURNED_LEFT);
    const input = { ...base, tools: [SIDE_LAPTOP], face: away };
    expect(evaluateEvidence(input)).toEqual({
      noEvidence: true,
      screenGaze: false,
      wantHands: true,
    });
    expect(evaluateEvidence({ ...input, hands: { atTool: true, moving: false } }).noEvidence).toBe(
      false,
    );
  });

  it("도구가 안 보이면 화면 응시만 본다", () => {
    const tools: NormalizedBox[] = [];
    expect(evaluateEvidence({ ...base, tools, face: face(LOOKING_AT_SCREEN) })).toEqual({
      noEvidence: false,
      screenGaze: true,
      wantHands: false,
    });
    expect(evaluateEvidence({ ...base, tools, face: face(TURNED_LEFT) })).toEqual(
      NO_EVIDENCE_SIGNALS,
    );
  });

  it("얼굴이 안 보이면 유예이고, 손이 도구 위에서 움직이면 공부로 본다", () => {
    const hidden = { present: false, gaze: LOOKING_DOWN, bounds: null };
    expect(evaluateEvidence({ ...base, face: hidden }).noEvidence).toBe(true);
    expect(
      evaluateEvidence({ ...base, face: hidden, hands: { atTool: true, moving: false } })
        .noEvidence,
    ).toBe(true);
    expect(
      evaluateEvidence({ ...base, face: hidden, hands: { atTool: true, moving: true } }).noEvidence,
    ).toBe(false);
  });
});
