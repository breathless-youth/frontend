import { fireEvent, render, screen } from "@testing-library/react-native";
import { Animated } from "react-native";
import type { SetGlassChromeMessage } from "@focusmakers/types";

import type * as ExpoUiMock from "../../jest/expoUiMock";
import { GlassChromeOverlay } from "../GlassChromeOverlay";

/**
 * 웹뷰 위 glass 층
 *
 * SwiftUI 뷰는 RN 대역으로 그려 글자, 머리글 역할, 누름 id, 숨김 규칙만 확인한다.
 */

jest.mock(
  "@expo/ui/swift-ui",
  () => jest.requireActual<typeof ExpoUiMock>("../../jest/expoUiMock").swiftUi,
);
jest.mock(
  "@expo/ui/swift-ui/modifiers",
  () => jest.requireActual<typeof ExpoUiMock>("../../jest/expoUiMock").swiftUiModifiers,
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

function chromeMessage(overrides: Partial<SetGlassChromeMessage>): SetGlassChromeMessage {
  return {
    type: "set-glass-chrome",
    top: null,
    obscured: false,
    atMs: 1,
    ...overrides,
  };
}

const backTop = {
  leading: "back",
  leadingLabel: "뒤로 가기",
  title: "이용약관",
} as const;

it("chrome이 없거나 웹 시트가 가리고 있으면 아무것도 그리지 않는다", () => {
  const { toJSON, rerender } = render(<GlassChromeOverlay chrome={null} onPress={jest.fn()} />);
  expect(toJSON()).toBeNull();

  rerender(
    <GlassChromeOverlay
      chrome={chromeMessage({ top: backTop, obscured: true })}
      onPress={jest.fn()}
    />,
  );
  expect(toJSON()).toBeNull();
});

it("뒤로 버튼과 제목을 그리고 뒤로 버튼은 chrome:leading으로 알린다", () => {
  const onPress = jest.fn();
  render(<GlassChromeOverlay chrome={chromeMessage({ top: backTop })} onPress={onPress} />);

  expect(screen.getByRole("header", { name: "이용약관" })).toBeTruthy();
  fireEvent.press(screen.getByLabelText("뒤로 가기"));
  expect(onPress).toHaveBeenCalledWith("chrome:leading", 0);
});

it("제목은 큰 글자 설정에서도 줄 높이를 넘지 않게 글자 배율을 제한한다", () => {
  render(<GlassChromeOverlay chrome={chromeMessage({ top: backTop })} onPress={jest.fn()} />);

  expect(screen.getByRole("header", { name: "이용약관" })).toHaveProp("maxFontSizeMultiplier", 1.3);
});

it("제목이 없으면 뒤로 버튼만 그려 가운데 웹 요소의 누름을 가리지 않는다", () => {
  render(
    <GlassChromeOverlay
      chrome={chromeMessage({ top: { ...backTop, title: null } })}
      onPress={jest.fn()}
    />,
  );

  expect(screen.getByLabelText("뒤로 가기")).toBeTruthy();
  expect(screen.queryByRole("header")).toBeNull();
});

it("받은 투명도를 층 전체에 입힌다", () => {
  render(
    <GlassChromeOverlay
      chrome={chromeMessage({ top: backTop })}
      opacity={new Animated.Value(0.4)}
      onPress={jest.fn()}
    />,
  );

  expect(screen.getByTestId("glass-chrome")).toHaveStyle({ opacity: 0.4 });
});
