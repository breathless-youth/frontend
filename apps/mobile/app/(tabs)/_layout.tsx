import { Tabs } from "expo-router";

import { TabBar } from "../../components/TabBar";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      // 활성 탭은 네비게이터 상태에서 읽는다 — 화면마다 하드코딩하지 않는다.
      // S6 설정은 아직 라우트가 없어 등록하지 않는다(탭 바에는 확정 3탭 IA가 그대로 보인다).
      tabBar={({ state }) => (
        <TabBar active={state.routes[state.index]?.name === "records" ? "record" : "home"} />
      )}
    >
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="records" options={{ title: "기록" }} />
    </Tabs>
  );
}
