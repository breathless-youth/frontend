import { act, renderHook } from "@testing-library/react-native";

import {
  __resetTabBarVisibilityForTests,
  setTabBarVisible,
  useTabBarVisible,
} from "../tabBarVisibility";
import { handleBridgeMessage } from "../nativeBridgeHandler";

/**
 * 탭 바 가시성 스토어 — 전체 화면 웹 라우트(가이드 G1~G5·문의·약관·방침)에서 탭 바를 감추기
 * 위한 통로다. 웹 라우팅은 네이티브 스택을 건너므로 이 신호가 없으면 탭 바가 그대로 남는다.
 */

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
}));
jest.mock("../cameraPermissionGate", () => ({ runCameraPermissionGate: jest.fn() }));
jest.mock("../cameraPermission", () => ({
  openAppSettings: jest.fn(),
  getCameraPermissionStatus: jest.fn(),
}));
jest.mock("../sessionSubmitRelay", () => ({ relaySessionSubmit: jest.fn() }));

beforeEach(() => {
  __resetTabBarVisibilityForTests();
});

describe("useTabBarVisible", () => {
  it("기본값은 보임이다 — 메시지가 오기 전에 감추면 사용자가 이동 수단을 잃는다", () => {
    const { result } = renderHook(() => useTabBarVisible());

    expect(result.current).toBe(true);
  });

  it("감춤·복귀가 구독 중인 화면에 반영된다", () => {
    const { result } = renderHook(() => useTabBarVisible());

    act(() => {
      setTabBarVisible(false);
    });
    expect(result.current).toBe(false);

    act(() => {
      setTabBarVisible(true);
    });
    expect(result.current).toBe(true);
  });

  it("구독을 해제한 뒤에는 갱신되지 않는다 — 언마운트된 화면을 깨우지 않는다", () => {
    const { result, unmount } = renderHook(() => useTabBarVisible());
    unmount();

    act(() => {
      setTabBarVisible(false);
    });

    expect(result.current).toBe(true);
  });
});

describe("set-tab-bar 메시지 연결", () => {
  it("웹이 전체 화면 라우트로 이동하면 탭 바가 사라진다", () => {
    const { result } = renderHook(() => useTabBarVisible());

    act(() => {
      handleBridgeMessage({ type: "set-tab-bar", visible: false, atMs: 1 }, jest.fn());
    });

    expect(result.current).toBe(false);
  });

  it("가이드를 닫고 탭 라우트로 돌아오면 탭 바가 복귀한다", () => {
    const { result } = renderHook(() => useTabBarVisible());
    act(() => {
      handleBridgeMessage({ type: "set-tab-bar", visible: false, atMs: 1 }, jest.fn());
    });

    act(() => {
      handleBridgeMessage({ type: "set-tab-bar", visible: true, atMs: 2 }, jest.fn());
    });

    expect(result.current).toBe(true);
  });
});
