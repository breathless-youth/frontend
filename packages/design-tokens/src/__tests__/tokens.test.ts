import { describe, expect, it } from "vitest";

import { spacing, statusColors, tokens } from "../index";

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
});
