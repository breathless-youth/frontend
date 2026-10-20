import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Platform } from "react-native";

import AppLockBatteryScreen from "../app/app-lock-battery";

// 화면 테스트를 `app/` 밖에 두는 이유는 `permission-denied.test.tsx` 상단 주석 참고.

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockNative = { openAppBatterySettings: jest.fn() };
// import가 먼저 평가되어 팩토리가 mockNative 선언 전에 돌아서 getter로 늦게 읽는다.
jest.mock("../modules/app-lock", () => ({
  get appLockNative() {
    return mockNative;
  },
}));

function setManufacturer(manufacturer: string, brand = manufacturer) {
  jest
    .spyOn(Platform, "constants", "get")
    .mockReturnValue({ Manufacturer: manufacturer, Brand: brand } as typeof Platform.constants);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe("배터리 예외 안내", () => {
  it("삼성은 앱 정보의 배터리에서 제한 없음을 고르는 순서를 보여 준다", () => {
    setManufacturer("samsung");
    render(<AppLockBatteryScreen />);
    expect(screen.getByText("공부 중에 잠금이\n풀리지 않게 해 주세요")).toBeTruthy();
    expect(screen.getByText("휴대폰이 배터리를 아끼기 위해 잠금을 풀 수도 있어요.")).toBeTruthy();
    for (const step of ["배터리", "제한 없음 선택"]) {
      expect(screen.getByText(step)).toBeTruthy();
    }
  });

  it("샤오미는 배터리 절약 제한 없음과 자동 시작 순서를 보여 준다", () => {
    setManufacturer("Xiaomi", "Redmi");
    render(<AppLockBatteryScreen />);
    for (const step of ["배터리 절약", "제한 없음 선택", "자동 시작 켜기"]) {
      expect(screen.getByText(step)).toBeTruthy();
    }
    expect(screen.queryByText(/포메/)).toBeNull();
  });

  it("다른 제조사는 앱 배터리 사용량에서 제한 없음을 고르는 순서를 보여 준다", () => {
    setManufacturer("Google");
    render(<AppLockBatteryScreen />);
    for (const step of ["배터리 사용량", "제한 없음 선택"]) {
      expect(screen.getByText(step)).toBeTruthy();
    }
    fireEvent.press(screen.getByRole("button", { name: "설정 열기" }));
    expect(mockNative.openAppBatterySettings).toHaveBeenCalled();
  });

  it("설정 열기는 이 앱의 앱 정보 화면을 열고 닫는다", () => {
    setManufacturer("samsung");
    render(<AppLockBatteryScreen />);
    fireEvent.press(screen.getByRole("button", { name: "설정 열기" }));
    expect(mockNative.openAppBatterySettings).toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it("닫기는 시스템 시트에 맡기고 시트 안에는 설정 열기 버튼만 둔다", () => {
    setManufacturer("samsung");
    render(<AppLockBatteryScreen />);
    expect(screen.getAllByRole("button").map((button) => button.props.accessibilityLabel)).toEqual([
      "설정 열기",
    ]);
  });
});
