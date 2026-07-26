import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import iconHome from "../assets/home/icon-tab-home-active.png";
import iconRecord from "../assets/home/icon-tab-record-inactive.png";
import iconSettings from "../assets/home/icon-tab-settings-inactive.png";

type TabId = "home" | "record" | "settings";

const TABS: { id: TabId; label: string; icon: number }[] = [
  { id: "home", label: "홈", icon: iconHome },
  { id: "record", label: "기록", icon: iconRecord },
  { id: "settings", label: "설정", icon: iconSettings },
];

type TabBarProps = {
  active?: TabId;
};

/**
 * S1 Figma의 Navigation/Tab Bar(node 36:48). 기록·설정 화면(S5·S6)이 아직 구현되지 않아
 * 홈만 실제 라우트다 — 나머지 두 탭은 확정된 3탭 IA를 시각적으로 보여주기 위해 표시만 하고
 * 탭해도 아무 동작을 하지 않는다(존재하지 않는 라우트로 이동 시도 금지, SCR-S1-home.md 참고).
 * S5·S6 구현 시 이 컴포넌트에 실제 네비게이션을 추가한다.
 */
export function TabBar({ active = "home" }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-bg-base dark:bg-bg-base-dark border-border-default dark:border-border-default-dark flex-row border-t px-6 pt-[10px]"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            disabled={tab.id !== "home"}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
            className="min-h-11 flex-1 items-center gap-[3px] pt-[2px]"
          >
            <Image source={tab.icon} className="size-6" resizeMode="contain" />
            <Text
              className={
                isActive
                  ? "text-brand-primary dark:text-brand-primary-dark text-[11px] font-semibold"
                  : "text-text-tertiary text-[11px] font-medium"
              }
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
