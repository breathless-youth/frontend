import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";

/**
 * RevenueCat 결제 키 주입 가드
 *
 * 운영 공개 키는 iOS와 Android가 다르고 EAS 환경 변수는 플랫폼별로 나뉘지 않아 env 이름을 플랫폼마다 따로 받는다.
 * 플랫폼 키가 하나도 없으면 두 플랫폼이 함께 쓰는 Test Store 키를 쓰고, 셋 다 없으면 충전이 꺼진다.
 * 값은 접두어만 진짜와 같은 가짜이며 진짜 키를 넣지 않는다.
 */
describe("RevenueCat 결제 키 설정", () => {
  const baseConfig = appJson.expo as unknown as ExpoConfig;

  // production 분기는 Firebase 설정 파일을 요구한다. 이 파일의 관심사가 아니라 채워 준다.
  const PROD_ENV = {
    APP_VARIANT: "production",
    GOOGLE_SERVICES_JSON: "./lib/__tests__/fixtures/firebase/prod/google-services.json",
    GOOGLE_SERVICES_PLIST: "./lib/__tests__/fixtures/firebase/prod/GoogleService-Info.plist",
  };
  const IOS_KEY = "appl_fakeIosPublicKey0000";
  const ANDROID_KEY = "goog_fakeAndroidPublicKey0000";
  const STORE_KEY = "test_fakeStorePublicKey0000";

  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function resolveConfig(env: Record<string, string | undefined>) {
    for (const key of [
      "APP_VARIANT",
      "API_BASE_URL",
      "WEB_BASE_URL",
      "GOOGLE_SERVICES_JSON",
      "GOOGLE_SERVICES_PLIST",
      "META_APP_ID",
      "META_CLIENT_TOKEN",
      "AIRBRIDGE_APP_TOKEN",
      "REVENUECAT_API_KEY",
      "REVENUECAT_IOS_API_KEY",
      "REVENUECAT_ANDROID_API_KEY",
      "EAS_BUILD",
    ]) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value;
    }
    return buildConfig({ config: baseConfig } as ConfigContext);
  }

  it("키가 하나도 없으면 두 플랫폼 모두 비워 충전을 끈다", () => {
    expect(resolveConfig({}).extra?.revenueCatApiKeys).toEqual({ ios: "", android: "" });
  });

  it("플랫폼 키가 있으면 플랫폼마다 그 키를 싣는다", () => {
    const cfg = resolveConfig({
      ...PROD_ENV,
      REVENUECAT_IOS_API_KEY: IOS_KEY,
      REVENUECAT_ANDROID_API_KEY: ANDROID_KEY,
    });
    expect(cfg.extra?.revenueCatApiKeys).toEqual({ ios: IOS_KEY, android: ANDROID_KEY });
    expect(cfg.extra).not.toHaveProperty("revenueCatApiKey");
  });

  it("플랫폼 키가 하나도 없으면 공용 Test Store 키를 두 플랫폼에 싣는다", () => {
    const cfg = resolveConfig({ REVENUECAT_API_KEY: STORE_KEY });
    expect(cfg.extra?.revenueCatApiKeys).toEqual({ ios: STORE_KEY, android: STORE_KEY });
  });

  it("플랫폼 키가 하나라도 있으면 공용 키로 다른 플랫폼을 채우지 않는다", () => {
    const cfg = resolveConfig({ REVENUECAT_IOS_API_KEY: IOS_KEY, REVENUECAT_API_KEY: STORE_KEY });
    expect(cfg.extra?.revenueCatApiKeys).toEqual({ ios: IOS_KEY, android: "" });
  });

  it.each([
    ["REVENUECAT_API_KEY", {}],
    ["REVENUECAT_IOS_API_KEY", { REVENUECAT_ANDROID_API_KEY: ANDROID_KEY }],
    ["REVENUECAT_ANDROID_API_KEY", { REVENUECAT_IOS_API_KEY: IOS_KEY }],
  ])("production 빌드는 %s에 Test Store 키(test_)가 오면 끊는다", (name, others) => {
    expect(() => resolveConfig({ ...PROD_ENV, ...others, [name]: STORE_KEY })).toThrow(/test_/);
  });

  it("production 빌드는 iOS 키 자리에 Android 키(goog_)가 오면 끊는다", () => {
    expect(() =>
      resolveConfig({
        ...PROD_ENV,
        REVENUECAT_IOS_API_KEY: ANDROID_KEY,
        REVENUECAT_ANDROID_API_KEY: ANDROID_KEY,
      }),
    ).toThrow(/REVENUECAT_IOS_API_KEY/);
  });

  it("production 빌드는 Android 키 자리에 iOS 키(appl_)가 오면 끊는다", () => {
    expect(() =>
      resolveConfig({
        ...PROD_ENV,
        REVENUECAT_IOS_API_KEY: IOS_KEY,
        REVENUECAT_ANDROID_API_KEY: IOS_KEY,
      }),
    ).toThrow(/REVENUECAT_ANDROID_API_KEY/);
  });

  it("개발 빌드는 Test Store 키를 플랫폼 키 자리에 넣어도 막지 않는다", () => {
    const cfg = resolveConfig({
      REVENUECAT_IOS_API_KEY: STORE_KEY,
      REVENUECAT_ANDROID_API_KEY: STORE_KEY,
    });
    expect(cfg.extra?.revenueCatApiKeys).toEqual({ ios: STORE_KEY, android: STORE_KEY });
  });
});
