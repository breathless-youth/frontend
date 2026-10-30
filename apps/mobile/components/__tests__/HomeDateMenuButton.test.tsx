import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";

import type * as MenuButtonModule from "../HomeDateMenuButton";

/**
 * Android 홈 날짜 줄의 과목 메뉴 버튼
 *
 * Compose 뷰는 jest에서 그려지지 않아 메뉴는 펼침 여부만 따라가는 RN 대역으로 바꾼다.
 */
type MockChildren = { children?: ReactNode };

jest.mock("@expo/ui/jetpack-compose", () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */
  const ReactModule = require("react") as typeof import("react");
  const { Pressable, Text, View } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */
  const ExpandedContext = ReactModule.createContext(false);
  const passThrough = ({ children }: MockChildren) =>
    ReactModule.createElement(ReactModule.Fragment, null, children);
  function DropdownMenu({ expanded = false, children }: MockChildren & { expanded?: boolean }) {
    return ReactModule.createElement(ExpandedContext.Provider, { value: expanded }, children);
  }
  DropdownMenu.Trigger = passThrough;
  DropdownMenu.Items = function Items({ children }: MockChildren) {
    const expanded = ReactModule.useContext(ExpandedContext);
    return expanded ? ReactModule.createElement(View, { testID: "menu-items" }, children) : null;
  };
  function DropdownMenuItem({ onClick, children }: MockChildren & { onClick: () => void }) {
    return ReactModule.createElement(Pressable, { onPress: onClick }, children);
  }
  DropdownMenuItem.Text = passThrough;
  return {
    Host: ({ children }: MockChildren) =>
      ReactModule.createElement(View, { testID: "compose-host" }, children),
    RNHostView: passThrough,
    DropdownMenu,
    DropdownMenuItem,
    Text: ({ children }: MockChildren) => ReactModule.createElement(Text, null, children),
  };
});

// jest는 iOS 기준으로 풀어 `.ios.tsx`를 가져오므로 Android 파일을 경로로 집어 온다.
const { HomeDateMenuButton } = jest.requireActual<typeof MenuButtonModule>(
  "../HomeDateMenuButton.tsx",
);

type Node = ReturnType<typeof screen.getByText>;

function findAncestor(node: Node, match: (props: Node["props"]) => boolean): Node | null {
  let current = node.parent;
  while (current !== null && !match(current.props)) {
    current = current.parent;
  }
  return current;
}

const renderButton = (disabled = false) => {
  const onAction = jest.fn();
  render(<HomeDateMenuButton color="#000" disabled={disabled} onAction={onAction} />);
  return onAction;
};

// Android는 부모 밖으로 나간 자식 영역의 터치를 넘기지 않아서, 누름 영역이 48인 부모를 꽉 채우는지 본다.
it("누름 영역이 48 이상인 부모 안을 꽉 채운다", () => {
  renderButton();
  const slot = StyleSheet.flatten(screen.getByTestId("date-menu-slot").props.style);
  expect(slot.width).toBeGreaterThanOrEqual(48);
  expect(slot.height).toBeGreaterThanOrEqual(48);
  const hit = StyleSheet.flatten(screen.getByRole("button", { name: "과목 메뉴" }).props.style);
  expect(hit).toMatchObject({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 });
});

// Compose 조상이 터치를 아이콘 크기로 잘라서, 누름은 Compose 밖의 RN 버튼만 받는다.
it("Compose 쪽은 터치를 받지 않는다", () => {
  renderButton();
  const host = screen.getByTestId("compose-host");
  expect(findAncestor(host, (props) => props.pointerEvents === "none")).not.toBeNull();
  expect(screen.getByRole("button", { name: "과목 메뉴" })).toBeTruthy();
});

it("누르면 메뉴를 펼치고 항목을 고르면 닫으며 알린다", () => {
  const onAction = renderButton();
  expect(screen.queryByTestId("menu-items")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "과목 메뉴" }));
  // 메뉴 항목은 Compose 팝업 창에 떠서 감싼 뷰의 pointerEvents와 상관없이 눌리므로 누름을 직접 부른다.
  const item = findAncestor(screen.getByText("과목 편집"), (props) => "onPress" in props);
  act(() => (item?.props.onPress as () => void)());
  expect(onAction).toHaveBeenCalledWith("edit-subjects");
  expect(screen.queryByTestId("menu-items")).toBeNull();
});

it("막힌 동안에는 눌러도 펼치지 않는다", () => {
  renderButton(true);
  fireEvent.press(screen.getByRole("button", { name: "과목 메뉴" }));
  expect(screen.queryByTestId("menu-items")).toBeNull();
});
