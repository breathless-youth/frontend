import { router } from "expo-router";
import { Share } from "react-native";

import type { SubmitResultMessage } from "@focusmakers/types";

import { handleBridgeMessage } from "../nativeBridgeHandler";
import { getCameraPermissionStatus, openAppSettings } from "../cameraPermission";
import { runCameraPermissionGate } from "../cameraPermissionGate";
import { getMotionSensorRelay } from "../motionSensorRelay";
import { relaySessionSubmit } from "../sessionSubmitRelay";

/**
 * 브리지 수신 공용 핸들러(BY-333) — `RemoteWebViewHost`를 쓰는 화면(탭 3개 + 세션) 전부가
 * 같은 규칙으로 반응하는지 여기서 한 번만 검증한다. 화면별 wiring 테스트
 * (`__tests__/session-room.test.tsx` 등)는 "이 핸들러가 실제로 연결됐는지"만 확인한다.
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

jest.mock("../cameraPermissionGate", () => ({
  runCameraPermissionGate: jest.fn(),
}));

jest.mock("../cameraPermission", () => ({
  openAppSettings: jest.fn(async () => undefined),
  getCameraPermissionStatus: jest.fn(),
}));

jest.mock("../sessionSubmitRelay", () => ({
  relaySessionSubmit: jest.fn(),
}));

jest.mock("../motionSensorRelay", () => ({
  getMotionSensorRelay: jest.fn(),
}));

/** 응답을 보지 않는 테스트용 통로. 실제 통로는 `RemoteWebViewHost`의 `injectJavaScript`다. */
const noopReply = jest.fn();

const mockedRouter = router as unknown as {
  push: jest.Mock;
  back: jest.Mock;
  replace: jest.Mock;
  navigate: jest.Mock;
  canGoBack: jest.Mock;
};
const mockedRunCameraPermissionGate = runCameraPermissionGate as jest.MockedFunction<
  typeof runCameraPermissionGate
>;
const mockedOpenAppSettings = openAppSettings as jest.MockedFunction<typeof openAppSettings>;
const mockedGetCameraPermissionStatus = getCameraPermissionStatus as jest.MockedFunction<
  typeof getCameraPermissionStatus
>;
const mockedRelaySessionSubmit = relaySessionSubmit as jest.MockedFunction<
  typeof relaySessionSubmit
>;
const mockedGetMotionSensorRelay = getMotionSensorRelay as jest.MockedFunction<
  typeof getMotionSensorRelay
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedRouter.canGoBack.mockReturnValue(true);
});

describe("handleBridgeMessage", () => {
  it("session-ready는 아무 것도 하지 않는다 — 네이티브가 추가로 할 일이 없다", () => {
    expect(() => handleBridgeMessage({ type: "session-ready", atMs: 1 }, noopReply)).not.toThrow();
    expect(mockedRouter.push).not.toHaveBeenCalled();
    expect(mockedRouter.back).not.toHaveBeenCalled();
    expect(mockedOpenAppSettings).not.toHaveBeenCalled();
  });

  it("start-session → 권한이 있으면 세션 화면으로 push한다", async () => {
    mockedRunCameraPermissionGate.mockResolvedValue("start-session");

    handleBridgeMessage({ type: "start-session", atMs: 1 }, noopReply);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRunCameraPermissionGate).toHaveBeenCalledTimes(1);
    expect(mockedRouter.push).toHaveBeenCalledWith("/room/1");
  });

  it("start-session → 권한이 거부되면 권한 거부 안내로 보낸다", async () => {
    mockedRunCameraPermissionGate.mockResolvedValue("show-denied-guide");

    handleBridgeMessage({ type: "start-session", atMs: 1 }, noopReply);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRouter.push).toHaveBeenCalledWith("/permission-denied");
  });

  it("request-camera-gate → 게이트 통과면 granted true로 답하고 화면 전환은 없다", async () => {
    mockedRunCameraPermissionGate.mockResolvedValue("start-session");
    const reply = jest.fn();

    handleBridgeMessage({ type: "request-camera-gate", atMs: 1 }, reply);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRunCameraPermissionGate).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "camera-gate-result", granted: true }),
    );
    expect(mockedRouter.push).not.toHaveBeenCalled();
  });

  it("request-camera-gate → 거부면 권한 거부 안내를 띄우고 granted false로 답한다", async () => {
    mockedRunCameraPermissionGate.mockResolvedValue("show-denied-guide");
    const reply = jest.fn();

    handleBridgeMessage({ type: "request-camera-gate", atMs: 1 }, reply);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRouter.push).toHaveBeenCalledWith("/permission-denied");
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "camera-gate-result", granted: false }),
    );
  });

  it("request-camera-gate → 게이트 실행이 실패하면 granted false로 답한다 — 확인 못 한 권한으로 입장시키지 않는다", async () => {
    mockedRunCameraPermissionGate.mockRejectedValue(new Error("native unavailable"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const reply = jest.fn();

    handleBridgeMessage({ type: "request-camera-gate", atMs: 1 }, reply);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "camera-gate-result", granted: false }),
    );
    warn.mockRestore();
  });

  it("navigate-home → 뒤로 갈 곳이 있으면 pop한다", () => {
    handleBridgeMessage({ type: "navigate-home", atMs: 1 }, noopReply);

    expect(mockedRouter.back).toHaveBeenCalledTimes(1);
  });

  /**
   * 스택이 비어 있을 때 아무 일도 하지 않으면 사용자가 결과 화면에 갇힌다 — 웹 라우터
   * 폴백은 WebView 안의 웹 홈을 열 뿐 네이티브 탭으로 나오지 못한다.
   */
  it("navigate-home → 뒤로 갈 곳이 없으면 탭 루트로 교체한다", () => {
    mockedRouter.canGoBack.mockReturnValue(false);

    handleBridgeMessage({ type: "navigate-home", atMs: 1 }, noopReply);

    expect(mockedRouter.back).not.toHaveBeenCalled();
    expect(mockedRouter.replace).toHaveBeenCalledWith("/");
  });

  it("navigate-tab → 기록 탭으로 이동한다 (홈 연속 공부 카드)", () => {
    handleBridgeMessage({ type: "navigate-tab", tab: "records", atMs: 1 }, noopReply);

    // push가 아니라 navigate — 이미 기록 탭이면 화면을 쌓지 않고 재사용한다.
    expect(mockedRouter.navigate).toHaveBeenCalledWith("/records");
    expect(mockedRouter.push).not.toHaveBeenCalled();
  });

  it("share → OS 공유 시트를 연다 (Android 웹뷰의 navigator.share 부재 대행)", () => {
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });

    handleBridgeMessage(
      {
        type: "share",
        text: "초대 텍스트",
        url: "https://web.sunqstudio.kr/social/join?code=0712",
        title: "포커스 메이커스 그룹 스터디",
        atMs: 1,
      },
      noopReply,
    );

    // url은 레거시 웹 메시지가 보낼 때만 수신하는 호환 필드다(현행 웹은 생략, BY-584) —
    // 받으면 그대로 전달하나 Android는 무시한다. title은 시트 제목, 링크는 message 본문에 있다.
    expect(shareSpy).toHaveBeenCalledWith({
      message: "초대 텍스트",
      url: "https://web.sunqstudio.kr/social/join?code=0712",
      title: "포커스 메이커스 그룹 스터디",
    });
    expect(noopReply).not.toHaveBeenCalled();
  });

  it("share에 url·title이 없으면(구버전 웹) message만 전달한다", () => {
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });

    handleBridgeMessage({ type: "share", text: "초대 텍스트", atMs: 1 }, noopReply);

    expect(shareSpy).toHaveBeenCalledWith({ message: "초대 텍스트" });
  });

  it("open-settings → OS 설정 앱을 연다", () => {
    handleBridgeMessage({ type: "open-settings", atMs: 1 }, noopReply);

    expect(mockedOpenAppSettings).toHaveBeenCalledTimes(1);
  });

  /**
   * 응답을 돌려주지 않으면 웹이 타임아웃까지 "저장 중..."에 갇힌다 — 화면에 증상이 없는
   * 유실이라 못 박는다. `requestId`를 그대로 실어 보내야 재시도와 낡은 응답이 섞이지 않는다.
   */
  it("submit-session → 제출을 대행하고 결과를 웹으로 되돌려 보낸다", async () => {
    const result: SubmitResultMessage = {
      type: "submit-result",
      requestId: "req-1",
      ok: true,
      sessions: [],
      atMs: 2,
    };
    mockedRelaySessionSubmit.mockResolvedValue(result);
    const reply = jest.fn();

    handleBridgeMessage(
      {
        type: "submit-session",
        requestId: "req-1",
        request: {
          userId: 1,
          startedAt: "",
          endedAt: "",
          studySec: 0,
          focusSec: 0,
          events: [],
        },
        atMs: 1,
      },
      reply,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRelaySessionSubmit).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(result);
  });

  describe("request-camera-permission", () => {
    it("granted면 granted: true로 답한다", async () => {
      mockedGetCameraPermissionStatus.mockResolvedValue("granted");
      const reply = jest.fn();

      handleBridgeMessage({ type: "request-camera-permission", atMs: 1 }, reply);
      await Promise.resolve();
      await Promise.resolve();

      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ type: "camera-permission", granted: true }),
      );
    });

    it("denied·undetermined는 둘 다 granted: false로 접는다 — 화면이 구분하지 않는다", async () => {
      for (const status of ["denied", "undetermined"] as const) {
        mockedGetCameraPermissionStatus.mockResolvedValue(status);
        const reply = jest.fn();

        handleBridgeMessage({ type: "request-camera-permission", atMs: 1 }, reply);
        await Promise.resolve();
        await Promise.resolve();

        expect(reply).toHaveBeenCalledWith(
          expect.objectContaining({ type: "camera-permission", granted: false }),
        );
      }
    });

    it("조회에 실패하면 아무것도 답하지 않는다 — false로 답하면 웹이 '허용 안 됨'을 단언하게 된다", async () => {
      mockedGetCameraPermissionStatus.mockRejectedValue(new Error("boom"));
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const reply = jest.fn();

      handleBridgeMessage({ type: "request-camera-permission", atMs: 1 }, reply);
      await Promise.resolve();
      await Promise.resolve();

      expect(reply).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("권한을 요청하지 않고 조회만 한다 — 설정 화면 진입만으로 OS 팝업이 뜨면 안 된다", async () => {
      mockedGetCameraPermissionStatus.mockResolvedValue("granted");

      handleBridgeMessage({ type: "request-camera-permission", atMs: 1 }, jest.fn());
      await Promise.resolve();

      expect(mockedGetCameraPermissionStatus).toHaveBeenCalledTimes(1);
      expect(mockedRunCameraPermissionGate).not.toHaveBeenCalled();
    });
  });

  it("motion-sensor를 센서 릴레이에 위임한다", () => {
    const handle = jest.fn();
    mockedGetMotionSensorRelay.mockReturnValue({ handle });

    const message = { type: "motion-sensor", enabled: true, atMs: 1 } as const;
    handleBridgeMessage(message, noopReply);

    expect(handle).toHaveBeenCalledWith(message, noopReply);
  });
});
