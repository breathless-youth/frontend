import type { SVGProps } from "react";

/**
 * S1 홈 아이콘·일러스트 (`apps/mobile/components/icons.tsx`의 홈 사용분만 이식 — BY-329).
 * SVG path는 Figma 익스포트 원본 그대로다 — 손으로 그리지 않는다.
 * 색은 RN판의 `useColorScheme` 분기 대신 CSS 변수(`--color-*`)로 라이트/다크를 따라간다.
 */

export function IconPlay({ size = 18, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" {...rest}>
      <path d="M6 4.125V13.875L13.875 9L6 4.125Z" fill="#FFFFFF" />
    </svg>
  );
}

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

/** 연속 공부 스탯 카드의 2톤 불꽃 일러스트(색 고정 — 이모지가 아닌 일러스트, glossary 참고). */
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

/**
 * 공부 측정 가이드 카드의 잉크 두들 일러스트.
 * 원본은 색이 하드코딩돼 있었지만 전부 시맨틱 토큰 라이트값과 일치해 토큰 바인딩을 복원한
 * RN판 결정을 그대로 따른다 — 웹에서는 CSS 변수로 표현한다(다크모드 자동 대응).
 */
export function IllustStudyDoodle({
  width = 96,
  height = 75,
  ...rest
}: SVGProps<SVGSVGElement> & { width?: number; height?: number }) {
  const ink = "var(--color-foreground)"; // 윤곽선
  const paper = "var(--color-background)"; // 윤곽선 안쪽 채움
  const ground = "var(--color-bg-layer-2)"; // 바닥 그림자
  const accent = "var(--color-primary)"; // 시계
  const hint = "var(--color-text-tertiary)"; // 말풍선 힌트

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 126 98"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M61.9348 95.8696C82.5254 95.8696 99.2174 93.9619 99.2174 91.6087C99.2174 89.2555 82.5254 87.3478 61.9348 87.3478C41.3442 87.3478 24.6522 89.2555 24.6522 91.6087C24.6522 93.9619 41.3442 95.8696 61.9348 95.8696Z"
        fill={ground}
      />
      <path d="M23.5869 70.3044H104.543" stroke={ink} strokeWidth={2.13043} strokeLinecap="round" />
      <path
        d="M32.1087 70.3044V90.5435M96.0217 70.3044V90.5435"
        stroke={ink}
        strokeWidth={2.13043}
        strokeLinecap="round"
      />
      <path
        d="M47.0217 66.0435C52.3478 62.3152 58.7391 62.3152 64.0652 66.0435C69.3913 62.3152 75.7826 62.3152 81.1087 66.0435V70.3043C75.7826 66.5761 69.3913 66.5761 64.0652 70.3043C58.7391 66.5761 52.3478 66.5761 47.0217 70.3043V66.0435Z"
        fill={paper}
        stroke={ink}
        strokeWidth={1.91739}
        strokeLinejoin="round"
      />
      <path d="M64.0652 66.5761V70.3043" stroke={ink} strokeWidth={1.70435} />
      <path
        d="M64.0652 43.6739C54.4783 45.2717 49.6848 51.663 48.6196 58.587"
        stroke={ink}
        strokeWidth={2.13043}
        strokeLinecap="round"
      />
      <path
        d="M64.0652 43.6739C73.1196 45.2717 77.3804 49.5326 78.4457 54.3261"
        stroke={ink}
        strokeWidth={2.13043}
        strokeLinecap="round"
      />
      <path
        d="M48.6196 58.5869C47.3413 61.3565 47.1283 63.7 47.7674 66.2565"
        stroke={ink}
        strokeWidth={2.13043}
        strokeLinecap="round"
      />
      <path
        d="M78.4456 54.3261C80.363 57.3087 80.7891 60.7174 79.937 64.5522"
        stroke={ink}
        strokeWidth={2.13043}
        strokeLinecap="round"
      />
      <path
        d="M64.0652 42.6087C71.7132 42.6087 77.9131 36.4088 77.9131 28.7609C77.9131 21.1129 71.7132 14.9131 64.0652 14.9131C56.4173 14.9131 50.2174 21.1129 50.2174 28.7609C50.2174 36.4088 56.4173 42.6087 64.0652 42.6087Z"
        fill={paper}
        stroke={ink}
        strokeWidth={2.13043}
      />
      <path
        d="M51.8152 23.9674C55.2239 17.7891 61.8283 15.0196 68.3261 16.937"
        stroke={ink}
        strokeWidth={2.13043}
        strokeLinecap="round"
      />
      <path
        d="M59.2717 30.4652C60.213 30.4652 60.9761 29.7022 60.9761 28.7609C60.9761 27.8196 60.213 27.0565 59.2717 27.0565C58.3304 27.0565 57.5674 27.8196 57.5674 28.7609C57.5674 29.7022 58.3304 30.4652 59.2717 30.4652Z"
        fill={ink}
      />
      <path
        d="M68.8587 30.4652C69.8 30.4652 70.5631 29.7022 70.5631 28.7609C70.5631 27.8196 69.8 27.0565 68.8587 27.0565C67.9174 27.0565 67.1544 27.8196 67.1544 28.7609C67.1544 29.7022 67.9174 30.4652 68.8587 30.4652Z"
        fill={ink}
      />
      <path
        d="M60.3369 34.6196C62.6804 36.3239 65.45 36.3239 67.7935 34.6196"
        stroke={ink}
        strokeWidth={1.81087}
        strokeLinecap="round"
      />
      <path
        opacity={0.55}
        d="M53.413 16.5109C51.8152 14.3804 51.8152 12.25 53.413 10.1196M58.7391 14.3804C57.4609 12.463 57.4609 10.5457 58.7391 8.62827"
        stroke={hint}
        strokeWidth={1.59783}
        strokeLinecap="round"
      />
      <path
        d="M103.478 35.1522C108.773 35.1522 113.065 30.86 113.065 25.5652C113.065 20.2705 108.773 15.9783 103.478 15.9783C98.1835 15.9783 93.8913 20.2705 93.8913 25.5652C93.8913 30.86 98.1835 35.1522 103.478 35.1522Z"
        fill={paper}
        stroke={accent}
        strokeWidth={2.13043}
      />
      <path
        d="M103.478 20.7717V25.8848L107.1 28.0152"
        stroke={accent}
        strokeWidth={1.91739}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M111.467 13.3152L114.663 10.1196M114.663 20.7717H118.924"
        stroke={accent}
        strokeWidth={1.70435}
        strokeLinecap="round"
      />
    </svg>
  );
}
