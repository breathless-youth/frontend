/**
 * 모바일·웹 공유 의미 기반 디자인 토큰(순수 값). 컴포넌트 구현체는 공유하지 않는다 —
 * 웹은 shadcn, 모바일은 RN + NativeWind로 각자 구현하되 이 토큰을 참조한다.
 * Figma "FocusON V1.0 Design"(파일 키 KmTbXL79g6ximY1RcnBZDz) Foundations 페이지에서
 * 직접 추출한 확정 값이다(2026-07-26 동기화, get_variable_defs로 교차 확인).
 */

/** 의미 기반 색상. Figma "Color · Semantic Tokens"(node 19:2)에서 추출 — Light/Dark 둘 다 갖는다. */
export const colors = {
  bg: {
    base: { light: "#ffffff", dark: "#101419" },
    dim: { light: "#00000066", dark: "#00000099" },
    guide: { light: "#f3f8fe", dark: "#152030" },
    layer1: { light: "#f9fafb", dark: "#191f28" },
    layer2: { light: "#f2f4f6", dark: "#333d4b" },
  },
  border: {
    default: { light: "#e5e8eb", dark: "#333d4b" },
    strong: { light: "#d1d6db", dark: "#4e5968" },
  },
  brand: {
    primary: { light: "#1b64da", dark: "#3182f6" },
    hover: { light: "#1957c2", dark: "#4593fc" },
    subtle: { light: "#e8f3ff", dark: "#1b2b4d" },
    subtlePressed: { light: "#c9e2ff", dark: "#194aa6" },
  },
  feedback: {
    error: { light: "#f04452", dark: "#ff6b77" },
    errorSubtle: { light: "#ffebee", dark: "#3d1b1f" },
    success: { light: "#12b76a", dark: "#32d583" },
  },
  /** 세션 오버레이 상태색(집중/비집중) — 일시정지는 별도 상태색이 없고 text.tertiary를 재사용한다(아래 statusColors 참고). */
  state: {
    focus: { light: "#1b64da", dark: "#4593fc" },
    focusSubtle: { light: "#e8f3ff", dark: "#1b2b4d" },
    distract: { light: "#ff8a00", dark: "#ff9e1b" },
    distractSubtle: { light: "#fff4e5", dark: "#3d2e14" },
    distractText: { light: "#b36100", dark: "#ff9e1b" },
  },
  text: {
    primary: { light: "#191f28", dark: "#f9fafb" },
    secondary: { light: "#6b7684", dark: "#b0b8c1" },
    /** 일시정지 상태색으로도 쓰인다 — Light/Dark 값이 동일(ai-wiki 6차 인터뷰 노트의 #8B95A1과 일치 확인). */
    tertiary: { light: "#8b95a1", dark: "#8b95a1" },
    disabled: { light: "#d1d6db", dark: "#4e5968" },
    inverse: { light: "#ffffff", dark: "#101419" },
    onBrand: { light: "#ffffff", dark: "#ffffff" },
  },
} as const;

/**
 * 공부 상태별 의미색. ⚠️ 이 4개 키(STUDYING/AWAY/PAUSED/CAMERA_OFF)는 실제 API 계약
 * `StudyEventStatus`(PHONE/DEVICE/AWAY/PAUSE — packages/types)와 이름이 어긋난다.
 * 이 불일치는 정책 판단이 필요해 의도적으로 그대로 두었다(리네이밍하지 않음) — 자세한 내용은
 * .claude/skills/focuson-screens-orchestrator/_workspace/01_design-tokens-sync-report.md 참고.
 * 색상 값 자체는 Figma 확정 시맨틱 토큰으로 갱신했다: 집중=state.focus, 일시정지=text.tertiary
 * (2026-07-26 정책 — 화면꺼짐·백그라운드도 일시정지에 통합), 나머지 비공부 이벤트는 state.distract로 통일.
 */
export const statusColors = {
  STUDYING: colors.state.focus,
  AWAY: colors.state.distract,
  PAUSED: colors.text.tertiary,
  CAMERA_OFF: colors.state.distract,
} as const;

/** 타이포 스케일. Figma "Typography"(node 21:2)에서 추출 — 폰트는 Pretendard 미설치로 Inter 임시 적용 중(교체하지 않는다). */
export const typography = {
  display: {
    /** 타이머 전용 */
    lg: { size: 56, lineHeight: 64, weight: "bold" },
    sm: { size: 40, lineHeight: 48, weight: "bold" },
  },
  heading: {
    h1: { size: 28, lineHeight: 36, weight: "bold" },
    h2: { size: 22, lineHeight: 30, weight: "bold" },
    h3: { size: 18, lineHeight: 26, weight: "bold" },
  },
  body: {
    lg: { size: 17, lineHeight: 26, weight: "regular" },
    md: { size: 15, lineHeight: 22, weight: "regular" },
    sm: { size: 13, lineHeight: 20, weight: "regular" },
  },
  caption: { size: 12, lineHeight: 16, weight: "regular" },
  label: {
    lg: { size: 16, lineHeight: 24, weight: "medium" },
    md: { size: 14, lineHeight: 20, weight: "medium" },
    sm: { size: 12, lineHeight: 16, weight: "medium" },
  },
} as const;

/** 간격 스케일(px). Figma "Spacing & Radius"(node 17:168)에서 추출 — 문서화된 값이며 바인딩된 Figma Variable은 아니다(get_variable_defs 확인 결과 비어 있음). */
export const spacing = {
  "2xs": 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
} as const;

/** 모서리 반경(px). Figma "Spacing & Radius"(node 17:168)에서 추출 — full은 999(기존 코드의 9999 아님). */
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

/** 아이콘 의미 키(플랫폼별 아이콘 세트 매핑용) — Figma Components 페이지 조사는 실제로 아이콘이 필요한 화면 구현 시점에 진행한다. */
export const iconMeanings = {
  study: "study",
  pause: "pause",
  end: "end",
  cameraOn: "camera-on",
  cameraOff: "camera-off",
  switchCamera: "switch-camera",
  report: "report",
} as const;

export const tokens = {
  colors,
  statusColors,
  typography,
  spacing,
  radius,
  iconMeanings,
} as const;

export type Colors = typeof colors;
export type StatusColors = typeof statusColors;
export type Typography = typeof typography;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type IconMeaning = (typeof iconMeanings)[keyof typeof iconMeanings];
export type DesignTokens = typeof tokens;
