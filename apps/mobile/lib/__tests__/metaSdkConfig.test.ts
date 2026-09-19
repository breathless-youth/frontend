import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";
import mobilePackageJson from "../../package.json";

/**
 * Meta SDK 설정 주입 가드.
 *
 * 설계: `docs/superpowers/specs/2026-09-13-by-644-meta-sdk-install-attribution-design.md`. 여기서 고정하는 것은
 * (1) app.json에 정적 Meta 설정이 없다는 것(공개 저장소·env 주입 전용), (2) `app.config.ts`의 env → plugin·
 * `extra.metaAppId` 변환과 누락·반쪽 설정 차단, (3) SDK 버전 고정이다.
 */
describe("Meta SDK 설정", () => {
  const baseConfig = appJson.expo as unknown as ExpoConfig;
  const pluginName = (entry: unknown) => (Array.isArray(entry) ? (entry[0] as string) : entry);
  const findPlugin = (cfg: ExpoConfig, name: string) =>
    cfg.plugins?.find((p) => pluginName(p) === name);
  const pluginOptions = (cfg: ExpoConfig, name: string) => {
    const entry = findPlugin(cfg, name);
    return Array.isArray(entry) ? (entry[1] as Record<string, unknown>) : undefined;
  };

  // production 분기는 Firebase 설정 파일 주입을 요구한다 — 이 파일의 관심사가 아니라 운영 fixture를 준다.
  const PROD_FIREBASE_ENV = {
    GOOGLE_SERVICES_JSON: "./lib/__tests__/fixtures/firebase/prod/google-services.json",
    GOOGLE_SERVICES_PLIST: "./lib/__tests__/fixtures/firebase/prod/GoogleService-Info.plist",
  };
  const META_ENV = {
    META_APP_ID: "1234567890123456",
    META_CLIENT_TOKEN: "0123456789abcdef0123456789abcdef",
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
      "EAS_BUILD",
    ]) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value;
    }
    return buildConfig({ config: baseConfig } as ConfigContext);
  }

  describe("app.json", () => {
    it("정적 Meta plugin·앱 ID가 없다 — env 주입 전용(공개 저장소)", () => {
      const names = (appJson.expo.plugins as unknown[]).map(pluginName);
      expect(names).not.toContain("react-native-fbsdk-next");
      expect(names).not.toContain("expo-tracking-transparency");
      expect(appJson.expo.extra).not.toHaveProperty("metaAppId");
    });
  });

  describe("app.config.ts", () => {
    it("env가 없으면 plugin을 넣지 않고 extra.metaAppId가 빈 문자열이다 — Metro·광고 없는 개발 빌드", () => {
      const cfg = resolveConfig({});
      expect(findPlugin(cfg, "react-native-fbsdk-next")).toBeUndefined();
      expect(findPlugin(cfg, "expo-tracking-transparency")).toBeUndefined();
      expect(cfg.extra?.metaAppId).toBe("");
    });

    it("env가 있으면 fbsdk-next·tracking-transparency plugin이 붙고 extra.metaAppId가 채워진다", () => {
      const cfg = resolveConfig({ ...META_ENV });
      const options = pluginOptions(cfg, "react-native-fbsdk-next");
      expect(options).toEqual({
        appID: META_ENV.META_APP_ID,
        clientToken: META_ENV.META_CLIENT_TOKEN,
        // 개발 변형 표시명 — fbsdk plugin이 displayName 없이는 throw한다.
        displayName: "포커스 메이커스 DEV",
        scheme: `fb${META_ENV.META_APP_ID}`,
        isAutoInitEnabled: true,
        autoLogAppEventsEnabled: true,
        advertiserIDCollectionEnabled: true,
      });
      // ATT 문구는 app.json의 한국어 카피가 그대로 남아야 한다 — plugin 옵션으로 덮어쓰지 않는다.
      expect(options).not.toHaveProperty("iosUserTrackingPermission");
      expect(findPlugin(cfg, "expo-tracking-transparency")).toBe("expo-tracking-transparency");
      expect(cfg.extra?.metaAppId).toBe(META_ENV.META_APP_ID);
    });

    it("displayName은 변형 접미사를 따른다 — staging은 STG, production은 접미사 없음", () => {
      expect(
        pluginOptions(
          resolveConfig({ APP_VARIANT: "staging", ...META_ENV }),
          "react-native-fbsdk-next",
        )?.displayName,
      ).toBe("포커스 메이커스 STG");
      expect(
        pluginOptions(
          resolveConfig({ APP_VARIANT: "production", ...PROD_FIREBASE_ENV, ...META_ENV }),
          "react-native-fbsdk-next",
        )?.displayName,
      ).toBe("포커스 메이커스");
    });

    it("기존 plugin 뒤에 붙는다 — app.json의 plugin 순서를 흔들지 않는다", () => {
      const cfg = resolveConfig({ ...META_ENV });
      const names = (cfg.plugins ?? []).map(pluginName);
      expect(names.slice(0, appJson.expo.plugins.length)).toEqual(
        (appJson.expo.plugins as unknown[]).map(pluginName),
      );
      expect(names.slice(-2)).toEqual(["react-native-fbsdk-next", "expo-tracking-transparency"]);
    });

    it.each([
      ["META_APP_ID만", { META_APP_ID: META_ENV.META_APP_ID }],
      ["META_CLIENT_TOKEN만", { META_CLIENT_TOKEN: META_ENV.META_CLIENT_TOKEN }],
    ])("%s 있으면 어느 변형이든 실패한다 — 반쪽 설정은 SDK가 조용히 죽는다", (_label, env) => {
      expect(() => resolveConfig(env)).toThrow(/함께 있어야 합니다/);
      expect(() => resolveConfig({ APP_VARIANT: "staging", ...env })).toThrow(/함께 있어야 합니다/);
    });

    it("앱 ID가 숫자가 아니면 실패한다 — 토큰과 자리를 바꿔 넣는 실수", () => {
      expect(() =>
        resolveConfig({
          META_APP_ID: META_ENV.META_CLIENT_TOKEN,
          META_CLIENT_TOKEN: META_ENV.META_APP_ID,
        }),
      ).toThrow(/숫자가 아닙니다/);
    });

    it("EAS 빌더의 production 빌드는 env가 없으면 실패한다 — 어트리뷰션 없는 운영 바이너리 방지", () => {
      expect(() =>
        resolveConfig({ APP_VARIANT: "production", EAS_BUILD: "true", ...PROD_FIREBASE_ENV }),
      ).toThrow(/META_APP_ID·META_CLIENT_TOKEN이 비어 있습니다/);
    });

    it("EAS 빌더 밖의 production 평가는 env가 없어도 통과한다 — eas-cli 로컬 평가(BY-620과 같은 이유)", () => {
      const cfg = resolveConfig({ APP_VARIANT: "production", ...PROD_FIREBASE_ENV });
      expect(findPlugin(cfg, "react-native-fbsdk-next")).toBeUndefined();
      expect(cfg.extra?.metaAppId).toBe("");
    });

    it("staging·development는 EAS 빌더에서도 env 없이 통과한다 — 광고를 붙이지 않는 빌드", () => {
      for (const variant of ["staging", undefined]) {
        const cfg = resolveConfig({ APP_VARIANT: variant, EAS_BUILD: "true" });
        expect(findPlugin(cfg, "react-native-fbsdk-next")).toBeUndefined();
      }
    });
  });

  describe("의존성", () => {
    it("fbsdk-next는 정확한 버전으로 고정한다 — config plugin 옵션·네이티브 SDK 버전이 함께 묶인다", () => {
      expect(mobilePackageJson.dependencies["react-native-fbsdk-next"]).toBe("13.4.3");
    });

    it("expo-tracking-transparency는 SDK 54 번들 버전 범위다", () => {
      expect(mobilePackageJson.dependencies["expo-tracking-transparency"]).toBe("~6.0.8");
    });
  });
});
