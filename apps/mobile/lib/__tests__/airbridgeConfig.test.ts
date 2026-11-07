import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import airbridgeJson from "../../airbridge.json";
import appJson from "../../app.json";
import mobilePackageJson from "../../package.json";

/**
 * Airbridge SDK 설정 주입 가드.
 *
 * 토큰은 env(`AIRBRIDGE_APP_TOKEN`)로만 받고, 있을 때만 plugin과 런타임 게이트(`extra.airbridgeEnabled`)가
 * 켜진다. production은 EAS 빌더에서 토큰이 없으면 끊는다(Meta와 같은 이유).
 */
describe("Airbridge SDK 설정", () => {
  const baseConfig = appJson.expo as unknown as ExpoConfig;
  const pluginName = (entry: unknown) => (Array.isArray(entry) ? (entry[0] as string) : entry);
  const findPlugin = (cfg: ExpoConfig) =>
    cfg.plugins?.find((p) => pluginName(p) === "airbridge-expo-sdk");

  // production 분기는 Firebase 설정 파일과 Meta env를 요구한다 — 이 파일의 관심사가 아니라 채워 준다.
  const PROD_ENV = {
    GOOGLE_SERVICES_JSON: "./lib/__tests__/fixtures/firebase/prod/google-services.json",
    GOOGLE_SERVICES_PLIST: "./lib/__tests__/fixtures/firebase/prod/GoogleService-Info.plist",
    META_APP_ID: "1234567890123456",
    META_CLIENT_TOKEN: "0123456789abcdef0123456789abcdef",
  };
  const TOKEN = "0123456789abcdef0123456789abcdef";

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
      "EAS_BUILD",
    ]) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value;
    }
    return buildConfig({ config: baseConfig } as ConfigContext);
  }

  it("app.json에 정적 Airbridge plugin이 없다 — 토큰은 env 주입 전용(공개 저장소)", () => {
    expect((appJson.expo.plugins as unknown[]).map(pluginName)).not.toContain("airbridge-expo-sdk");
  });

  it("토큰이 없으면 plugin을 넣지 않고 런타임도 꺼진다 — 개발·staging 빌드", () => {
    const cfg = resolveConfig({});
    expect(findPlugin(cfg)).toBeUndefined();
    expect(cfg.extra?.airbridgeEnabled).toBe(false);
  });

  it("토큰이 있으면 앱 이름과 토큰으로 plugin이 붙고 런타임이 켜진다", () => {
    const cfg = resolveConfig({ AIRBRIDGE_APP_TOKEN: TOKEN });
    expect(findPlugin(cfg)).toEqual([
      "airbridge-expo-sdk",
      { appName: "focusmakers", appToken: TOKEN },
    ]);
    expect(cfg.extra?.airbridgeEnabled).toBe(true);
  });

  it("EAS 빌더의 production 빌드는 토큰이 없으면 실패한다 — 측정 없는 운영 바이너리 방지", () => {
    expect(() =>
      resolveConfig({ APP_VARIANT: "production", EAS_BUILD: "true", ...PROD_ENV }),
    ).toThrow(/AIRBRIDGE_APP_TOKEN이 비어 있습니다/);
  });

  it("EAS 빌더 밖의 production 평가는 토큰이 없어도 통과한다 — eas-cli 로컬 평가", () => {
    const cfg = resolveConfig({ APP_VARIANT: "production", ...PROD_ENV });
    expect(findPlugin(cfg)).toBeUndefined();
    expect(cfg.extra?.airbridgeEnabled).toBe(false);
  });

  it("staging·development는 EAS 빌더에서도 토큰 없이 통과한다", () => {
    for (const variant of ["staging", undefined]) {
      const cfg = resolveConfig({ APP_VARIANT: variant, EAS_BUILD: "true" });
      expect(findPlugin(cfg)).toBeUndefined();
    }
  });

  it("SDK는 꺼진 채 시작한다 — iOS는 앱 추적을 허용한 뒤에만 켠다(개인정보 처리방침의 약속)", () => {
    expect(airbridgeJson).toEqual({ autoStartTrackingEnabled: false });
  });

  it("두 SDK는 정확한 버전으로 고정한다 — config plugin과 네이티브 SDK 버전이 함께 묶인다", () => {
    expect(mobilePackageJson.dependencies["airbridge-expo-sdk"]).toBe("4.11.0");
    expect(mobilePackageJson.dependencies["airbridge-react-native-sdk"]).toBe("4.12.0");
  });
});
