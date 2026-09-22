import { describe, expect, it } from "vitest";

import { headPitchMedian, headPitchZone, isLookingDown, pushHeadPitch } from "../headPitchGate";
import {
  HEAD_PITCH_DOWN_DEG,
  HEAD_PITCH_MEDIAN_SAMPLES,
  HEAD_PITCH_QUIET_DEG,
} from "../visionConfig";

const DOWN = HEAD_PITCH_DOWN_DEG + 5;

function feed(pitches: readonly (number | null)[]): number[] {
  let recent: number[] = [];
  for (const pitch of pitches) {
    recent = pushHeadPitch(recent, pitch);
  }
  return recent;
}

describe("내려다봄 게이트", () => {
  it("고개가 서 있으면 걸지 않는다", () => {
    expect(isLookingDown(feed([0, 2, 1]))).toBe(false);
  });

  it("고개를 내리면 건다", () => {
    expect(isLookingDown(feed([0, DOWN, DOWN]))).toBe(true);
  });

  it("한 틱 튐은 중앙값이 거른다 — 7회차의 18.9° 한 틱", () => {
    expect(isLookingDown(feed([1, DOWN, 2]))).toBe(false);
  });

  it("뒤로 젖혀진 각도(음수)는 걸지 않는다 — 아래에서 찍는 배치", () => {
    expect(isLookingDown(feed([-20, -18, -22]))).toBe(false);
  });

  it("각도를 모르는 관측은 넣지 않고, 아는 각도가 없으면 걸지 않는다", () => {
    expect(feed([null, null])).toEqual([]);
    expect(isLookingDown([])).toBe(false);
    expect(feed([DOWN, null, DOWN])).toEqual([DOWN, DOWN]);
  });

  it("표본 수만 든다", () => {
    const recent = feed(Array.from({ length: HEAD_PITCH_MEDIAN_SAMPLES + 3 }, (_, i) => i));
    expect(recent).toHaveLength(HEAD_PITCH_MEDIAN_SAMPLES);
    expect(headPitchMedian(recent)).toBe(HEAD_PITCH_MEDIAN_SAMPLES + 1);
  });

  it("경계값은 포함한다", () => {
    expect(
      isLookingDown(feed([HEAD_PITCH_DOWN_DEG, HEAD_PITCH_DOWN_DEG, HEAD_PITCH_DOWN_DEG])),
    ).toBe(true);
  });

  it("구간 — 10° 아래는 clear, 10~15°는 quiet, 15° 이상은 down", () => {
    expect(headPitchZone(feed([0, 2, 1]))).toBe("clear");
    expect(headPitchZone(feed([HEAD_PITCH_QUIET_DEG, 12, 11]))).toBe("quiet");
    expect(headPitchZone(feed([HEAD_PITCH_DOWN_DEG - 1, 14, 13]))).toBe("quiet");
    expect(headPitchZone(feed([HEAD_PITCH_DOWN_DEG, 16, 15]))).toBe("down");
    expect(headPitchZone([])).toBe("clear");
  });
});
