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
  /** 세션 오버레이 상태색(집중/비집중) — 일시정지는 별도 상태색이 없고 text.tertiary를 재사용한다(아래 sessionStateColors 참고). */
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
 * 세션 상태 표시색 — 3색 체계. 결과 타임라인 범례와 세션 상태 필에 쓴다.
 * 근거: ai-wiki `product/mvp-scope.md` 세션 상태 모델 + `product/design.md`(2026-07-26 확정).
 *
 * - FOCUS(집중): 순공·총 공부 모두 진행. 기본 상태이므로 서버 이벤트로 기록되지 않는다.
 * - DISTRACTION(비집중): 감지 3종(자리 이탈·휴대폰 사용·기기 조작). 순공만 정지, 총 공부는 진행.
 * - PAUSE(일시정지): 수동 일시정지 + 화면 꺼짐·백그라운드(2026-07-26 통합). 순공·총 공부 모두 정지.
 */
export const sessionStateColors = {
  FOCUS: colors.state.focus,
  DISTRACTION: colors.state.distract,
  PAUSE: colors.text.tertiary,
} as const;

/**
 * 서버 이벤트 상태별 표시색. 키는 `@focusmakers/types`의 `StudyEventStatus`
 * (`"PHONE" | "DEVICE" | "AWAY" | "PAUSE"` — 백엔드 Swagger 계약)와 1:1로 대응한다.
 *
 * 이 패키지는 순수 값 패키지라 `@focusmakers/types`를 import하지 않는다(아키텍처 경계 유지) —
 * 대신 키 집합이 어긋나지 않도록 테스트로 고정한다. 계약이 바뀌면 이 표와 테스트를 함께 고친다.
 *
 * 비집중 3종(PHONE·DEVICE·AWAY)은 사용자에게 같은 오렌지로 보이고 라벨·뱃지 문구로만 구분된다
 * (`ai-wiki/product/glossary.md`의 노출 표기 참고).
 */
export const eventStatusColors = {
  PHONE: sessionStateColors.DISTRACTION,
  DEVICE: sessionStateColors.DISTRACTION,
  AWAY: sessionStateColors.DISTRACTION,
  PAUSE: sessionStateColors.PAUSE,
} as const;

/** 타이포 스케일. Figma "Typography"(node 21:2)에서 추출 — 폰트는 apps/web에 NanumSquareRound를 자체 호스팅해 적용한다. */
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
    /** 복구 모달 등 강조 제목 전용, Figma 텍스트 스타일 heading/emphasis와 일치 */
    emphasis: { size: 19, lineHeight: 23, weight: "extrabold" },
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

/**
 * V2 Soft Blue 스코프 — 스플래시·하단 탭 바 전용. 기존 `colors`(V1)와 분리해 둔다.
 * 아직 V1인 모바일 화면이 따라 바뀌면 안 되므로 별도 스코프로만 참조한다.
 * 값 출처: Figma "Nav / Glass Tab Bar"(5325:3730)·"E1 · 스플래시"(5322:3661),
 * 웹 `apps/web/src/index.css`의 `.theme-soft-blue`와 교차 확인.
 */
export const softBlue = {
  /** 유리 표면·테두리·하이라이트·활성 알약·그림자 — RN 인라인 style 값(className 불가). */
  glass: {
    surface: { light: "rgba(255,255,255,0.55)", dark: "rgba(30,34,44,0.55)" },
    border: { light: "rgba(255,255,255,0.75)", dark: "rgba(255,255,255,0.18)" },
    innerHighlight: { light: "rgba(255,255,255,0.9)", dark: "rgba(255,255,255,0.25)" },
    activePill: { light: "rgba(255,255,255,0.85)", dark: "rgba(255,255,255,0.14)" },
    shadow: { light: "rgba(31,42,61,0.14)", dark: "rgba(0,0,0,0.35)" },
  },
  /** 탭 라벨 — 활성은 text/primary, 비활성은 text/secondary(색이 아니라 알약으로 구분). */
  tab: {
    labelActive: { light: "#1f2a3d", dark: "#eaf0f9" },
    labelInactive: { light: "#556173", dark: "#9fabc0" },
  },
  /** 스플래시 배경·워드마크 — swift 스크립트·app.json과 같은 값. */
  splash: {
    bg: { light: "#f8fafd", dark: "#0d1118" },
    wordmark: { light: "#3671cf", dark: "#5a90ea" },
  },
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
  sessionStateColors,
  eventStatusColors,
  typography,
  spacing,
  radius,
  iconMeanings,
  softBlue,
} as const;

export type Colors = typeof colors;
export type SessionStateColors = typeof sessionStateColors;
export type EventStatusColors = typeof eventStatusColors;
export type Typography = typeof typography;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type IconMeaning = (typeof iconMeanings)[keyof typeof iconMeanings];
export type SoftBlue = typeof softBlue;
export type DesignTokens = typeof tokens;
