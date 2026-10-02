import { Tabs, useIsFocused } from "expo-router";
import { useEffect, useRef } from "react";
import { BackHandler, Platform, View } from "react-native";

import { NativeTabsLayout } from "../../components/NativeTabsLayout";
import { TabBar } from "../../components/TabBar";
import { setActiveTabRoute, TAB_BY_ROUTE_NAME } from "../../lib/activeTab";
import { trackNativeEvent } from "../../lib/nativeAnalytics";
import { emitTabReset, tabResetTargetForBack } from "../../lib/tabReset";
import { useTabBarState } from "../../lib/tabBarVisibility";

/**
 * 하단 탭 레이아웃
 *
 * iOS는 시스템 탭 바(`NativeTabsLayout`)를 쓴다.
 * iOS 26은 Liquid Glass로 그려진다.
 * Android는 V2 커스텀 바(`TabBar`)를 유지한다.
 * Material 3 바는 시안과 다르고 유리 효과의 이점도 없다.
 */
export default function TabsLayout() {
  return Platform.OS === "ios" ? <NativeTabsLayout /> : <CustomTabsLayout />;
}

/** Android 전용 커스텀 탭 바 레이아웃. */
function CustomTabsLayout() {
  /**
   * 전체 화면 웹 라우트(온보딩 가이드 G1~G5·문의·약관·방침)와 바텀시트에서는 탭 바를
   * 감춘다("hidden") — 그 화면들은 탭 웹뷰 **안에서** 웹 라우팅으로 열려 네이티브 스택을
   * 건너므로, 웹이 `set-tab-bar`로 알려주지 않으면 탭 바가 그대로 남는다. V2 탭 바는 웹뷰
   * 위에 떠 있어 자리를 차지하지 않으므로 언마운트하지 않고 `TabBar`가 페이드로 감춘다 —
   * 마운트/언마운트는 나타날 때 한 프레임 번쩍여 웹 시트 애니메이션과 어긋난다(BY-658).
   *
   * 웹 다이얼로그가 열려 있는 동안은 "blocked"다 — 탭 바는 보이는 채 딤으로 덮어 터치만 막는다.
   */
  const tabBarState = useTabBarState();
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
        const blocked = tabBarState === "blocked";
        // 딤은 TabBar 안에서 탭 바를 덮는다. 차단 중엔 래퍼를 접근성 트리에서 함께 빼 스크린리더가
        // 밑 탭 버튼에 닿지 않게 한다. 래퍼는 상태와 무관하게 늘 같은 View다 — 차단일 때만 감싸면
        // 이 자리의 엘리먼트 타입이 바뀌어 TabBar가 리마운트되고, 복귀 페이드 대신 번쩍 나타난다.
        return (
          <View
            accessibilityElementsHidden={blocked}
            importantForAccessibility={blocked ? "no-hide-descendants" : "auto"}
          >
            <TabBar
              active={TAB_BY_ROUTE_NAME[activeRouteRef.current] ?? "home"}
              dimmed={blocked}
              hidden={tabBarState === "hidden"}
            />
          </View>
        );
      }}
    >
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="social" options={{ title: "소셜" }} />
      <Tabs.Screen name="records" options={{ title: "기록" }} />
      <Tabs.Screen name="settings" options={{ title: "설정" }} />
    </Tabs>
  );
}
