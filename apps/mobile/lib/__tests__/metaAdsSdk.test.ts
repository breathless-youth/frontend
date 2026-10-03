/**
 * Meta env가 없는 빌드는 SDK 패키지를 불러오지도 않아야 한다.
 * 루트를 불러오기만 해도 Android가 `FBAccessToken` 네이티브 모듈을 만들고, 앱 ID 없이 초기화되지 않은 SDK를 만나 앱이 죽는다.
 */

import type * as MetaAdsSdkModule from "../metaAdsSdk";

let mockMetaAppId = "";
let mockSdkLoaded = false;

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { metaAppId: mockMetaAppId } };
    },
  },
}));
jest.mock("expo-tracking-transparency", () => ({ requestTrackingPermissionsAsync: jest.fn() }));
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

beforeEach(() => {
  jest.resetModules();
  mockSdkLoaded = false;
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
