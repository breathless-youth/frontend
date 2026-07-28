import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ONBOARDING_GUIDE_STEPS,
  type OnboardingGuideExitReason,
  type OnboardingGuideStep,
} from "../../lib/onboardingGuideSteps";
import { CoachNavBar } from "./CoachNavBar";
import { IconClose } from "./coachIcons";
import { coachMotion, SWIPE_THRESHOLD_PX } from "./coachOverlayTheme";
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
 * 대상·배경 상태)는 `lib/onboardingGuideSteps.ts` 배열 하나로 선언돼 있고 이 컴포넌트는
 * 그것을 그리기만 한다.
 *
 * 이 컴포넌트는 **다음 단계를 직접 호출하지 않는다** — "끝났다"는 사실만 `onFinish`로
 * 넘기고, 카메라 권한 요청(S2-2)·세션 시작은 `lib/focusStartFlow.ts`가 정한다.
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
 * 5번의 요소들은 `pointerEvents="none"`이라 탭이 4번으로 흘러가고, 6·7번의 버튼만 자기 탭을
 * 가져간다 — Figma 하단 힌트가 약속한 "화면을 탭해도 넘어가요(버튼 영역 제외)"와 같다.
 */

/** 비율만 갖는 여백. Figma 절대 좌표에서 뽑은 여백 비를 화면 높이에 맞게 늘린다. */
function FlexSpacer({ flex }: { flex: number }) {
  return <View pointerEvents="none" style={{ flexGrow: flex, flexShrink: 1, flexBasis: 0 }} />;
}

function StepBody({
  step,
  focusSec,
  totalSec,
  fade,
}: {
  step: OnboardingGuideStep;
  focusSec: number;
  totalSec: number;
  fade: Animated.Value;
}) {
  const timerBlock = (
    <MockTimerBlock
      focusSec={focusSec}
      totalSec={totalSec}
      showCaption={step.backdrop.showPrivacyCaption}
      tone={step.backdrop.focusTimerTone}
      emphasized={step.emphasis === "timer"}
    />
  );

  const coachCard = (
    <Animated.View style={{ opacity: fade }} pointerEvents="none">
      {step.tooltip ? <CoachTooltip {...step.tooltip} /> : null}
      {step.privacyCard ? <GuidePrivacyCard {...step.privacyCard} /> : null}
    </Animated.View>
  );

  switch (step.anchor) {
    // G1·G2 — 툴팁이 타이머 바로 위에서 아래를 가리킨다.
    case "above-timer":
      return (
        <>
          {coachCard}
          {/* 간격용 래퍼에도 `pointerEvents="none"`이 필요하다 — 이게 없으면 래퍼가 히트 테스트
              대상이 되어 탭이 아래 탭 레이어(형제 노드)에 닿지 못한다. */}
          <View className="mt-[3px]" pointerEvents="none">
            {timerBlock}
          </View>
        </>
      );
    // G3 — 타이머가 위, 툴팁이 그 아래에서 위를 가리킨다.
    case "below-timer":
      return (
        <>
          {timerBlock}
          <View className="mt-[18px]" pointerEvents="none">
            {coachCard}
          </View>
        </>
      );
    // G4 — Figma는 컨트롤 바를 y756→y409로 끌어올려 dim 위에 얹는 방식으로 강조했다.
    // `design.md`는 같은 스텝을 "바 링 하이라이트 + 위치 힌트 셰브런"으로 서술해 표현이 다르다.
    // 어느 쪽이 확정인지 미확인이라 Figma 방식(끌어올림)으로 두되, 강조 방식은 `emphasis`
    // prop으로 분리돼 있어 링/셰브런으로 확정되면 배치만 교체하면 된다.
    // TODO(SCR-G1-G5-onboarding-guide.md Current Limitations): G4 강조 표현 확정 필요.
    case "above-control-bar":
      return (
        <>
          {coachCard}
          <MockControlBar emphasized />
          <View className="mt-6" pointerEvents="none">
            {timerBlock}
          </View>
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
}: {
  /** 완료·건너뛰기 **둘 다** 여기로 나온다 — 이후 동작은 호출부(플로우 오케스트레이션)가 정한다. */
  onFinish: (reason: OnboardingGuideExitReason) => void;
  /** 우상단 X(나가기) — 세션으로 이어지지 않는 별도 종료 경로(2026-07-28 확정, BY-151). */
  onExit: () => void;
}) {
  const insets = useSafeAreaInsets();
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
    // 동작 없음"으로 두되 그 사실이 `accessibilityState.disabled`로 드러나게 했다.
    // TODO(SCR-G1-G5-onboarding-guide.md Review Checklist): G1 "이전" 처리 확정 필요.
    setStepIndex((index) => Math.max(0, index - 1));
  }, []);

  const skip = useCallback(() => onFinish("skipped"), [onFinish]);

  // 시연용 로컬 카운터. 스텝이 바뀔 때마다 Figma 시안값에서 다시 출발한다 —
  // 서버에 아무것도 보내지 않고 세션 집계와도 무관하다.
  useEffect(() => {
    setElapsedSec(0);
    const timer = setInterval(() => setElapsedSec((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [stepIndex]);

  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    fade.setValue(0);
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: coachMotion.stepFadeMs,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [stepIndex, fade]);

  // 스와이프 이동. `Capture` 쪽에서 판정해야 탭 레이어·버튼이 이미 responder를 잡은 뒤에도
  // 가로 드래그를 가져올 수 있다. 세로 움직임이 더 큰 제스처는 스와이프로 보지 않는다.
  const gestureRef = useRef({ goNext, goPrev });
  gestureRef.current = { goNext, goPrev };
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx <= -SWIPE_THRESHOLD_PX) {
          gestureRef.current.goNext();
          return;
        }
        if (gesture.dx >= SWIPE_THRESHOLD_PX) {
          gestureRef.current.goPrev();
        }
      },
    }),
  ).current;

  const { backdrop } = step;
  const focusSec = backdrop.freezeFocusTimer
    ? // G2 — 순공만 멈추고 총 공부는 계속 흐른다. 이 인과가 G2의 교육 목적 그 자체다.
      backdrop.seedFocusSec
    : backdrop.seedFocusSec + elapsedSec;
  const totalSec = backdrop.seedTotalSec + elapsedSec;

  return (
    <View className="flex-1" {...panResponder.panHandlers}>
      <MockBaseLayer base={backdrop.base} />

      {backdrop.controlBar === "behind-dim" ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 4 }}
        >
          <MockControlBar emphasized={false} />
        </View>
      ) : null}

      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          // dim 값은 시맨틱 토큰이 아니라 세션 오버레이 전용 값이다(스펙 Design Tokens Used).
          { backgroundColor: `rgba(0,0,0,${backdrop.dimOpacity})` },
        ]}
      />

      {/* 탭 레이어 — 버튼·하단 힌트를 제외한 화면 어디를 탭해도 다음 스텝으로. 버튼이 같은
          기능을 이미 접근 가능한 형태로 제공하므로 스크린 리더에는 노출하지 않는다. */}
      <Pressable
        testID="onboarding-guide-tap-layer"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        onPress={goNext}
        style={StyleSheet.absoluteFillObject}
      />

      <View
        pointerEvents="box-none"
        className="flex-1"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 4 }}
      >
        {backdrop.statusPill ? (
          <View className="mt-[13px]" pointerEvents="none">
            <MockStatusPillBlock
              pill={backdrop.statusPill}
              emphasized={step.emphasis === "status-pill"}
            />
          </View>
        ) : null}

        <FlexSpacer flex={step.spacing.topFlex} />

        <StepBody step={step} focusSec={focusSec} totalSec={totalSec} fade={fade} />

        <FlexSpacer flex={step.spacing.bottomFlex} />

        <CoachNavBar
          stepIndex={stepIndex}
          ctaLabel={step.ctaLabel}
          skippable={step.skippable}
          isFirstStep={isFirstStep}
          onPrev={goPrev}
          onNext={goNext}
          onSkip={skip}
        />
      </View>

      {/* 우상단 나가기 — 건너뛰기(생략하고 진행)와 반대 방향의 별도 동작이라 위치도 분리한다. */}
      <Pressable
        onPress={onExit}
        accessibilityRole="button"
        accessibilityLabel="가이드 닫기"
        hitSlop={8}
        style={{
          position: "absolute",
          top: insets.top + 13,
          right: 20,
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconClose />
      </Pressable>
    </View>
  );
}
