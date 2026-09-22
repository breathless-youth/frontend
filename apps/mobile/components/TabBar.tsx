import { colors, softBlue } from "@focusmakers/design-tokens";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
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

type TabBarProps = {
  active?: TabId;
  // 웹 모달이 열린 blocked 상태 — 탭 바를 덮어 터치를 막는다.
  dimmed?: boolean;
};

export function TabBar({ active = "home", dimmed = false }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const g = softBlue.glass;

  return (
    // 화면 흐름 밖에 떠 있는다 — 좌우 16, 아래 24(또는 safe area). 그림자는 여기(overflow 없음).
    <View
      pointerEvents="box-none"
      style={[styles.floatWrap, { bottom: Math.max(insets.bottom, 24) }]}
    >
      <View
        style={[
          styles.shadowWrap,
          {
            shadowColor: g.shadow[scheme],
            shadowOpacity: 1,
            shadowRadius: 15,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
          },
        ]}
      >
        <View style={[styles.surface, { borderColor: g.border[scheme] }]}>
          {/* 프로스티드 바 — 표준 블러(iOS26 Liquid Glass 아님, 그건 NativeTabs 별도 티켓).
              Android는 experimentalBlurMethod 없이는 intensity 블러가 안 먹고 backgroundColor만
              보인다 — dimezisBlurView로 실제 블러를 켠다(iOS는 무시). */}
          <BlurView
            testID="tab-bar-blur"
            intensity={22}
            tint={scheme === "dark" ? "dark" : "light"}
            experimentalBlurMethod="dimezisBlurView"
            style={[StyleSheet.absoluteFill, { backgroundColor: g.surface[scheme] }]}
          />
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
                      pointerEvents="none"
                      style={[
                        styles.pill,
                        {
                          backgroundColor: g.activePill[scheme],
                          ...(scheme === "light"
                            ? {
                                shadowColor: "rgba(31,42,61,0.1)",
                                shadowOpacity: 1,
                                shadowRadius: 4,
                                shadowOffset: { width: 0, height: 2 },
                              }
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
    </View>
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
  pill: { ...StyleSheet.absoluteFillObject, borderRadius: 999 },
  // useFonts 등록 키는 app/_layout.tsx 기준 "NanumSquareRoundBold"(하이픈 없음).
  label: { fontSize: 11, fontFamily: "NanumSquareRoundBold", lineHeight: 13 },
});
