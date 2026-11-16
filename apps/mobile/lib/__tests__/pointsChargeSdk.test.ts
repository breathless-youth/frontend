/**
 * RevenueCat 결제 SDK 어댑터의 키 고르기와 켜는 때
 *
 * 운영 공개 키는 iOS와 Android가 달라서 실행 중인 플랫폼의 키로 SDK를 시작해야 한다.
 * 그 플랫폼의 키가 없는 빌드는 SDK를 불러오지 않고 충전을 끈다.
 * 앱을 켤 때는 어댑터만 붙이고 SDK는 결제용 ID가 실린 첫 결제 메시지에서 그 ID로 켠다.
 */

import { NativeModules, Platform } from "react-native";

import type * as PointsChargeSdkModule from "../pointsChargeSdk";

let mockKeys: { ios: string; android: string } = { ios: "", android: "" };
let mockSdkLoaded = false;
const mockConfigure = jest.fn();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { revenueCatApiKeys: mockKeys } };
    },
  },
}));
jest.mock("react-native-purchases", () => {
  mockSdkLoaded = true;
  return {
    __esModule: true,
    default: { configure: mockConfigure },
    PRODUCT_CATEGORY: { NON_SUBSCRIPTION: "NON_SUBSCRIPTION" },
  };
});
jest.mock("../pointsCharge", () => ({ setPointsChargeAdapter: jest.fn() }));

function install(): jest.Mock {
  const { installPointsChargeSdk } =
    jest.requireActual<typeof PointsChargeSdkModule>("../pointsChargeSdk");
  installPointsChargeSdk();
  return jest.requireMock<{ setPointsChargeAdapter: jest.Mock }>("../pointsCharge")
    .setPointsChargeAdapter;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockKeys = { ios: "", android: "" };
  NativeModules.RNPurchases = {};
});

afterEach(() => {
  delete NativeModules.RNPurchases;
});

describe("결제 SDK 키 고르기", () => {
  it("실행 중인 플랫폼의 키가 없으면 SDK를 불러오지 않고 어댑터도 넣지 않는다", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    mockKeys = { ios: "", android: "goog_fakeAndroidPublicKey0000" };

    expect(install()).not.toHaveBeenCalled();
    expect(mockSdkLoaded).toBe(false);
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it.each([
    ["ios", "appl_fakeIosPublicKey0000"],
    ["android", "goog_fakeAndroidPublicKey0000"],
  ] as const)(
    "%s에서는 앱을 켤 때 SDK를 시작하지 않고, 켜 달라는 결제용 ID로 그 플랫폼의 키를 써서 시작한다",
    (os, key) => {
      jest.replaceProperty(Platform, "OS", os);
      mockKeys = { ios: "appl_fakeIosPublicKey0000", android: "goog_fakeAndroidPublicKey0000" };

      const setAdapter = install();
      expect(setAdapter).toHaveBeenCalledTimes(1);
      expect(mockConfigure).not.toHaveBeenCalled();

      const adapter = setAdapter.mock.calls[0][0] as { start(appUserId: string): void };
      adapter.start("rc-user");
      expect(mockConfigure).toHaveBeenCalledWith({ apiKey: key, appUserID: "rc-user" });
    },
  );

  it("SDK 네이티브 모듈이 없는 이전 Dev Client에서는 어댑터를 넣지 않아 충전을 끈다", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    mockKeys = { ios: "appl_fakeIosPublicKey0000", android: "" };
    delete NativeModules.RNPurchases;
    jest.spyOn(console, "warn").mockImplementation(() => {});

    expect(install()).not.toHaveBeenCalled();
  });
});
