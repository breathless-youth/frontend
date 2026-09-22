import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import React from "react";

import { TabBar } from "../TabBar";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../../lib/nativeAnalytics";

/**
 * 탭 바 — BY-409에서 4탭으로 확장. 순서(홈·소셜·기록·설정, Figma V1.3 확정)와
 * 활성 상태 표시가 회귀하지 않게 고정한다. BY-729에서 Liquid Glass/제스처 알약 실험을
 * 되돌리고 정적 Figma 디자인(표준 블러 + 고정 알약)으로 복귀했다.
 */

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

jest.mock("expo-router", () => ({
  router: { navigate: jest.fn() },
}));

jest.mock("expo-blur", () => ({
  BlurView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => {
    const { View } = require("react-native");
    return <View testID={testID}>{children}</View>;
  },
}));

afterEach(() => {
  jest.restoreAllMocks();
  (router.navigate as jest.Mock).mockClear();
});

it("BlurView를 렌더한다", () => {
  render(<TabBar active="home" />);
  expect(screen.getByTestId("tab-bar-blur")).toBeTruthy();
});

describe("TabBar", () => {
  it("4탭을 홈·소셜·기록·설정 순서로 렌더한다", () => {
    render(<TabBar active="home" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual(["홈", "소셜", "기록", "설정"]);
  });

  it("소셜 탭 활성 시 selected 상태가 소셜에만 붙는다", () => {
    render(<TabBar active="social" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.props.accessibilityState?.selected)).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });
});

/** 탭 터치는 네이티브만 아는 사용자 행동이다 — `tab_pressed`로 웹 Amplitude에 넘긴다. */
describe("TabBar — tab_pressed 이벤트", () => {
  let received: NativeAnalyticsEvent[];

  beforeEach(() => {
    __resetNativeAnalyticsForTests();
    received = [];
    attachNativeAnalyticsSink((event) => received.push(event));
    (router.navigate as jest.Mock).mockClear();
  });

  afterEach(() => {
    __resetNativeAnalyticsForTests();
  });

  it("탭을 누르면 목적지·출발 탭을 실어 남기고 이동한다", () => {
    render(<TabBar active="home" />);

    fireEvent.press(screen.getByRole("tab", { name: "기록" }));

    expect(received.map((event) => [event.name, event.properties])).toEqual([
      ["tab_pressed", { tab: "record", from_tab: "home", via: "tab_bar" }],
    ]);
    expect(router.navigate).toHaveBeenCalledWith("/records");
  });

  it("활성 탭은 비활성화돼 있어 눌러도 이벤트가 없다", () => {
    render(<TabBar active="social" />);

    fireEvent.press(screen.getByRole("tab", { name: "소셜" }));

    expect(received).toEqual([]);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe("TabBar — 딤", () => {
  // 실제 터치 차단은 딤 View가 탭 위를 덮고 pointerEvents가 auto(=포인터를 삼킴)여서 일어나는
  // 네이티브 히트테스트다. RNTL의 fireEvent.press는 히트테스트를 건너뛰고 노드에 직접 쏘므로
  // "차단"을 그대로 재현하지 못한다 — 그래서 여기서는 (1) 딤이 존재하고 (2) 삼키도록 설정됐는지
  // (pointerEvents가 "none"이 아님)를 검증한다.
  it("dimmed면 포인터를 삼키는 딤 오버레이가 붙는다", () => {
    render(<TabBar active="home" dimmed />);
    const dim = screen.getByTestId("tab-bar-dim");
    expect(dim).toBeTruthy();
    expect(dim.props.pointerEvents).not.toBe("none");
  });
  it("기본 상태에는 딤이 없다", () => {
    render(<TabBar active="home" />);
    expect(screen.queryByTestId("tab-bar-dim")).toBeNull();
  });
});
