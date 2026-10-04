import { softBlue } from "@focusmakers/design-tokens";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { DynamicColorIOS } from "react-native";

import { getActiveTab, setActiveTabRoute, TAB_BY_ROUTE_NAME } from "../lib/activeTab";
import { trackNativeEvent } from "../lib/nativeAnalytics";
import { useTabBarState } from "../lib/tabBarVisibility";

/**
 * iOS 시스템 탭 바
 *
 * iOS 26은 Liquid Glass로, iOS 18 이하는 기본 탭 바로 시스템이 그린다.
 * 아이콘은 Android 커스텀 바와 같은 패스를 검정 템플릿 PNG로 구운 것이라 색은 시스템 tint가 입힌다.
 * 활성 아이콘은 같은 패스의 안쪽을 채운 것이라 모양은 그대로고 색만 반전돼 보인다.
 * 탭 4개는 조건 없이 항상 렌더한다.
 * 실행 중 트리거를 넣고 빼면 네비게이터가 다시 마운트돼 상태를 잃는다.
 */
const TABS = [
  {
    name: "index",
    label: "홈",
    icon: require("../assets/tabs/home.png") as number,
    iconSelected: require("../assets/tabs/home-selected.png") as number,
  },
  {
    name: "social",
    label: "소셜",
    icon: require("../assets/tabs/social.png") as number,
    iconSelected: require("../assets/tabs/social-selected.png") as number,
  },
  {
    name: "records",
    label: "기록",
    icon: require("../assets/tabs/record.png") as number,
    iconSelected: require("../assets/tabs/record-selected.png") as number,
  },
  {
    name: "settings",
    label: "설정",
    icon: require("../assets/tabs/settings.png") as number,
    iconSelected: require("../assets/tabs/settings-selected.png") as number,
  },
] as const;

// 활성·비활성 색은 커스텀 바의 라벨 토큰과 같다.
// DynamicColorIOS라 라이트·다크 전환을 시스템이 처리한다.
const ACTIVE = DynamicColorIOS({
  light: softBlue.tab.labelActive.light,
  dark: softBlue.tab.labelActive.dark,
});
const INACTIVE = DynamicColorIOS({
  light: softBlue.tab.labelInactive.light,
  dark: softBlue.tab.labelInactive.dark,
});

export function NativeTabsLayout() {
  // 탭 바가 웹뷰 바깥이라 전체 화면 라우트와 웹 모달을 웹이 `set-tab-bar`로 알려 줘야 한다.
  const tabBarState = useTabBarState();
  const blocked = tabBarState === "blocked";

  return (
    <NativeTabs
      tintColor={ACTIVE}
      hidden={tabBarState === "hidden"}
      iconColor={{ default: INACTIVE, selected: ACTIVE }}
      labelStyle={{
        default: { color: INACTIVE, fontFamily: "PretendardLight", fontSize: 11 },
        selected: { color: ACTIVE, fontFamily: "PretendardLight", fontSize: 11 },
      }}
      screenListeners={({ route }) => ({
        // 네이티브 누름은 JUMP_TO보다 먼저 오므로 getActiveTab()이 아직 출발 탭이다.
        tabPress: (event) => {
          if (event.data.isPrevented) {
            return;
          }
          const tab = TAB_BY_ROUTE_NAME[route.name];
          const fromTab = getActiveTab();
          // 활성 탭을 다시 누르는 것은 탭 이동이 아니다.
          // 커스텀 바도 활성 탭을 눌리지 않게 뒀다.
          if (tab === undefined || tab === fromTab) {
            return;
          }
          trackNativeEvent("tab_pressed", { tab, from_tab: fromTab, via: "tab_bar" });
        },
        // 브리지 핸들러가 `navigate-tab`의 출발 탭을 읽을 수 있게 모듈 스코프에 기록한다(`lib/activeTab.ts`).
        state: (event) => {
          const state = event.data.state;
          setActiveTabRoute(state.routes[state.index]?.name ?? "index");
        },
      })}
    >
      {/* 자동 인셋 조정 끔
          켜 두면 첫 자식 사슬에서 찾은 웹뷰 스크롤 뷰의 인셋 조정이 never에서 automatic으로 바뀐다.
          그러면 웹이 CSS로 넣은 안전 영역 여백 위에 인셋이 한 번 더 붙는다.
          첫 자식이 스플래시인지 웹뷰인지에 따라 탭마다 결과가 달라지기도 한다. */}
      {TABS.map((tab) => (
        <NativeTabs.Trigger
          key={tab.name}
          name={tab.name}
          disabled={blocked}
          disableAutomaticContentInsets
        >
          <NativeTabs.Trigger.Icon
            src={{ default: tab.icon, selected: tab.iconSelected }}
            renderingMode="template"
          />
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
