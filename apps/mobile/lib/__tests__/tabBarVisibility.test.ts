import { act, renderHook } from "@testing-library/react-native";

import {
  __resetTabBarVisibilityForTests,
  setTabBarState,
  useTabBarState,
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

beforeEach(() => {
  __resetTabBarVisibilityForTests();
});

describe("useTabBarState", () => {
  it("기본값은 보임이다 — 메시지가 오기 전에 감추면 사용자가 이동 수단을 잃는다", () => {
    const { result } = renderHook(() => useTabBarState());

    expect(result.current).toBe("visible");
  });

  it("감춤·복귀가 구독 중인 화면에 반영된다", () => {
    const { result } = renderHook(() => useTabBarState());

    act(() => {
      setTabBarState("hidden");
    });
    expect(result.current).toBe("hidden");

    act(() => {
      setTabBarState("visible");
    });
    expect(result.current).toBe("visible");
  });

  it("구독을 해제한 뒤에는 갱신되지 않는다 — 언마운트된 화면을 깨우지 않는다", () => {
    const { result, unmount } = renderHook(() => useTabBarState());
    unmount();

    act(() => {
      setTabBarState("hidden");
    });

    expect(result.current).toBe("visible");
  });
});

describe("set-tab-bar 메시지 연결", () => {
  it("웹이 전체 화면 라우트로 이동하면 탭 바가 사라진다", () => {
    const { result } = renderHook(() => useTabBarState());

    act(() => {
      handleBridgeMessage({ type: "set-tab-bar", visible: false, atMs: 1 }, jest.fn());
    });

    expect(result.current).toBe("hidden");
  });

  it("가이드를 닫고 탭 라우트로 돌아오면 탭 바가 복귀한다", () => {
    const { result } = renderHook(() => useTabBarState());
    act(() => {
      handleBridgeMessage({ type: "set-tab-bar", visible: false, atMs: 1 }, jest.fn());
    });

    act(() => {
      handleBridgeMessage({ type: "set-tab-bar", visible: true, atMs: 2 }, jest.fn());
    });

    expect(result.current).toBe("visible");
  });
});

describe("blockedByModal", () => {
  it("blockedByModal이면 차단 상태가 된다 — 탭 바는 남고 터치만 막힌다", () => {
    const { result } = renderHook(() => useTabBarState());

    act(() => {
      handleBridgeMessage(
        { type: "set-tab-bar", visible: false, blockedByModal: true, atMs: 1 },
        jest.fn(),
      );
    });

    expect(result.current).toBe("blocked");
  });

  it("모달이 닫히면 경로 기준 상태로 돌아온다", () => {
    const { result } = renderHook(() => useTabBarState());

    act(() => {
      handleBridgeMessage(
        { type: "set-tab-bar", visible: false, blockedByModal: true, atMs: 1 },
        jest.fn(),
      );
      handleBridgeMessage({ type: "set-tab-bar", visible: true, atMs: 2 }, jest.fn());
    });

    expect(result.current).toBe("visible");
  });

  it("blockedByModal 없이 visible이 false면 자리까지 감춘다 — 전체 화면 라우트 동작", () => {
    const { result } = renderHook(() => useTabBarState());

    act(() => {
      handleBridgeMessage({ type: "set-tab-bar", visible: false, atMs: 1 }, jest.fn());
    });

    expect(result.current).toBe("hidden");
  });

  it("visible이 true여도 blockedByModal이 true면 차단이 이긴다 — 재보고가 두 값을 동시에 실어 보낼 수 있어 우선순위를 못 박는다", () => {
    const { result } = renderHook(() => useTabBarState());

    act(() => {
      handleBridgeMessage(
        { type: "set-tab-bar", visible: true, blockedByModal: true, atMs: 1 },
        jest.fn(),
      );
    });

    expect(result.current).toBe("blocked");
  });
});
