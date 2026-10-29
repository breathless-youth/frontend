import { act, render } from "@testing-library/react-native";
import { Platform } from "react-native";

import { NativeTabsLayout } from "../NativeTabsLayout";
import { __resetActiveTabForTests, getActiveTab, setActiveTabRoute } from "../../lib/activeTab";
import {
  __resetHomeDateBarForTests,
  setHomeDateBar,
  subscribeHomeDateBarEvents,
} from "../../lib/homeDateBar";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
} from "../../lib/nativeAnalytics";
import {
  __resetInitialActiveRouteForTests,
  markSettingsAsInitialRoute,
  revealSettingsTab,
  settingsMayBeHidden,
} from "../../lib/settingsReveal";
import { __resetStartKeyForTests, publishStartKey } from "../../lib/startTab";
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
  ios?: { prominentScreenKey?: string; bottomAccessoryHidden?: boolean };
  triggers: {
    name: string;
    disabled?: boolean;
    hidden?: boolean;
    role?: string;
    icon?: { sf?: string; renderingMode?: string };
    label?: React.ReactNode;
  }[];
  listeners: (route: { name: string; key: string }) => Listeners;
} = { triggers: [], listeners: () => ({}) };

jest.mock("expo-router/unstable-native-tabs", () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */
  const ReactModule = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */
  function NativeTabs(props: {
    hidden?: boolean;
    unstable_nativeProps?: {
      ios?: { prominentScreenKey?: string; bottomAccessoryHidden?: boolean };
    };
    screenListeners: (p: { route: { name: string; key: string } }) => Listeners;
    children: React.ReactNode;
  }) {
    captured.hidden = props.hidden;
    captured.ios = props.unstable_nativeProps?.ios;
    captured.listeners = (route) => props.screenListeners({ route });
    return ReactModule.createElement(View, { testID: "native-tabs" }, props.children);
  }
  function Trigger(props: {
    name: string;
    disabled?: boolean;
    hidden?: boolean;
    role?: string;
    children?: React.ReactNode;
  }) {
    // 아이콘과 라벨은 네이티브가 그리므로 자식 요소의 props를 트리거 기록에 모은다.
    const children = ReactModule.Children.toArray(props.children).filter(
      ReactModule.isValidElement<{ sf?: string; renderingMode?: string; children?: unknown }>,
    );
    const icon = children.find((child) => child.type === Trigger.Icon)?.props;
    const label = children.find((child) => child.type === Trigger.Label)?.props.children;
    captured.triggers.push({
      name: props.name,
      disabled: props.disabled,
      hidden: props.hidden,
      role: props.role,
      icon,
      label: label as React.ReactNode,
    });
    return ReactModule.createElement(View, { testID: `trigger-${props.name}` });
  }
  Trigger.Icon = function TriggerIcon(_props: { sf?: string; renderingMode?: string }) {
    return null;
  };
  Trigger.Label = function TriggerLabel(_props: { children?: React.ReactNode }) {
    return null;
  };
  NativeTabs.Trigger = Trigger;
  // 액세서리는 iOS 26 네이티브 자리라 이 테스트에서는 그리지 않는다.
  NativeTabs.BottomAccessory = Object.assign(() => null, { usePlacement: () => "regular" });
  return { NativeTabs };
});

jest.mock("../HomeDateBar", () => ({ HomeDateBar: () => null }));

beforeEach(() => {
  captured.hidden = undefined;
  captured.triggers = [];
  jest.restoreAllMocks();
  jest.spyOn(Platform, "Version", "get").mockReturnValue("26.0");
  __resetTabBarVisibilityForTests();
  __resetActiveTabForTests();
  __resetNativeAnalyticsForTests();
  __resetHomeDateBarForTests();
  __resetStartKeyForTests();
  __resetInitialActiveRouteForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

const goTo = (index: number, routes: { name: string }[]) =>
  act(() => {
    captured.listeners({ name: "index", key: "k" }).state?.({ data: { state: { index, routes } } });
  });

const byName = (name: string) => captured.triggers.findLast((trigger) => trigger.name === name);

it("iOS 26 이상은 탭 다섯 개 뒤에 떨어진 재생 트리거를 둔다", () => {
  render(<NativeTabsLayout />);
  expect(captured.triggers.map((trigger) => trigger.name)).toEqual([
    "index",
    "social",
    "records",
    "ranking",
    "settings",
    "start",
  ]);
  expect(byName("start")).toMatchObject({ role: "search", disabled: true });
});

it("iOS 26 미만은 재생 트리거가 없다", () => {
  jest.spyOn(Platform, "Version", "get").mockReturnValue("18.5");
  render(<NativeTabsLayout />);
  expect(captured.triggers.map((trigger) => trigger.name)).toEqual([
    "index",
    "social",
    "records",
    "ranking",
    "settings",
  ]);
});

it("홈에서는 설정을 숨기고 다른 탭에서는 재생을 숨긴다", () => {
  render(<NativeTabsLayout />);
  expect(byName("settings")?.hidden).toBe(true);
  expect(byName("start")?.hidden).toBe(false);

  captured.triggers = [];
  act(() => {
    captured.listeners({ name: "index", key: "index-k" }).state?.({
      data: { state: { index: 1, routes: [{ name: "index" }, { name: "social" }] } },
    });
  });
  expect(byName("settings")?.hidden).toBe(false);
  expect(byName("start")?.hidden).toBe(true);
});

it("재생 트리거의 막힌 누름은 홈 웹뷰에 알리고 tab_pressed는 세지 않는다", () => {
  const received: unknown[] = [];
  attachNativeAnalyticsSink((event) => received.push(event.name));
  const events: unknown[] = [];
  subscribeHomeDateBarEvents((event) => events.push(event.type));
  render(<NativeTabsLayout />);

  captured.listeners({ name: "start", key: "start-k" }).tabPress?.({
    target: "start-k",
    data: { isPrevented: true },
  });

  expect(events).toEqual(["home-play-pressed"]);
  expect(received).toEqual([]);
});

describe("재생 트리거의 오늘로 돌아가기", () => {
  const showDateBar = (selectedKey: string) =>
    act(() =>
      setHomeDateBar({
        type: "set-home-date-bar",
        dates: [
          { key: "2026-10-28", label: "28일 (수)", accessibilityLabel: "10월 28일 수요일" },
          { key: "2026-10-29", label: "29일 (목)", accessibilityLabel: "10월 29일 목요일" },
        ],
        selectedKey,
        todayKey: "2026-10-29",
        atMs: 1,
      }),
    );
  const pressStart = () =>
    act(() => {
      captured.listeners({ name: "start", key: "start-k" }).tabPress?.({
        target: "start-k",
        data: { isPrevented: true },
      });
    });

  it("다른 날을 보고 있으면 되돌아가기 화살표와 오늘로 라벨을 달고, 누르면 오늘을 고른다", () => {
    const events: unknown[] = [];
    subscribeHomeDateBarEvents((event) => events.push(event));
    render(<NativeTabsLayout />);
    showDateBar("2026-10-28");

    expect(byName("start")).toMatchObject({
      label: "오늘로",
      icon: { sf: "arrow.uturn.forward" },
    });
    pressStart();
    expect(events).toEqual([
      expect.objectContaining({ type: "home-date-selected", dateKey: "2026-10-29" }),
    ]);
    // 오늘로 돌아왔으니 다시 재생 버튼이다.
    expect(byName("start")?.label).toBe("순공 시작");
  });

  it("오늘을 보고 있으면 재생 버튼이고 누르면 재생을 알린다", () => {
    const events: unknown[] = [];
    subscribeHomeDateBarEvents((event) => events.push(event.type));
    render(<NativeTabsLayout />);
    showDateBar("2026-10-29");

    expect(byName("start")?.label).toBe("순공 시작");
    expect(byName("start")?.icon?.sf).toBeUndefined();
    pressStart();
    expect(events).toEqual(["home-play-pressed"]);
  });

  it("차단 상태에서는 다른 날을 보고 있어도 누름이 아무 일도 하지 않는다", () => {
    setTabBarState("blocked");
    const events: unknown[] = [];
    subscribeHomeDateBarEvents((event) => events.push(event.type));
    render(<NativeTabsLayout />);
    showDateBar("2026-10-28");

    pressStart();
    expect(events).toEqual([]);
  });
});

it("설정에서 홈으로 돌아오면 선택 이동이 끝난 뒤에 바꿔 끼운다", () => {
  jest.useFakeTimers();
  render(<NativeTabsLayout />);
  const go = (index: number) =>
    act(() => {
      captured.listeners({ name: "index", key: "k" }).state?.({
        data: { state: { index, routes: [{ name: "index" }, { name: "settings" }] } },
      });
    });
  go(1);
  go(0);
  // 바꿔 끼우기 전이라 다시 그리지 않았고, 마지막 렌더가 여전히 설정을 보인다.
  expect(byName("settings")?.hidden).toBe(false);
  act(() => {
    jest.advanceTimersByTime(250);
  });
  expect(byName("settings")?.hidden).toBe(true);
});

it("차단 상태에서는 재생 트리거의 막힌 누름이 홈 웹뷰에 알리지 않는다", () => {
  setTabBarState("blocked");
  const events: unknown[] = [];
  subscribeHomeDateBarEvents((event) => events.push(event.type));
  render(<NativeTabsLayout />);

  captured.listeners({ name: "start", key: "start-k" }).tabPress?.({
    target: "start-k",
    data: { isPrevented: true },
  });

  expect(events).toEqual([]);
});

it("재생 트리거가 막히지 않은 누름으로 오면 아무 일도 하지 않는다", () => {
  const received: unknown[] = [];
  attachNativeAnalyticsSink((event) => received.push(event.name));
  const events: unknown[] = [];
  subscribeHomeDateBarEvents((event) => events.push(event.type));
  render(<NativeTabsLayout />);

  captured.listeners({ name: "start", key: "start-k" }).tabPress?.({
    target: "start-k",
    data: { isPrevented: false },
  });

  expect(events).toEqual([]);
  expect(received).toEqual([]);
});

it("콜드 스타트 링크로 설정에서 시작하면 첫 렌더부터 설정 칸을 보이고 재생을 숨긴다", () => {
  markSettingsAsInitialRoute();
  render(<NativeTabsLayout />);
  expect(byName("settings")?.hidden).toBe(false);
  expect(byName("start")?.hidden).toBe(true);
});

it("iOS 26은 떼어 그릴 탭 key를 넘기지 않는다", () => {
  render(<NativeTabsLayout />);
  act(() => publishStartKey("start-k"));
  expect(captured.ios).toBeDefined();
  expect(captured.ios).not.toHaveProperty("prominentScreenKey");
});

it("iOS 27 이상에서 떼어 그릴 탭 key는 홈이고 key를 받았을 때만 넘긴다", () => {
  jest.spyOn(Platform, "Version", "get").mockReturnValue("27.0");
  render(<NativeTabsLayout />);
  expect(captured.ios?.prominentScreenKey).toBeUndefined();

  act(() => publishStartKey("start-k"));
  expect(captured.ios?.prominentScreenKey).toBe("start-k");

  goTo(1, [{ name: "index" }, { name: "social" }]);
  expect(captured.ios?.prominentScreenKey).toBeUndefined();
});

it("액세서리는 홈이고 날짜 줄이 있을 때만 드러낸다", () => {
  render(<NativeTabsLayout />);
  expect(captured.ios?.bottomAccessoryHidden).toBe(true);

  act(() =>
    setHomeDateBar({
      type: "set-home-date-bar",
      dates: [{ key: "2026-10-29", label: "29일 (목)", accessibilityLabel: "10월 29일 목요일" }],
      selectedKey: "2026-10-29",
      todayKey: "2026-10-29",
      atMs: 1,
    }),
  );
  expect(captured.ios?.bottomAccessoryHidden).toBe(false);

  goTo(1, [{ name: "index" }, { name: "social" }]);
  expect(captured.ios?.bottomAccessoryHidden).toBe(true);
});

it("홈에서 설정 드러내기 요청이 오면 설정 칸을 되살리고, 설정 라우트가 상태에 들어온 뒤에 한 번 이어 간다", () => {
  render(<NativeTabsLayout />);
  const then = jest.fn();

  act(() => revealSettingsTab(then));

  expect(byName("settings")?.hidden).toBe(false);
  expect(byName("start")?.hidden).toBe(true);
  // 커밋 직후에는 내비게이터 상태에 설정 라우트가 아직 없어 이동하면 버려진다.
  expect(then).not.toHaveBeenCalled();

  goTo(0, [{ name: "index" }]);
  expect(then).not.toHaveBeenCalled();
  // 설정 라우트가 없는 상태 이벤트가 와도 설정 칸을 다시 숨기지 않는다.
  expect(byName("settings")?.hidden).toBe(false);

  goTo(0, [{ name: "index" }, { name: "settings" }]);
  expect(then).toHaveBeenCalledTimes(1);

  goTo(1, [{ name: "index" }, { name: "settings" }]);
  expect(then).toHaveBeenCalledTimes(1);
  expect(byName("settings")?.hidden).toBe(false);
});

it("설정 라우트가 1초 안에 들어오지 않으면 한 번 이동을 시도하고 홈 칸으로 돌아온다", () => {
  jest.useFakeTimers();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  render(<NativeTabsLayout />);
  const then = jest.fn();

  act(() => revealSettingsTab(then));
  expect(byName("settings")?.hidden).toBe(false);

  act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(byName("settings")?.hidden).toBe(true);
  expect(byName("start")?.hidden).toBe(false);
  expect(then).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledTimes(1);

  goTo(0, [{ name: "index" }, { name: "settings" }]);
  expect(then).toHaveBeenCalledTimes(1);
});

it("설정 드러내기를 기다리는 중에 사용자가 탭을 누르면 기다림을 버린다", () => {
  jest.useFakeTimers();
  render(<NativeTabsLayout />);
  const then = jest.fn();

  act(() => revealSettingsTab(then));
  captured.listeners({ name: "records", key: "records-k" }).tabPress?.({
    target: "records-k",
    data: { isPrevented: false },
  });
  goTo(2, [{ name: "index" }, { name: "settings" }, { name: "records" }]);

  expect(then).not.toHaveBeenCalled();
  expect(byName("start")?.hidden).toBe(true);
});

it("홈이 아니면 설정 드러내기 요청을 바로 이어 간다", () => {
  render(<NativeTabsLayout />);
  goTo(1, [{ name: "index" }, { name: "social" }]);
  const then = jest.fn();

  revealSettingsTab(then);

  expect(then).toHaveBeenCalledTimes(1);
});

it("iOS 26 미만은 설정 칸을 가리지 않아 드러내기 요청을 바로 이어 간다", () => {
  jest.spyOn(Platform, "Version", "get").mockReturnValue("18.5");
  render(<NativeTabsLayout />);
  const then = jest.fn();

  // 시스템 링크가 라우팅 전에 멈추지 않도록 가릴 수 있는 레이아웃이 없다고 답해야 한다.
  expect(settingsMayBeHidden()).toBe(false);

  revealSettingsTab(then);

  expect(then).toHaveBeenCalledTimes(1);
});

it("숨김 상태면 바 전체를 hidden으로 넘긴다", () => {
  setTabBarState("hidden");
  render(<NativeTabsLayout />);
  expect(captured.hidden).toBe(true);
  // 재생 트리거는 누름을 막힌 누름으로만 받으려고 늘 disabled다.
  expect(captured.triggers.filter((t) => t.name !== "start").every((t) => !t.disabled)).toBe(true);
});

it("차단 상태면 바는 보이고 트리거 5개가 전부 disabled다", () => {
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

it("랭킹 탭 누름을 tab_pressed로 센다", () => {
  const received: unknown[] = [];
  attachNativeAnalyticsSink((event) => received.push([event.name, event.properties]));
  setActiveTabRoute("index");
  render(<NativeTabsLayout />);

  captured.listeners({ name: "ranking", key: "ranking-k" }).tabPress?.({
    target: "ranking-k",
    data: { isPrevented: false },
  });

  expect(received).toEqual([["tab_pressed", { tab: "ranking", from_tab: "home", via: "tab_bar" }]]);
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

  goTo(1, [{ name: "index" }, { name: "social" }]);

  expect(getActiveTab()).toBe("social");
});

it("언마운트하면 걸어 둔 바꿔 끼우기 타이머를 지운다", () => {
  jest.useFakeTimers();
  const view = render(<NativeTabsLayout />);
  goTo(1, [{ name: "index" }, { name: "settings" }]);
  goTo(0, [{ name: "index" }, { name: "settings" }]);

  view.unmount();
  expect(jest.getTimerCount()).toBe(0);
});
