import { render, screen, within } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";

import { SocialTabSkeleton } from "../RemoteSplashSkeletons";

/**
 * 탭 웹뷰 스플래시 스켈레톤
 *
 * 웹이 그리기 전에 같은 자리에 같은 모양을 두어, 웹이 뜨는 순간 화면이 바뀌지 않고 채워지게 한다.
 */

// 스켈레톤이 위아래 안전영역을 읽는다(탭 화면 테스트와 같은 값).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

afterEach(() => {
  jest.restoreAllMocks();
});

describe("SocialTabSkeleton", () => {
  it("그룹 탭 목록처럼 탭 두 개와 그룹 카드 두 장, + 버튼을 그린다", () => {
    render(<SocialTabSkeleton />);

    const tabs = within(screen.getByTestId("social-skeleton-tabs"));
    expect(tabs.getAllByLabelText("불러오는 중")).toHaveLength(2);
    const groups = within(screen.getByTestId("social-skeleton-groups"));
    expect(groups.getAllByLabelText("불러오는 중")).toHaveLength(2);
    expect(screen.getByTestId("social-skeleton-create")).toBeTruthy();
  });

  // 안전영역 아래쪽 34에서 iOS는 34 + 탭 바 49 + 8 + 16, Android는 탭 바 70 + 34 + 8 + 16이다.
  it.each([
    ["ios", 107],
    ["android", 128],
  ] as const)("%s에서 + 버튼을 웹처럼 탭 바 윗변보다 24 위에 둔다", (os, bottom) => {
    jest.replaceProperty(Platform, "OS", os);
    render(<SocialTabSkeleton />);

    expect(
      StyleSheet.flatten(screen.getByTestId("social-skeleton-create").props.style),
    ).toMatchObject({ bottom });
  });
});
