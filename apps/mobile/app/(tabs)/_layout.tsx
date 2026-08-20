import { Tabs } from "expo-router";

import { TabBar, type TabId } from "../../components/TabBar";
import { useTabBarVisible } from "../../lib/tabBarVisibility";

/** expo-router 라우트 이름 → 탭 바 아이템 id. 확정 4탭(BY-409에서 소셜 추가)이 모두 실재하는 라우트다. */
const TAB_BY_ROUTE_NAME: Record<string, TabId> = {
  index: "home",
  social: "social",
  records: "record",
  settings: "settings",
};

export default function TabsLayout() {
  /**
   * 전체 화면 웹 라우트(온보딩 가이드 G1~G5·문의·약관·방침)에서는 탭 바를 감춘다 — 그 화면들은
   * 탭 웹뷰 **안에서** 웹 라우팅으로 열려 네이티브 스택을 건너므로, 웹이 `set-tab-bar`로
   * 알려주지 않으면 탭 바가 그대로 남는다(Figma G1~G5에는 탭 바가 없다).
   *
   * `null`을 돌려 **자리까지 없앤다** — 숨기기만 하면 빈 여백이 남아 가이드가 화면 끝까지
   * 차지하지 못한다.
   */
  const tabBarVisible = useTabBarVisible();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      // 활성 탭은 네비게이터 상태에서 읽는다 — 화면마다 하드코딩하지 않는다.
      tabBar={({ state }) =>
        tabBarVisible ? (
          <TabBar active={TAB_BY_ROUTE_NAME[state.routes[state.index]?.name ?? ""] ?? "home"} />
        ) : null
      }
    >
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="social" options={{ title: "소셜" }} />
      <Tabs.Screen name="records" options={{ title: "기록" }} />
      <Tabs.Screen name="settings" options={{ title: "설정" }} />
    </Tabs>
  );
}
