import { Tabs } from "expo-router";

import { TabBar, type TabId } from "../../components/TabBar";

/** expo-router 라우트 이름 → 탭 바 아이템 id. 확정 3탭이 모두 실재하는 라우트다. */
const TAB_BY_ROUTE_NAME: Record<string, TabId> = {
  index: "home",
  records: "record",
  settings: "settings",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      // 활성 탭은 네비게이터 상태에서 읽는다 — 화면마다 하드코딩하지 않는다.
      tabBar={({ state }) => (
        <TabBar active={TAB_BY_ROUTE_NAME[state.routes[state.index]?.name ?? ""] ?? "home"} />
      )}
    >
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="records" options={{ title: "기록" }} />
      <Tabs.Screen name="settings" options={{ title: "설정" }} />
    </Tabs>
  );
}
