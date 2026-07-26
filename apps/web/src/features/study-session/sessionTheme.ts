import type { CSSProperties } from "react";

import { colors, sessionStateColors } from "@focuson/design-tokens";

/**
 * 세션 오버레이 전용 스타일 변수.
 *
 * ⚠️ **세션 화면은 시스템 테마와 무관하게 항상 다크다.** `src/index.css`의 시맨틱 변수는
 * `prefers-color-scheme`에 따라 Light/Dark로 갈리므로, 세션 서브트리에서만 같은 이름의 변수를
 * **다크 값으로 덮어써서** Tailwind 토큰 유틸(`bg-state-focus`, `text-text-tertiary` 등)이
 * 라이트 모드에서도 다크 값을 쓰게 한다. 값의 출처는 항상 `@focuson/design-tokens`다.
 *
 * 상태색은 `colors.state.*`를 직접 읽지 않고 **`sessionStateColors`(FOCUS/DISTRACTION/PAUSE)**
 * 시맨틱 레이어를 경유한다 — 지금은 같은 값을 가리키는 별칭이지만, 상태 3색 매핑이 바뀌면
 * 이 화면에도 자동으로 전달되어야 한다(SCR-S3-1·S3-2 §Design Tokens Used).
 *
 * `--session-*`은 토큰 스케일 밖의 세션 오버레이 전용 실측값이다(Figma S3-1 `58:323` 실측).
 * 시맨틱 토큰 체계와 층이 달라 `packages/design-tokens`에 올리지 않는다 —
 * 근거: SCR-S3-1·S3-2 "토큰 스케일 밖 실측값".
 */

/** 토큰 색에 알파만 입힌다 — 알파는 Figma 실측값이고 색상 자체는 토큰에서 온다. */
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

  // 세션 오버레이 전용 실측값
  /** 카메라 영역 base — 실제 앱에서는 카메라 피드가 들어온다. */
  "--session-camera-base": "#1a2029",
  "--session-pill-bg": "rgba(16, 20, 25, 0.65)",
  "--session-pill-bg-distract": "rgba(16, 20, 25, 0.68)",
  /** 비집중 상태색 35% — Figma 실측 `rgba(255,158,27,0.35)`와 동일한 값이 토큰에서 계산된다. */
  "--session-pill-border-distract": withAlpha(sessionStateColors.DISTRACTION.dark, 0.35),
  "--session-bar-bg": "rgba(22, 27, 34, 0.55)",
  /** 종료 버튼 — colors.feedback.error.dark(#ff6b77)와 Figma 실측이 일치한다. */
  "--session-exit-bg": colors.feedback.error.dark,
  /** 토스트 배경 — 시각 스펙 미확정(Current Limitations). 컨트롤 바보다 불투명하게 둔다. */
  "--session-toast-bg": "rgba(22, 27, 34, 0.92)",
} as const;

export const sessionSurfaceStyle = SESSION_SURFACE_VARS as unknown as CSSProperties;
