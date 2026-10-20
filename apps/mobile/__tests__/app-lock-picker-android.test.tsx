import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import AppLockPickerScreen from "../app/app-lock-picker.android";
import { notifyPickerClosed } from "../lib/appLock/appLockRelay";

// 화면 테스트를 `app/` 밖에 두는 이유는 `permission-denied.test.tsx` 상단 주석 참고.

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("../lib/appLock/appLockRelay", () => ({ notifyPickerClosed: jest.fn() }));
const mockGetLaunchableApps = jest.fn();
const mockGetSelectedPackages = jest.fn();
jest.mock("../modules/app-lock", () => ({
  appLockNative: {
    getLaunchableApps: () => mockGetLaunchableApps(),
    getSelectedPackages: () => mockGetSelectedPackages(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSelectedPackages.mockReturnValue(["com.instagram.android"]);
  mockGetLaunchableApps.mockResolvedValue([
    { packageName: "com.google.android.youtube", label: "YouTube", iconBase64: "aWNvbg==" },
    { packageName: "com.instagram.android", label: "인스타그램", iconBase64: "aWNvbg==" },
    { packageName: "com.kakao.talk", label: "카카오톡", iconBase64: "aWNvbg==" },
  ]);
});

async function renderPicker() {
  const view = render(<AppLockPickerScreen />);
  await screen.findByText("카카오톡");
  return view;
}

describe("Android 잠글 앱 고르기", () => {
  it("설치된 앱을 보여 주고 저장된 선택으로 시작한다", async () => {
    await renderPicker();
    expect(screen.getByText("1개 선택")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "인스타그램" }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
    expect(screen.getByRole("checkbox", { name: "YouTube" }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );
  });

  it("이름으로 찾는다", async () => {
    await renderPicker();
    fireEvent.changeText(screen.getByPlaceholderText("앱 이름 검색"), "youtube");
    expect(screen.getByText("YouTube")).toBeTruthy();
    expect(screen.queryByText("카카오톡")).toBeNull();
  });

  it("찾는 앱이 없으면 없다고 알려 준다", async () => {
    await renderPicker();
    fireEvent.changeText(screen.getByPlaceholderText("앱 이름 검색"), "없는앱");
    expect(screen.getByText("찾는 앱이 없어요")).toBeTruthy();
  });

  it("앱 목록을 못 읽으면 못 불러왔다고 알려 준다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockGetLaunchableApps.mockRejectedValue(new Error("읽기 실패"));
    render(<AppLockPickerScreen />);
    expect(await screen.findByText("앱 목록을 불러오지 못했어요")).toBeTruthy();
    expect(screen.queryByText("찾는 앱이 없어요")).toBeNull();
    warn.mockRestore();
  });

  it("저장된 선택을 못 읽으면 빈 선택으로 열고 못 불러왔다고 알려 준다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockGetSelectedPackages.mockImplementation(() => {
      throw new Error("읽기 실패");
    });
    const { unmount } = render(<AppLockPickerScreen />);
    expect(await screen.findByText("앱 목록을 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByText("0개 선택")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    unmount();
    expect(notifyPickerClosed).toHaveBeenCalledWith(undefined);
    warn.mockRestore();
  });

  it("고르고 완료를 누르면 닫고, 닫힐 때 고른 패키지 목록을 넘긴다", async () => {
    const { unmount } = await renderPicker();
    fireEvent.press(screen.getByRole("checkbox", { name: "카카오톡" }));
    expect(screen.getByText("2개 선택")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "완료" }));
    expect(router.back).toHaveBeenCalled();

    unmount();
    expect(notifyPickerClosed).toHaveBeenCalledWith(
      JSON.stringify(["com.instagram.android", "com.kakao.talk"]),
    );
  });

  it("바꾸지 않고 닫으면 바뀐 게 없다고 넘긴다", async () => {
    const { unmount } = await renderPicker();
    fireEvent.press(screen.getByRole("button", { name: "뒤로" }));
    expect(router.back).toHaveBeenCalled();
    unmount();
    expect(notifyPickerClosed).toHaveBeenCalledWith(undefined);
  });

  it("다 지우고 닫으면 null을 넘긴다", async () => {
    const { unmount } = await renderPicker();
    fireEvent.press(screen.getByRole("checkbox", { name: "인스타그램" }));
    unmount();
    expect(notifyPickerClosed).toHaveBeenCalledWith(null);
  });
});
