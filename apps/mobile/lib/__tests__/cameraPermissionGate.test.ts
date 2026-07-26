import {
  mockCameraPermissionAdapter,
  resetMockCameraPermissionState,
  setCameraPermissionAdapter,
  setMockCameraPermissionState,
} from "../cameraPermission";
import { decideFromPermissionStatus, runCameraPermissionGate } from "../cameraPermissionGate";

beforeEach(() => {
  setCameraPermissionAdapter(mockCameraPermissionAdapter);
  resetMockCameraPermissionState();
});

describe("decideFromPermissionStatus", () => {
  it("granted면 세션으로 진행한다", () => {
    expect(decideFromPermissionStatus("granted")).toBe("start-session");
  });

  it("undetermined면 OS 다이얼로그(S2-2)를 띄워야 한다", () => {
    expect(decideFromPermissionStatus("undetermined")).toBe("request-permission");
  });

  it("denied면 재요청 없이 S2-3으로 보낸다", () => {
    expect(decideFromPermissionStatus("denied")).toBe("show-denied-guide");
  });
});

describe("runCameraPermissionGate", () => {
  it("이미 허용돼 있으면 다이얼로그 없이 세션으로 간다", async () => {
    setMockCameraPermissionState({ status: "granted" });
    const request = jest.fn();
    setCameraPermissionAdapter({
      getStatus: () => Promise.resolve("granted"),
      request,
    });

    await expect(runCameraPermissionGate()).resolves.toBe("start-session");
    expect(request).not.toHaveBeenCalled();
  });

  it("미결정 상태에서 허용하면 세션으로 간다", async () => {
    setMockCameraPermissionState({ status: "undetermined", dialogOutcome: "granted" });

    await expect(runCameraPermissionGate()).resolves.toBe("start-session");
  });

  it("미결정 상태에서 거부하면 S2-3으로 간다", async () => {
    setMockCameraPermissionState({ status: "undetermined", dialogOutcome: "denied" });

    await expect(runCameraPermissionGate()).resolves.toBe("show-denied-guide");
  });

  it("이미 거부된 상태에서는 다이얼로그를 다시 띄우지 않고 바로 S2-3으로 간다", async () => {
    const request = jest.fn().mockResolvedValue("denied");
    setCameraPermissionAdapter({
      getStatus: () => Promise.resolve("denied"),
      request,
    });

    await expect(runCameraPermissionGate()).resolves.toBe("show-denied-guide");
    expect(request).not.toHaveBeenCalled();
  });

  describe("fail-closed", () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it("조회가 실패하면 세션을 시작하지 않고 S2-3으로 보낸다", async () => {
      setCameraPermissionAdapter({
        getStatus: () => Promise.reject(new Error("네이티브 모듈 없음")),
        request: jest.fn(),
      });

      await expect(runCameraPermissionGate()).resolves.toBe("show-denied-guide");
      expect(warn).toHaveBeenCalled();
    });

    it("다이얼로그 요청이 실패해도 세션을 시작하지 않는다", async () => {
      setCameraPermissionAdapter({
        getStatus: () => Promise.resolve("undetermined"),
        request: () => Promise.reject(new Error("다이얼로그 실패")),
      });

      await expect(runCameraPermissionGate()).resolves.toBe("show-denied-guide");
    });
  });
});
