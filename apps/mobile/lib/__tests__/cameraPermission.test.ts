import { Linking } from "react-native";

import {
  getCameraPermissionStatus,
  mockCameraPermissionAdapter,
  openAppSettings,
  requestCameraPermission,
  resetMockCameraPermissionState,
  setCameraPermissionAdapter,
  setMockCameraPermissionState,
} from "../cameraPermission";

beforeEach(() => {
  setCameraPermissionAdapter(mockCameraPermissionAdapter);
  resetMockCameraPermissionState();
});

describe("mock 어댑터", () => {
  it("초기 상태는 undetermined다", async () => {
    await expect(getCameraPermissionStatus()).resolves.toBe("undetermined");
  });

  it("undetermined에서 요청하면 다이얼로그 응답값으로 전이한다", async () => {
    setMockCameraPermissionState({ dialogOutcome: "granted" });

    await expect(requestCameraPermission()).resolves.toBe("granted");
    await expect(getCameraPermissionStatus()).resolves.toBe("granted");
  });

  it("denied 상태에서 다시 요청해도 denied를 그대로 돌려준다 (iOS는 다이얼로그를 재노출하지 않는다)", async () => {
    setMockCameraPermissionState({ status: "denied", dialogOutcome: "granted" });

    await expect(requestCameraPermission()).resolves.toBe("denied");
  });

  it("granted 상태에서 요청해도 상태가 바뀌지 않는다", async () => {
    setMockCameraPermissionState({ status: "granted", dialogOutcome: "denied" });

    await expect(requestCameraPermission()).resolves.toBe("granted");
  });
});

describe("setCameraPermissionAdapter", () => {
  it("실제 구현으로 교체하면 조회·요청이 그쪽으로 위임된다", async () => {
    const getStatus = jest.fn().mockResolvedValue("granted");
    const request = jest.fn().mockResolvedValue("granted");
    setCameraPermissionAdapter({ getStatus, request });

    await expect(getCameraPermissionStatus()).resolves.toBe("granted");
    await expect(requestCameraPermission()).resolves.toBe("granted");
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("openAppSettings", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("OS 설정 앱을 연다", async () => {
    const spy = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);

    await openAppSettings();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("설정 앱을 열지 못해도 throw 하지 않는다 (S2-3 화면은 그대로 유지)", async () => {
    jest.spyOn(Linking, "openSettings").mockRejectedValue(new Error("unavailable"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(openAppSettings()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
