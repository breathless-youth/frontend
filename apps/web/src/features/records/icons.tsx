import { ChevronDown, ChevronLeft, ChevronRight, type LucideProps } from "lucide-react";
import type { SVGProps } from "react";

/**
 * S5 기록 아이콘·일러스트 (`apps/mobile/components/icons.tsx`의 기록 사용분만 이식 — BY-330).
 * SVG path는 Figma 익스포트 원본 그대로다 — 손으로 그리지 않는다(꺾쇠 3종만 같은 모양의 lucide 아이콘을 쓴다).
 * 색은 RN판의 `useColorScheme` 분기 대신 CSS 변수(`--color-*`)로 라이트/다크를 따라간다
 * (`apps/web/src/features/home/icons.tsx`가 세운 관례와 동일).
 */

type ChevronProps = Omit<LucideProps, "size"> & { size?: number };

/*
 * 꺾쇠 3종 — 모양은 lucide 아이콘이다. lucide는 24 격자 한가운데에 꺾쇠를 작게 그려서 그대로 쓰면
 * 둘레 여백만큼 옆 글자와의 간격이 벌어진다. 그래서 보이는 영역(viewBox)을 꺾쇠에 붙여 자르고
 * 선 굵기를 시안 값에 맞춘다 — 호출부는 꺾쇠 자체의 크기만 넘기면 된다.
 */

/** `size`는 높이. */
export function IconChevronRight({ color = "#8B95A1", size = 12, ...rest }: ChevronProps) {
  return (
    <ChevronRight
      viewBox="7.9167 5 8.1667 14"
      width={(size * 7) / 12}
      height={size}
      color={color}
      strokeWidth={1.8}
      {...rest}
    />
  );
}

/** `size`는 높이. */
export function IconChevronLeft({
  color = "var(--color-foreground)",
  size = 13,
  ...rest
}: ChevronProps) {
  return (
    <ChevronLeft
      viewBox="8.1 5.1 7.8 13.8"
      width={(size * 7.8) / 13.8}
      height={size}
      color={color}
      strokeWidth={1.8}
      {...rest}
    />
  );
}

/** `size`는 너비. */
export function IconChevronDown({
  color = "var(--color-text-tertiary)",
  size = 9,
  ...rest
}: ChevronProps) {
  return (
    <ChevronDown
      viewBox="4.8 7.8 14.4 8.4"
      width={size}
      height={(size * 8.4) / 14.4}
      color={color}
      strokeWidth={2.4}
      {...rest}
    />
  );
}

/**
 * 플래너 아이콘(Figma `icon/planner` — 18×18, 달력에 체크). 기본은 글자색을 따라간다.
 * `var(--color-brand-subtle-text)`처럼 Soft Blue 테마에만 있는 토큰을 `--color-*`로 직접 쓰면 값이 비어
 * 아이콘이 안 보인다 — `--color-*`는 `:root`에서 풀리는데 그 토큰은 `.theme-soft-blue` 안에만 있다.
 */
export function IconPlanner({
  color = "currentColor",
  size = 18,
  ...rest
}: SVGProps<SVGSVGElement> & { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M12.375 3H5.625C4.38236 3 3.375 4.00736 3.375 5.25V13.125C3.375 14.3676 4.38236 15.375 5.625 15.375H12.375C13.6176 15.375 14.625 14.3676 14.625 13.125V5.25C14.625 4.00736 13.6176 3 12.375 3Z"
        stroke={color}
        strokeWidth={1.275}
      />
      <path
        d="M6.375 2.0625V4.3125M11.625 2.0625V4.3125M3.375 6.9375H14.625"
        stroke={color}
        strokeWidth={1.275}
        strokeLinecap="round"
      />
      <path
        d="M6.75 10.875L8.25 12.375L11.25 9.15"
        stroke={color}
        strokeWidth={1.275}
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
