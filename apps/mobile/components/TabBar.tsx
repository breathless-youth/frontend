import { colors, softBlue } from "@focusmakers/design-tokens";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import Reanimated, {
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HomeDateBar } from "./HomeDateBar";
import {
  IconReturnToday,
  IconTabHome,
  IconTabRanking,
  IconTabRecord,
  IconTabSettings,
  IconTabSocial,
} from "./icons";
import { triggerHaptic } from "../lib/haptics";
import {
  isViewingPastDate,
  pressHomePlay,
  returnToToday,
  useHomeDateBar,
} from "../lib/homeDateBar";
import { trackNativeEvent } from "../lib/nativeAnalytics";

export type TabId = "home" | "social" | "record" | "ranking" | "settings";

const TABS: { id: TabId; label: string; Icon: typeof IconTabHome; href: string }[] = [
  { id: "home", label: "홈", Icon: IconTabHome, href: "/" },
  { id: "social", label: "소셜", Icon: IconTabSocial, href: "/social" },
  { id: "record", label: "기록", Icon: IconTabRecord, href: "/records" },
  { id: "ranking", label: "랭킹", Icon: IconTabRanking, href: "/ranking" },
  { id: "settings", label: "설정", Icon: IconTabSettings, href: "/settings" },
];

/**
 * 복귀 페이드 길이 — 웹 시트의 슬라이드(300ms)보다 짧아 시트가 내려가는 동안 함께 나타난다.
 * 숨김은 페이드 없이 즉시다: 시트가 올라오는 순간 자리를 비워야 하고, 사라지는 쪽 페이드는 실기기에서 굼떠 보였다.
 */
const SHOW_FADE_MS = 180;

// iOS 시스템 바처럼 재생 버튼이 오른쪽에서 들어오고 막대가 그만큼 접히거나 펼쳐진다.
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const MORPH_MS = 250;
const BAR_LAYOUT = LinearTransition.duration(MORPH_MS)
  .easing(EASE_IN_OUT)
  .reduceMotion(ReduceMotion.System);
const PLAY_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: 24 }, { scale: 0.9 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }], easing: EASE_OUT },
})
  .duration(MORPH_MS)
  .reduceMotion(ReduceMotion.System);
const PLAY_EXIT = new Keyframe({
  0: { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }] },
  100: { opacity: 0, transform: [{ translateX: 24 }, { scale: 0.9 }], easing: EASE_OUT },
})
  .duration(200)
  .reduceMotion(ReduceMotion.System);

type TabBarProps = {
  active?: TabId;
  // 웹 모달이 열린 blocked 상태 — 탭 바를 덮어 터치를 막는다.
  dimmed?: boolean;
  // 코치마크가 재생 원을 가리키는 동안이라 막대만 덮고 재생 원은 눌리게 둔다.
  dimmedExceptPlay?: boolean;
  /**
   * hidden 상태 — 전체 화면 웹 라우트와 바텀시트. 언마운트하지 않고 즉시 감췄다가 페이드로 되살린다.
   * 떠 있는 바라 자리 걱정이 없고, 마운트/언마운트는 나타날 때 한 프레임 번쩍여 웹 시트 애니메이션과
   * 어긋난다. 보이지 않는 동안 터치를 받지 않고 접근성 트리에서도 빠진다.
   */
  hidden?: boolean;
};

/**
 * Android 하단 플로팅 탭 바
 *
 * iOS는 시스템 탭 바(`NativeTabsLayout`)를 쓰므로 이 컴포넌트는 Android에서만 그려진다.
 * 홈에서는 설정 칸을 빼고 오른쪽에 떨어진 재생 원을 둔다.
 * 선택 표시 알약은 하나만 두고 이전 탭 자리에서 새 자리로 미끄러진다.
 * 홈 날짜 줄은 같은 유리 막대로 탭 바 바로 위에 띄우고, 웹은 그 높이와 간격만큼 본문 끝을 비운다.
 */
export function TabBar({
  active = "home",
  dimmed = false,
  dimmedExceptPlay = false,
  hidden = false,
}: TabBarProps) {
  const barDimmed = dimmed || dimmedExceptPlay;
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const g = softBlue.glass;
  const pillColor = scheme === "light" ? colors.bg.layer2.light : g.activePill.dark;
  // 지연 초기화 — useRef(new …)는 렌더마다 Animated.Value를 만들었다 버린다.
  const [opacity] = useState(() => new Animated.Value(hidden ? 0 : 1));
  const dateBar = useHomeDateBar();
  const hasDateBar = dateBar !== null;
  const returnsToToday = isViewingPastDate(dateBar);
  const onHome = active === "home";
  const dateBarHidden = !onHome || dimmedExceptPlay;
  const dateBarOpacity = useSharedValue(onHome ? 1 : 0);
  useEffect(() => {
    dateBarOpacity.set(
      withTiming(onHome ? 1 : 0, {
        duration: onHome ? MORPH_MS : 150,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [onHome, dateBarOpacity]);
  const dateBarStyle = useAnimatedStyle(() => ({ opacity: dateBarOpacity.get() }));
  const visibleTabs = TABS.filter(({ id }) => !(active === "home" && id === "settings"));
  // 탭 칸 위치를 onLayout으로 측정해 두고, 선택 표시는 그 자리로 transform·width만 움직인다.
  const [layouts, setLayouts] = useState<Partial<Record<TabId, { x: number; width: number }>>>({});
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  // 칸 객체는 onLayout마다 새로 만들어져서 값으로 풀어 의존한다.
  const targetX = layouts[active]?.x;
  const targetWidth = layouts[active]?.width;
  useEffect(() => {
    if (targetX === undefined || targetWidth === undefined) return;
    // 처음 자리 잡을 때는 미끄러지지 않고 바로 놓는다.
    if (pillW.get() === 0) {
      pillX.set(targetX);
      pillW.set(targetWidth);
      return;
    }
    const config = { duration: MORPH_MS, easing: EASE_IN_OUT, reduceMotion: ReduceMotion.System };
    pillX.set(withTiming(targetX, config));
    pillW.set(withTiming(targetWidth, config));
  }, [targetX, targetWidth, pillX, pillW]);
  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillW.get() === 0 ? 0 : 1,
    transform: [{ translateX: pillX.get() }],
    width: pillW.get(),
  }));

  useEffect(() => {
    if (hidden) {
      opacity.stopAnimation();
      opacity.setValue(0);
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: SHOW_FADE_MS, useNativeDriver: true }).start();
  }, [hidden, opacity]);

  return (
    <Animated.View
      testID="tab-bar"
      pointerEvents={hidden ? "none" : "box-none"}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      style={[styles.floatWrap, { bottom: Math.max(insets.bottom, 24), opacity }]}
    >
      {/* 흐름 밖에 띄우고 감싼 뷰가 그 자리를 늘 비워 두어, 날짜 줄이 생기고 사라져도 막대가 감싼 뷰 안에서 움직이지 않는다. */}
      {/* 감싼 뷰 영역 안에 두어야 Android가 가로 끌기를 날짜 줄 스크롤에 넘긴다. */}
      {/* 다른 탭에서도 내리지 않고 숨겨 두어, 홈으로 돌아올 때 날짜 줄을 다시 재고 그리느라 번쩍이지 않는다. */}
      {hasDateBar && (
        <Reanimated.View
          testID="tab-bar-date-bar"
          entering={FadeIn.duration(MORPH_MS).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
          pointerEvents={onHome ? "box-none" : "none"}
          accessibilityElementsHidden={dateBarHidden}
          importantForAccessibility={dateBarHidden ? "no-hide-descendants" : "auto"}
          style={styles.dateBarWrap}
        >
          <Reanimated.View
            testID="tab-bar-date-bar-fade"
            style={[
              styles.dateBarShadow,
              { boxShadow: `0 10px 30px ${g.shadow[scheme]}` },
              dateBarStyle,
            ]}
          >
            <View
              style={[
                styles.dateBarSurface,
                {
                  borderColor: g.border[scheme],
                  backgroundColor: scheme === "dark" ? colors.bg.layer1.dark : colors.bg.base.light,
                },
              ]}
            >
              <HomeDateBar chipHeight={44} />
            </View>
          </Reanimated.View>
        </Reanimated.View>
      )}
      <View style={styles.barRow}>
        {/* 재생 원만 살린 딤에서는 레이아웃 래퍼가 아니라 여기서 막대만 접근성 트리에서 뺀다. 래퍼가 빼면 재생 원도 빠진다. */}
        <Reanimated.View
          layout={BAR_LAYOUT}
          accessibilityElementsHidden={dimmedExceptPlay}
          importantForAccessibility={dimmedExceptPlay ? "no-hide-descendants" : "auto"}
          style={[
            styles.shadowWrap,
            // shadow*는 iOS 전용이고, Android elevation은 배경 없는 뷰에 그림자를 그리지 않는다.
            // boxShadow 하나로 양쪽에 같은 그림자를 그린다.
            { boxShadow: `0 10px 30px ${g.shadow[scheme]}` },
          ]}
        >
          <View style={[styles.surface, { borderColor: g.border[scheme] }]}>
            {/* Android 전용 바라 불투명 배경이다.
                블러는 화면 전체를 찍어 알약과 아이콘까지 번졌다.
                iOS는 시스템 탭 바를 쓴다. */}
            <View
              testID="tab-bar-surface"
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: scheme === "dark" ? colors.bg.layer1.dark : colors.bg.base.light,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[styles.innerHighlight, { backgroundColor: g.innerHighlight[scheme] }]}
            />
            <View style={styles.row}>
              {/* 선택 표시는 탭마다 그리지 않고 하나를 두어 이전 탭에서 미끄러져 온다. */}
              <Reanimated.View
                testID="tab-bar-active-pill"
                pointerEvents="none"
                style={[
                  styles.pill,
                  {
                    backgroundColor: pillColor,
                    ...(scheme === "light" ? { boxShadow: "0 2px 8px rgba(31,42,61,0.1)" } : null),
                  },
                  pillStyle,
                ]}
              />
              {visibleTabs.map(({ id, label, Icon, href }) => {
                const isActive = id === active;
                const labelColor = isActive
                  ? softBlue.tab.labelActive[scheme]
                  : softBlue.tab.labelInactive[scheme];
                return (
                  <Reanimated.View
                    key={id}
                    layout={BAR_LAYOUT}
                    entering={FadeIn.duration(MORPH_MS).reduceMotion(ReduceMotion.System)}
                    exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
                    onLayout={(event) => {
                      const { x, width } = event.nativeEvent.layout;
                      setLayouts((prev) => ({ ...prev, [id]: { x, width } }));
                    }}
                    style={styles.tab}
                  >
                    <Pressable
                      disabled={isActive || barDimmed}
                      onPress={() => {
                        trackNativeEvent("tab_pressed", {
                          tab: id,
                          from_tab: active,
                          via: "tab_bar",
                        });
                        // iOS는 시스템 탭 바가 탭 전환 햅틱을 직접 울려서 이 바에서만 울린다.
                        triggerHaptic("light");
                        router.navigate(href);
                      }}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={label}
                      style={styles.tabPress}
                    >
                      <Icon size={24} color={labelColor} />
                      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
                    </Pressable>
                  </Reanimated.View>
                );
              })}
            </View>
            {barDimmed && (
              <View
                testID="tab-bar-dim"
                style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg.dim[scheme] }]}
              />
            )}
          </View>
        </Reanimated.View>
        {active === "home" && (
          <Reanimated.View entering={PLAY_ENTER} exiting={PLAY_EXIT}>
            {/* 웹 모달이 열린 동안은 막대와 함께 재생도 막고 같은 덮개로 덮는다.
                코치마크는 재생을 가리키므로 dimmedExceptPlay에서는 막지 않는다. */}
            {returnsToToday ? (
              // iOS는 유리 원 위에 tint 화살표를 그려서, 막대와 같은 바탕에 primary 화살표로 맞춘다.
              <Pressable
                disabled={dimmed}
                accessibilityRole="button"
                accessibilityLabel="오늘로 돌아가기"
                onPress={() => {
                  triggerHaptic("light");
                  returnToToday();
                }}
                style={[
                  styles.playButton,
                  styles.returnButton,
                  {
                    borderColor: g.border[scheme],
                    backgroundColor:
                      scheme === "dark" ? colors.bg.layer1.dark : colors.bg.base.light,
                    boxShadow: `0 10px 30px ${g.shadow[scheme]}`,
                  },
                ]}
              >
                <IconReturnToday size={28} color={colors.brand.primary[scheme]} />
              </Pressable>
            ) : (
              <Pressable
                disabled={dimmed}
                accessibilityRole="button"
                accessibilityLabel="순공 시작"
                onPress={() => {
                  triggerHaptic("light");
                  pressHomePlay();
                }}
                style={[styles.playButton, { boxShadow: `0 10px 30px ${g.shadow[scheme]}` }]}
              >
                {/* iOS 재생 버튼과 같은 PNG(primary 원과 흰 재생 아이콘)를 써서 두 플랫폼 모양을 맞춘다. */}
                <Image
                  source={
                    scheme === "dark"
                      ? (require("../assets/tabs/play-disc-dark.png") as number)
                      : (require("../assets/tabs/play-disc.png") as number)
                  }
                  style={styles.playImage}
                />
              </Pressable>
            )}
            {dimmed && (
              <View
                testID="tab-bar-play-dim"
                style={[styles.playDim, { backgroundColor: colors.bg.dim[scheme] }]}
              />
            )}
          </Reanimated.View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 윗자리는 날짜 줄 높이 56과 막대와의 간격 8이고, 비어 있을 때는 box-none이라 아래 웹뷰가 터치를 받는다.
  floatWrap: { position: "absolute", left: 16, right: 16, alignItems: "center", paddingTop: 64 },
  barRow: { width: "100%", maxWidth: 402, flexDirection: "row", gap: 10 },
  dateBarWrap: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
  dateBarShadow: { width: "100%", maxWidth: 402, borderRadius: 999 },
  dateBarSurface: { height: 56, borderRadius: 999, borderWidth: 1, overflow: "hidden", padding: 5 },
  shadowWrap: { flex: 1, borderRadius: 999 },
  playButton: { width: 70, height: 70, borderRadius: 999 },
  playImage: { width: 70, height: 70 },
  returnButton: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
  playDim: { ...StyleSheet.absoluteFill, borderRadius: 999 },
  surface: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    padding: 6,
  },
  innerHighlight: { position: "absolute", top: 0, left: 0, right: 0, height: 1 },
  row: { flexDirection: "row" },
  tab: {
    flex: 1,
    minHeight: 44,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 999,
  },
  pill: { position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 999 },
  tabPress: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: 3 },
  // 폰트 파일 속 이름이 아니라 app/_layout.tsx의 useFonts 등록 키를 써야 iOS와 Android에서 같은 폰트로 풀린다.
  label: { fontSize: 11, fontFamily: "PretendardBold", lineHeight: 13 },
});
