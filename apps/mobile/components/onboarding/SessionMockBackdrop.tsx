import { type ReactNode, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";

import {
  formatSessionClock,
  formatTotalStudyClock,
  type MockBackdrop,
  type MockStatusPill,
  MOCK_PRIVACY_CAPTION,
} from "../../lib/onboardingGuideSteps";
import { IconCameraFlip, IconExit, IconPause } from "./coachIcons";
import {
  coachMotion,
  coachOverlay,
  coachRadius,
  coachTokenColors,
  GUIDE_DISTRACT_BORDER,
  GUIDE_DISTRACT_COLOR,
  GUIDE_FOCUS_COLOR,
} from "./coachOverlayTheme";

/**
 * 온보딩 가이드 배경의 **세션 화면 목업** — Figma `Session / Camera Preview BG`(58:109),
 * `Session / Status Pill`(34:14), `Session / Control Bar`(34:32).
 *
 * ## 이것이 하지 않는 것
 *
 * - **카메라를 켜지 않는다.** 가이드는 카메라 권한 요청(S2-2)보다 먼저 실행되므로 배경은
 *   실제 프리뷰일 수 없다. Figma 컴포넌트 설명도 "목업 배경"이라고 명시한다.
 *   이 파일에 카메라·권한·Vision·WebView·LiveKit 코드는 들어가지 않는다.
 * - **실제 세션 컴포넌트를 재사용하지 않는다.** 진짜 세션 화면(S3-1~S3-8)은 `apps/web`이
 *   구현하며 두 앱은 컴포넌트를 공유하지 않는다(ADR 0001).
 * - **집계하지 않는다.** 타이머는 시연용 로컬 카운터이고 서버에 아무것도 보내지 않는다.
 *
 * ## 접근성
 *
 * 배경은 dim 아래의 장식이라 스크린 리더에서 제외한다. 단 **그 스텝의 강조 대상만은 예외로**
 * 읽히게 한다 — 툴팁이 무엇을 가리키는지 시각에 의존하지 않고 알아야 하기 때문이다.
 *
 * ⚠️ 글래스(배경 블러) 효과는 재현하지 못했다. Figma 변수 `blur/glass-strong`(radius 14)·
 * `blur/glass-soft`(radius 10)에 해당하는데 RN 코어에는 배경 블러가 없고 `expo-blur`는
 * 설치돼 있지 않다 — 새 의존성을 추측으로 추가하지 않는다(루트 CLAUDE.md). 블러 아래에 깔리는
 * 반투명 배경색만 그대로 쓴다. 장식 레이어라 정보 손실은 없다.
 */

/** 시스템 "동작 줄이기"가 켜져 있으면 반복 애니메이션을 시작하지 않는다. */
function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => {
        // 조회 실패 시에는 기본값(false)을 유지한다 — 장식 애니메이션이라 영향이 없다.
      });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

/**
 * 강조 대상을 감싸는 링 확산 페이드(ringOut) — `design.md` "상태 필은 링 확산 페이드로 강조".
 * duration/easing은 확정값이 아니다(`coachMotion` 주석 참고).
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
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduceMotion) {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: coachMotion.ringOutDurationMs,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      progress.setValue(0);
    };
  }, [active, reduceMotion, progress]);

  return (
    <View>
      {children}
      {active && !reduceMotion ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderWidth: 2,
              borderColor: color,
              borderRadius,
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, coachMotion.ringOutScale],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const STRIPE_COUNT = 12;

/**
 * 목업 배경 판 — 베이스 색 + 사선 라이트 밴드 + 프리뷰 라벨.
 * dim보다 뒤에 깔리는 순수 장식이라 스크린 리더에서 통째로 제외한다.
 */
export function MockBaseLayer({ base }: { base: MockBackdrop["base"] }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor:
            base === "simple" ? coachOverlay.mockSimpleBg : coachOverlay.mockCameraBg,
          overflow: "hidden",
        },
      ]}
    >
      {base === "camera" ? (
        <>
          {Array.from({ length: STRIPE_COUNT }, (_, index) => (
            <View
              key={index}
              style={{
                position: "absolute",
                top: -300,
                left: -560 + index * 110,
                width: 55,
                height: 1500,
                backgroundColor: coachOverlay.mockStripe,
                transform: [{ rotate: "-45deg" }],
              }}
            />
          ))}
          <Text
            style={{
              position: "absolute",
              top: "55%",
              width: "100%",
              textAlign: "center",
              fontSize: 12,
              lineHeight: 14,
              letterSpacing: 2,
              color: coachOverlay.mockPreviewLabel,
            }}
          >
            [ 전 면 카 메 라 프 리 뷰 ]
          </Text>
          {/* 위 라벨은 Figma 목업의 "여기가 카메라 자리"라는 표시다 — 실제 프리뷰가 아니다. */}
        </>
      ) : null}
    </View>
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
    <View
      className="items-center"
      // 강조 대상이 아닐 때는 dim 아래 장식과 같은 취급 — 스크린 리더에서 제외한다.
      accessibilityElementsHidden={!emphasized}
      importantForAccessibility={emphasized ? "yes" : "no-hide-descendants"}
      pointerEvents="none"
    >
      <RingOutEmphasis active={emphasized} color={accent} borderRadius={coachRadius.full}>
        <View
          accessible={emphasized}
          accessibilityLabel={emphasized ? pill.label : undefined}
          className="flex-row items-center gap-2 border px-4 py-[9px]"
          style={{
            backgroundColor: isDistract ? coachOverlay.pillBgDistract : coachOverlay.pillBgFocus,
            borderColor: isDistract ? GUIDE_DISTRACT_BORDER : coachOverlay.pillBorderFocus,
            borderRadius: coachRadius.full,
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
          <Text className="text-[14px] font-medium leading-[18px] text-white">{pill.label}</Text>
        </View>
      </RingOutEmphasis>

      {pill.subLabel ? (
        <Text
          className="mt-2 text-center text-[12px] leading-[14px]"
          style={{ color: coachOverlay.mockCaption }}
        >
          {pill.subLabel}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * 순공 타이머 + 총 공부 병기 + 프라이버시 캡션.
 * 숫자는 `tabular-nums`로 고정폭 — 초가 바뀔 때 좌우로 흔들리지 않게 한다.
 */
export function MockTimerBlock({
  focusSec,
  totalSec,
  showCaption,
  simple,
  emphasized,
}: {
  focusSec: number;
  totalSec: number;
  showCaption: boolean;
  /** 심플 모드(G3) — 타이머가 발광 블루가 된다. */
  simple: boolean;
  emphasized: boolean;
}) {
  const clock = formatSessionClock(focusSec);
  const total = formatTotalStudyClock(totalSec);

  return (
    <View
      className="items-center"
      accessibilityElementsHidden={!emphasized}
      importantForAccessibility={emphasized ? "yes" : "no-hide-descendants"}
      pointerEvents="none"
      accessible={emphasized}
      // 숫자만 읽히면 무엇을 가리키는지 알 수 없다 — 의미를 붙여 한 덩어리로 읽게 한다.
      accessibilityLabel={emphasized ? `순공시간 ${clock}, ${total}` : undefined}
    >
      <Text
        style={{
          fontSize: 52,
          lineHeight: 60,
          fontWeight: "700",
          letterSpacing: -0.5,
          textAlign: "center",
          fontVariant: ["tabular-nums"],
          color: simple ? coachTokenColors.privacyIllustAccent : coachOverlay.mockTimer,
          ...(simple
            ? {
                textShadowColor: "rgba(69,147,252,0.55)",
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 24,
              }
            : null),
        }}
      >
        {clock}
      </Text>
      <Text
        className="mt-1.5 text-[15px] font-medium leading-[18px]"
        style={{ color: coachOverlay.mockTotal, fontVariant: ["tabular-nums"] }}
      >
        {total}
      </Text>
      {showCaption ? (
        <Text
          className="mt-2 text-[12px] leading-[14px]"
          style={{ color: coachOverlay.mockCaption }}
        >
          {MOCK_PRIVACY_CAPTION}
        </Text>
      ) : null}
    </View>
  );
}

/** 세션 하단 컨트롤 바 244×80 — 일시정지 · 카메라 전환 · 공부 종료. **표시 전용**(눌리지 않는다). */
export function MockControlBar({ emphasized }: { emphasized: boolean }) {
  return (
    <View
      className="items-center"
      accessibilityElementsHidden={!emphasized}
      importantForAccessibility={emphasized ? "yes" : "no-hide-descendants"}
      pointerEvents="none"
    >
      <RingOutEmphasis
        active={emphasized}
        color={GUIDE_FOCUS_COLOR}
        borderRadius={coachRadius.full}
      >
        <View
          accessible={emphasized}
          accessibilityLabel={
            emphasized ? "일시정지, 카메라 전환, 공부 종료 버튼이 모인 하단 바" : undefined
          }
          className="flex-row items-center justify-center gap-[22px] overflow-hidden border px-6 pb-3 pt-4"
          style={{
            width: 244,
            height: 80,
            backgroundColor: coachOverlay.controlBarBg,
            borderColor: coachOverlay.controlBarBorder,
            borderRadius: coachRadius.full,
          }}
        >
          <View
            className="absolute left-1/2 top-[5px] -ml-[18px]"
            style={{
              width: 36,
              height: 4,
              borderRadius: coachRadius.full,
              backgroundColor: coachOverlay.controlBarHandle,
            }}
          />
          <View
            className="size-[50px] items-center justify-center"
            style={{
              borderRadius: coachRadius.full,
              backgroundColor: coachOverlay.controlButtonBg,
            }}
          >
            <IconPause />
          </View>
          <View
            className="size-[50px] items-center justify-center"
            style={{
              borderRadius: coachRadius.full,
              backgroundColor: coachOverlay.controlButtonBg,
            }}
          >
            <IconCameraFlip />
          </View>
          <View
            className="size-[50px] items-center justify-center"
            style={{
              borderRadius: coachRadius.full,
              backgroundColor: coachTokenColors.exitButton,
            }}
          >
            <IconExit />
          </View>
        </View>
      </RingOutEmphasis>
    </View>
  );
}
