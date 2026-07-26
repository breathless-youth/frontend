import { colors } from "@focuson/design-tokens";
import { router } from "expo-router";
import { Pressable, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconTabHome, IconTabRecord, IconTabSettings } from "./icons";

type TabId = "home" | "record" | "settings";

/** `href`가 `null`인 탭은 아직 라우트가 없다 — 표시만 하고 누를 수 없다. */
const TABS: { id: TabId; label: string; Icon: typeof IconTabHome; href: string | null }[] = [
  { id: "home", label: "홈", Icon: IconTabHome, href: "/" },
  { id: "record", label: "기록", Icon: IconTabRecord, href: "/records" },
  { id: "settings", label: "설정", Icon: IconTabSettings, href: null },
];

type TabBarProps = {
  active?: TabId;
};

/**
 * S1 Figma의 Navigation/Tab Bar(node 36:48). 홈과 기록(S5)이 실제 라우트다 —
 * 설정(S6)은 아직 화면이 없어 확정된 3탭 IA를 시각적으로 보여주기 위해 표시만 하고 탭해도 아무
 * 동작을 하지 않는다(존재하지 않는 라우트로 이동 시도 금지, SCR-S1-home.md 참고).
 * S6 구현 시 `TABS`의 `href`만 채우면 된다.
 *
 * 아이콘은 SVG라 활성/비활성을 색상 prop으로 처리한다(상태별 이미지 파일 불필요).
 */
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
            disabled={href === null || isActive}
            onPress={() => {
              if (href !== null) {
                router.navigate(href);
              }
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
                  ? "text-brand-primary dark:text-brand-primary-dark text-[11px] font-semibold"
                  : "text-text-tertiary text-[11px] font-medium"
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
