import { colors, sessionStateColors } from "@focuson/design-tokens";
import { describe, expect, it } from "vitest";

import { sessionGlowStyle, sessionSurfaceStyle } from "../sessionTheme";

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

describe("종료 확인 다이얼로그 변수 — S3-7 (항상-다크 오버레이)", () => {
  const surface = sessionSurfaceStyle as unknown as Record<string, string>;

  it("딤은 라이트 40%가 아니라 다크 60%다 — Figma 실측 rgba(0,0,0,0.6)과 일치한다", () => {
    // 세션은 항상 다크 서피스라 `bg/dim`의 라이트 값(#00000066 = 40%)을 쓰면 딤이 옅어진다.
    expect(surface["--session-dim"]).toBe(colors.bg.dim.dark);
    expect(surface["--session-dim"]).toBe("#00000099");
    expect(surface["--session-dim"]).not.toBe(colors.bg.dim.light);
  });

  it("다이얼로그 색을 하드코딩하지 않고 토큰의 다크 값에서 가져온다", () => {
    expect(surface["--session-dialog-bg"]).toBe(colors.bg.layer1.dark);
    expect(surface["--session-dialog-title"]).toBe(colors.text.primary.dark);
    expect(surface["--session-dialog-body"]).toBe(colors.text.secondary.dark);
    expect(surface["--session-dialog-cancel-bg"]).toBe(colors.bg.layer2.dark);
  });

  it("`공부 종료` 버튼은 state/focus의 **라이트** 값이다 — Figma 바인딩 그대로", () => {
    // 세션 서브트리는 --state-focus를 다크(#4593FC)로 덮어쓰므로 bg-state-focus를 쓰면
    // Figma(#1B64DA)와 색이 달라진다. 값 출처는 여전히 토큰이다.
    expect(surface["--session-dialog-confirm-bg"]).toBe(colors.state.focus.light);
    expect(surface["--session-dialog-confirm-bg"]).toBe("#1b64da");
  });
});
