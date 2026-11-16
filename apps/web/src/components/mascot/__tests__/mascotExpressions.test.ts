import { describe, expect, it } from "vitest";

import { MASCOT_EXPRESSION_SRC, jumpTiltTransform } from "../mascotExpressions";
import { MASCOT_SRC } from "../mascotSources";

describe("mascotExpressions", () => {
  it("일곱 마스코트 모두 다섯 표정 그림을 따로 가진다", () => {
    const sources = Object.values(MASCOT_EXPRESSION_SRC).flatMap((faces) => Object.values(faces));

    expect(sources).toHaveLength(35);
    expect(new Set(sources).size).toBe(35);
    for (const source of sources) {
      expect(Object.values(MASCOT_SRC)).not.toContain(source);
    }
  });

  it("점프 그림의 몸만큼 옮긴 뒤 반시계 방향으로 돌린다", () => {
    expect(jumpTiltTransform("stopwatch")).toBe("translate(0.3906%, -5.2734%) rotate(-5.5deg)");
    expect(jumpTiltTransform("planner")).toBe("translate(1.9531%, -5.2734%) rotate(-6.1deg)");
    expect(jumpTiltTransform("padlock")).toBe("translate(0%, -3.7109%) rotate(-6deg)");
  });
});
