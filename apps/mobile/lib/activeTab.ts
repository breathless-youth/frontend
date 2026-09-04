import type { NativeTab } from "./nativeAnalytics";

/**
 * 지금 활성인 하단 탭 — 탭 레이아웃(`app/(tabs)/_layout.tsx`)이 내비게이터 상태를 받을 때마다
 * 기록하고, React 트리 밖의 순수 함수(`lib/nativeBridgeHandler.ts`)가 읽는다.
 *
 * 필요한 이유: 웹이 `navigate-tab`으로 탭을 옮길 때(홈 연속 공부 카드 → 기록)도 사용자에겐 탭
 * 이동이라 `tab_pressed {via: "card"}`로 세는데, 공용 브리지 핸들러는 어느 탭에서 왔는지 모른다.
 * `tabBarVisibility`·`tabReset`과 같은 모듈 스코프 통로다.
 */

/** expo-router 라우트 이름 → 탭 id. 확정 4탭(BY-409에서 소셜 추가)이 모두 실재하는 라우트다. */
export const TAB_BY_ROUTE_NAME: Record<string, NativeTab> = {
  index: "home",
  social: "social",
  records: "record",
  settings: "settings",
};

let activeTab: NativeTab = "home";

/** 탭 내비게이터의 현재 라우트 이름을 기록한다. 모르는 라우트는 무시한다(직전 값 유지). */
export function setActiveTabRoute(routeName: string): void {
  const tab = TAB_BY_ROUTE_NAME[routeName];
  if (tab !== undefined) {
    activeTab = tab;
  }
}

export function getActiveTab(): NativeTab {
  return activeTab;
}

/** 테스트 전용: 기본값(홈)으로 되돌린다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetActiveTabForTests(): void {
  activeTab = "home";
}
