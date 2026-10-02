import { colors, softBlue } from "@focusmakers/design-tokens";
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
 * Android 하단 플로팅 탭 바
 *
 * iOS는 시스템 탭 바를 쓰므로 이 바는 Android에서만 그려진다.
 * 탭 순서(홈·소셜·기록·설정)와 불투명 배경, 고정 알약의 활성 표시가 회귀하지 않게 고정한다.
 */

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

jest.mock("expo-router", () => ({
  router: { navigate: jest.fn() },
}));

/**
 * useColorScheme은 react-native 진입점이 내부 모듈을 다시 내보내는 형태라, 진입점 객체에
 * spy를 걸면 컴포넌트가 이미 가져간 참조가 바뀌지 않는다. 모듈 자체를 대체한다.
 */
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

const { default: mockUseColorScheme } = jest.requireMock<{ default: jest.Mock }>(
  "react-native/Libraries/Utilities/useColorScheme",
);

afterEach(() => {
  jest.restoreAllMocks();
  (router.navigate as jest.Mock).mockClear();
});

describe("TabBar 배경", () => {
  it("라이트는 불투명 base 배경을 깐다", () => {
    render(<TabBar active="home" />);
    expect(screen.getByTestId("tab-bar-surface")).toHaveStyle({
      backgroundColor: colors.bg.base.light,
    });
  });

  it("Android 다크는 layer1 배경을 깐다", () => {
    mockUseColorScheme.mockReturnValue("dark");
    render(<TabBar active="home" />);
    expect(screen.getByTestId("tab-bar-surface")).toHaveStyle({
      backgroundColor: colors.bg.layer1.dark,
    });
  });

  it("Android 라이트 활성 알약은 layer2 회색이다", () => {
    render(<TabBar active="home" />);
    expect(screen.getByTestId("tab-bar-active-pill")).toHaveStyle({
      backgroundColor: colors.bg.layer2.light,
    });
  });

  it("다크 활성 알약은 유리색이다", () => {
    mockUseColorScheme.mockReturnValue("dark");
    render(<TabBar active="home" />);
    expect(screen.getByTestId("tab-bar-active-pill")).toHaveStyle({
      backgroundColor: softBlue.glass.activePill.dark,
    });
  });

  afterEach(() => {
    mockUseColorScheme.mockReturnValue("light");
  });
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

describe("TabBar — 숨김", () => {
  it("hidden이면 터치를 받지 않고 접근성 트리에서 빠진다 — 언마운트 대신 페이드라 노드는 남는다", () => {
    render(<TabBar active="home" hidden />);
    // 접근성 트리에서 빠졌으므로 RNTL 기본 조회에도 안 잡힌다 — 그게 검증 대상이라 숨긴 요소까지 포함해 찾는다.
    const root = screen.getByTestId("tab-bar", { includeHiddenElements: true });
    expect(root.props.pointerEvents).toBe("none");
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("보이는 상태에서는 탭만 터치를 받는다(box-none)", () => {
    render(<TabBar active="home" />);
    const root = screen.getByTestId("tab-bar");
    expect(root.props.pointerEvents).toBe("box-none");
    expect(root.props.accessibilityElementsHidden).toBe(false);
  });
});
