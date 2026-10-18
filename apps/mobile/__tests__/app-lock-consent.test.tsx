import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { AppState, type AppStateStatus } from "react-native";

import AppLockConsentScreen from "../app/app-lock-consent";
import { notifyConsentClosed } from "../lib/appLock/androidFlow";

// 화면 테스트를 `app/` 밖에 두는 이유는 `permission-denied.test.tsx` 상단 주석 참고.

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../lib/appLock/androidFlow", () => ({
  ...jest.requireActual<object>("../lib/appLock/androidFlow"),
  notifyConsentClosed: jest.fn(),
}));
const mockNative = {
  hasUsageAccess: jest.fn(() => false),
  canDrawOverlays: jest.fn(() => false),
  openUsageAccessSettings: jest.fn(),
  openOverlaySettings: jest.fn(),
};
// import가 먼저 평가되어 팩토리가 mockNative 선언 전에 돌아서 getter로 늦게 읽는다.
jest.mock("../modules/app-lock", () => ({
  get appLockNative() {
    return mockNative;
  },
}));

let appStateListener: ((state: AppStateStatus) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.hasUsageAccess.mockReturnValue(false);
  mockNative.canDrawOverlays.mockReturnValue(false);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

function returnFromSettings() {
  act(() => appStateListener?.("active"));
}

describe("방해 앱 잠금 권한 안내", () => {
  it("필요한 권한 두 가지와 쓰는 이유를 보여 준다", () => {
    render(<AppLockConsentScreen />);
    expect(screen.getByText("방해 앱 잠금을 켜려면\n권한 두 가지가 필요해요")).toBeTruthy();
    expect(screen.getByText("사용정보 접근")).toBeTruthy();
    expect(screen.getByText("지금 열린 앱이 잠긴 앱인지 확인할 때만 써요.")).toBeTruthy();
    expect(screen.getByText("다른 앱 위에 표시")).toBeTruthy();
    expect(screen.getByText("공부 중에 잠긴 앱을 열면 잠금 화면을 띄워요.")).toBeTruthy();
  });

  it("설정을 열기 전에 설치된 앱 목록을 조회하는 이유와 기기 밖으로 보내지 않음을 알린다", () => {
    render(<AppLockConsentScreen />);
    expect(
      screen.getByText(
        "잠그고 싶은 앱을 고를 수 있게 기기에 설치된 앱 목록을 조회해요. 앱 목록은 기기 밖으로 전송되지 않아요.",
      ),
    ).toBeTruthy();
  });

  it("동의하면 사용정보 접근 설정부터 연다", () => {
    render(<AppLockConsentScreen />);
    fireEvent.press(screen.getByRole("button", { name: "동의하고 설정 열기" }));
    expect(mockNative.openUsageAccessSettings).toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("하나만 켜고 돌아오면 허용됨을 표시하고 남은 권한 버튼으로 바꾼다", () => {
    render(<AppLockConsentScreen />);
    mockNative.hasUsageAccess.mockReturnValue(true);
    returnFromSettings();
    expect(screen.getByText("허용됨")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "다른 앱 위에 표시 허용하기" }));
    expect(mockNative.openOverlaySettings).toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("둘 다 켜고 돌아오면 닫는다", () => {
    render(<AppLockConsentScreen />);
    mockNative.hasUsageAccess.mockReturnValue(true);
    mockNative.canDrawOverlays.mockReturnValue(true);
    returnFromSettings();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("나중에 할게요는 닫는다", () => {
    render(<AppLockConsentScreen />);
    fireEvent.press(screen.getByRole("button", { name: "나중에 할게요" }));
    expect(router.back).toHaveBeenCalled();
  });

  it("어떻게 닫히든 닫힘을 알린다", () => {
    const { unmount } = render(<AppLockConsentScreen />);
    expect(notifyConsentClosed).not.toHaveBeenCalled();
    unmount();
    expect(notifyConsentClosed).toHaveBeenCalledTimes(1);
  });
});
