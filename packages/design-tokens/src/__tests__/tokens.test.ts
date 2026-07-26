import { describe, expect, it } from "vitest";

import { colors, eventStatusColors, radius, sessionStateColors, spacing, tokens } from "../index";

describe("design-tokens", () => {
  it("세션 상태 표시색은 확정된 3색 체계다(집중·비집중·일시정지)", () => {
    expect(Object.keys(sessionStateColors).sort()).toEqual(
      ["DISTRACTION", "FOCUS", "PAUSE"].sort(),
    );
  });

  /**
   * design-tokens는 아키텍처 경계상 @focuson/types를 import하지 않으므로 타입으로 강제할 수 없다.
   * 대신 이 테스트가 계약(StudyEventStatus)과의 키 일치를 고정한다 — 백엔드 계약이 바뀌면 여기서 먼저 깨진다.
   */
  it("이벤트 상태색 키가 StudyEventStatus 계약과 1:1로 일치한다", () => {
    expect(Object.keys(eventStatusColors).sort()).toEqual(
      ["AWAY", "DEVICE", "PAUSE", "PHONE"].sort(),
    );
  });

  it("비집중 3종은 같은 오렌지, 일시정지는 회색이다", () => {
    expect(eventStatusColors.PHONE).toEqual(sessionStateColors.DISTRACTION);
    expect(eventStatusColors.DEVICE).toEqual(sessionStateColors.DISTRACTION);
    expect(eventStatusColors.AWAY).toEqual(sessionStateColors.DISTRACTION);
    expect(eventStatusColors.PAUSE).toEqual(sessionStateColors.PAUSE);
  });

  it("간격 스케일이 오름차순이다", () => {
    const values = [spacing.xs, spacing.sm, spacing.md, spacing.lg, spacing.xl];
    const sorted = [...values].sort((a, b) => a - b);
    expect(values).toEqual(sorted);
  });

  it("tokens 집합에 주요 토큰 그룹이 모두 포함된다", () => {
    expect(tokens).toHaveProperty("colors");
    expect(tokens).toHaveProperty("sessionStateColors");
    expect(tokens).toHaveProperty("eventStatusColors");
    expect(tokens).toHaveProperty("typography");
    expect(tokens).toHaveProperty("radius");
    expect(tokens).toHaveProperty("iconMeanings");
  });

  it("radius.full은 Figma 확정값 999다(과거 9999 아님)", () => {
    expect(radius.full).toBe(999);
  });

  it("일시정지 상태색은 text.tertiary를 재사용하고 Light/Dark가 동일하다(ai-wiki #8B95A1과 일치)", () => {
    expect(colors.text.tertiary.light).toBe("#8b95a1");
    expect(colors.text.tertiary.dark).toBe("#8b95a1");
    expect(sessionStateColors.PAUSE).toEqual(colors.text.tertiary);
  });

  it("색상 시맨틱 그룹마다 Light/Dark 값을 모두 갖는다", () => {
    for (const group of Object.values(colors)) {
      for (const value of Object.values(group)) {
        expect(value).toHaveProperty("light");
        expect(value).toHaveProperty("dark");
      }
    }
  });
});
