import type { ReactNode } from "react";

import {
  type FocusTimerTone,
  formatSessionClock,
  formatTotalStudyClock,
  type MockBackdrop,
  type MockStatusPill,
} from "./onboardingGuideSteps";
import { IconCameraFlip, IconExit, IconPause } from "./coachIcons";
import {
  coachOverlay,
  coachRadius,
  coachTokenColors,
  GUIDE_DISTRACT_BORDER,
  GUIDE_DISTRACT_COLOR,
  GUIDE_FOCUS_COLOR,
  GUIDE_SIMPLE_TIMER_GLOW,
} from "./coachOverlayTheme";

/** 순공 타이머 색조 → 실제 색. Figma 텍스트 노드 fill과 1:1 대응한다. */
const FOCUS_TIMER_COLORS: Record<FocusTimerTone, string> = {
  active: coachOverlay.mockTimer,
  stopped: coachTokenColors.mockTimerStopped,
  simple: coachTokenColors.privacyIllustAccent,
};

/**
 * 온보딩 가이드 배경의 **세션 화면 목업** — Figma `Session / Camera Preview BG`(58:109),
 * `Session / Status Pill`(34:14), `Session / Control Bar`(34:32).
 *
 * **BY-151 재정의(2026-07-28 팀 확정):** 가이드 배경은 검정 단색이다.
 * 카메라 흉내 사선 밴드·프리뷰 라벨 장식은 제거됐다.
 *
 * ## 이것이 하지 않는 것
 *
 * - **카메라를 켜지 않는다.** 가이드는 카메라 권한 요청(S2-2)보다 먼저 실행되므로 배경은
 *   실제 프리뷰일 수 없다. 이 파일에 카메라·권한·Vision·WebView·LiveKit 코드는 들어가지 않는다.
 * - **실제 세션 컴포넌트를 재사용하지 않는다.** 진짜 세션 화면(S3-1~S3-8)은
 *   `features/study-session`이 구현하며, 이 화면(온보딩 목업)과는 컴포넌트를 공유하지 않는다
 *   (ADR 0001 — 화면끼리 컴포넌트를 공유하지 않는다. `coachIcons.tsx`와 같은 판단).
 * - **집계하지 않는다.** 타이머는 시연용 로컬 카운터이고 서버에 아무것도 보내지 않는다.
 *
 * ## 접근성
 *
 * 배경은 dim 아래의 장식이라 스크린 리더에서 제외한다. 단 **그 스텝의 강조 대상만은 예외로**
 * 읽히게 한다 — 툴팁이 무엇을 가리키는지 시각에 의존하지 않고 알아야 하기 때문이다.
 *
 * ⚠️ 글래스(배경 블러) 효과는 이 파일에서도 재현하지 않는다. Figma 변수 `blur/glass-strong`
 * (radius 14)·`blur/glass-soft`(radius 10)에 해당하는데, RN판은 `expo-blur` 미설치로 못 넣었고
 * (루트 CLAUDE.md "새 의존성을 추측으로 추가하지 않는다"), 웹은 `backdrop-filter`를 네이티브로 쓸
 * 수 있음에도 **이 포팅 범위를 RN 목업의 1:1 이식으로 한정**해 추가하지 않는다 — 블러 아래에
 * 깔리는 반투명 배경색만 그대로 쓴다. 장식 레이어라 정보 손실은 없다.
 *
 * (`apps/mobile/components/onboarding/SessionMockBackdrop.tsx`에서 이식 — BY-334 온보딩 웹 이관.
 * RN `AccessibilityInfo.isReduceMotionEnabled` 폴링 훅은 CSS `prefers-reduced-motion` 미디어쿼리
 * (`motion-reduce:` 유틸)로 대체했다 — JS 훅이 더 이상 필요 없다. RN `accessible` +
 * `accessibilityLabel`(개별 자식을 숨기고 하나로 묶어 읽는 것)은 `role="img"` + 요약
 * `aria-label`로 옮겼다(`StreakBanner`·`StudyTimelineCard`가 세운 관례와 동일).)
 */

/**
 * 강조 대상을 감싸는 링 확산 페이드(ringOut) — `design.md` "상태 필은 링 확산 페이드로 강조".
 * duration/scale은 `coachOverlayTheme.ts`의 `coachMotion`(확정값 아님, 주석 참고) 값을
 * `index.css`의 `coach-ring-out` 키프레임에 그대로 옮겨 적었다 — CSS는 TS를 import할 수 없다.
 * 반복 애니메이션은 `motion-reduce:hidden`으로 시스템 "동작 줄이기"에서 통째로 숨긴다.
 */
function RingOutEmphasis({
  active,
  color,
  borderRadius,
  children,
}: {
  active: boolean;
  color: string;
  borderRadius: number;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      {active ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-[coach-ring-out_1.6s_ease-out_infinite] motion-reduce:hidden"
          style={{ borderWidth: 2, borderColor: color, borderRadius }}
        />
      ) : null}
    </div>
  );
}

/**
 * 목업 배경 판 — 검정 단색 배경.
 * dim보다 뒤에 깔리는 순수 장식이라 스크린 리더에서 통째로 제외한다.
 */
export function MockBaseLayer({ base }: { base: MockBackdrop["base"] }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundColor: base === "simple" ? coachOverlay.mockSimpleBg : coachOverlay.mockCameraBg,
      }}
    />
  );
}

/** 세션 상단 중앙 상태 필. Focus=블루 도트 / Distract=오렌지 도트·오렌지 35% 보더. */
export function MockStatusPillBlock({
  pill,
  emphasized,
}: {
  pill: MockStatusPill;
  emphasized: boolean;
}) {
  const isDistract = pill.state === "distract";
  const accent = isDistract ? GUIDE_DISTRACT_COLOR : GUIDE_FOCUS_COLOR;

  return (
    <div
      className="pointer-events-none flex flex-col items-center"
      // 강조 대상이 아닐 때는 dim 아래 장식과 같은 취급 — 스크린 리더에서 제외한다.
      aria-hidden={emphasized ? undefined : true}
    >
      <RingOutEmphasis active={emphasized} color={accent} borderRadius={coachRadius.full}>
        <div
          role={emphasized ? "img" : undefined}
          aria-label={emphasized ? pill.label : undefined}
          className="flex flex-row items-center gap-2 border px-4 py-[9px]"
          style={{
            backgroundColor: isDistract ? coachOverlay.pillBgDistract : coachOverlay.pillBgFocus,
            borderColor: isDistract ? GUIDE_DISTRACT_BORDER : coachOverlay.pillBorderFocus,
            borderRadius: coachRadius.full,
          }}
        >
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <span className="text-[14px] leading-[18px] font-medium text-white">{pill.label}</span>
        </div>
      </RingOutEmphasis>

      {pill.subLabel ? (
        <p
          className="mt-2 text-center text-[12px] leading-[14px]"
          style={{ color: coachOverlay.mockCaption }}
        >
          {pill.subLabel}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 순공 타이머 + 총 공부 병기.
 * 숫자는 `tabular-nums`로 고정폭 — 초가 바뀔 때 좌우로 흔들리지 않게 한다.
 * 프라이버시 캡션("영상은 기기 안에서만 처리돼요")은 2026-07-29 확정으로 삭제됐다 —
 * 프라이버시 안내는 G5 카드가 전담한다(BY-151).
 */
export function MockTimerBlock({
  focusSec,
  totalSec,
  tone,
  emphasized,
}: {
  focusSec: number;
  totalSec: number;
  /**
   * 순공 타이머 색조. Figma가 텍스트 노드마다 fill을 직접 지정해둔 값이고, 총 공부 줄은
   * 5스텝 모두 같은 색이다 — 순공만 색이 바뀌는 것이 규칙이다(`FocusTimerTone` 참고).
   */
  tone: FocusTimerTone;
  emphasized: boolean;
}) {
  const clock = formatSessionClock(focusSec);
  const total = formatTotalStudyClock(totalSec);
  const focusColor = FOCUS_TIMER_COLORS[tone];

  return (
    <div
      className="pointer-events-none flex flex-col items-center"
      aria-hidden={emphasized ? undefined : true}
      role={emphasized ? "img" : undefined}
      // 숫자만 읽히면 무엇을 가리키는지 알 수 없다 — 의미를 붙여 한 덩어리로 읽게 한다.
      aria-label={emphasized ? `순공시간 ${clock}, ${total}` : undefined}
    >
      <p
        className="text-center text-[52px] leading-[60px] font-bold tracking-[-0.5px] tabular-nums"
        style={{
          color: focusColor,
          // 발광은 심플 모드에만 있다 — 글자색과 같은 색에서 파생시켜 둘이 어긋나지 않게 한다.
          ...(tone === "simple" ? { textShadow: `0 0 24px ${GUIDE_SIMPLE_TIMER_GLOW}` } : null),
        }}
      >
        {clock}
      </p>
      <p
        className="mt-1.5 text-center text-[15px] leading-[18px] font-medium tabular-nums"
        style={{ color: coachOverlay.mockTotal }}
      >
        {total}
      </p>
    </div>
  );
}

/**
 * 세션 하단 컨트롤 바 244×80 — 일시정지 · 카메라 전환 · 공부 종료. **표시 전용**(눌리지 않는다).
 * G4의 파동 강조는 바 전체가 아니라 **일시정지 버튼 주위**에만 붙는다(2026-07-29 확정) —
 * 툴팁 본문도 일시정지만 설명하므로 강조 대상과 설명이 일치한다.
 */
export function MockControlBar({ emphasized }: { emphasized: boolean }) {
  return (
    <div
      className="pointer-events-none flex flex-col items-center"
      aria-hidden={emphasized ? undefined : true}
    >
      <div
        className="relative flex flex-row items-center justify-center gap-[22px] border px-6 pt-4 pb-3"
        style={{
          width: 244,
          height: 80,
          backgroundColor: coachOverlay.controlBarBg,
          borderColor: coachOverlay.controlBarBorder,
          borderRadius: coachRadius.full,
        }}
      >
        {/* 손잡이 중앙정렬(2026-07-29) — 좌우 풀폭 래퍼의 justify-center로 맞춘다.
            구 방식(left-1/2 + 음수 마진 임의값 클래스)은 좌측으로 치우쳐 보였다. */}
        <div className="pointer-events-none absolute top-[5px] right-0 left-0 flex justify-center">
          <div
            className="h-1 w-9 rounded-full"
            style={{ backgroundColor: coachOverlay.controlBarHandle }}
          />
        </div>
        <RingOutEmphasis
          active={emphasized}
          color={GUIDE_FOCUS_COLOR}
          borderRadius={coachRadius.full}
        >
          <div
            role={emphasized ? "img" : undefined}
            aria-label={emphasized ? "일시정지 버튼" : undefined}
            className="flex size-[50px] items-center justify-center"
            style={{
              borderRadius: coachRadius.full,
              backgroundColor: coachOverlay.controlButtonBg,
            }}
          >
            <IconPause />
          </div>
        </RingOutEmphasis>
        <div
          className="flex size-[50px] items-center justify-center"
          style={{
            borderRadius: coachRadius.full,
            backgroundColor: coachOverlay.controlButtonBg,
          }}
        >
          <IconCameraFlip />
        </div>
        <div
          className="flex size-[50px] items-center justify-center"
          style={{
            borderRadius: coachRadius.full,
            backgroundColor: coachTokenColors.exitButton,
          }}
        >
          <IconExit />
        </div>
      </div>
    </div>
  );
}
