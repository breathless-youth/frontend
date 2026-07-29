import { type ReactNode, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";

import {
  type FocusTimerTone,
  formatSessionClock,
  formatTotalStudyClock,
  type MockBackdrop,
  type MockStatusPill,
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

/**
 * 목업 배경 판 — 검정 단색 배경.
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
        },
      ]}
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
          color: focusColor,
          // 발광은 심플 모드에만 있다 — 글자색과 같은 색에서 파생시켜 둘이 어긋나지 않게 한다.
          ...(tone === "simple"
            ? {
                textShadowColor: GUIDE_SIMPLE_TIMER_GLOW,
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
    </View>
  );
}

/**
 * 세션 하단 컨트롤 바 244×80 — 일시정지 · 카메라 전환 · 공부 종료. **표시 전용**(눌리지 않는다).
 * G4의 파동 강조는 바 전체가 아니라 **일시정지 버튼 주위**에만 붙는다(2026-07-29 확정) —
 * 툴팁 본문도 일시정지만 설명하므로 강조 대상과 설명이 일치한다.
 */
export function MockControlBar({ emphasized }: { emphasized: boolean }) {
  return (
    <View
      className="items-center"
      accessibilityElementsHidden={!emphasized}
      importantForAccessibility={emphasized ? "yes" : "no-hide-descendants"}
      pointerEvents="none"
    >
      <View
        className="flex-row items-center justify-center gap-[22px] border px-6 pb-3 pt-4"
        style={{
          width: 244,
          height: 80,
          backgroundColor: coachOverlay.controlBarBg,
          borderColor: coachOverlay.controlBarBorder,
          borderRadius: coachRadius.full,
        }}
      >
        {/* 손잡이 중앙정렬(2026-07-29) — 좌우 풀폭 래퍼의 alignItems로 맞춘다.
            구 방식(left-1/2 + 음수 마진 임의값 클래스)은 좌측으로 치우쳐 보였다. */}
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 5, left: 0, right: 0, alignItems: "center" }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: coachRadius.full,
              backgroundColor: coachOverlay.controlBarHandle,
            }}
          />
        </View>
        <RingOutEmphasis
          active={emphasized}
          color={GUIDE_FOCUS_COLOR}
          borderRadius={coachRadius.full}
        >
          <View
            accessible={emphasized}
            accessibilityLabel={emphasized ? "일시정지 버튼" : undefined}
            className="size-[50px] items-center justify-center"
            style={{
              borderRadius: coachRadius.full,
              backgroundColor: coachOverlay.controlButtonBg,
            }}
          >
            <IconPause />
          </View>
        </RingOutEmphasis>
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
    </View>
  );
}
