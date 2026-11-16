/**
 * RevenueCat 결제 SDK 어댑터의 키 고르기
 *
 * 운영 공개 키는 iOS와 Android가 달라서 실행 중인 플랫폼의 키로 SDK를 시작해야 한다.
 * 그 플랫폼의 키가 없는 빌드는 SDK를 불러오지 않고 충전을 끈다.
 */

import { Platform } from "react-native";

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
  ] as const)("%s에서는 그 플랫폼의 키로 SDK를 시작한다", (os, key) => {
    jest.replaceProperty(Platform, "OS", os);
    mockKeys = { ios: "appl_fakeIosPublicKey0000", android: "goog_fakeAndroidPublicKey0000" };

    expect(install()).toHaveBeenCalledTimes(1);
    expect(mockConfigure).toHaveBeenCalledWith({ apiKey: key });
  });
});
