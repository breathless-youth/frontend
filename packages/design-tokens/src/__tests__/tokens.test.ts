import { describe, expect, it } from "vitest";

import { colors, radius, spacing, statusColors, tokens } from "../index";

describe("design-tokens", () => {
  it("네 가지 공부 상태 모두에 의미색이 정의되어 있다", () => {
    expect(Object.keys(statusColors).sort()).toEqual(
      ["AWAY", "CAMERA_OFF", "PAUSED", "STUDYING"].sort(),
    );
  });

  it("간격 스케일이 오름차순이다", () => {
    const values = [spacing.xs, spacing.sm, spacing.md, spacing.lg, spacing.xl];
    const sorted = [...values].sort((a, b) => a - b);
    expect(values).toEqual(sorted);
  });

  it("tokens 집합에 주요 토큰 그룹이 모두 포함된다", () => {
    expect(tokens).toHaveProperty("colors");
    expect(tokens).toHaveProperty("statusColors");
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
    expect(statusColors.PAUSED).toEqual(colors.text.tertiary);
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
