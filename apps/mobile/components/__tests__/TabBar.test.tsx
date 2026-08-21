import { render, screen } from "@testing-library/react-native";

import { TabBar } from "../TabBar";

/**
 * 탭 바 — BY-409에서 4탭으로 확장. 순서(홈·소셜·기록·설정, Figma V1.3 확정)와
 * 활성 상태 표시가 회귀하지 않게 고정한다.
 */

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

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
