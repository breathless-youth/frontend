import { sessionStateColors } from "@focuson/design-tokens";
import { describe, expect, it } from "vitest";

import { sessionGlowStyle } from "../sessionTheme";

/** CSSProperties에는 커스텀 프로퍼티 인덱스가 없어 테스트에서만 좁혀 읽는다. */
function vars(kind: Parameters<typeof sessionGlowStyle>[0]): Record<string, string> {
  return sessionGlowStyle(kind) as unknown as Record<string, string>;
}

describe("sessionGlowStyle — 심플 모드 발광색 (S3-4)", () => {
  it("집중 상태는 Figma Spec `14:7` 실측값과 정확히 일치한다", () => {
    const focus = vars("FOCUS");

    // 숫자: #4593FC 55% + #1B64DA 35%
    expect(focus["--session-state-color"]).toBe("#4593fc");
    expect(focus["--session-glow-near"]).toBe("rgba(69, 147, 252, 0.55)");
    expect(focus["--session-glow-far"]).toBe("rgba(27, 100, 218, 0.35)");
    // 엣지: #1B64DA 32% + #4593FC 16%
    expect(focus["--session-edge-glow-outer"]).toBe("rgba(27, 100, 218, 0.32)");
    expect(focus["--session-edge-glow-inner"]).toBe("rgba(69, 147, 252, 0.16)");
  });

  it("발광색을 지어내지 않고 상태색 토큰에서 유도한다", () => {
    for (const kind of ["FOCUS", "DISTRACTION", "PAUSE"] as const) {
      expect(vars(kind)["--session-state-color"]).toBe(sessionStateColors[kind].dark);
    }
  });

  it("일시정지×심플(Figma 미설계)은 발광을 유지하고 색만 일시정지 상태색으로 바꾼다", () => {
    const paused = vars("PAUSE");

    expect(paused["--session-state-color"]).toBe("#8b95a1");
    // 발광을 끄지 않는다 — 스펙이 지시한 '가장 보수적인 잠정안'.
    expect(paused["--session-glow-near"]).toBe("rgba(139, 149, 161, 0.55)");
    expect(paused["--session-glow-far"]).toBe("rgba(139, 149, 161, 0.35)");
  });
});
