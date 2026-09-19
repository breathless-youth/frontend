import { render } from "@testing-library/react-native";
import { BackHandler, Platform } from "react-native";

import TabsLayout from "../app/(tabs)/_layout";

import { __resetActiveTabForTests, getActiveTab } from "../lib/activeTab";
import { __resetNativeAnalyticsForTests, attachNativeAnalyticsSink } from "../lib/nativeAnalytics";
import { __resetTabBarVisibilityForTests, setTabBarState } from "../lib/tabBarVisibility";
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

// 탭 바 자체는 SafeAreaProvider를 요구하고 여기서 볼 대상도 아니다 — 렌더만 되는 자리표시자로
// 대체한다. testID를 갖는 View라야 "차단이면 탭 바가 남고, 숨김이면 사라진다"를 증명할 수 있다.
jest.mock("../components/TabBar", () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */
  const ReactModule = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */

  return {
    TabBar: function MockTabBar() {
      return ReactModule.createElement(View, { testID: "tab-bar" });
    },
  };
});

/** 등록된 hardwareBackPress 핸들러를 꺼내 눌린 것처럼 호출한다. */
function pressHardwareBack(): boolean | undefined {
  const addListener = BackHandler.addEventListener as jest.Mock;
  const handler = addListener.mock.calls.at(-1)?.[1] as (() => boolean) | undefined;
  return handler?.();
}

beforeEach(() => {
  mockTabBarState.routes = [{ name: "index" }];
  mockTabBarState.index = 0;
  __resetTabBarVisibilityForTests();
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

it("내비게이터 상태의 활성 탭을 모듈 스코프에 기록한다 — 브리지 핸들러가 navigate-tab의 출발 탭으로 읽는다", () => {
  __resetActiveTabForTests();
  mockTabBarState.routes = [{ name: "index" }, { name: "records" }];
  mockTabBarState.index = 1;

  render(<TabsLayout />);

  expect(getActiveTab()).toBe("record");
  __resetActiveTabForTests();
});

it("Android 하드웨어 뒤로가기로 홈 탭에 돌아가는 것도 tab_pressed로 센다 — 경로만 hardware_back", () => {
  jest.replaceProperty(Platform, "OS", "android");
  mockTabBarState.routes = [{ name: "index" }, { name: "social" }];
  mockTabBarState.index = 1;
  __resetNativeAnalyticsForTests();
  const received: unknown[] = [];
  attachNativeAnalyticsSink((event) => received.push([event.name, event.properties]));

  render(<TabsLayout />);
  pressHardwareBack();

  expect(received).toEqual([
    ["tab_pressed", { tab: "home", from_tab: "social", via: "hardware_back" }],
  ]);
  __resetNativeAnalyticsForTests();
});

it("홈 탭에서의 뒤로가기는 앱 종료라 탭 이동 이벤트가 없다", () => {
  jest.replaceProperty(Platform, "OS", "android");
  __resetNativeAnalyticsForTests();
  const received: unknown[] = [];
  attachNativeAnalyticsSink((event) => received.push(event.name));

  render(<TabsLayout />);
  pressHardwareBack();

  expect(received).toEqual([]);
  __resetNativeAnalyticsForTests();
});

describe("모달 차단", () => {
  it("차단 상태면 탭 바와 딤이 함께 있고, 감싼 래퍼가 접근성 트리에서 빠진다 — 안 그러면 스크린리더가 딤을 건너뛰고 가려진 탭을 눌러 화면이 바뀐다", () => {
    setTabBarState("blocked");

    // 래퍼가 접근성 트리에서 빠진 것 자체를 검증하는 테스트라 기본 쿼리(접근성 숨김 요소
    // 제외)로는 찾을 수 없다 — includeHiddenElements로 존재를 확인한다.
    const { getByTestId, UNSAFE_getByProps } = render(<TabsLayout />);
    const options = { includeHiddenElements: true };

    expect(getByTestId("tab-bar", options)).toBeTruthy();
    expect(getByTestId("tab-bar-dim", options)).toBeTruthy();
    const wrapper = UNSAFE_getByProps({ accessibilityElementsHidden: true });
    expect(wrapper.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("보임 상태면 탭 바만 있고 딤은 없다", () => {
    setTabBarState("visible");

    const { getByTestId, queryByTestId } = render(<TabsLayout />);

    expect(getByTestId("tab-bar")).toBeTruthy();
    expect(queryByTestId("tab-bar-dim")).toBeNull();
  });

  it("숨김 상태면 탭 바 자리까지 사라진다", () => {
    setTabBarState("hidden");

    const { queryByTestId } = render(<TabsLayout />);

    expect(queryByTestId("tab-bar")).toBeNull();
    expect(queryByTestId("tab-bar-dim")).toBeNull();
  });
});
