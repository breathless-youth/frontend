import { colors } from "@focusmakers/design-tokens";
import { router } from "expo-router";
import { Pressable, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconTabHome, IconTabRecord, IconTabSettings, IconTabSocial } from "./icons";

export type TabId = "home" | "social" | "record" | "settings";

// 순서: 홈 · 소셜 · 기록 · 설정.
const TABS: { id: TabId; label: string; Icon: typeof IconTabHome; href: string }[] = [
  { id: "home", label: "홈", Icon: IconTabHome, href: "/" },
  { id: "social", label: "소셜", Icon: IconTabSocial, href: "/social" },
  { id: "record", label: "기록", Icon: IconTabRecord, href: "/records" },
  { id: "settings", label: "설정", Icon: IconTabSettings, href: "/settings" },
];

type TabBarProps = {
  active?: TabId;
};

export function TabBar({ active = "home" }: TabBarProps) {
  const insets = useSafeAreaInsets();

  // 아이콘 색은 라벨(`dark:text-brand-primary-dark`)과 같은 스킴을 따라야 한다 — 라이트값을
  // 하드코딩하면 다크모드에서 같은 탭의 아이콘과 글자가 서로 다른 파랑이 된다.
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const activeColor = colors.brand.primary[scheme];
  const inactiveColor = colors.text.tertiary[scheme]; // 라이트·다크 동일값이지만 토큰 경유로 통일

  return (
    <View
      className="bg-bg-base dark:bg-bg-base-dark border-border-default dark:border-border-default-dark flex-row border-t px-6 pt-[10px]"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
    >
      {TABS.map(({ id, label, Icon, href }) => {
        const isActive = id === active;
        return (
          <Pressable
            key={id}
            disabled={isActive}
            onPress={() => {
              router.navigate(href);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
            className="min-h-11 flex-1 items-center gap-[3px] pt-[2px]"
          >
            <Icon size={24} color={isActive ? activeColor : inactiveColor} />
            <Text
              className={
                isActive
                  ? "text-brand-primary dark:text-brand-primary-dark text-[11px] font-semibold font-sans"
                  : "text-text-tertiary text-[11px] font-medium font-sans"
              }
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
