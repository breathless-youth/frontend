import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";
import mobilePackageJson from "../../package.json";

/**
 * 보상형 광고 설정 주입 가드
 *
 * 서버는 자기 환경의 광고 단위로 본 시청만 보상하므로 빌드 종류마다 맞는 단위가 실려야 한다.
 * 광고 단위가 비어 있으면 런타임(`lib/pointsAdsSdk.ts`)이 광고를 끈다.
 */
describe("보상형 광고 설정", () => {
  const baseConfig = appJson.expo as unknown as ExpoConfig;
  const pluginName = (entry: unknown) => (Array.isArray(entry) ? (entry[0] as string) : entry);
  const findPlugin = (cfg: ExpoConfig) =>
    cfg.plugins?.find((p) => pluginName(p) === "react-native-google-mobile-ads");

  // production 분기는 Firebase 설정 파일을 요구한다. 이 파일의 관심사가 아니라 채워 준다.
  const PROD_ENV = {
    GOOGLE_SERVICES_JSON: "./lib/__tests__/fixtures/firebase/prod/google-services.json",
    GOOGLE_SERVICES_PLIST: "./lib/__tests__/fixtures/firebase/prod/GoogleService-Info.plist",
  };
  const APP_IDS = {
    iosAppId: "ca-app-pub-4724067415486202~4873548455",
    androidAppId: "ca-app-pub-4724067415486202~1529713162",
  };

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
      "EAS_BUILD",
    ]) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value;
    }
    return buildConfig({ config: baseConfig } as ConfigContext);
  }

  it("production 빌드는 광고 플러그인과 운영 광고 단위를 싣는다", () => {
    const cfg = resolveConfig({ APP_VARIANT: "production", ...PROD_ENV });
    expect(findPlugin(cfg)).toEqual(["react-native-google-mobile-ads", APP_IDS]);
    expect(cfg.extra?.admobRewardedUnitIds).toEqual({
      ios: "ca-app-pub-4724067415486202/5967651624",
      android: "ca-app-pub-4724067415486202/3528677194",
    });
  });

  it("development 빌드는 광고 플러그인과 개발 광고 단위를 싣는다", () => {
    const cfg = resolveConfig({});
    expect(findPlugin(cfg)).toEqual(["react-native-google-mobile-ads", APP_IDS]);
    expect(cfg.extra?.admobRewardedUnitIds).toEqual({
      ios: "ca-app-pub-4724067415486202/6730214745",
      android: "ca-app-pub-4724067415486202/5416473931",
    });
  });

  it("staging 빌드는 광고 단위가 없어 광고를 끈다", () => {
    const cfg = resolveConfig({ APP_VARIANT: "staging" });
    expect(cfg.extra?.admobRewardedUnitIds).toEqual({ ios: "", android: "" });
  });

  // 광고 SDK는 광고를 쓰지 않는 빌드에도 링크되고, Android는 앱 ID가 없으면 앱이 시작할 때 죽는다.
  it("광고 단위가 없는 staging 빌드에도 광고 앱 ID를 싣는다", () => {
    const cfg = resolveConfig({ APP_VARIANT: "staging" });
    expect(findPlugin(cfg)).toEqual(["react-native-google-mobile-ads", APP_IDS]);
  });

  it("광고 SDK는 정확한 버전으로 고정한다", () => {
    expect(mobilePackageJson.dependencies["react-native-google-mobile-ads"]).toBe("17.4.0");
  });
});
