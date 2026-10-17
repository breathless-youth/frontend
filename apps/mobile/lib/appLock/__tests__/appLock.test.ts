import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
  authorizeAppLock,
  cleanupOnLaunch,
  getAppLockState,
  isAppLockSupported,
  safetyReleaseSchedule,
  saveSelection,
  startStudyLock,
  stopStudyLock,
} from "../appLock";
import { handleAppLockMessage } from "../appLockRelay";
import { getRnda } from "../rnda";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../rnda", () => ({ getRnda: jest.fn() }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
}));

const mockedGetRnda = getRnda as jest.Mock;
const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;

function fakeRnda() {
  const calls: string[] = [];
  const record =
    (name: string, impl: (...args: unknown[]) => unknown = () => undefined) =>
    (...args: unknown[]) => {
      calls.push(name);
      return impl(...args);
    };
  const rnda = {
    calls,
    getAuthorizationStatus: jest.fn(() => 2),
    requestAuthorization: jest.fn(async () => undefined),
    setFamilyActivitySelectionId: jest.fn(),
    userDefaultsGet: jest.fn(),
    userDefaultsSet: jest.fn(),
    getFamilyActivitySelectionId: jest.fn(),
    activitySelectionMetadata: jest.fn(() => ({
      applicationCount: 3,
      categoryCount: 1,
      webDomainCount: 0,
      includeEntireCategory: false,
    })),
    configureActions: jest.fn(record("configureActions")),
    startMonitoring: jest.fn(record("startMonitoring", async () => undefined)),
    updateShield: jest.fn(record("updateShield")),
    blockSelection: jest.fn(record("blockSelection")),
    unblockSelection: jest.fn(record("unblockSelection")),
    resetBlocks: jest.fn(record("resetBlocks")),
    stopMonitoring: jest.fn(record("stopMonitoring")),
  };
  return rnda;
}

let rnda: ReturnType<typeof fakeRnda>;

// Platform.Version은 getter라 replaceProperty로 바꿀 수 없다.
function setIosVersion(version: string) {
  jest.spyOn(Platform, "Version", "get").mockReturnValue(version);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.useRealTimers();
  jest.replaceProperty(Platform, "OS", "ios");
  setIosVersion("18.2");
  rnda = fakeRnda();
  mockedGetRnda.mockReturnValue(rnda);
  mockedGet.mockResolvedValue(null);
  mockedSet.mockResolvedValue(undefined);
});

describe("isAppLockSupported", () => {
  it("iOS 18 이상에서만 지원한다", () => {
    expect(isAppLockSupported()).toBe(true);
    setIosVersion("17.5.1");
    expect(isAppLockSupported()).toBe(false);
  });

  it("세 자리 버전 문자열도 주 버전으로 읽는다", () => {
    setIosVersion("18.0.1");
    expect(isAppLockSupported()).toBe(true);
  });

  it("Android나 모듈이 없는 빌드는 지원하지 않는다", () => {
    mockedGetRnda.mockReturnValue(null);
    expect(isAppLockSupported()).toBe(false);
  });
});

describe("getAppLockState", () => {
  it("허용 상태면 개수를 싣고 허용 기록을 남긴다", async () => {
    await expect(getAppLockState()).resolves.toEqual({
      supported: true,
      authorized: true,
      revoked: false,
      appCount: 3,
      categoryCount: 1,
    });
    expect(mockedSet).toHaveBeenCalledWith("appLock.approvedBefore", "1", expect.anything());
  });

  it("허용 기록이 있는데 미결정으로 돌아오면 revoked다", async () => {
    mockedGet.mockResolvedValue("1");
    rnda.getAuthorizationStatus.mockReturnValue(0);
    await expect(getAppLockState()).resolves.toMatchObject({ authorized: false, revoked: true });
  });

  it("처음 쓰는 사용자의 미결정은 revoked가 아니다", async () => {
    rnda.getAuthorizationStatus.mockReturnValue(0);
    await expect(getAppLockState()).resolves.toMatchObject({ authorized: false, revoked: false });
  });
});

describe("authorizeAppLock", () => {
  it("iOS 17에서는 권한을 묻지 않고 미지원으로 답한다", async () => {
    setIosVersion("17.5");
    await expect(authorizeAppLock()).resolves.toMatchObject({ supported: false });
    expect(rnda.requestAuthorization).not.toHaveBeenCalled();
  });

  it("허용하면 authorized다", async () => {
    rnda.getAuthorizationStatus.mockReturnValueOnce(0).mockReturnValue(2);
    await expect(authorizeAppLock()).resolves.toMatchObject({ authorized: true });
    expect(rnda.requestAuthorization).toHaveBeenCalledWith("individual");
  });

  it("거부하면 authorized가 아니다", async () => {
    rnda.getAuthorizationStatus.mockReturnValue(1);
    rnda.requestAuthorization.mockRejectedValue(new Error("denied"));
    await expect(authorizeAppLock()).resolves.toMatchObject({ authorized: false });
  });
});

describe("saveSelection", () => {
  it("선택을 저장하고 새 개수를 돌려준다", async () => {
    await expect(saveSelection("token")).resolves.toMatchObject({ appCount: 3, categoryCount: 1 });
    expect(rnda.setFamilyActivitySelectionId).toHaveBeenCalledWith({
      id: "focusmakers_app_lock",
      familyActivitySelection: "token",
    });
  });
});

describe("saveSelection(null)", () => {
  // 실제 라이브러리처럼 선택은 App Group의 id 사전에 들어 있고 개수는 그 사전에서 읽는다.
  function withSelectionStore(initial: Record<string, string>) {
    const store: Record<string, unknown> = { familyActivitySelectionIds: initial };
    rnda.userDefaultsGet.mockImplementation((key: string) => store[key]);
    rnda.userDefaultsSet.mockImplementation((key: string, value: unknown) => {
      store[key] = value;
    });
    rnda.activitySelectionMetadata.mockImplementation(() => {
      const ids = store.familyActivitySelectionIds as Record<string, string>;
      const has = ids.focusmakers_app_lock !== undefined;
      return {
        applicationCount: has ? 3 : 0,
        categoryCount: has ? 1 : 0,
        webDomainCount: 0,
        includeEntireCategory: false,
      };
    });
    return store;
  }

  it("다 지우면 저장된 선택을 없애 개수가 0이 되고 잠그지 않는다", async () => {
    const store = withSelectionStore({ focusmakers_app_lock: "token", other: "keep" });
    await expect(saveSelection(null)).resolves.toMatchObject({ appCount: 0, categoryCount: 0 });
    expect(store.familyActivitySelectionIds).toEqual({ other: "keep" });
    expect(rnda.setFamilyActivitySelectionId).not.toHaveBeenCalled();
    await expect(startStudyLock()).resolves.toBeNull();
  });

  it("저장된 선택이 없어도 던지지 않는다", async () => {
    withSelectionStore({});
    rnda.userDefaultsGet.mockReturnValue(undefined);
    await expect(saveSelection(null)).resolves.toMatchObject({ appCount: 0 });
  });
});

describe("startStudyLock", () => {
  it("안전 해제 예약을 먼저 걸고 잠근다", async () => {
    await expect(startStudyLock(new Date(2026, 9, 17, 9, 0, 0))).resolves.toEqual({
      appCount: 3,
      categoryCount: 1,
    });
    expect(rnda.calls).toEqual([
      "configureActions",
      "startMonitoring",
      "updateShield",
      "blockSelection",
    ]);
    expect(rnda.configureActions).toHaveBeenCalledWith({
      activityName: "focusmakers_study_lock",
      callbackName: "intervalDidEnd",
      actions: [{ type: "resetBlocks" }],
    });
    expect(rnda.startMonitoring).toHaveBeenCalledWith(
      "focusmakers_study_lock",
      safetyReleaseSchedule(new Date(2026, 9, 17, 9, 0, 0)),
      [],
    );
    expect(rnda.blockSelection).toHaveBeenCalledWith(
      { activitySelectionId: "focusmakers_app_lock" },
      expect.any(String),
    );
  });

  it("잠금 화면 문구·자물쇠 아이콘·닫기 버튼을 정한다", async () => {
    await startStudyLock();
    expect(rnda.updateShield).toHaveBeenCalledWith(
      {
        title: "지금은 공부에 집중하고,\n쉴 땐 확실히 쉬자고요:)",
        subtitle: "공부가 끝나면 다시 열려요",
        primaryButtonLabel: "닫기",
        iconSystemName: "lock.fill",
        // brand/primary 라이트 #1b64da
        iconTint: { red: 27, green: 100, blue: 218 },
      },
      { primary: { behavior: "close" } },
    );
  });

  it("고른 앱이 없으면 잠그지 않는다", async () => {
    rnda.activitySelectionMetadata.mockReturnValue({
      applicationCount: 0,
      categoryCount: 0,
      webDomainCount: 0,
      includeEntireCategory: false,
    });
    await expect(startStudyLock()).resolves.toBeNull();
    expect(rnda.calls).toEqual([]);
  });

  it("권한이 없으면 잠그지 않는다", async () => {
    rnda.getAuthorizationStatus.mockReturnValue(0);
    await expect(startStudyLock()).resolves.toBeNull();
    expect(rnda.calls).toEqual([]);
  });

  it("예약이 실패하면 잠그지 않는다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    rnda.startMonitoring.mockImplementation(() => Promise.reject(new Error("schedule")));
    await expect(startStudyLock()).resolves.toBeNull();
    expect(rnda.blockSelection).not.toHaveBeenCalled();
  });

  it("예약 뒤 잠금이 실패하면 예약을 지워 아무것도 남기지 않는다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    rnda.blockSelection.mockImplementation(() => {
      throw new Error("block");
    });
    await expect(startStudyLock()).resolves.toBeNull();
    expect(rnda.stopMonitoring).toHaveBeenCalledWith(["focusmakers_study_lock"]);
  });
});

describe("safetyReleaseSchedule", () => {
  it("12시간 뒤에 끝나는 일회성 예약을 만들고 자정을 넘긴다", () => {
    const schedule = safetyReleaseSchedule(new Date(2026, 9, 17, 23, 30, 0));
    expect(schedule.intervalStart).toMatchObject({ hour: 23, minute: 30 });
    expect(schedule.intervalEnd).toMatchObject({ hour: 11, minute: 30 });
    expect(schedule.repeats).toBe(false);
  });
});

describe("stopStudyLock · cleanupOnLaunch", () => {
  it("걸린 잠금을 모두 풀고 예약을 지운다", async () => {
    await stopStudyLock();
    expect(rnda.calls).toEqual(["resetBlocks", "stopMonitoring"]);
    expect(rnda.unblockSelection).not.toHaveBeenCalled();
    expect(rnda.stopMonitoring).toHaveBeenCalledWith(["focusmakers_study_lock"]);
  });

  it("잠금 해제가 실패하면 reject하지 않고 안전 해제 예약을 남긴다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    rnda.resetBlocks.mockImplementation(() => {
      throw new Error("native");
    });
    await expect(stopStudyLock()).resolves.toBeUndefined();
    expect(rnda.stopMonitoring).not.toHaveBeenCalled();
  });

  it("실행 시 잠금 정리가 실패하면 reject하지 않고 안전 해제 예약을 남긴다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    rnda.resetBlocks.mockImplementation(() => {
      throw new Error("native");
    });
    await expect(cleanupOnLaunch()).resolves.toBeUndefined();
    expect(rnda.stopMonitoring).not.toHaveBeenCalled();
  });

  it("예약 해제가 던져도 reject하지 않는다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    rnda.stopMonitoring.mockImplementation(() => {
      throw new Error("native");
    });
    await expect(stopStudyLock()).resolves.toBeUndefined();
    await expect(cleanupOnLaunch()).resolves.toBeUndefined();
  });

  it("실행 시 정리는 모든 잠금과 예약을 지운다", async () => {
    await cleanupOnLaunch();
    expect(rnda.calls).toEqual(["resetBlocks", "stopMonitoring"]);
    expect(rnda.stopMonitoring).toHaveBeenCalledWith(["focusmakers_study_lock"]);
  });

  it("지원하지 않는 기기에서는 아무것도 부르지 않는다", async () => {
    setIosVersion("17.0");
    await cleanupOnLaunch();
    expect(rnda.calls).toEqual([]);
  });
});

describe("브리지로 온 시작·해제 순서", () => {
  it("예약을 기다리는 사이에 해제가 와도 잠금이 끝난 뒤에 풀고 예약을 지운다", async () => {
    jest.useFakeTimers();
    rnda.startMonitoring.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          rnda.calls.push("startMonitoring");
          setTimeout(() => resolve(undefined), 100);
        }),
    );
    const reply = jest.fn();
    const start = handleAppLockMessage({ type: "app-lock-start", atMs: 1 }, reply);
    const stop = handleAppLockMessage({ type: "app-lock-stop", atMs: 2 }, reply);
    await jest.advanceTimersByTimeAsync(100);
    await Promise.all([start, stop]);
    expect(rnda.calls).toEqual([
      "configureActions",
      "startMonitoring",
      "updateShield",
      "blockSelection",
      "resetBlocks",
      "stopMonitoring",
    ]);
  });

  it("앞 처리가 실패해도 다음 메시지를 처리한다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    rnda.getAuthorizationStatus.mockImplementationOnce(() => {
      throw new Error("native");
    });
    const reply = jest.fn();
    const first = handleAppLockMessage({ type: "app-lock-query", id: "r1", atMs: 1 }, reply);
    const second = handleAppLockMessage({ type: "app-lock-stop", atMs: 2 }, reply);
    await expect(first).rejects.toThrow("native");
    await expect(second).resolves.toBeUndefined();
    expect(rnda.calls).toEqual(["resetBlocks", "stopMonitoring"]);
  });
});
