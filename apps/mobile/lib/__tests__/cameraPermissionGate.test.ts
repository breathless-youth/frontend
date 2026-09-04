import { type CameraPermissionStatus, setCameraPermissionAdapter } from "../cameraPermission";
import { decideFromPermissionStatus, runCameraPermissionGate } from "../cameraPermissionGate";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../nativeAnalytics";

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

/**
 * 게이트 분기 결과는 웹 Amplitude로 넘어간다(`camera_permission_gate_resolved`) — OS 다이얼로그
 * 거부율은 웹이 관측할 수 없는 값이다. 결과·다이얼로그 노출 여부·룸 종류가 정확히 실리는지 본다.
 */
describe("runCameraPermissionGate — camera_permission_gate_resolved 이벤트", () => {
  let received: NativeAnalyticsEvent[];
  let warn: jest.SpyInstance;

  beforeEach(() => {
    __resetNativeAnalyticsForTests();
    received = [];
    attachNativeAnalyticsSink((event) => received.push(event));
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    __resetNativeAnalyticsForTests();
    warn.mockRestore();
  });

  const properties = () => received.map((event) => event.properties);

  it("이미 허용 — 다이얼로그 없이 granted", async () => {
    stubPermission({ status: "granted" });
    await runCameraPermissionGate();
    expect(properties()).toEqual([{ result: "granted", prompted: false, room_type: "single" }]);
  });

  it("미결정 → 허용 — 다이얼로그를 띄운 granted", async () => {
    stubPermission({ status: "undetermined", dialogOutcome: "granted" });
    await runCameraPermissionGate();
    expect(properties()).toEqual([{ result: "granted", prompted: true, room_type: "single" }]);
  });

  it("미결정 → 거부 — denied", async () => {
    stubPermission({ status: "undetermined", dialogOutcome: "denied" });
    await runCameraPermissionGate();
    expect(properties()).toEqual([{ result: "denied", prompted: true, room_type: "single" }]);
  });

  it("이미 거부 — 다이얼로그 없이 already_denied", async () => {
    stubPermission({ status: "denied" });
    await runCameraPermissionGate();
    expect(properties()).toEqual([
      { result: "already_denied", prompted: false, room_type: "single" },
    ]);
  });

  it("조회 실패 — error, 다이얼로그 전", async () => {
    stubPermission({ status: new Error("권한 조회 실패") });
    await runCameraPermissionGate();
    expect(properties()).toEqual([{ result: "error", prompted: false, room_type: "single" }]);
  });

  it("다이얼로그 요청 실패 — error, 다이얼로그 후", async () => {
    stubPermission({ status: "undetermined", dialogOutcome: new Error("다이얼로그 실패") });
    await runCameraPermissionGate();
    expect(properties()).toEqual([{ result: "error", prompted: true, room_type: "single" }]);
  });

  it("소셜룸 입장 게이트는 room_type을 social로 싣는다", async () => {
    stubPermission({ status: "granted" });
    await runCameraPermissionGate("social");
    expect(properties()).toEqual([{ result: "granted", prompted: false, room_type: "social" }]);
  });

  it("호출당 정확히 한 번만 남긴다", async () => {
    stubPermission({ status: "undetermined", dialogOutcome: "granted" });
    await runCameraPermissionGate();
    expect(received).toHaveLength(1);
  });
});
