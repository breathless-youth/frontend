import { Camera } from "expo-camera";
import { Linking } from "react-native";

import {
  expoCameraPermissionAdapter,
  getCameraPermissionStatus,
  openAppSettings,
  requestCameraPermission,
  setCameraPermissionAdapter,
} from "../cameraPermission";

jest.mock("expo-camera", () => ({
  Camera: {
    getCameraPermissionsAsync: jest.fn(),
    requestCameraPermissionsAsync: jest.fn(),
  },
}));

const mockedGetPermissions = Camera.getCameraPermissionsAsync as jest.Mock;
const mockedRequestPermissions = Camera.requestCameraPermissionsAsync as jest.Mock;

beforeEach(() => {
  setCameraPermissionAdapter(expoCameraPermissionAdapter);
  mockedGetPermissions.mockReset();
  mockedRequestPermissions.mockReset();
});

describe("expo-camera 어댑터", () => {
  // expo-camera는 `granted`·`canAskAgain`·`expires`도 돌려주지만 어댑터는 `status`만 쓴다.
  // 남은 필드에 의존하지 않는다는 것을 응답 형태로 함께 고정한다.
  const response = (status: string) => ({
    status,
    granted: status === "granted",
    canAskAgain: status !== "denied",
    expires: "never" as const,
  });

  it.each(["undetermined", "granted", "denied"])(
    "조회 상태 %s를 그대로 돌려준다",
    async (status) => {
      mockedGetPermissions.mockResolvedValue(response(status));

      await expect(getCameraPermissionStatus()).resolves.toBe(status);
    },
  );

  it("아직 다시 물어볼 수 있는 거부는 undetermined로 돌려준다 — Android에서 설정으로 권한을 끈 상태", async () => {
    mockedGetPermissions.mockResolvedValue({
      status: "denied",
      granted: false,
      canAskAgain: true,
      expires: "never" as const,
    });

    await expect(getCameraPermissionStatus()).resolves.toBe("undetermined");
  });

  it("요청 결과는 다시 물어볼 수 있어도 그대로 돌려준다 — 방금 거부한 응답을 뒤집지 않는다", async () => {
    mockedRequestPermissions.mockResolvedValue({
      status: "denied",
      granted: false,
      canAskAgain: true,
      expires: "never" as const,
    });

    await expect(requestCameraPermission()).resolves.toBe("denied");
  });

  it("조회는 요청 API를 부르지 않는다 (다이얼로그를 띄우면 안 된다)", async () => {
    mockedGetPermissions.mockResolvedValue(response("undetermined"));

    await getCameraPermissionStatus();

    expect(mockedRequestPermissions).not.toHaveBeenCalled();
  });

  it("요청은 다이얼로그 응답 상태를 돌려준다", async () => {
    mockedRequestPermissions.mockResolvedValue(response("granted"));

    await expect(requestCameraPermission()).resolves.toBe("granted");
    expect(mockedRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it("네이티브 조회가 실패하면 그대로 reject한다 (게이트가 fail-closed로 받는다)", async () => {
    mockedGetPermissions.mockRejectedValue(new Error("native unavailable"));

    await expect(getCameraPermissionStatus()).rejects.toThrow("native unavailable");
  });
});

describe("setCameraPermissionAdapter", () => {
  it("어댑터를 교체하면 조회·요청이 그쪽으로 위임된다", async () => {
    const getStatus = jest.fn().mockResolvedValue("granted");
    const request = jest.fn().mockResolvedValue("granted");
    setCameraPermissionAdapter({ getStatus, request });

    await expect(getCameraPermissionStatus()).resolves.toBe("granted");
    await expect(requestCameraPermission()).resolves.toBe("granted");
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(mockedGetPermissions).not.toHaveBeenCalled();
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
