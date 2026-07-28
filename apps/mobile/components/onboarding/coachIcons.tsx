import Svg, { Path, type SvgProps } from "react-native-svg";

import { coachOverlay, coachTokenColors } from "./coachOverlayTheme";

/**
 * 온보딩 가이드(G1~G5) 전용 SVG — Figma "FocusON V1.0 Design"(KmTbXL79g6ximY1RcnBZDz)에서
 * `download_assets`(svg)로 내보낸 path 데이터를 그대로 옮긴 것이다(형상을 직접 그리지 않았다).
 *
 * Figma 익스포트에는 캔버스·섹션 배경 `<rect>`(#F5F5F5, white)가 함께 들어오는데 그건
 * 아이콘이 아니라 Figma 페이지 배경이므로 제외했다 — PNG로 내보내면 이 배경이 합성돼
 * 흰 네모로 보인다(2026-07-26 실제 발생, `components/icons.tsx` 주석 참고).
 *
 * **공용 `components/icons.tsx`에 넣지 않은 이유**: 컨트롤 바 아이콘(일시정지·카메라 전환·종료)은
 * 이 화면의 **표시 전용 목업**이지 앱이 실제로 쓰는 컨트롤이 아니다. 진짜 세션 컨트롤은
 * `apps/web`(WG 계열)이 갖는다(ADR 0001 — 두 앱은 컴포넌트를 공유하지 않는다). 공용 아이콘
 * 파일에 섞어두면 "모바일에도 세션 컨트롤이 있다"고 오해할 여지가 생긴다.
 */

/** 컨트롤 바 일시정지(`icon/pause` 32:9, 16×18). */
export function IconPause({ width = 16, height = 18, ...rest }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 16 18" fill="none" {...rest}>
      <Path
        d="M4.71112 1.88889H3.82223C2.93857 1.88889 2.22223 2.60523 2.22223 3.48889V14.5111C2.22223 15.3948 2.93857 16.1111 3.82223 16.1111H4.71112C5.59477 16.1111 6.31112 15.3948 6.31112 14.5111V3.48889C6.31112 2.60523 5.59477 1.88889 4.71112 1.88889Z"
        fill="#FFFFFF"
      />
      <Path
        d="M12.1778 1.88889H11.2889C10.4052 1.88889 9.6889 2.60523 9.6889 3.48889V14.5111C9.6889 15.3948 10.4052 16.1111 11.2889 16.1111H12.1778C13.0614 16.1111 13.7778 15.3948 13.7778 14.5111V3.48889C13.7778 2.60523 13.0614 1.88889 12.1778 1.88889Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

/** 컨트롤 바 카메라 전환(`icon/camera-flip` 32:15, 20×20). */
export function IconCameraFlip({ width = 20, height = 20, ...rest }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 20 20" fill="none" {...rest}>
      <Path
        d="M5.25 6.83334C5.83917 5.99143 6.64029 5.3201 7.57227 4.88728C8.50426 4.45446 9.53404 4.27551 10.5574 4.36855C11.5808 4.46158 12.5614 4.82329 13.4001 5.41708C14.2387 6.01087 14.9056 6.81566 15.3333 7.75"
        stroke="#FFFFFF"
        strokeWidth={1.66667}
        strokeLinecap="round"
      />
      <Path
        d="M15.6667 4.33333V7.83333H12.1667"
        stroke="#FFFFFF"
        strokeWidth={1.66667}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14.75 13.1667C14.1608 14.0086 13.3597 14.6799 12.4277 15.1127C11.4957 15.5455 10.4659 15.7245 9.44258 15.6315C8.41922 15.5384 7.43859 15.1767 6.59993 14.5829C5.76127 13.9891 5.09435 13.1843 4.66666 12.25"
        stroke="#FFFFFF"
        strokeWidth={1.66667}
        strokeLinecap="round"
      />
      <Path
        d="M4.33334 15.6667V12.1667H7.83334"
        stroke="#FFFFFF"
        strokeWidth={1.66667}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 컨트롤 바 공부 종료(`icon/exit` 32:24, 19×19). */
export function IconExit({ width = 19, height = 19, ...rest }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 19 19" fill="none" {...rest}>
      <Path
        d="M10.6875 3.5625H5.54165C5.12172 3.5625 4.71899 3.72931 4.42206 4.02625C4.12513 4.32318 3.95831 4.72591 3.95831 5.14583V13.8542C3.95831 14.2741 4.12513 14.6768 4.42206 14.9738C4.71899 15.2707 5.12172 15.4375 5.54165 15.4375H10.6875"
        stroke="#FFFFFF"
        strokeWidth={1.58333}
        strokeLinecap="round"
      />
      <Path
        d="M8.3125 9.50001H15.8333M13.0625 12.2708L15.8333 9.50001L13.0625 6.72917"
        stroke="#FFFFFF"
        strokeWidth={1.58333}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 우상단 나가기 X (BY-151). 획 색·두께는 IconExit의 화이트 스트로크 관례를 따른다. */
export function IconClose({ width = 19, height = 19, ...rest }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 19 19" fill="none" {...rest}>
      <Path
        d="M4.75 4.75L14.25 14.25"
        stroke="#FFFFFF"
        strokeWidth={1.58333}
        strokeLinecap="round"
      />
      <Path
        d="M14.25 4.75L4.75 14.25"
        stroke="#FFFFFF"
        strokeWidth={1.58333}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * G5 프라이버시 카드 일러스트(`illust/privacy-camera` 32:74, 156×104).
 *
 * Figma 원본은 색을 하드코딩했지만 값이 기존 토큰의 **다크값**과 정확히 일치한다
 * (`#4593FC` = `state/focus` 다크, `#FF6B77` = `feedback/error` 다크) — 하드코딩 대신
 * 토큰에 바인딩한다. 이 일러스트가 다크값을 쓰고 있다는 사실 자체가 `coachOverlayTheme.ts`의
 * `GUIDE_FOCUS_COLOR` 판단 근거 중 하나다.
 */
export function IllustPrivacyCamera({ width = 156, height = 104, ...rest }: SvgProps) {
  const accent = coachTokenColors.privacyIllustAccent;
  const block = coachTokenColors.exitButton;

  return (
    <Svg width={width} height={height} viewBox="0 0 156 104" fill="none" {...rest}>
      <Path
        d="M112.32 18.72H43.68C36.7875 18.72 31.2 24.3075 31.2 31.2V72.8C31.2 79.6925 36.7875 85.28 43.68 85.28H112.32C119.213 85.28 124.8 79.6925 124.8 72.8V31.2C124.8 24.3075 119.213 18.72 112.32 18.72Z"
        fill="#FFFFFF"
        fillOpacity={0.03}
        stroke={accent}
        strokeWidth={2.08}
      />
      <Path
        d="M78 35.36C81.3099 35.36 84.4842 36.6748 86.8247 39.0153C89.1652 41.3557 90.48 44.5301 90.48 47.84C90.48 51.1499 89.1652 54.3242 86.8247 56.6647C84.4842 59.0051 81.3099 60.32 78 60.32C74.6901 60.32 71.5158 59.0051 69.1753 56.6647C66.8349 54.3242 65.52 51.1499 65.52 47.84C65.52 44.5301 66.8349 41.3557 69.1753 39.0153C71.5158 36.6748 74.6901 35.36 78 35.36Z"
        stroke={accent}
        strokeWidth={2.08}
      />
      <Path
        d="M78 53.04C80.8719 53.04 83.2 50.7119 83.2 47.84C83.2 44.9681 80.8719 42.64 78 42.64C75.1281 42.64 72.8 44.9681 72.8 47.84C72.8 50.7119 75.1281 53.04 78 53.04Z"
        fill={accent}
      />
      <Path
        d="M31.2 52H10.4M124.8 52H145.6"
        stroke="#FFFFFF"
        strokeOpacity={0.35}
        strokeWidth={2.08}
        strokeLinecap="round"
        strokeDasharray="1.04 6.24"
      />
      <Path
        d="M14.56 45.76L8.32 52L14.56 58.24M141.44 45.76L147.68 52L141.44 58.24"
        stroke={block}
        strokeWidth={2.08}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M62.4 91.52H93.6"
        stroke="#FFFFFF"
        strokeOpacity={0.5}
        strokeWidth={2.08}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * 코치마크 툴팁 꼬리(`Polygon` — 14×7 박스 안의 삼각형).
 * 카드 배경과 같은 색이라야 이어져 보이므로 색을 `coachOverlay.cardBg`에 묶는다.
 */
export function CoachTooltipTail({ width = 14, height = 7, ...rest }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 14 7" fill="none" {...rest}>
      <Path d="M7 0L13.0622 5.25H0.9378L7 0Z" fill={coachOverlay.cardBg} />
    </Svg>
  );
}
