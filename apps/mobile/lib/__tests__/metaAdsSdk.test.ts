/**
 * Meta env가 없는 빌드는 SDK 패키지를 불러오지도 않아야 한다.
 * 루트를 불러오기만 해도 Android가 `FBAccessToken` 네이티브 모듈을 만들고, 앱 ID 없이 초기화되지 않은 SDK를 만나 앱이 죽는다.
 */

import type * as ReactNative from "react-native";

import type { MetaAdsAdapter } from "../metaAds";
import type * as MetaAdsSdkModule from "../metaAdsSdk";

let mockMetaAppId = "";
let mockSdkLoaded = false;
const mockRequestTracking = jest.fn();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { metaAppId: mockMetaAppId } };
    },
  },
}));
jest.mock("expo-tracking-transparency", () => ({
  PermissionStatus: { UNDETERMINED: "undetermined" },
  requestTrackingPermissionsAsync: () => mockRequestTracking() as Promise<unknown>,
}));
jest.mock("react-native-fbsdk-next", () => {
  mockSdkLoaded = true;
  return { AppEventsLogger: { logEvent: jest.fn() }, Settings: { initializeSDK: jest.fn() } };
});
jest.mock("../metaAds", () => ({ setMetaAdsAdapter: jest.fn() }));

function install(): jest.Mock {
  const { installMetaAdsSdk } = jest.requireActual<typeof MetaAdsSdkModule>("../metaAdsSdk");
  installMetaAdsSdk();
  return jest.requireMock<{ setMetaAdsAdapter: jest.Mock }>("../metaAds").setMetaAdsAdapter;
}

function installedAdapter(): MetaAdsAdapter {
  mockMetaAppId = "1234567890";
  return install().mock.calls[0]![0] as MetaAdsAdapter;
}

/**
 * 테스트용 AppState 제어
 *
 * 이 테스트 파일은 매번 모듈을 새로 불러오므로, 어댑터가 볼 `AppState`도 그때의 것을 잡아 상태와 리스너를 직접 다룬다.
 * `emit`은 상태를 바꾸고 등록된 리스너를 부른다.
 */
function controlAppState(initial: string) {
  const { AppState } = jest.requireActual<typeof ReactNative>("react-native");
  const state = AppState as unknown as { currentState: string };
  const listeners = new Set<(next: string) => void>();
  state.currentState = initial;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((
    _event: string,
    listener: (next: string) => void,
  ) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  }) as unknown as typeof AppState.addEventListener);
  return {
    listeners,
    emit(next: string) {
      state.currentState = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

beforeEach(() => {
  jest.resetModules();
  mockSdkLoaded = false;
  mockRequestTracking.mockReset();
});

it("앱 ID가 없으면 SDK 패키지를 불러오지 않는다", () => {
  mockMetaAppId = "";
  const setMetaAdsAdapter = install();
  expect(mockSdkLoaded).toBe(false);
  expect(setMetaAdsAdapter).not.toHaveBeenCalled();
});

it("앱 ID가 있으면 SDK를 불러와 어댑터를 붙인다", () => {
  mockMetaAppId = "1234567890";
  const setMetaAdsAdapter = install();
  expect(mockSdkLoaded).toBe(true);
  expect(setMetaAdsAdapter).toHaveBeenCalledTimes(1);
});

/**
 * iOS ATT 요청 시점
 *
 * iOS는 앱이 active일 때만 ATT 프롬프트를 띄운다.
 * 그 전에 요청하면 창 없이 "미결정"이 돌아와, 한 번 묻고 끝내면 프롬프트가 영영 안 뜬다.
 */
describe("iOS ATT 요청 시점", () => {
  it("앱이 active가 아니면 active가 될 때까지 요청하지 않는다", async () => {
    const appState = controlAppState("inactive");
    mockRequestTracking.mockResolvedValue({ granted: true, status: "granted" });
    const answer = installedAdapter().requestTrackingPermission();
    await Promise.resolve();
    expect(mockRequestTracking).not.toHaveBeenCalled();

    appState.emit("active");

    await expect(answer).resolves.toBe(true);
    expect(mockRequestTracking).toHaveBeenCalledTimes(1);
    expect(appState.listeners.size).toBe(0);
  });

  it("프롬프트가 뜨지 못해 미결정이 돌아오면 다시 묻는다", async () => {
    jest.useFakeTimers();
    try {
      controlAppState("active");
      mockRequestTracking
        .mockResolvedValueOnce({ granted: false, status: "undetermined" })
        .mockResolvedValueOnce({ granted: true, status: "granted" });
      const answer = installedAdapter().requestTrackingPermission();

      await jest.advanceTimersByTimeAsync(1_000);

      await expect(answer).resolves.toBe(true);
      expect(mockRequestTracking).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("끝까지 미결정이면 거부로 끝낸다 — 무한히 묻지 않는다", async () => {
    jest.useFakeTimers();
    try {
      controlAppState("active");
      mockRequestTracking.mockResolvedValue({ granted: false, status: "undetermined" });
      const answer = installedAdapter().requestTrackingPermission();

      await jest.advanceTimersByTimeAsync(10_000);

      await expect(answer).resolves.toBe(false);
      expect(mockRequestTracking).toHaveBeenCalledTimes(5);
    } finally {
      jest.useRealTimers();
    }
  });
});
