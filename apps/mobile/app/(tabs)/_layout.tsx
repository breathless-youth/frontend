import { Tabs } from "expo-router";

import { TabBar } from "../../components/TabBar";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={() => <TabBar active="home" />}>
      <Tabs.Screen name="index" options={{ title: "홈" }} />
    </Tabs>
  );
}
