import { useEffect, useEffectEvent } from "react";
import { Image, Text, useColorScheme, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { onFirstScreenLoaded } from "../lib/firstScreenLoaded";
import type { LaunchGoal } from "../lib/launchGoal";

// 최대 20자 문구를 한 번 읽을 시간이다.
export const MIN_VISIBLE_MS = 3000;
// 로드 신호를 놓쳐도 사용자가 갇히지 않게 하는 상한이라 최소 노출보다 길어야 한다.
export const MAX_VISIBLE_MS = 5000;
const LOGO_LIFT_MS = 400;
const FADE_IN_MS = 400;
export const FADE_OUT_MS = 200;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// 네이티브 스플래시와 이어져 보여야 해서 토큰이 아니라 app.json의 expo-splash-screen 값을 그대로 쓴다.
const SPLASH_BACKGROUND = { light: "#f8fafd", dark: "#0d1118" } as const;
const SPLASH_LOGO_SIZE = 240;
// 로고 PNG는 투명 여백이 커서 글자 띠(1024 기준 y 455~570)의 아래 끝이 이미지 중앙보다 14pt 아래에 있다.
const LOGO_BAND_BELOW_CENTER = 14;
const LOGO_TEXT_GAP = 32;
// 한 줄 목표, 구분선, 닉네임으로 된 문구 묶음 높이의 절반이다.
const GOAL_BLOCK_HALF_HEIGHT = 35;
/**
 * 로고가 스플래시 자리에서 올라가는 거리
 *
 * 문구 묶음은 화면 정중앙에 있어서 글자 띠 아래와 묶음 위 사이가 간격만큼 되도록 묶음 높이의 절반을 더한다.
 * ponytail: 묶음 높이를 한 줄 목표 기준 고정값으로 두어 두 줄 목표는 간격이 약 19pt, 닉네임이 없으면 약 54pt가 된다.
 * 고정값이 onLayout으로 재고 나서 움직이는 것보다 단순하고 첫 프레임부터 자리가 정해지며, 실기기에서 어색하면 잰 높이로 바꾼다.
 */
export const LOGO_LIFT = LOGO_BAND_BELOW_CENTER + LOGO_TEXT_GAP + GOAL_BLOCK_HALF_HEIGHT;

/**
 * 콜드 스타트 때 스플래시 바로 뒤에 덮는 목표 문구 화면
 *
 * 배경과 로고 첫 자리를 스플래시와 같게 두고 로고를 위로 올린 뒤 문구를 띄운다.
 * 최소 노출이 지나고 첫 웹뷰 로드가 끝나면 걷고, 로드 신호를 놓쳐도 최대 노출에서 걷는다.
 * 걷히기 전 아래 웹뷰를 누르지 못하도록 터치를 막는다.
 */
export function LaunchGoalOverlay({
  launchGoal,
  onDone,
}: {
  launchGoal: LaunchGoal;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(1);
  const goalOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const logoY = useSharedValue(reduceMotion ? -LOGO_LIFT : 0);
  const notifyDone = useEffectEvent(onDone);

  useEffect(() => {
    if (!reduceMotion) {
      // 스플래시에서 로고가 순간이동하지 않게 같은 자리에서 올리고 문구는 그 뒤를 잇는다.
      logoY.set(withTiming(-LOGO_LIFT, { duration: LOGO_LIFT_MS, easing: EASE_OUT }));
      goalOpacity.set(
        withDelay(LOGO_LIFT_MS, withTiming(1, { duration: FADE_IN_MS, easing: EASE_OUT })),
      );
    }
    let minPassed = false;
    let screenLoaded = false;
    let finished = false;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (reduceMotion) {
        notifyDone();
        return;
      }
      opacity.set(withTiming(0, { duration: FADE_OUT_MS, easing: EASE_OUT }));
      // 애니메이션 완료 콜백은 UI 스레드에서 오고 끊길 수도 있어서 같은 길이의 타이머로 끝을 알린다.
      doneTimer = setTimeout(() => notifyDone(), FADE_OUT_MS);
    };
    const minTimer = setTimeout(() => {
      minPassed = true;
      if (screenLoaded) finish();
    }, MIN_VISIBLE_MS);
    const maxTimer = setTimeout(finish, MAX_VISIBLE_MS);
    const unsubscribe = onFirstScreenLoaded(() => {
      screenLoaded = true;
      if (minPassed) finish();
    });
    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      clearTimeout(doneTimer);
      unsubscribe();
    };
  }, [reduceMotion, opacity, goalOpacity, logoY]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const goalStyle = useAnimatedStyle(() => ({ opacity: goalOpacity.get() }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ translateY: logoY.get() }] }));

  return (
    <Animated.View
      accessible
      accessibilityLabel={
        launchGoal.nickname === null
          ? launchGoal.goal
          : `${launchGoal.goal}, ${launchGoal.nickname}`
      }
      className="absolute inset-0"
      style={[{ backgroundColor: SPLASH_BACKGROUND[scheme] }, rootStyle]}
      testID="launch-goal-overlay"
    >
      <View className="absolute inset-0 items-center justify-center">
        <Animated.View style={logoStyle} testID="launch-goal-logo">
          <Image
            resizeMode="contain"
            source={
              scheme === "dark"
                ? (require("../assets/splash-icon-dark.png") as number)
                : (require("../assets/splash-icon.png") as number)
            }
            style={{ width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE }}
          />
        </Animated.View>
      </View>
      <Animated.View
        className="absolute inset-0 items-center justify-center px-[51px]"
        style={goalStyle}
      >
        <Text
          className="text-center font-sans-bold text-[20px] leading-[26px] text-text-primary dark:text-text-primary-dark"
          numberOfLines={2}
        >
          {launchGoal.goal}
        </Text>
        {launchGoal.nickname !== null && (
          <>
            <View
              className="my-3 h-[2px] w-5 bg-brand-subtlePressed dark:bg-brand-subtlePressed-dark"
              testID="launch-goal-divider"
            />
            <Text className="font-sans-bold text-[13px] text-text-secondary dark:text-text-secondary-dark">
              {launchGoal.nickname}
            </Text>
          </>
        )}
      </Animated.View>
      <View
        className="absolute inset-x-0 items-center gap-3"
        style={{ bottom: insets.bottom + 40 }}
      >
        <View className="flex-row gap-[5px]">
          {[0, 1, 2].map((index) => (
            <LoadingDot key={index} index={index} animate={!reduceMotion} />
          ))}
        </View>
        <Text className="font-sans text-[12px] text-text-tertiary">
          오늘 할 공부를 정리하고 있어요
        </Text>
      </View>
    </Animated.View>
  );
}

/** 차례로 깜빡이는 로딩 점 */
function LoadingDot({ index, animate }: { index: number; animate: boolean }) {
  const opacity = useSharedValue(animate ? 0.3 : 1);

  useEffect(() => {
    if (!animate) return;
    opacity.set(
      withDelay(
        index * 150,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 300, easing: EASE_OUT }),
            withTiming(0.3, { duration: 300, easing: EASE_OUT }),
          ),
          -1,
        ),
      ),
    );
  }, [animate, index, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      className="h-[6px] w-[6px] rounded-full bg-brand-primary dark:bg-brand-primary-dark"
      style={style}
    />
  );
}
