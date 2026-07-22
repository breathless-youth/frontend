/**
 * 모바일·웹 공유 의미 기반 디자인 토큰(순수 값). 컴포넌트 구현체는 공유하지 않는다 —
 * 웹은 shadcn, 모바일은 RN + NativeWind로 각자 구현하되 이 토큰을 참조한다.
 * 이번 라운드는 최소 초기 구조다(값은 후속 디자인 확정 시 조정).
 */

/** 의미 기반 색상(hex). 브랜드/역할별. */
export const colors = {
  brand: "#4F46E5",
  background: "#FFFFFF",
  foreground: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#DC2626",
} as const;

/** 공부 상태별 의미색(`StudyStatus`와 1:1). */
export const statusColors = {
  STUDYING: colors.success,
  AWAY: colors.warning,
  PAUSED: colors.muted,
  CAMERA_OFF: colors.danger,
} as const;

/** 타이포 스케일(px). */
export const typography = {
  caption: 12,
  body: 14,
  subtitle: 16,
  title: 20,
  display: 28,
} as const;

/** 간격 스케일(px). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** 모서리 반경(px). */
export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
} as const;

/** 아이콘 의미 키(플랫폼별 아이콘 세트 매핑용). */
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
