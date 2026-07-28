import { describe, expect, it } from "vitest";

import type { Detection, DetectionFrame } from "../detectionRules";
import {
  PERSON_LABEL,
  PHONE_LABEL,
  detectedAsUsedRule,
  evaluateFrame,
  maxScoreFor,
  personPresenceRule,
  topScoresByLabel,
} from "../detectionRules";
import { SCORE_THRESHOLDS } from "../visionConfig";

/**
 * 픽스처의 bbox는 **규칙이 쓰지 않는다**. 지금 규칙은 라벨과 score만 보므로,
 * 여기 좌표는 "인터페이스에 자리가 있다"는 것만 확인하는 더미다(설계 §4).
 */
function detection(label: string, score: number): Detection {
  return { label, score, box: { originX: 0, originY: 0, width: 10, height: 10 } };
}

function frame(detections: readonly Detection[], previous: readonly Detection[] | null = null) {
  return {
    detections,
    previous,
    frameSize: { width: 320, height: 320 },
    atMs: 1_000,
  } satisfies DetectionFrame;
}

describe("personPresenceRule", () => {
  it("빈 검출 배열이면 사람 없음", () => {
    expect(personPresenceRule(frame([]))).toBe(false);
  });

  it("person이 아닌 라벨만 있으면 사람 없음", () => {
    expect(personPresenceRule(frame([detection(PHONE_LABEL, 0.99)]))).toBe(false);
  });

  it("person 하나가 임계 이상이면 사람 있음", () => {
    expect(personPresenceRule(frame([detection(PERSON_LABEL, SCORE_THRESHOLDS.person)]))).toBe(
      true,
    );
  });

  it("임계 경계값은 포함한다 (>= 임계)", () => {
    const justBelow = SCORE_THRESHOLDS.person - 0.0001;
    expect(personPresenceRule(frame([detection(PERSON_LABEL, justBelow)]))).toBe(false);
    expect(personPresenceRule(frame([detection(PERSON_LABEL, SCORE_THRESHOLDS.person)]))).toBe(
      true,
    );
  });

  it("여러 명 중 하나만 임계를 넘어도 사람 있음 — 관대한 쪽", () => {
    const detections = [
      detection(PERSON_LABEL, 0.05),
      detection(PERSON_LABEL, 0.11),
      detection(PERSON_LABEL, SCORE_THRESHOLDS.person + 0.2),
    ];
    expect(personPresenceRule(frame(detections))).toBe(true);
  });

  it("여러 명이지만 전부 임계 미만이면 사람 없음", () => {
    const detections = [detection(PERSON_LABEL, 0.05), detection(PERSON_LABEL, 0.11)];
    expect(personPresenceRule(frame(detections))).toBe(false);
  });

  it("person 임계와 phone 임계를 혼동하지 않는다", () => {
    // person 임계(0.3)와 phone 임계(0.4) 사이 값. person 규칙에서는 통과해야 한다.
    const between = (SCORE_THRESHOLDS.person + SCORE_THRESHOLDS.phone) / 2;
    expect(personPresenceRule(frame([detection(PERSON_LABEL, between)]))).toBe(true);
  });
});

describe("detectedAsUsedRule", () => {
  it("빈 검출 배열이면 사용 중 아님", () => {
    expect(detectedAsUsedRule.evaluate(frame([]))).toBe(false);
  });

  it("phone이 없으면 사용 중 아님", () => {
    expect(detectedAsUsedRule.evaluate(frame([detection(PERSON_LABEL, 0.99)]))).toBe(false);
  });

  it("phone이 임계 이상이면 곧바로 사용 중", () => {
    expect(
      detectedAsUsedRule.evaluate(frame([detection(PHONE_LABEL, SCORE_THRESHOLDS.phone)])),
    ).toBe(true);
  });

  it("임계 경계값은 포함한다 (>= 임계)", () => {
    const justBelow = SCORE_THRESHOLDS.phone - 0.0001;
    expect(detectedAsUsedRule.evaluate(frame([detection(PHONE_LABEL, justBelow)]))).toBe(false);
  });

  it("person 임계(0.3)로는 phone이 통과하지 않는다", () => {
    const between = (SCORE_THRESHOLDS.person + SCORE_THRESHOLDS.phone) / 2;
    expect(detectedAsUsedRule.evaluate(frame([detection(PHONE_LABEL, between)]))).toBe(false);
  });

  it("폰이 여러 개면 그중 하나만 임계를 넘어도 사용 중", () => {
    const detections = [detection(PHONE_LABEL, 0.1), detection(PHONE_LABEL, 0.95)];
    expect(detectedAsUsedRule.evaluate(frame(detections))).toBe(true);
  });

  it("previous·frameSize를 보지 않는다 — 같은 프레임이면 이전 프레임과 무관하게 같은 결과", () => {
    const current = [detection(PHONE_LABEL, 0.95)];
    const withoutPrevious = detectedAsUsedRule.evaluate(frame(current, null));
    const withPrevious = detectedAsUsedRule.evaluate(frame(current, current));
    expect(withoutPrevious).toBe(withPrevious);
  });
});

describe("evaluateFrame", () => {
  it("사람과 폰을 각각 독립적으로 판정한다", () => {
    expect(
      evaluateFrame(frame([detection(PERSON_LABEL, 0.8), detection(PHONE_LABEL, 0.8)])),
    ).toEqual({ personPresent: true, phoneInUse: true });

    expect(evaluateFrame(frame([detection(PERSON_LABEL, 0.8)]))).toEqual({
      personPresent: true,
      phoneInUse: false,
    });

    expect(evaluateFrame(frame([]))).toEqual({ personPresent: false, phoneInUse: false });
  });

  it("폰 규칙을 갈아끼우면 결과가 바뀐다 — 교체 지점이 실제로 열려 있다", () => {
    const neverUsed = { evaluate: () => false };
    expect(evaluateFrame(frame([detection(PHONE_LABEL, 0.99)]), neverUsed)).toEqual({
      personPresent: false,
      phoneInUse: false,
    });
  });
});

describe("점수 집계 헬퍼", () => {
  it("maxScoreFor가 라벨별 최고 score를 돌려주고 없으면 0", () => {
    const detections = [detection(PERSON_LABEL, 0.2), detection(PERSON_LABEL, 0.7)];
    expect(maxScoreFor(detections, PERSON_LABEL)).toBe(0.7);
    expect(maxScoreFor(detections, PHONE_LABEL)).toBe(0);
  });

  it("topScoresByLabel이 라벨 → 최고 score만 담는다 (좌표 없음)", () => {
    const scores = topScoresByLabel([
      detection(PERSON_LABEL, 0.2),
      detection(PERSON_LABEL, 0.7),
      detection(PHONE_LABEL, 0.42),
    ]);

    expect(scores).toEqual({ [PERSON_LABEL]: 0.7, [PHONE_LABEL]: 0.42 });
    // 반환값 어디에도 위치 정보가 없어야 한다(설계 §8 · frontend/CLAUDE.md 개인정보 원칙).
    expect(JSON.stringify(scores)).not.toMatch(/origin|width|height|box/i);
  });
});
