import { type CameraPermissionStatus, setCameraPermissionAdapter } from "../cameraPermission";
import { decideFromPermissionStatus, runCameraPermissionGate } from "../cameraPermissionGate";

/**
 * 게이트는 어댑터 뒤의 실제 구현(`expo-camera`)을 알 필요가 없다 — 상태와 실패만 재현하면 된다.
 * 어댑터를 통째로 교체하므로 이 테스트는 네이티브 모듈을 건드리지 않는다.
 */
function stubPermission(options: {
  status: CameraPermissionStatus | Error;
  dialogOutcome?: CameraPermissionStatus | Error;
}) {
  const request = jest.fn(() =>
    options.dialogOutcome instanceof Error
      ? Promise.reject(options.dialogOutcome)
      : Promise.resolve(options.dialogOutcome ?? "denied"),
  );
  setCameraPermissionAdapter({
    getStatus: () =>
      options.status instanceof Error
        ? Promise.reject(options.status)
        : Promise.resolve(options.status),
    request,
  });
  return request;
}

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
    const request = stubPermission({ status: "granted" });

    await expect(runCameraPermissionGate()).resolves.toBe("start-session");
    expect(request).not.toHaveBeenCalled();
  });

  it("미결정 상태에서 허용하면 세션으로 간다", async () => {
    const request = stubPermission({ status: "undetermined", dialogOutcome: "granted" });

    await expect(runCameraPermissionGate()).resolves.toBe("start-session");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("미결정 상태에서 거부하면 S2-3으로 간다", async () => {
    stubPermission({ status: "undetermined", dialogOutcome: "denied" });

    await expect(runCameraPermissionGate()).resolves.toBe("show-denied-guide");
  });

  it("이미 거부된 상태에서는 다이얼로그를 다시 띄우지 않고 바로 S2-3으로 간다", async () => {
    const request = stubPermission({ status: "denied", dialogOutcome: "granted" });

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
      stubPermission({ status: new Error("권한 조회 실패") });

      await expect(runCameraPermissionGate()).resolves.toBe("show-denied-guide");
      expect(warn).toHaveBeenCalled();
    });

    it("다이얼로그 요청이 실패해도 세션을 시작하지 않는다", async () => {
      stubPermission({ status: "undetermined", dialogOutcome: new Error("다이얼로그 실패") });

      await expect(runCameraPermissionGate()).resolves.toBe("show-denied-guide");
    });
  });
});
