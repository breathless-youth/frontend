import { render } from "@testing-library/react-native";
import { BackHandler, Platform } from "react-native";

import TabsLayout from "../app/(tabs)/_layout";

import { subscribeTabReset } from "../lib/tabReset";

/**
 * 탭 레이아웃의 뒤로가기 배선 — 판정 로직 자체는 `lib/__tests__/tabReset.test.ts`가 고정하고,
 * 여기서는 **그 판정이 실제로 연결됐는지**만 본다(핸들러 등록, 활성 탭 반영, 기본 동작 유지).
 *
 * expo-router `Tabs`는 내비게이터 전체를 끌고 오므로 tabBar render prop을 즉시 호출하는
 * 최소 스텁으로 대체한다 — 활성 탭이 그 prop을 통해 들어오는 것이 이 배선의 계약이다.
 */

const mockTabBarState = { index: 0, routes: [{ name: "index" }] as { name: string }[] };

jest.mock("expo-router", () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */
  const ReactModule = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */

  function Tabs({ tabBar }: { tabBar: (props: { state: typeof mockTabBarState }) => unknown }) {
    return ReactModule.createElement(View, null, tabBar({ state: mockTabBarState }) as never);
  }
  Tabs.Screen = function TabsScreen() {
    return null;
  };
  return { Tabs };
});

jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));

// 탭 바 자체는 SafeAreaProvider를 요구하고 여기서 볼 대상도 아니다 — 렌더만 되게 비운다.
jest.mock("../components/TabBar", () => ({
  TabBar: function MockTabBar() {
    return null;
  },
}));

/** 등록된 hardwareBackPress 핸들러를 꺼내 눌린 것처럼 호출한다. */
function pressHardwareBack(): boolean | undefined {
  const addListener = BackHandler.addEventListener as jest.Mock;
  const handler = addListener.mock.calls.at(-1)?.[1] as (() => boolean) | undefined;
  return handler?.();
}

beforeEach(() => {
  mockTabBarState.routes = [{ name: "index" }];
  mockTabBarState.index = 0;
  jest
    .spyOn(BackHandler, "addEventListener")
    .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
      typeof BackHandler.addEventListener
    >);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("Android에서 홈이 아닌 탭에 있을 때 뒤로가기를 누르면 그 탭의 초기화 신호가 나간다", () => {
  jest.replaceProperty(Platform, "OS", "android");
  mockTabBarState.routes = [{ name: "index" }, { name: "settings" }];
  mockTabBarState.index = 1;
  const listener = jest.fn();
  const unsubscribe = subscribeTabReset(listener);

  render(<TabsLayout />);
  const handled = pressHardwareBack();

  expect(listener).toHaveBeenCalledWith("/settings");
  // 기본 동작(홈 탭 이동)은 그대로 둔다 — 신호만 보내고 이벤트를 삼키지 않는다.
  expect(handled).toBe(false);
  unsubscribe();
});

it("홈 탭에서는 초기화 신호를 보내지 않는다 — 뒤로가기가 앱 종료다", () => {
  jest.replaceProperty(Platform, "OS", "android");
  const listener = jest.fn();
  const unsubscribe = subscribeTabReset(listener);

  render(<TabsLayout />);
  pressHardwareBack();

  expect(listener).not.toHaveBeenCalled();
  unsubscribe();
});

it("iOS에서는 뒤로가기 핸들러를 등록하지 않는다", () => {
  jest.replaceProperty(Platform, "OS", "ios");

  render(<TabsLayout />);

  expect(BackHandler.addEventListener).not.toHaveBeenCalled();
});
