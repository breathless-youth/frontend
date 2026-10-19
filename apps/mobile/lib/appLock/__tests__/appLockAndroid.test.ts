import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
  authorizeAppLock,
  cleanupOnLaunch,
  getAppLockState,
  isAppLockSupported,
  saveSelection,
  startStudyLock,
  stopStudyLock,
} from "../appLock";
import { notifyConsentClosed } from "../androidFlow";
import { getRnda } from "../rnda";

/**
 * Android 방해 앱 잠금 경로
 *
 * 네이티브 모듈은 기기 상태를 흉내 내는 가짜로 바꾸고, RNDA는 Android에서 쓰지 않으므로 늘 null이다.
 */

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../rnda", () => ({ getRnda: jest.fn(() => null) }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
}));

type FakeNative = ReturnType<typeof fakeNative>;
const mockModule: { native: FakeNative | null } = { native: null };
jest.mock("../../../modules/app-lock", () => ({
  get appLockNative() {
    return mockModule.native;
  },
}));

function fakeNative() {
  let selected = ["com.instagram.android", "com.google.android.youtube"];
  return {
    hasUsageAccess: jest.fn(() => true),
    canDrawOverlays: jest.fn(() => true),
    openUsageAccessSettings: jest.fn(),
    openOverlaySettings: jest.fn(),
    openAppBatterySettings: jest.fn(),
    getLaunchableApps: jest.fn(async () => []),
    getSelectedPackages: jest.fn(() => selected),
    setSelectedPackages: jest.fn((packages: string[]) => {
      selected = packages;
    }),
    startLock: jest.fn(() => selected.length),
    stopLock: jest.fn(),
  };
}

const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;
let native: FakeNative;
let store: Record<string, string>;

// 고지 화면을 열기 전후의 보안 저장소 읽기가 끝날 때까지 기다린다.
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setAndroidApi(level: number) {
  jest.spyOn(Platform, "Version", "get").mockReturnValue(level);
}

function setManufacturer(manufacturer: string, brand = manufacturer) {
  jest
    .spyOn(Platform, "constants", "get")
    .mockReturnValue({ Manufacturer: manufacturer, Brand: brand } as typeof Platform.constants);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.replaceProperty(Platform, "OS", "android");
  setAndroidApi(34);
  setManufacturer("Google");
  native = fakeNative();
  mockModule.native = native;
  store = {};
  mockedGet.mockImplementation(async (key: string) => store[key] ?? null);
  mockedSet.mockImplementation(async (key: string, value: string) => {
    store[key] = value;
  });
});

describe("isAppLockSupported", () => {
  it("Android 8(API 26) 이상이고 모듈이 있으면 지원한다", () => {
    expect(isAppLockSupported()).toBe(true);
    setAndroidApi(25);
    expect(isAppLockSupported()).toBe(false);
  });

  it("모듈이 없는 빌드는 지원하지 않는다", () => {
    mockModule.native = null;
    expect(isAppLockSupported()).toBe(false);
  });

  it("Android에서는 RNDA를 찾지 않는다", () => {
    isAppLockSupported();
    expect(getRnda).not.toHaveBeenCalled();
  });
});

describe("getAppLockState", () => {
  it("두 권한이 다 있으면 허용이고 고른 앱 개수만 싣는다", async () => {
    await expect(getAppLockState()).resolves.toEqual({
      supported: true,
      authorized: true,
      revoked: false,
      appCount: 2,
      categoryCount: 0,
    });
    expect(store["appLock.approvedBefore"]).toBe("1");
  });

  it("권한 하나만 있으면 허용이 아니다", async () => {
    native.canDrawOverlays.mockReturnValue(false);
    await expect(getAppLockState()).resolves.toMatchObject({ authorized: false, revoked: false });
  });

  it("허용 기록이 있는데 권한 하나가 꺼지면 revoked다", async () => {
    store["appLock.approvedBefore"] = "1";
    native.hasUsageAccess.mockReturnValue(false);
    await expect(getAppLockState()).resolves.toMatchObject({ authorized: false, revoked: true });
  });

  it("허용 기록이 있어도 권한을 읽다 throw하면 revoked가 아니다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    store["appLock.approvedBefore"] = "1";
    native.canDrawOverlays.mockImplementation(() => {
      throw new Error("native");
    });
    await expect(getAppLockState()).resolves.toMatchObject({ authorized: false, revoked: false });
  });

  it("API 25에서는 미지원으로 답하고 모듈을 부르지 않는다", async () => {
    setAndroidApi(25);
    await expect(getAppLockState()).resolves.toMatchObject({ supported: false });
    expect(native.hasUsageAccess).not.toHaveBeenCalled();
  });
});

describe("authorizeAppLock", () => {
  it("두 권한이 이미 있으면 고지 화면을 열지 않고 허용으로 답한다", async () => {
    await expect(authorizeAppLock()).resolves.toMatchObject({ authorized: true });
    expect(router.push).not.toHaveBeenCalledWith("/app-lock-consent");
  });

  it("권한이 없으면 고지 화면을 열고 닫힐 때까지 기다린 뒤 그때 상태로 답한다", async () => {
    native.hasUsageAccess.mockReturnValue(false);
    native.canDrawOverlays.mockReturnValue(false);
    let settled = false;
    const result = authorizeAppLock().then((state) => {
      settled = true;
      return state;
    });
    await flush();
    expect(router.push).toHaveBeenCalledWith("/app-lock-consent");
    expect(settled).toBe(false);

    native.hasUsageAccess.mockReturnValue(true);
    native.canDrawOverlays.mockReturnValue(true);
    notifyConsentClosed();
    await expect(result).resolves.toMatchObject({ authorized: true });
  });

  it("권한 하나만 켜고 닫으면 허용 안 됨으로 답한다", async () => {
    native.canDrawOverlays.mockReturnValue(false);
    const result = authorizeAppLock();
    await flush();
    notifyConsentClosed();
    await expect(result).resolves.toMatchObject({ authorized: false });
  });

  it("고지 화면이 열려 있는 동안 온 요청은 화면을 다시 열지 않고 같이 기다린다", async () => {
    native.hasUsageAccess.mockReturnValue(false);
    const first = authorizeAppLock();
    const second = authorizeAppLock();
    await flush();
    notifyConsentClosed();
    await Promise.all([first, second]);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("고지 화면을 열지 못하면 기다리지 않고 지금 상태로 답한다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    native.hasUsageAccess.mockReturnValue(false);
    (router.push as jest.Mock).mockImplementationOnce(() => {
      throw new Error("navigation");
    });
    await expect(authorizeAppLock()).resolves.toMatchObject({ authorized: false });
  });

  it.each([
    ["samsung", "samsung"],
    ["Xiaomi", "Redmi"],
    ["Xiaomi", "POCO"],
  ])("허용되면 %s(%s)에는 배터리 안내를 한 번만 연다", async (manufacturer, brand) => {
    setManufacturer(manufacturer, brand);
    await authorizeAppLock();
    await authorizeAppLock();
    await flush();
    expect(
      (router.push as jest.Mock).mock.calls.filter(([path]) => path === "/app-lock-battery"),
    ).toHaveLength(1);
  });

  it("다른 제조사에는 배터리 안내를 열지 않는다", async () => {
    setManufacturer("Google");
    await authorizeAppLock();
    await flush();
    expect(router.push).not.toHaveBeenCalledWith("/app-lock-battery");
  });

  it("허용되지 않으면 배터리 안내를 열지 않는다", async () => {
    setManufacturer("samsung");
    native.canDrawOverlays.mockReturnValue(false);
    const result = authorizeAppLock();
    await flush();
    notifyConsentClosed();
    await result;
    await flush();
    expect(router.push).not.toHaveBeenCalledWith("/app-lock-battery");
  });
});

describe("saveSelection", () => {
  it("고른 패키지 목록을 기기에 저장하고 새 개수를 돌려준다", async () => {
    await expect(saveSelection(JSON.stringify(["com.kakao.talk"]))).resolves.toMatchObject({
      appCount: 1,
      categoryCount: 0,
    });
    expect(native.setSelectedPackages).toHaveBeenCalledWith(["com.kakao.talk"]);
  });

  it("null이면 선택을 비운다", async () => {
    await expect(saveSelection(null)).resolves.toMatchObject({ appCount: 0 });
    expect(native.setSelectedPackages).toHaveBeenCalledWith([]);
  });

  it("목록 형식이 아니면 저장하지 않는다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(saveSelection("{")).resolves.toMatchObject({ appCount: 2 });
    expect(native.setSelectedPackages).not.toHaveBeenCalled();
  });
});

describe("startStudyLock", () => {
  it("허용되고 고른 앱이 있으면 6시간 잠금 서비스를 시작하고 개수를 돌려준다", async () => {
    await expect(startStudyLock()).resolves.toEqual({ appCount: 2, categoryCount: 0 });
    expect(native.startLock).toHaveBeenCalledWith(6 * 3_600_000);
  });

  it("권한이 없으면 시작하지 않는다", async () => {
    native.hasUsageAccess.mockReturnValue(false);
    await expect(startStudyLock()).resolves.toBeNull();
    expect(native.startLock).not.toHaveBeenCalled();
  });

  it("고른 앱이 없으면 null이다", async () => {
    native.setSelectedPackages([]);
    await expect(startStudyLock()).resolves.toBeNull();
  });

  it("서비스 시작이 throw하면 null이다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    native.startLock.mockImplementation(() => {
      throw new Error("ForegroundServiceStartNotAllowed");
    });
    await expect(startStudyLock()).resolves.toBeNull();
  });
});

describe("stopStudyLock · cleanupOnLaunch", () => {
  it("잠금 서비스를 멈춘다", async () => {
    await stopStudyLock();
    await cleanupOnLaunch();
    expect(native.stopLock).toHaveBeenCalledTimes(2);
  });

  it("멈추다 throw해도 reject하지 않는다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    native.stopLock.mockImplementation(() => {
      throw new Error("native");
    });
    await expect(stopStudyLock()).resolves.toBeUndefined();
    await expect(cleanupOnLaunch()).resolves.toBeUndefined();
  });
});
