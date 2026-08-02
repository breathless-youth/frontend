import type { SVGProps } from "react";

import { coachOverlay, coachTokenColors } from "./coachOverlayTheme";

/**
 * 온보딩 가이드(G1~G5) 전용 SVG — Figma "FocusON V1.0 Design"(KmTbXL79g6ximY1RcnBZDz)에서
 * `download_assets`(svg)로 내보낸 path 데이터를 그대로 옮긴 것이다(형상을 직접 그리지 않았다).
 *
 * Figma 익스포트에는 캔버스·섹션 배경 `<rect>`(#F5F5F5, white)가 함께 들어오는데 그건
 * 아이콘이 아니라 Figma 페이지 배경이므로 제외했다 — PNG로 내보내면 이 배경이 합성돼
 * 흰 네모로 보인다(2026-07-26 실제 발생, `components/icons.tsx` 주석 참고).
 *
 * **공용 `features/home/icons.tsx`·`features/records/icons.tsx`에 넣지 않은 이유**: 컨트롤 바
 * 아이콘(일시정지·카메라 전환·종료)은 이 화면의 **표시 전용 목업**이지 앱이 실제로 쓰는
 * 컨트롤이 아니다. 진짜 세션 컨트롤은 `features/study-session`이 갖는다(ADR 0001 — 화면끼리
 * 컴포넌트를 공유하지 않는다). 공용 아이콘 파일에 섞어두면 "이 온보딩 목업이 실제 세션
 * 컨트롤이다"고 오해할 여지가 생긴다.
 *
 * 색은 이 화면 전용으로 고정된 값(흰색 하드코딩 또는 `coachOverlayTheme`의 다크 오버레이
 * 상수)이다 — home/records 아이콘처럼 라이트/다크 자동 전환 CSS 변수를 쓰지 않는다. 이 화면이
 * 항상 다크 오버레이 위에 그려지는 이유는 `coachOverlayTheme.ts` 상단 주석 참고.
 *
 * (`apps/mobile/components/onboarding/coachIcons.tsx`에서 이식 — BY-334 온보딩 웹 이관.
 * `Svg`/`Path`/`Circle`/`Ellipse`/`Rect` → `svg`/`path`/`circle`/`ellipse`/`rect` 태그명만
 * 바뀌었고 좌표·색·strokeWidth는 원본 그대로다.)
 */

/** 컨트롤 바 일시정지(`icon/pause` 32:9, 16×18). */
export function IconPause({
  width = 16,
  height = 18,
  ...rest
}: SVGProps<SVGSVGElement> & { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 16 18" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M4.71112 1.88889H3.82223C2.93857 1.88889 2.22223 2.60523 2.22223 3.48889V14.5111C2.22223 15.3948 2.93857 16.1111 3.82223 16.1111H4.71112C5.59477 16.1111 6.31112 15.3948 6.31112 14.5111V3.48889C6.31112 2.60523 5.59477 1.88889 4.71112 1.88889Z"
        fill="#FFFFFF"
      />
      <path
        d="M12.1778 1.88889H11.2889C10.4052 1.88889 9.6889 2.60523 9.6889 3.48889V14.5111C9.6889 15.3948 10.4052 16.1111 11.2889 16.1111H12.1778C13.0614 16.1111 13.7778 15.3948 13.7778 14.5111V3.48889C13.7778 2.60523 13.0614 1.88889 12.1778 1.88889Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/** 컨트롤 바 카메라 전환(`icon/camera-flip` 32:15, 20×20). */
export function IconCameraFlip({
  width = 20,
  height = 20,
  ...rest
}: SVGProps<SVGSVGElement> & { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M5.25 6.83334C5.83917 5.99143 6.64029 5.3201 7.57227 4.88728C8.50426 4.45446 9.53404 4.27551 10.5574 4.36855C11.5808 4.46158 12.5614 4.82329 13.4001 5.41708C14.2387 6.01087 14.9056 6.81566 15.3333 7.75"
        stroke="#FFFFFF"
        strokeWidth={1.66667}
        strokeLinecap="round"
      />
      <path
        d="M15.6667 4.33333V7.83333H12.1667"
        stroke="#FFFFFF"
        strokeWidth={1.66667}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.75 13.1667C14.1608 14.0086 13.3597 14.6799 12.4277 15.1127C11.4957 15.5455 10.4659 15.7245 9.44258 15.6315C8.41922 15.5384 7.43859 15.1767 6.59993 14.5829C5.76127 13.9891 5.09435 13.1843 4.66666 12.25"
        stroke="#FFFFFF"
        strokeWidth={1.66667}
        strokeLinecap="round"
      />
      <path
        d="M4.33334 15.6667V12.1667H7.83334"
        stroke="#FFFFFF"
        strokeWidth={1.66667}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 컨트롤 바 공부 종료(`icon/exit` 32:24, 19×19). */
export function IconExit({
  width = 19,
  height = 19,
  ...rest
}: SVGProps<SVGSVGElement> & { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 19 19" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M10.6875 3.5625H5.54165C5.12172 3.5625 4.71899 3.72931 4.42206 4.02625C4.12513 4.32318 3.95831 4.72591 3.95831 5.14583V13.8542C3.95831 14.2741 4.12513 14.6768 4.42206 14.9738C4.71899 15.2707 5.12172 15.4375 5.54165 15.4375H10.6875"
        stroke="#FFFFFF"
        strokeWidth={1.58333}
        strokeLinecap="round"
      />
      <path
        d="M8.3125 9.50001H15.8333M13.0625 12.2708L15.8333 9.50001L13.0625 6.72917"
        stroke="#FFFFFF"
        strokeWidth={1.58333}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 우상단 나가기 X (BY-151). 획 색·두께는 IconExit의 화이트 스트로크 관례를 따른다. */
export function IconClose({
  width = 19,
  height = 19,
  ...rest
}: SVGProps<SVGSVGElement> & { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 19 19" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M4.75 4.75L14.25 14.25"
        stroke="#FFFFFF"
        strokeWidth={1.58333}
        strokeLinecap="round"
      />
      <path
        d="M14.25 4.75L4.75 14.25"
        stroke="#FFFFFF"
        strokeWidth={1.58333}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * G5 프라이버시 카드 일러스트 — `FocusON V1.0 Final (Standalone)_iOS.html`의 G5 카드 SVG를
 * 그대로 옮긴 것(2026-07-29 확정 교체, 구 `illust/privacy-camera` 32:74 대체). 구성:
 * 폰 실루엣 + 시계(측정) + 방패 체크(보호) + 사선이 그어진 구름(외부 전송 없음) + 스파클.
 *
 * 원본 HTML의 `#4593FC`·`#FF6B77`은 기존 토큰의 다크값과 일치해 토큰에 바인딩한다
 * (`#4593FC` = `state/focus` 다크, `#FF6B77` = `feedback/error` 다크 — 구 일러스트와 동일 근거).
 */
export function IllustPrivacyCamera({
  width = 156,
  height = 104,
  ...rest
}: SVGProps<SVGSVGElement> & { width?: number; height?: number }) {
  const accent = coachTokenColors.privacyIllustAccent;
  const block = coachTokenColors.exitButton;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 150 100"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      <ellipse cx={76} cy={94} rx={46} ry={4} fill="rgba(255,255,255,0.07)" />
      <rect
        x={59}
        y={8}
        width={34}
        height={66}
        rx={7}
        stroke="#F9FAFB"
        strokeWidth={2}
        fill="rgba(255,255,255,0.03)"
      />
      <path d="M71 13.5h10" stroke="#F9FAFB" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={76} cy={36} r={11} stroke={accent} strokeWidth={2} />
      <path
        d="M76 30.5v5.5l3.6 2.2"
        stroke={accent}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M68 56h16M68 62h11"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <path
        d="M104 50c7 0 12 2.6 12 2.6v12.8c0 8.4-6.6 13.9-12 15.6-5.4-1.7-12-7.2-12-15.6V52.6S97 50 104 50Z"
        fill="rgba(49,130,246,0.18)"
        stroke={accent}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M98.5 64.5l4 4 7-7.5"
        stroke="#F9FAFB"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 30c-3.8 0-6.5-2.4-6.5-5.7 0-3 2.2-5.3 5-5.6.6-3.6 3.7-6.2 7.5-6.2 3.4 0 6.3 2.1 7.3 5.2 3.3.2 5.7 2.6 5.7 5.9 0 3.5-2.8 6.4-6.6 6.4Z"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M12.5 34.5 42 8.5" stroke={block} strokeWidth={2.2} strokeLinecap="round" />
      <path
        d="M52 28h-6M49.5 22.5l-4 3"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeDasharray="2.5 3.5"
      />
      <path
        d="M124 18l3.4-3.4M127.5 26h4.8M118 12.5v-4.8"
        stroke={accent}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 코치마크 툴팁 꼬리(`Polygon` — 14×7 박스 안의 삼각형).
 * 카드 배경과 같은 색이라야 이어져 보이므로 색을 `coachOverlay.cardBg`에 묶는다.
 */
export function CoachTooltipTail({
  // Figma 원본은 14×7 — 말풍선과 강조 대상의 연결이 잘 안 읽힌다는 피드백으로 두 차례
  // 키웠다(BY-343: 20×10 → 26×13). viewBox는 그대로라 비율(2:1) 유지 확대다.
  width = 26,
  height = 13,
  ...rest
}: SVGProps<SVGSVGElement> & { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 14 7" fill="none" aria-hidden="true" {...rest}>
      <path d="M7 0L13.0622 5.25H0.9378L7 0Z" fill={coachOverlay.cardBg} />
    </svg>
  );
}
