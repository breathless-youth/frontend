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
const CROSSFADE_MS = 400;
export const FADE_OUT_MS = 200;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// 네이티브 스플래시와 이어져 보여야 해서 토큰이 아니라 app.json의 expo-splash-screen 값을 그대로 쓴다.
const SPLASH_BACKGROUND = { light: "#f8fafd", dark: "#0d1118" } as const;
const SPLASH_LOGO_SIZE = 240;

/**
 * 콜드 스타트 때 스플래시 바로 뒤에 덮는 목표 문구 화면
 *
 * 배경과 로고를 스플래시와 같게 두고 로고가 사라지는 동안 문구가 나타난다.
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
  const logoOpacity = useSharedValue(1);
  const notifyDone = useEffectEvent(onDone);

  useEffect(() => {
    if (!reduceMotion) {
      // 스플래시 로고가 그 자리에서 문구로 바뀌어 보이게 같은 시간 동안 엇갈려 흐린다.
      const crossfade = { duration: CROSSFADE_MS, easing: EASE_OUT };
      logoOpacity.set(withTiming(0, crossfade));
      goalOpacity.set(withTiming(1, crossfade));
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
  }, [reduceMotion, opacity, goalOpacity, logoOpacity]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const goalStyle = useAnimatedStyle(() => ({ opacity: goalOpacity.get() }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.get() }));

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
      {!reduceMotion && (
        <Animated.View
          className="absolute inset-0 items-center justify-center"
          style={logoStyle}
          testID="launch-goal-logo"
        >
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
      )}
      <Animated.View
        className="absolute inset-0 items-center justify-center"
        style={goalStyle}
        testID="launch-goal-text"
      >
        {/* 시안은 ExtraBold지만 실행마다 폰트를 더 받지 않으려고 이미 로드한 Bold로 그린다. */}
        <Text
          accessibilityElementsHidden
          className="font-sans-bold text-[64px] leading-[76px] text-brand-subtlePressed dark:text-brand-subtlePressed-dark"
          importantForAccessibility="no"
        >
          “
        </Text>
        {/* 따옴표 글리프의 아래 여백 때문에 시안에서 따옴표 박스와 목표 문구가 4pt 겹친다. */}
        <Text
          className="-mt-1 w-[300px] text-center font-sans-bold text-[22px] leading-[26px] text-text-primary dark:text-text-primary-dark"
          numberOfLines={2}
        >
          {launchGoal.goal}
        </Text>
        {launchGoal.nickname !== null && (
          <>
            <View
              className="mt-7 h-[2px] w-5 rounded-[1px] bg-brand-subtlePressed dark:bg-brand-subtlePressed-dark"
              testID="launch-goal-divider"
            />
            <Text className="mt-[10px] font-sans-bold text-[15px] text-text-secondary dark:text-text-secondary-dark">
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
        <Text className="font-sans text-[13px] text-text-tertiary">
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
