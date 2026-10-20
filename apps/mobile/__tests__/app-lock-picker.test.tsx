import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ReactNode } from "react";
import type * as ReactNative from "react-native";

import AppLockPickerScreen from "../app/app-lock-picker";
import { notifyPickerClosed } from "../lib/appLock/appLockRelay";

// 화면 테스트를 `app/` 밖에 두는 이유는 `permission-denied.test.tsx` 상단 주석 참고.

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
const mockSafeArea = jest.fn();
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual<typeof ReactNative>("react-native");
  return {
    SafeAreaView: (props: { edges?: readonly string[]; children?: ReactNode }) => {
      mockSafeArea(props);
      return <View>{props.children}</View>;
    },
  };
});
jest.mock("../lib/appLock/appLockRelay", () => ({ notifyPickerClosed: jest.fn() }));

type SelectionViewProps = {
  familyActivitySelection?: string | null;
  onSelectionChange?: (event: { nativeEvent: { familyActivitySelection: string | null } }) => void;
  children?: ReactNode;
};
const mockSelectionView = jest.fn();
jest.mock("../lib/appLock/rnda", () => {
  const { View } = jest.requireActual<typeof ReactNative>("react-native");
  return {
    getRnda: () => ({
      getFamilyActivitySelectionId: () => "saved",
      DeviceActivitySelectionView: (props: SelectionViewProps) => {
        mockSelectionView(props);
        return <View testID="selection-view" />;
      },
    }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("잠글 앱 고르기", () => {
  it("완료 버튼이 상태바와 겹치지 않게 위아래 안전 영역을 비운다", () => {
    render(<AppLockPickerScreen />);
    expect(mockSafeArea).toHaveBeenLastCalledWith(
      expect.objectContaining({ edges: ["top", "bottom"] }),
    );
  });

  it("저장된 선택으로 시작한다", () => {
    render(<AppLockPickerScreen />);
    expect(mockSelectionView).toHaveBeenLastCalledWith(
      expect.objectContaining({ familyActivitySelection: "saved" }),
    );
  });

  it("완료를 누르면 닫고, 닫힐 때 고른 선택을 넘긴다", () => {
    const { unmount } = render(<AppLockPickerScreen />);
    const props = mockSelectionView.mock.lastCall?.[0] as SelectionViewProps;
    props.onSelectionChange?.({ nativeEvent: { familyActivitySelection: "picked" } });

    fireEvent.press(screen.getByRole("button", { name: "완료" }));
    expect(router.back).toHaveBeenCalled();

    unmount();
    expect(notifyPickerClosed).toHaveBeenCalledWith("picked");
  });

  it("바꾸지 않고 쓸어 닫으면 바뀐 게 없다고 넘긴다", () => {
    const { unmount } = render(<AppLockPickerScreen />);
    unmount();
    expect(notifyPickerClosed).toHaveBeenCalledWith(undefined);
  });

  it("다 지우고 닫으면 null을 넘긴다", () => {
    const { unmount } = render(<AppLockPickerScreen />);
    const props = mockSelectionView.mock.lastCall?.[0] as SelectionViewProps;
    props.onSelectionChange?.({ nativeEvent: { familyActivitySelection: "picked" } });
    props.onSelectionChange?.({ nativeEvent: { familyActivitySelection: null } });
    unmount();
    expect(notifyPickerClosed).toHaveBeenCalledWith(null);
  });
});
