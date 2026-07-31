import type { SVGProps } from "react";

/**
 * S5 기록 아이콘·일러스트 (`apps/mobile/components/icons.tsx`의 기록 사용분만 이식 — BY-330).
 * SVG path는 Figma 익스포트 원본 그대로다 — 손으로 그리지 않는다.
 * 색은 RN판의 `useColorScheme` 분기 대신 CSS 변수(`--color-*`)로 라이트/다크를 따라간다
 * (`apps/web/src/features/home/icons.tsx`가 세운 관례와 동일).
 */

export function IconChevronRight({
  color = "#8B95A1",
  size = 12,
  ...rest
}: SVGProps<SVGSVGElement> & { color?: string; size?: number }) {
  // 원본 비율 7×12 — size는 높이 기준으로 두고 너비를 비율로 맞춘다.
  return (
    <svg
      width={(size * 7) / 12}
      height={size}
      viewBox="0 0 7 12"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M0.928589 0.857147L6.07145 6L0.928589 11.1429"
        stroke={color}
        strokeWidth={1.54286}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * S5 기록의 달력 이전 달 버튼 아이콘(Figma `icon/chevron-left` 32:39 — 프레임 8×13).
 * 익스포트 원본 stroke는 #191F28 하드코딩이지만 값이 `text/primary` 라이트값과 정확히 일치해
 * 토큰(`--color-foreground`)에 바인딩한다(다크모드 대응) — 다음 달 버튼은 이 아이콘을 회전시키지
 * 않고 같은 세트의 `IconChevronRight`를 쓴다(원본과 동일 방침).
 */
export function IconChevronLeft({
  color = "var(--color-foreground)",
  size = 13,
  ...rest
}: SVGProps<SVGSVGElement> & { color?: string; size?: number }) {
  // 익스포트 원본 비율 7.24×12.81 — size는 높이 기준으로 두고 너비를 비율로 맞춘다.
  return (
    <svg
      width={(size * 7.24286) / 12.8143}
      height={size}
      viewBox="0 0 7.24286 12.8143"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M6.40714 0.835714L0.835714 6.40714L6.40714 11.9786"
        stroke={color}
        strokeWidth={1.67143}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * S5 연속 공부 배너의 주간 체크 도트 안 체크 표시(Figma `icon/check-sm` 32:33 — 프레임 13×13).
 * 브랜드 색 원 위에 얹히는 아이콘이라 색이 `text/onBrand` 고정이다(라이트·다크 동일값 `#FFFFFF`라
 * 토큰 조회가 필요 없다 — 원본과 동일 방침).
 */
export function IconCheckSm({
  color = "#FFFFFF",
  size = 13,
  ...rest
}: SVGProps<SVGSVGElement> & { color?: string; size?: number }) {
  // 익스포트 원본 10.21×8.36이 13×13 프레임 안에 들어간다 — size는 프레임 기준.
  return (
    <svg
      width={(size * 10.2143) / 13}
      height={(size * 8.35716) / 13}
      viewBox="0 0 10.2143 8.35716"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M0.928571 4.64287L3.71429 7.42859L9.28571 0.928588"
        stroke={color}
        strokeWidth={1.85714}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 연속 공부 스탯 배너의 2톤 불꽃 일러스트(색 고정 — 이모지가 아닌 일러스트, glossary 참고). */
export function IllustFlame({
  width = 19,
  height = 22,
  ...rest
}: SVGProps<SVGSVGElement> & { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 38 44" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M19 1.64999C19.88 7.36999 17.46 10.67 13.94 14.19C10.2 17.93 6.24 21.56 6.24 27.72C6.24 36.19 11.85 42.35 19 42.35C26.15 42.35 31.76 36.19 31.76 27.72C31.76 22.77 29.56 18.81 26.81 15.4C25.82 17.16 24.72 18.37 23.18 19.36C23.51 12.21 21.53 5.71999 19 1.64999Z"
        fill="#FF9E1B"
      />
      <path
        d="M19 42.35C14.6 42.35 11.3 39.05 11.3 34.65C11.3 31.13 13.28 28.93 15.37 26.84C16.91 25.3 18.34 23.76 19 21.45C21.86 24.09 26.7 28.49 26.7 34.65C26.7 39.05 23.4 42.35 19 42.35Z"
        fill="#FFD262"
      />
    </svg>
  );
}
