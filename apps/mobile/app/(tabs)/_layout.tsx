import { useIsFocused } from "@react-navigation/native";
import { Tabs } from "expo-router";
import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

import { TabBar } from "../../components/TabBar";
import { setActiveTabRoute, TAB_BY_ROUTE_NAME } from "../../lib/activeTab";
import { trackNativeEvent } from "../../lib/nativeAnalytics";
import { emitTabReset, tabResetTargetForBack } from "../../lib/tabReset";
import { useTabBarVisible } from "../../lib/tabBarVisibility";

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
  // tabBar render prop이 내비게이터 상태를 받을 때마다 갱신한다 — BackHandler 콜백이 등록
  // 시점이 아니라 눌린 시점의 활성 탭을 읽게 하기 위해서다.
  const activeRouteRef = useRef("index");
  // 탭 위에 다른 네이티브 화면(권한 안내·솔로 세션)이 떠 있으면 뒤로가기는 그 화면 몫이다 —
  // 그때 초기화 신호를 보내면 보이지도 않는 탭 웹뷰가 리셋된다.
  const isFocused = useIsFocused();

  // 시스템 뒤로가기로 탭을 떠날 때 그 탭 웹뷰를 탭 루트로 초기화한다(`lib/tabReset.ts`).
  // 기본 동작(홈 탭 이동, 홈에서는 앱 종료)은 그대로 둔다 — false 반환. 소셜룸 세션 중에는
  // RemoteScreen의 잠금 핸들러가 나중에 등록되어 먼저 소비하므로 여기까지 오지 않는다.
  useEffect(() => {
    if (Platform.OS !== "android" || !isFocused) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const target = tabResetTargetForBack(activeRouteRef.current);
      if (target !== null) {
        // 홈이 아닌 탭에서의 뒤로가기는 홈 탭 이동이다 — 탭 바 터치와 같은 사건이라 `tab_pressed`로
        // 세고 경로만 가른다(홈 탭에서는 앱 종료라 탭 이동이 아니고 이벤트도 없다).
        trackNativeEvent("tab_pressed", {
          tab: "home",
          from_tab: TAB_BY_ROUTE_NAME[activeRouteRef.current] ?? "home",
          via: "hardware_back",
        });
        emitTabReset(target);
      }
      return false;
    });
    return () => subscription.remove();
  }, [isFocused]);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      // 활성 탭은 네비게이터 상태에서 읽는다 — 화면마다 하드코딩하지 않는다.
      tabBar={({ state }) => {
        activeRouteRef.current = state.routes[state.index]?.name ?? "index";
        // 브리지 핸들러가 `navigate-tab`의 출발 탭을 읽을 수 있게 모듈 스코프에도 기록한다(`lib/activeTab.ts`).
        setActiveTabRoute(activeRouteRef.current);
        return tabBarVisible ? (
          <TabBar active={TAB_BY_ROUTE_NAME[activeRouteRef.current] ?? "home"} />
        ) : null;
      }}
    >
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="social" options={{ title: "소셜" }} />
      <Tabs.Screen name="records" options={{ title: "기록" }} />
      <Tabs.Screen name="settings" options={{ title: "설정" }} />
    </Tabs>
  );
}
