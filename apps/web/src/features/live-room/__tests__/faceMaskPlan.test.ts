import { describe, expect, it } from "vitest";

import type { FaceSpot } from "@/features/study-session/vision/faceSpot";

import { FOLLOW_PER_FRAME, followSpot, maskModeOf } from "../faceMaskPlan";

const spot = (over: Partial<FaceSpot> = {}): FaceSpot => ({
  x: 0.5,
  y: 0.4,
  size: 0.2,
  aspect: 16 / 9,
  visible: true,
  ...over,
});

describe("maskModeOf", () => {
  it("사람을 못 찾았으면 흐린다", () => {
    expect(maskModeOf(null, true)).toBe("blur");
  });
  it("얼굴이 보이고 이모지가 준비됐으면 이모지를 덮는다", () => {
    expect(maskModeOf(spot(), true)).toBe("sticker");
  });
  it("얼굴이 보이는데 이모지가 아직이면 흐린다", () => {
    expect(maskModeOf(spot(), false)).toBe("blur");
  });
  it("몸만 보이면(visible 거짓) 선명하게 보낸다", () => {
    expect(maskModeOf(spot({ visible: false }), false)).toBe("plain");
    expect(maskModeOf(spot({ visible: false }), true)).toBe("plain");
  });
});

describe("followSpot", () => {
  it("처음 나타나면 목표 자리에 바로 놓는다", () => {
    expect(followSpot(null, spot())).toEqual({ x: 0.5, y: 0.4, size: 0.2 });
  });
  it("이미 그리고 있으면 목표 쪽으로 정해진 비율만큼 다가간다", () => {
    const next = followSpot({ x: 0, y: 0, size: 0.1 }, spot({ x: 1, y: 1, size: 0.3 }));
    expect(next.x).toBeCloseTo(FOLLOW_PER_FRAME);
    expect(next.y).toBeCloseTo(FOLLOW_PER_FRAME);
    expect(next.size).toBeCloseTo(0.1 + 0.2 * FOLLOW_PER_FRAME);
  });
});
