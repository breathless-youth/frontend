import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconTabHome, IconTabRecord, IconTabSettings } from "./icons";

type TabId = "home" | "record" | "settings";

const ACTIVE_COLOR = "#1B64DA"; // colors.brand.primary.light
const INACTIVE_COLOR = "#8B95A1"; // colors.text.tertiary

const TABS: { id: TabId; label: string; Icon: typeof IconTabHome }[] = [
  { id: "home", label: "홈", Icon: IconTabHome },
  { id: "record", label: "기록", Icon: IconTabRecord },
  { id: "settings", label: "설정", Icon: IconTabSettings },
];

type TabBarProps = {
  active?: TabId;
};

/**
 * S1 Figma의 Navigation/Tab Bar(node 36:48). 기록·설정 화면(S5·S6)이 아직 구현되지 않아
 * 홈만 실제 라우트다 — 나머지 두 탭은 확정된 3탭 IA를 시각적으로 보여주기 위해 표시만 하고
 * 탭해도 아무 동작을 하지 않는다(존재하지 않는 라우트로 이동 시도 금지, SCR-S1-home.md 참고).
 * S5·S6 구현 시 이 컴포넌트에 실제 네비게이션을 추가한다.
 *
 * 아이콘은 SVG라 활성/비활성을 색상 prop으로 처리한다(상태별 이미지 파일 불필요).
 */
export function TabBar({ active = "home" }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-bg-base dark:bg-bg-base-dark border-border-default dark:border-border-default-dark flex-row border-t px-6 pt-[10px]"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <Pressable
            key={id}
            disabled={id !== "home"}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
            className="min-h-11 flex-1 items-center gap-[3px] pt-[2px]"
          >
            <Icon size={24} color={isActive ? ACTIVE_COLOR : INACTIVE_COLOR} />
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
