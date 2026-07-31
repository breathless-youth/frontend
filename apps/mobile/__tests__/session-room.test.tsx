import { act, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import SessionRoomScreen from "../app/room/[id]";
import { openAppSettings } from "../lib/cameraPermission";
import { runCameraPermissionGate } from "../lib/cameraPermissionGate";

/**
 * 싱글룸 세션 화면 — `RemoteWebViewHost`(BY-333)의 첫 실사용처.
 *
 * 여기서 검증하는 것은 셋이다: (1) 세션 경로로 URL을 조립해 넘기는지, (2) 브리지 메시지
 * 3종(start-session·exit-session·open-settings)을 받았을 때 알맞은 네이티브 동작(권한
 * 게이트·화면 pop·설정 앱 열기)으로 이어지는지, (3) session-ready는 그대로 흘려보내는지.
 * URL 조립·실패 폴백 자체의 세부 분기는 `components/__tests__/RemoteWebViewHost.test.tsx`가 덮는다.
 */

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "1" }),
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webBaseUrl: "https://web.test" } } },
}));

jest.mock("react-native-webview", () => {
  /*
    eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports --
    `jest.mock` 팩토리는 상단 import보다 먼저 호이스팅돼 평가되므로 import 바인딩을 참조할 수 없다.
  */
  const ReactModule = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */

  return {
    WebView: ReactModule.forwardRef(function MockWebView(
      props: Record<string, unknown>,
      ref: React.Ref<{ reload: () => void }>,
    ) {
      ReactModule.useImperativeHandle(ref, () => ({ reload: jest.fn() }));
      return ReactModule.createElement(View, props);
    }),
  };
});

jest.mock("../lib/cameraPermissionGate", () => ({
  runCameraPermissionGate: jest.fn(),
}));

jest.mock("../lib/cameraPermission", () => ({
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

/** 웹이 보낸 것처럼 브리지 메시지를 흉내 낸다. */
function sendBridgeMessage(type: string) {
  const onMessage = screen.getByTestId("session-webview").props.onMessage as (e: unknown) => void;
  act(() => {
    onMessage({ nativeEvent: { data: JSON.stringify({ type, atMs: 1 }) } });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedRouter.canGoBack.mockReturnValue(true);
});

describe("SessionRoomScreen", () => {
  it("세션 경로로 조립한 URL을 WebView에 넘긴다", () => {
    render(<SessionRoomScreen />);

    expect(screen.getByTestId("session-webview").props.source).toEqual({
      uri: "https://web.test/room/1",
    });
  });

  it("세션 화면은 항상 다크 배경이다", () => {
    render(<SessionRoomScreen />);

    expect(screen.getByTestId("session-webview").props.style).toEqual({
      flex: 1,
      backgroundColor: "#0B0F14",
    });
  });

  it("session-ready는 그대로 흘려보낸다 — 네이티브가 추가로 할 일이 없다", () => {
    render(<SessionRoomScreen />);

    expect(() => sendBridgeMessage("session-ready")).not.toThrow();
    expect(mockedRouter.push).not.toHaveBeenCalled();
    expect(mockedRouter.back).not.toHaveBeenCalled();
    expect(mockedOpenAppSettings).not.toHaveBeenCalled();
  });

  it("start-session → 권한이 있으면 세션 화면으로 push한다", async () => {
    mockedRunCameraPermissionGate.mockResolvedValue("start-session");
    render(<SessionRoomScreen />);

    sendBridgeMessage("start-session");
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedRunCameraPermissionGate).toHaveBeenCalledTimes(1);
    expect(mockedRouter.push).toHaveBeenCalledWith("/room/1");
  });

  it("start-session → 권한이 거부되면 권한 거부 안내로 보낸다", async () => {
    mockedRunCameraPermissionGate.mockResolvedValue("show-denied-guide");
    render(<SessionRoomScreen />);

    sendBridgeMessage("start-session");
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedRouter.push).toHaveBeenCalledWith("/permission-denied");
  });

  it("exit-session → 세션 화면을 pop한다", () => {
    render(<SessionRoomScreen />);

    sendBridgeMessage("exit-session");

    expect(mockedRouter.back).toHaveBeenCalledTimes(1);
  });

  it("exit-session → 뒤로 갈 곳이 없으면 아무 것도 하지 않는다", () => {
    mockedRouter.canGoBack.mockReturnValue(false);
    render(<SessionRoomScreen />);

    sendBridgeMessage("exit-session");

    expect(mockedRouter.back).not.toHaveBeenCalled();
  });

  it("open-settings → OS 설정 앱을 연다", () => {
    render(<SessionRoomScreen />);

    sendBridgeMessage("open-settings");

    expect(mockedOpenAppSettings).toHaveBeenCalledTimes(1);
  });
});
