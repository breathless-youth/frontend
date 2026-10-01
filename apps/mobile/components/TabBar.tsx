import { colors, softBlue } from "@focusmakers/design-tokens";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconTabHome, IconTabRecord, IconTabSettings, IconTabSocial } from "./icons";
import { trackNativeEvent } from "../lib/nativeAnalytics";

export type TabId = "home" | "social" | "record" | "settings";

const TABS: { id: TabId; label: string; Icon: typeof IconTabHome; href: string }[] = [
  { id: "home", label: "홈", Icon: IconTabHome, href: "/" },
  { id: "social", label: "소셜", Icon: IconTabSocial, href: "/social" },
  { id: "record", label: "기록", Icon: IconTabRecord, href: "/records" },
  { id: "settings", label: "설정", Icon: IconTabSettings, href: "/settings" },
];

/**
 * 복귀 페이드 길이 — 웹 시트의 슬라이드(300ms)보다 짧아 시트가 내려가는 동안 함께 나타난다.
 * 숨김은 페이드 없이 즉시다: 시트가 올라오는 순간 자리를 비워야 하고, 사라지는 쪽 페이드는 실기기에서 굼떠 보였다.
 */
const SHOW_FADE_MS = 180;

type TabBarProps = {
  active?: TabId;
  // 웹 모달이 열린 blocked 상태 — 탭 바를 덮어 터치를 막는다.
  dimmed?: boolean;
  /**
   * hidden 상태 — 전체 화면 웹 라우트와 바텀시트. 언마운트하지 않고 즉시 감췄다가 페이드로 되살린다.
   * 떠 있는 바라 자리 걱정이 없고, 마운트/언마운트는 나타날 때 한 프레임 번쩍여 웹 시트 애니메이션과
   * 어긋난다. 보이지 않는 동안 터치를 받지 않고 접근성 트리에서도 빠진다.
   */
  hidden?: boolean;
};

export function TabBar({ active = "home", dimmed = false, hidden = false }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const g = softBlue.glass;
  const pillColor = scheme === "light" ? colors.bg.layer2.light : g.activePill.dark;
  // 지연 초기화 — useRef(new …)는 렌더마다 Animated.Value를 만들었다 버린다.
  const [opacity] = useState(() => new Animated.Value(hidden ? 0 : 1));

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
      <View
        style={[
          styles.shadowWrap,
          // shadow*는 iOS 전용이고, Android elevation은 배경 없는 뷰에 그림자를 그리지 않는다.
          // boxShadow 하나로 양쪽에 같은 그림자를 그린다.
          { boxShadow: `0 10px 30px ${g.shadow[scheme]}` },
        ]}
      >
        <View style={[styles.surface, { borderColor: g.border[scheme] }]}>
          {/* 프로스티드 바. 표준 블러이고 iOS26 Liquid Glass는 아니다, 그건 NativeTabs 별도 티켓이다.
              Android 블러는 탭 바가 속한 화면 전체를 찍어 흐리게 해서 알약과 아이콘까지 밑에 번진다.
              대상만 골라 찍는 방법이 이 expo-blur 버전에는 없어 Android는 불투명 배경을 쓴다. */}
          {Platform.OS === "android" ? (
            <View
              testID="tab-bar-surface"
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: scheme === "dark" ? colors.bg.layer1.dark : colors.bg.base.light,
                },
              ]}
            />
          ) : (
            <BlurView
              testID="tab-bar-blur"
              intensity={22}
              tint={scheme === "dark" ? "dark" : "light"}
              style={[StyleSheet.absoluteFill, { backgroundColor: g.surface[scheme] }]}
            />
          )}
          <View
            pointerEvents="none"
            style={[styles.innerHighlight, { backgroundColor: g.innerHighlight[scheme] }]}
          />
          <View style={styles.row}>
            {TABS.map(({ id, label, Icon, href }) => {
              const isActive = id === active;
              const labelColor = isActive
                ? softBlue.tab.labelActive[scheme]
                : softBlue.tab.labelInactive[scheme];
              return (
                <Pressable
                  key={id}
                  disabled={isActive}
                  onPress={() => {
                    trackNativeEvent("tab_pressed", { tab: id, from_tab: active, via: "tab_bar" });
                    router.navigate(href);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={label}
                  style={styles.tab}
                >
                  {isActive && (
                    <View
                      testID="tab-bar-active-pill"
                      pointerEvents="none"
                      style={[
                        styles.pill,
                        {
                          backgroundColor: pillColor,
                          ...(scheme === "light"
                            ? { boxShadow: "0 2px 8px rgba(31,42,61,0.1)" }
                            : null),
                        },
                      ]}
                    />
                  )}
                  <Icon size={24} color={labelColor} />
                  <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {dimmed && (
            <View
              testID="tab-bar-dim"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg.dim[scheme] }]}
            />
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floatWrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  shadowWrap: { width: "100%", borderRadius: 999, maxWidth: 402 },
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
  pill: { ...StyleSheet.absoluteFill, borderRadius: 999 },
  // 폰트 파일 속 이름이 아니라 app/_layout.tsx의 useFonts 등록 키를 써야 iOS와 Android에서 같은 폰트로 풀린다.
  label: { fontSize: 11, fontFamily: "PretendardBold", lineHeight: 13 },
});
