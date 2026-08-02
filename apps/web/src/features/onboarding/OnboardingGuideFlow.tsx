import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import {
  GUIDE_CLOSE_LABEL,
  ONBOARDING_GUIDE_STEPS,
  type OnboardingGuideExitReason,
  type OnboardingGuideStep,
} from "./onboardingGuideSteps";
import { CoachNavBar } from "./CoachNavBar";
import { IconClose } from "./coachIcons";
import { SWIPE_THRESHOLD_PX } from "./coachOverlayTheme";
import { CoachTooltip } from "./CoachTooltip";
import { GuidePrivacyCard } from "./GuidePrivacyCard";
import {
  MockBaseLayer,
  MockControlBar,
  MockStatusPillBlock,
  MockTimerBlock,
} from "./SessionMockBackdrop";

/**
 * G1~G5 온보딩 가이드 플로우 (`frontend/docs/screens/SCR-G1-G5-onboarding-guide.md`).
 *
 * **5개 라우트가 아니라 하나의 플로우 + 스텝 인덱스**다. 스텝 데이터(문구·꼬리 방향·강조
 * 대상·배경 상태)는 `onboardingGuideSteps.ts`의 배열 하나로 선언돼 있고 이 컴포넌트는
 * 그것을 그리기만 한다.
 *
 * 이 컴포넌트는 **다음 단계를 직접 호출하지 않는다** — "끝났다"는 사실만 `onFinish`로
 * 넘기고, 카메라 권한 요청·세션 시작은 호출부(`routes/OnboardingGuidePage.tsx`)와
 * `focusStartFlow.ts`가 정한다.
 *
 * ## 레이어 순서 (뒤 → 앞)
 *
 * 1. 검정 단색 배경판 — 장식(BY-151: 사선 밴드·프리뷰 라벨은 제거된 카메라 프리뷰 목업이었다)
 * 2. 컨트롤 바(dim 뒤에 깔리는 스텝일 때) — 장식
 * 3. dim
 * 4. 탭 레이어 — 화면 아무 곳이나 탭하면 다음 스텝
 * 5. 콘텐츠(상태 필 · 툴팁/카드 · 타이머 · G4의 끌어올린 컨트롤 바)
 * 6. 하단 내비게이션(페이저 · 이전 · CTA · 건너뛰기)
 * 7. 우상단 X(나가기) — 자기 탭만 가져간다(BY-151)
 *
 * 5번의 요소들은 `pointer-events-none`이라 탭이 4번으로 흘러가고, 6·7번의 버튼만 자기 탭을
 * 가져간다 — Figma 하단 힌트가 약속한 "화면을 탭해도 넘어가요(버튼 영역 제외)"와 같다.
 *
 * (`apps/mobile/components/onboarding/OnboardingGuideFlow.tsx`에서 이식 — BY-334 온보딩 웹 이관.
 * RN `useSafeAreaInsets()`는 CSS `env(safe-area-inset-*)`로 대체했다. RN `Animated.Value` 기반
 * 스텝 페이드는 CSS `@keyframes coach-step-fade`(`index.css`) + `key={step.id}` 리마운트로
 * 대체했다 — 스텝이 바뀔 때마다 엘리먼트가 새로 마운트되며 애니메이션이 자연히 재생된다.
 *
 * RN판 스와이프는 **캡처 단계** `PanResponder`를 써서 탭 레이어·버튼이 이미 제스처를 잡은
 * 뒤에도 가로 드래그를 가져왔다. DOM 포인터 이벤트에는 그런 가로채기 캡처가 없고, 버튼 위에서
 * 시작한 드래그까지 가로채려 하면 버튼 클릭과 이중 발화할 위험이 커진다.
 * ponytail: 탭 레이어(화면 대부분)에서 시작한 스와이프만 인식한다 — 버튼 위에서 시작한
 * 스와이프까지 필요해지면 캡처 단계 리스너 + 클릭 억제로 승격한다(RN 원본에도 이 경로를 도는
 * 테스트는 없었다).)
 */

/** 비율만 갖는 여백. Figma 절대 좌표에서 뽑은 여백 비를 화면 높이에 맞게 늘린다. */
function FlexSpacer({ flex }: { flex: number }) {
  return (
    <div className="pointer-events-none" style={{ flexGrow: flex, flexShrink: 1, flexBasis: 0 }} />
  );
}

function StepBody({
  step,
  focusSec,
  totalSec,
}: {
  step: OnboardingGuideStep;
  focusSec: number;
  totalSec: number;
}) {
  const timerBlock = (
    <MockTimerBlock
      focusSec={focusSec}
      totalSec={totalSec}
      tone={step.backdrop.focusTimerTone}
      emphasized={step.emphasis === "timer"}
    />
  );

  const coachCard = (
    // key={step.id} — 스텝이 바뀔 때마다 리마운트시켜 페이드 인 애니메이션을 재생한다.
    <div
      key={step.id}
      className="pointer-events-none animate-[coach-step-fade_180ms_ease-out] motion-reduce:animate-none"
    >
      {step.tooltip ? <CoachTooltip {...step.tooltip} /> : null}
      {step.privacyCard ? <GuidePrivacyCard {...step.privacyCard} /> : null}
    </div>
  );

  switch (step.anchor) {
    // G1·G2 — 툴팁이 타이머 바로 위에서 아래를 가리킨다.
    case "above-timer":
      return (
        <>
          {coachCard}
          {/* 간격용 래퍼에도 `pointer-events-none`이 필요하다 — 이게 없으면 래퍼가 히트 테스트
              대상이 되어 탭이 아래 탭 레이어(형제 노드)에 닿지 못한다. */}
          <div className="pointer-events-none mt-[3px]">{timerBlock}</div>
        </>
      );
    // G3 — 타이머가 위, 툴팁이 그 아래에서 위를 가리킨다.
    case "below-timer":
      return (
        <>
          {timerBlock}
          <div className="pointer-events-none mt-[18px]">{coachCard}</div>
        </>
      );
    // G4 — 타이머가 원래 자리(위)에 남고, 오버레이(툴팁 + 끌어올린 컨트롤 바)가 그 아래에
    // 놓인다(2026-07-29 확정 — 구 Figma 배치는 오버레이가 타이머 위였다). 강조는 바 전체가
    // 아니라 일시정지 버튼 주위 파동이다(`MockControlBar` 참고).
    case "above-control-bar":
      return (
        <>
          {timerBlock}
          <div className="pointer-events-none mt-6">{coachCard}</div>
          <MockControlBar emphasized />
        </>
      );
    // G5 — 말풍선 대신 일러스트 카드가 상단에 놓이고 타이머는 원래 자리에 남는다.
    case "privacy-card":
      return (
        <>
          {coachCard}
          <FlexSpacer flex={step.spacing.midFlex} />
          {timerBlock}
        </>
      );
  }
}

export function OnboardingGuideFlow({
  onFinish,
  onExit,
  isReentry,
}: {
  /** 완료·건너뛰기 **둘 다** 여기로 나온다 — 이후 동작은 호출부(플로우 오케스트레이션)가 정한다. */
  onFinish: (reason: OnboardingGuideExitReason) => void;
  /** 우상단 X(나가기) — 세션으로 이어지지 않는 별도 종료 경로(2026-07-28 확정, BY-151). */
  onExit: () => void;
  /**
   * 재진입(홈 카드·설정) 모드인가. 재진입에서는 마지막 CTA가 세션을 시작하지 않고 닫기만
   * 하므로 문구도 "가이드 종료하기"로 바꾼다(2026-07-29 확정) — 문구와 동작의 일치.
   */
  isReentry: boolean;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  const step = ONBOARDING_GUIDE_STEPS[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === ONBOARDING_GUIDE_STEPS.length - 1;

  const goNext = useCallback(() => {
    if (isLastStep) {
      onFinish("completed");
      return;
    }
    setStepIndex((index) => index + 1);
  }, [isLastStep, onFinish]);

  const goPrev = useCallback(() => {
    // ⚠️ G1(첫 스텝)에서 "이전"이 비활성인지·숨김인지·무동작인지는 미정이다. Figma G1에도
    // 버튼이 그대로 그려져 있고 비활성 표현이 따로 없다 — 임의로 정하지 않고 "보이지만 아무
    // 동작 없음"으로 두되 그 사실이 `disabled`로 드러나게 했다.
    // TODO(SCR-G1-G5-onboarding-guide.md Review Checklist): G1 "이전" 처리 확정 필요.
    setStepIndex((index) => Math.max(0, index - 1));
  }, []);

  const skip = useCallback(() => onFinish("skipped"), [onFinish]);

  /**
   * 제스처(탭·스와이프) 전용 "다음" — **G5에서는 무동작이다**(BY-343). `goNext`는 마지막
   * 스텝에서 완료(`onFinish`)로 이어지는데, 종료는 사용자가 문구를 읽고 확정하는 행동이라
   * CTA("집중 시작하기"/"가이드 종료하기")·건너뛰기·X로만 연다 — 화면을 넘기려던 무심한
   * 탭 한 번이 세션 시작(권한 요청)까지 끌고 가면 안 된다. G1 왼쪽 탭 무동작과 대칭 계약.
   */
  const goNextFromGesture = useCallback(() => {
    if (isLastStep) {
      return;
    }
    goNext();
  }, [isLastStep, goNext]);

  // 시연용 로컬 카운터. 스텝이 바뀔 때마다 Figma 시안값에서 다시 출발한다 —
  // 서버에 아무것도 보내지 않고 세션 집계와도 무관하다.
  useEffect(() => {
    setElapsedSec(0);
    const timer = setInterval(() => setElapsedSec((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [stepIndex]);

  // 탭 레이어 스와이프 — 시작점만 기록해 두고 놓는 순간 총 이동량으로 판정한다(RN
  // PanResponder의 캡처+릴리즈 판정을 pointerup 하나로 합친 것 — 위 파일 주석 참고).
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTapLayerPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleTapLayerPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (!start) {
        return;
      }
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const isHorizontalDrag = Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy);
      if (!isHorizontalDrag) {
        // 탭(또는 세로 위주 드래그) — 좌/우 절반으로 방향을 가른다: 왼쪽 탭은 이전, 오른쪽
        // 탭은 다음(BY-343, 스토리형 탐색 관례). 기준은 탭 시작점이다 — 손가락이 12px 안에서
        // 흔들려도 사용자가 누른 자리로 판정한다. 탭 레이어가 `inset-0` 전면이라 화면 폭과
        // 같으므로 `window.innerWidth`로 충분하다. G1에서 왼쪽 탭은 `goPrev`의 기존 계약대로
        // 무동작이다(G1 "이전"과 동일).
        if (start.x < window.innerWidth / 2) {
          goPrev();
          return;
        }
        goNextFromGesture();
        return;
      }
      if (dx <= -SWIPE_THRESHOLD_PX) {
        goNextFromGesture();
        return;
      }
      if (dx >= SWIPE_THRESHOLD_PX) {
        goPrev();
      }
      // 12~48px 사이의 가로 드래그는 스와이프 실패로 보고 아무 동작도 하지 않는다(RN PanResponder와 동일).
    },
    [goNextFromGesture, goPrev],
  );

  const { backdrop } = step;
  const focusSec = backdrop.freezeFocusTimer
    ? // G2 — 순공만 멈추고 총 공부는 계속 흐른다. 이 인과가 G2의 교육 목적 그 자체다.
      backdrop.seedFocusSec
    : backdrop.seedFocusSec + elapsedSec;
  const totalSec = backdrop.seedTotalSec + elapsedSec;

  // `touch-manipulation`(루트 div) — iOS 웹뷰는 `user-scalable=no`여도 더블탭 줌 **인식기**는
  // 계속 돌려서, 빠른 연속 탭의 두 번째 탭이 더블탭 후보로 잡혀 통째로 삼켜진다(탭이 씹히는
  // 증상, BY-343). `manipulation`은 그 인식을 끄되 팬·핀치는 그대로 둔다 — `index.css`가
  // 경고하는 "touch-action을 건드리면 스크롤까지 죽는다"는 `none` 이야기라 해당 없고,
  // 가이드는 스크롤 없는 전면 오버레이라 영향 범위도 이 화면뿐이다.
  return (
    <div className="relative h-svh w-full touch-manipulation overflow-hidden">
      <MockBaseLayer base={backdrop.base} />

      {backdrop.controlBar === "behind-dim" ? (
        <div className="pointer-events-none absolute right-0 bottom-[calc(env(safe-area-inset-bottom)+4px)] left-0">
          <MockControlBar emphasized={false} />
        </div>
      ) : null}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        // dim 값은 시맨틱 토큰이 아니라 세션 오버레이 전용 값이다(스펙 Design Tokens Used).
        style={{ backgroundColor: `rgba(0,0,0,${backdrop.dimOpacity})` }}
      />

      {/* 탭 레이어 — 버튼·하단 힌트를 제외한 영역에서 왼쪽 절반 탭은 이전, 오른쪽 절반 탭은
          다음 스텝으로(BY-343). 버튼이 같은 기능을 이미 접근 가능한 형태로 제공하므로 스크린
          리더에는 노출하지 않는다(RN `accessible={false}` 그대로 옮긴 것 — 그래서 `<button>`이
          아니라 `<div>`다). */}
      <div
        data-testid="onboarding-guide-tap-layer"
        aria-hidden="true"
        onPointerDown={handleTapLayerPointerDown}
        onPointerUp={handleTapLayerPointerUp}
        className="absolute inset-0"
      />

      {/* RN `pointerEvents="box-none"` 이식 — 컨테이너 자신은 탭을 가로채지 않고(탭 레이어로
          흘려보내고) 안의 버튼만 자기 탭을 가져가야 한다. CSS는 `pointer-events`가 자식에게
          상속되므로, 컨테이너를 `none`으로 두고 버튼 래퍼만 `auto`로 되돌린다. */}
      <div className="pointer-events-none relative flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+4px)]">
        {backdrop.statusPill ? (
          <div className="mt-[13px]">
            <MockStatusPillBlock
              pill={backdrop.statusPill}
              emphasized={step.emphasis === "status-pill"}
            />
          </div>
        ) : null}

        <FlexSpacer flex={step.spacing.topFlex} />

        <StepBody step={step} focusSec={focusSec} totalSec={totalSec} />

        <FlexSpacer flex={step.spacing.bottomFlex} />

        <div className="pointer-events-auto">
          <CoachNavBar
            stepIndex={stepIndex}
            ctaLabel={isLastStep && isReentry ? GUIDE_CLOSE_LABEL : step.ctaLabel}
            skippable={step.skippable}
            isFirstStep={isFirstStep}
            onPrev={goPrev}
            onNext={goNext}
            onSkip={skip}
          />
        </div>
      </div>

      {/* 우상단 나가기 — 건너뛰기(생략하고 진행)와 반대 방향의 별도 동작이라 위치도 분리한다. */}
      <button
        type="button"
        onClick={onExit}
        aria-label="가이드 닫기"
        className="absolute top-[calc(env(safe-area-inset-top)+13px)] right-5 flex size-11 items-center justify-center"
      >
        <IconClose />
      </button>
    </div>
  );
}
