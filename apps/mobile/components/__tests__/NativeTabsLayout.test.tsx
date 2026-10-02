import { render } from "@testing-library/react-native";

import { NativeTabsLayout } from "../NativeTabsLayout";
import { __resetActiveTabForTests, getActiveTab, setActiveTabRoute } from "../../lib/activeTab";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
} from "../../lib/nativeAnalytics";
import { __resetTabBarVisibilityForTests, setTabBarState } from "../../lib/tabBarVisibility";

/**
 * NativeTabs는 네이티브 탭 호스트를 끌고 오므로 props만 받아 기록하는 스텁으로 대체한다.
 * 이 컴포넌트의 책임은 탭 바 상태를 hidden·disabled로 옮기고, 네이티브 누름을 분석 이벤트로 바꾸는 것뿐이다.
 */
type Listeners = {
  tabPress?: (e: { target: string; data: { isPrevented: boolean } }) => void;
  state?: (e: { data: { state: { index: number; routes: { name: string }[] } } }) => void;
};
const captured: {
  hidden?: boolean;
  triggers: { name: string; disabled?: boolean }[];
  listeners: (route: { name: string; key: string }) => Listeners;
} = { triggers: [], listeners: () => ({}) };

jest.mock("expo-router/unstable-native-tabs", () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */
  const ReactModule = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */
  function NativeTabs(props: {
    hidden?: boolean;
    screenListeners: (p: { route: { name: string; key: string } }) => Listeners;
    children: React.ReactNode;
  }) {
    captured.hidden = props.hidden;
    captured.listeners = (route) => props.screenListeners({ route });
    return ReactModule.createElement(View, { testID: "native-tabs" }, props.children);
  }
  function Trigger(props: { name: string; disabled?: boolean; children?: React.ReactNode }) {
    captured.triggers.push({ name: props.name, disabled: props.disabled });
    return ReactModule.createElement(View, { testID: `trigger-${props.name}` });
  }
  Trigger.Icon = function TriggerIcon() {
    return null;
  };
  Trigger.Label = function TriggerLabel() {
    return null;
  };
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});

beforeEach(() => {
  captured.hidden = undefined;
  captured.triggers = [];
  __resetTabBarVisibilityForTests();
  __resetActiveTabForTests();
  __resetNativeAnalyticsForTests();
});

it("4탭을 홈·소셜·기록·설정 라우트 순서로 고정 렌더한다 — 동적 추가·삭제는 네비게이터를 다시 마운트한다", () => {
  render(<NativeTabsLayout />);
  expect(captured.triggers.map((t) => t.name)).toEqual(["index", "social", "records", "settings"]);
});

it("숨김 상태면 바 전체를 hidden으로 넘긴다", () => {
  setTabBarState("hidden");
  render(<NativeTabsLayout />);
  expect(captured.hidden).toBe(true);
  expect(captured.triggers.every((t) => !t.disabled)).toBe(true);
});

it("차단 상태면 바는 보이고 트리거 4개가 전부 disabled다", () => {
  setTabBarState("blocked");
  render(<NativeTabsLayout />);
  expect(captured.hidden).toBe(false);
  expect(captured.triggers.every((t) => t.disabled === true)).toBe(true);
});

it("네이티브 탭 누름을 tab_pressed로 센다 — 출발 탭은 누르기 전 활성 탭", () => {
  const received: unknown[] = [];
  attachNativeAnalyticsSink((event) => received.push([event.name, event.properties]));
  setActiveTabRoute("index");
  render(<NativeTabsLayout />);

  captured.listeners({ name: "records", key: "records-k" }).tabPress?.({
    target: "records-k",
    data: { isPrevented: false },
  });

  expect(received).toEqual([["tab_pressed", { tab: "record", from_tab: "home", via: "tab_bar" }]]);
});

it("disabled로 막힌 누름은 세지 않는다 — 이동이 없었다", () => {
  const received: unknown[] = [];
  attachNativeAnalyticsSink((event) => received.push(event.name));
  render(<NativeTabsLayout />);

  captured.listeners({ name: "records", key: "records-k" }).tabPress?.({
    target: "records-k",
    data: { isPrevented: true },
  });

  expect(received).toEqual([]);
});

it("활성 탭을 다시 누르면 세지 않는다 — 커스텀 바에서도 활성 탭은 눌리지 않았다", () => {
  const received: unknown[] = [];
  attachNativeAnalyticsSink((event) => received.push(event.name));
  setActiveTabRoute("records");
  render(<NativeTabsLayout />);

  captured.listeners({ name: "records", key: "records-k" }).tabPress?.({
    target: "records-k",
    data: { isPrevented: false },
  });

  expect(received).toEqual([]);
});

it("네비게이터 상태가 바뀌면 활성 탭을 모듈 스코프에 기록한다 — 브리지 핸들러가 navigate-tab의 출발 탭으로 읽는다", () => {
  render(<NativeTabsLayout />);

  captured.listeners({ name: "index", key: "index-k" }).state?.({
    data: { state: { index: 1, routes: [{ name: "index" }, { name: "social" }] } },
  });

  expect(getActiveTab()).toBe("social");
});
