import { router } from "expo-router";

import { handleBridgeMessage } from "../nativeBridgeHandler";
import { openAppSettings } from "../cameraPermission";
import { runCameraPermissionGate } from "../cameraPermissionGate";

/**
 * 브리지 수신 공용 핸들러(BY-333) — `RemoteWebViewHost`를 쓰는 화면(탭 3개 + 세션) 전부가
 * 같은 규칙으로 반응하는지 여기서 한 번만 검증한다. 화면별 wiring 테스트
 * (`__tests__/session-room.test.tsx` 등)는 "이 핸들러가 실제로 연결됐는지"만 확인한다.
 */

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

jest.mock("../cameraPermissionGate", () => ({
  runCameraPermissionGate: jest.fn(),
}));

jest.mock("../cameraPermission", () => ({
  openAppSettings: jest.fn(async () => undefined),
}));

const mockedRouter = router as unknown as {
  push: jest.Mock;
  back: jest.Mock;
  canGoBack: jest.Mock;
};
const mockedRunCameraPermissionGate = runCameraPermissionGate as jest.MockedFunction<
  typeof runCameraPermissionGate
>;
const mockedOpenAppSettings = openAppSettings as jest.MockedFunction<typeof openAppSettings>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedRouter.canGoBack.mockReturnValue(true);
});

describe("handleBridgeMessage", () => {
  it("session-ready는 아무 것도 하지 않는다 — 네이티브가 추가로 할 일이 없다", () => {
    expect(() => handleBridgeMessage({ type: "session-ready", atMs: 1 })).not.toThrow();
    expect(mockedRouter.push).not.toHaveBeenCalled();
    expect(mockedRouter.back).not.toHaveBeenCalled();
    expect(mockedOpenAppSettings).not.toHaveBeenCalled();
  });

  it("start-session → 권한이 있으면 세션 화면으로 push한다", async () => {
    mockedRunCameraPermissionGate.mockResolvedValue("start-session");

    handleBridgeMessage({ type: "start-session", atMs: 1 });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRunCameraPermissionGate).toHaveBeenCalledTimes(1);
    expect(mockedRouter.push).toHaveBeenCalledWith("/room/1");
  });

  it("start-session → 권한이 거부되면 권한 거부 안내로 보낸다", async () => {
    mockedRunCameraPermissionGate.mockResolvedValue("show-denied-guide");

    handleBridgeMessage({ type: "start-session", atMs: 1 });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRouter.push).toHaveBeenCalledWith("/permission-denied");
  });

  it("exit-session → 뒤로 갈 곳이 있으면 pop한다", () => {
    handleBridgeMessage({ type: "exit-session", atMs: 1 });

    expect(mockedRouter.back).toHaveBeenCalledTimes(1);
  });

  it("exit-session → 뒤로 갈 곳이 없으면 아무 것도 하지 않는다", () => {
    mockedRouter.canGoBack.mockReturnValue(false);

    handleBridgeMessage({ type: "exit-session", atMs: 1 });

    expect(mockedRouter.back).not.toHaveBeenCalled();
  });

  it("open-settings → OS 설정 앱을 연다", () => {
    handleBridgeMessage({ type: "open-settings", atMs: 1 });

    expect(mockedOpenAppSettings).toHaveBeenCalledTimes(1);
  });
});
