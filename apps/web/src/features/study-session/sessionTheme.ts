import type { CSSProperties } from "react";

import { colors, sessionStateColors } from "@focusmakers/design-tokens";

/**
 * 세션 오버레이 전용 스타일 변수.
 *
 * ⚠️ **세션 화면은 시스템 테마와 무관하게 항상 다크다.** `src/index.css`의 시맨틱 변수는
 * `prefers-color-scheme`에 따라 Light/Dark로 갈리므로, 세션 서브트리에서만 같은 이름의 변수를
 * **다크 값으로 덮어써서** Tailwind 토큰 유틸(`bg-state-focus`, `text-text-tertiary` 등)이
 * 라이트 모드에서도 다크 값을 쓰게 한다. 값의 출처는 항상 `@focusmakers/design-tokens`다.
 *
 * 상태색은 `colors.state.*`를 직접 읽지 않고 **`sessionStateColors`(FOCUS/DISTRACTION/PAUSE)**
 * 시맨틱 레이어를 경유한다 — 지금은 같은 값을 가리키는 별칭이지만, 상태 3색 매핑이 바뀌면
 * 이 화면에도 자동으로 전달되어야 한다.
 *
 * `--session-*`은 토큰 스케일 밖의 세션 오버레이 전용 값이다.
 * 시맨틱 토큰 체계와 층이 달라 `packages/design-tokens`에 올리지 않는다.
 */

/** 토큰 색에 알파만 입힌다 — 색상 자체는 토큰에서 온다. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SESSION_SURFACE_VARS = {
  // index.css 시맨틱 변수의 다크 값 고정 — 출처는 상태 3색 체계(sessionStateColors)
  "--state-focus": sessionStateColors.FOCUS.dark,
  "--state-distract": sessionStateColors.DISTRACTION.dark,
  "--text-tertiary": sessionStateColors.PAUSE.dark,

  /** 카메라 영역 base — 실제 앱에서는 카메라 피드가 들어온다. */
  "--session-camera-base": "#1a2029",
  /**
   * 심플 모드 배경 — 카메라 프리뷰가 사라진 자리.
   *
   * ⚠️ **가로 심플은 `#0A0F18`로 값이 다르다**.
   * 둘 다 토큰 미바인딩 하드코딩이고 의도된 차이인지 불명확하다. **세로 값 하나로 통일한다** —
   * 방향에 따라 배경이 바뀌면 기기를 돌릴 때 화면이 깜빡이는 것처럼 보인다(회전은 레이아웃만
   * 바뀌어야 한다). 디자이너가 가로 값을 확정하면 이 한 줄만 고친다.
   */
  "--session-simple-base": "#0b0f14",
  "--session-pill-bg": withAlpha(colors.bg.base.dark, 0.65),
  "--session-pill-border-focus": colors.brand.primary.dark,
  "--session-pill-bg-distract": withAlpha(colors.bg.base.dark, 0.68),
  "--session-pill-border-distract": sessionStateColors.DISTRACTION.dark,
  "--session-pill-bg-paused": withAlpha(colors.bg.base.dark, 0.68),
  "--session-bar-bg": "rgba(22, 27, 34, 0.55)",
  /** 종료 버튼 — colors.feedback.error.dark(#ff6b77)다. `RoomControlBar`와
   * `RoomPage`/`LiveRoomSession`의 에러 문구 색이 공유해서 값을 바꿀 수 없다. */
  "--session-exit-bg": colors.feedback.error.dark,
  /**
   * 컨트롤 바 재개·종료 버튼 전용 — `--session-exit-bg`와 값이 다르다(그 변수는 위처럼 다른
   * 화면과 공유돼 값을 바꿀 수 없다).
   */
  "--session-control-resume-bg": "#4593fc",
  "--session-control-exit-bg": "#f0555f",
  /**
   * 토스트 배경 — 시각 스펙 미확정. 컨트롤 바보다 불투명하게 둔다.
   * 값을 바꾸면 `components/ui/sonner.tsx`의 CSS 변수 폴백도 같은 값으로 맞출 것(sonner.test.tsx가 고정).
   */
  // 실기기 피드백: 검정 알약 → 토스풍 회색 알약(+흰 글자)으로 변경.
  // #4E5968 = border.strong 다크값과 같은 회색 계열.
  "--session-toast-bg": "rgba(78, 89, 104, 0.96)",

  // ── 종료 확인 다이얼로그 (항상-다크 오버레이) ───────────────────────────
  // 이 화면은 카메라 위에 뜨는 오버레이라 **라이트/다크 테마를 따르지 않는다.**
  // index.css의 시맨틱 변수(--dim, --bg-layer-2 …)를 그대로 쓰면 라이트 모드에서 딤이 40%로
  // 옅어지고 버튼이 회색 대신 밝은 회색이 된다 — 그래서 여기서 **다크 값으로 고정**한다.
  /**
   * 딤 — `colors.bg.dim.dark`(#00000099 = **60%**). 라이트 값(#00000066 = 40%)이 아니라 다크 값을 쓰는 이유가 위와 같다.
   */
  "--session-dim": colors.bg.dim.dark,
  /** 다이얼로그 서피스 — `colors.bg.layer1.dark`(#191F28). */
  "--session-dialog-bg": colors.bg.layer1.dark,
  "--session-dialog-title": colors.text.primary.dark,
  "--session-dialog-body": colors.text.secondary.dark,
  /** `계속하기`(비파괴) 버튼 — `colors.bg.layer2.dark`(#333D4B). */
  "--session-dialog-cancel-bg": colors.bg.layer2.dark,
  /**
   * `공부 종료` 버튼 — Figma가 `state/focus` 변수에 바인딩했고 그 값은 **light 쪽**
   * `#1B64DA`(blue/500)다. 세션 서브트리는 `--state-focus`를 다크 값(#4593FC)으로 덮어쓰므로
   * `bg-state-focus`를 쓰면 Figma와 색이 달라진다 — 그래서 별도 변수로 light 값을 명시한다.
   *
   * ⚠️ **디자인 확인 대기**: `design.md` 상태 컬러 보조 규칙 ③("상태 컬러는 상태 표시 전용,
   * 액션은 brand 토큰만")과 형식상 어긋난다. 값은 `colors.brand.primary.light`와 동일해
   * 시각 결과는 같지만 토큰 의미가 다르다.
   */
  "--session-dialog-confirm-bg": colors.state.focus.light,
} as const;

export const sessionSurfaceStyle = SESSION_SURFACE_VARS as unknown as CSSProperties;

/**
 * 상태별 발광(글로우) 색 — 심플 모드의 타이머 발광과 엣지 글로우가 함께 쓴다.
 *
 * Figma는 **집중 상태의 발광만** 정의한다: 근거리 `#4593FC` 55% / 원거리 `#1B64DA` 35%.
 * 두 값은 각각 `sessionStateColors.FOCUS`의 **dark 값과 light 값**이라 상태색 토큰에서
 * 그대로 유도된다 — 그래서 이 표는 집중 상태를 Figma와 **정확히 일치**시키면서
 * 비집중·일시정지로도 색을 새로 지어내지 않고 확장된다(일시정지는 light/dark가 같은 `#8B95A1`).
 *
 * ⚠️ **"일시정지 × 심플 모드"는 Figma 미설계다**.
 * 스펙이 지시한 가장 보수적인 잠정안 — **발광은 유지하고 색만 상태 컬러로 바꾼다** — 를 적용했다.
 * 디자인이 확정되면 이 함수 하나만 고치면 된다.
 */
export function sessionGlowStyle(kind: keyof typeof sessionStateColors): CSSProperties {
  const stateColor = sessionStateColors[kind];
  return {
    "--session-state-color": stateColor.dark,
    // 숫자 발광 — 0 0 24 (dark) 55% + 0 0 60 (light) 35%
    "--session-glow-near": withAlpha(stateColor.dark, 0.55),
    "--session-glow-far": withAlpha(stateColor.light, 0.35),
    // 엣지 글로우 — inner 0 0 110 spread 4 (light) 32% + 0 0 40 (dark) 16%
    "--session-edge-glow-outer": withAlpha(stateColor.light, 0.32),
    "--session-edge-glow-inner": withAlpha(stateColor.dark, 0.16),
  } as unknown as CSSProperties;
}
