/**
 * 보상형 광고 SDK 어댑터
 *
 * 광고 등급 상한은 SDK를 시작하기 전에 걸어야 첫 광고부터 적용된다.
 * 광고 단위가 없는 빌드는 SDK를 불러오지 않아야 한다.
 */

import type { PointsAdsAdapter } from "../pointsAds";
import type * as PointsAdsSdkModule from "../pointsAdsSdk";

let mockUnitIds: { ios: string; android: string } = { ios: "", android: "" };
let mockSdkLoaded = false;
const mockCalls: string[] = [];
const mockSetRequestConfiguration = jest.fn(async (_config: unknown) => {
  mockCalls.push("setRequestConfiguration");
});
const mockInitialize = jest.fn(async () => {
  mockCalls.push("initialize");
});
const mockCreateForAdRequest = jest.fn();

type Listener = (payload?: unknown) => void;

/**
 * 불러오면 곧바로 로드되고, 띄우면 보상 신호 뒤에 닫히는 가짜 광고
 *
 * `loadError`를 주면 로드 대신 그 오류로 오류 신호를 보내고, `showError`를 주면 띄우기가 그 오류로 실패한다.
 */
function fakeRewardedAd(failure: { loadError?: unknown; showError?: unknown } = {}) {
  const listeners = new Map<string, Listener>();
  const fire = (type: string, payload?: unknown) => listeners.get(type)?.(payload);
  return {
    addAdEventListener: (type: string, listener: Listener) => void listeners.set(type, listener),
    removeAllListeners: () => listeners.clear(),
    load: () => ("loadError" in failure ? fire("error", failure.loadError) : fire("loaded")),
    show: async () => {
      if ("showError" in failure) {
        throw failure.showError;
      }
      fire("earned_reward");
      fire("closed");
    },
  };
}

// 광고 요청 오류에는 서버 확인 옵션의 사용자 ID가 실릴 수 있다.
const AD_ERROR = Object.assign(new Error("ad request for userId 1685 failed"), {
  code: "googleMobileAds/no-fill",
});

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { admobRewardedUnitIds: mockUnitIds } };
    },
  },
}));
let mockNativeModuleError: unknown = null;
jest.mock("react-native-google-mobile-ads", () => {
  mockSdkLoaded = true;
  return {
    __esModule: true,
    default: () => {
      if (mockNativeModuleError !== null) {
        throw mockNativeModuleError;
      }
      return {
        setRequestConfiguration: mockSetRequestConfiguration,
        initialize: mockInitialize,
      };
    },
    MaxAdContentRating: { G: "G", PG: "PG", T: "T", MA: "MA" },
    RewardedAd: { createForAdRequest: mockCreateForAdRequest },
    RewardedAdEventType: { LOADED: "loaded", EARNED_REWARD: "earned_reward" },
    AdEventType: { CLOSED: "closed", ERROR: "error" },
  };
});
jest.mock("../pointsAds", () => ({ setPointsAdsAdapter: jest.fn() }));

function install(): jest.Mock {
  const { installPointsAdsSdk } = jest.requireActual<typeof PointsAdsSdkModule>("../pointsAdsSdk");
  installPointsAdsSdk();
  return jest.requireMock<{ setPointsAdsAdapter: jest.Mock }>("../pointsAds").setPointsAdsAdapter;
}

function installedAdapter(): PointsAdsAdapter {
  mockUnitIds = { ios: "ca-app-pub-1/ios", android: "ca-app-pub-1/android" };
  const setAdapter = install();
  return setAdapter.mock.calls.at(-1)?.[0] as PointsAdsAdapter;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockUnitIds = { ios: "", android: "" };
  mockNativeModuleError = null;
  mockCreateForAdRequest.mockImplementation(() => fakeRewardedAd());
});

describe("보상형 광고 SDK 어댑터", () => {
  it("광고 단위가 없는 빌드는 SDK를 불러오지 않고 어댑터도 넣지 않는다", () => {
    const setAdapter = install();
    expect(setAdapter).not.toHaveBeenCalled();
    expect(mockSdkLoaded).toBe(false);
  });

  it("SDK를 시작하기 전에 광고 등급 상한을 전체 이용가로 건다", async () => {
    const adapter = installedAdapter();

    await expect(adapter.show("1685")).resolves.toBe("rewarded");

    expect(mockCalls).toEqual(["setRequestConfiguration", "initialize"]);
    // 아동 대상 표시는 넣지 않는다.
    expect(mockSetRequestConfiguration).toHaveBeenCalledWith({ maxAdContentRating: "G" });
  });

  it("등급 상한과 SDK 시작은 광고를 여러 번 띄워도 한 번만 한다", async () => {
    const adapter = installedAdapter();

    await adapter.show("1685");
    await adapter.show("1685");

    expect(mockSetRequestConfiguration).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(2);
  });

  it("SDK 시작이 한 번 실패해도 다음 광고에서 다시 시작한다", async () => {
    const adapter = installedAdapter();
    mockInitialize.mockRejectedValueOnce(new Error("network"));

    await expect(adapter.show("1685")).rejects.toThrow("network");
    await expect(adapter.show("1685")).resolves.toBe("rewarded");

    expect(mockSetRequestConfiguration).toHaveBeenCalledTimes(2);
    expect(mockInitialize).toHaveBeenCalledTimes(2);
  });

  it("광고 요청에는 서버가 보상을 줄 계정을 알 사용자 ID를 싣는다", async () => {
    const adapter = installedAdapter();

    await adapter.show("1685");

    const [, options] = mockCreateForAdRequest.mock.calls[0] as [string, Record<string, unknown>];
    expect(options.serverSideVerificationOptions).toEqual({ userId: "1685" });
  });

  it("맞춤 광고를 허용하므로 광고 요청에 맞춤 광고를 끄는 옵션을 싣지 않는다", async () => {
    const adapter = installedAdapter();

    await adapter.show("1685");

    const [, options] = mockCreateForAdRequest.mock.calls[0] as [string, Record<string, unknown>];
    expect(options).not.toHaveProperty("requestNonPersonalizedAdsOnly");
  });
});

describe("광고 SDK 오류 로그", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it("광고를 불러오다 난 오류는 객체를 통째로 남기지 않고 코드만 남긴다", async () => {
    const adapter = installedAdapter();
    mockCreateForAdRequest.mockImplementationOnce(() => fakeRewardedAd({ loadError: AD_ERROR }));

    await expect(adapter.show("1685")).resolves.toBe("unavailable");

    expect(warn.mock.calls).toEqual([["[points-ads] 광고 오류", "code googleMobileAds/no-fill"]]);
  });

  it("광고를 띄우다 난 오류도 코드만 남긴다", async () => {
    const adapter = installedAdapter();
    mockCreateForAdRequest.mockImplementationOnce(() => fakeRewardedAd({ showError: AD_ERROR }));

    await expect(adapter.show("1685")).resolves.toBe("unavailable");

    expect(warn.mock.calls).toEqual([
      ["[points-ads] 광고 표시 실패", "code googleMobileAds/no-fill"],
    ]);
  });

  it("SDK를 불러오지 못한 오류는 이름만 남기고 광고를 끈다", () => {
    mockNativeModuleError = new TypeError("native module missing");
    mockUnitIds = { ios: "ca-app-pub-1/ios", android: "ca-app-pub-1/android" };

    const setAdapter = install();

    expect(setAdapter).not.toHaveBeenCalled();
    expect(warn.mock.calls).toEqual([
      ["[points-ads] 광고 SDK를 불러오지 못해 광고를 끈다", "TypeError"],
    ]);
  });
});
