import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";
import easJson from "../../eas.json";

/**
 * BY-585: Firebase SDK 연동 설정 가드.
 *
 * 설계: `docs/superpowers/specs/2026-09-03-by-585-firebase-sdk-design.md`. 여기서 고정하는 것은
 * (1) app.json의 plugin·entitlement, (2) `app.config.ts`의 설정 파일 주입과 dev/prod 오주입 차단,
 * (3) eas.json의 EAS environment 매핑과 Xcode 26.2 빌드 이미지다.
 */
describe("Firebase 설정 (BY-585)", () => {
  const baseConfig = appJson.expo as unknown as ExpoConfig;
  const plugins = appJson.expo.plugins as unknown[];
  const pluginName = (entry: unknown) => (Array.isArray(entry) ? (entry[0] as string) : entry);
  const pluginOptions = (name: string) => {
    const entry = plugins.find((p) => pluginName(p) === name);
    return Array.isArray(entry) ? (entry[1] as Record<string, Record<string, unknown>>) : undefined;
  };

  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function resolveConfig(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return buildConfig({ config: baseConfig } as ConfigContext);
  }

  const FIXTURE = (variant: "dev" | "prod") => ({
    json: `./lib/__tests__/fixtures/firebase/${variant}/google-services.json`,
    plist: `./lib/__tests__/fixtures/firebase/${variant}/GoogleService-Info.plist`,
  });

  describe("app.json", () => {
    it("RNFB app·messaging plugin이 있다 (remote-config는 plugin이 없다)", () => {
      const names = plugins.map(pluginName);
      expect(names).toContain("@react-native-firebase/app");
      expect(names).toContain("@react-native-firebase/messaging");
    });

    /**
     * RNFB 26은 firebase-ios-sdk를 SPM으로 받고, SPM 제품은 automatic 라이브러리라 pod마다 복사본을
     * 안는다 — static 링크면 중복 심볼로 링크가 깨진다. dynamic이 SPM 모드의 요구사항이다.
     */
    it("expo-build-properties가 iOS dynamic frameworks를 켠다", () => {
      expect(pluginOptions("expo-build-properties")?.ios?.useFrameworks).toBe("dynamic");
    });

    /**
     * `disableSPM: true`는 CocoaPods 모드로 되돌리는 스위치다. Firebase가 2026-10부터 CocoaPods에
     * 새 버전을 올리지 않으므로 그 경로는 곧 얼어붙는다 — 되돌리지 않는다.
     */
    it("RNFB app plugin에 disableSPM을 주지 않는다", () => {
      expect(pluginOptions("@react-native-firebase/app")?.ios?.disableSPM).toBeUndefined();
    });

    /**
     * messaging plugin은 Android만 손댄다 — iOS APNs entitlement는 여기서 직접 넣는다. 값은
     * `development`로 두고 배포 export에서 Xcode가 프로파일에 맞춰 `production`으로 바꾼다.
     */
    it("iOS aps-environment entitlement가 development다", () => {
      expect(appJson.expo.ios.entitlements["aps-environment"]).toBe("development");
    });

    it("app.json 자체에는 googleServicesFile이 없다 — env 주입 전용(공개 저장소)", () => {
      expect(appJson.expo.ios).not.toHaveProperty("googleServicesFile");
      expect(appJson.expo.android).not.toHaveProperty("googleServicesFile");
    });
  });

  describe("설정 파일 주입 (app.config.ts)", () => {
    it("env가 없으면 googleServicesFile 키를 넣지 않는다 — Metro만 띄울 때는 파일이 없어도 된다", () => {
      const config = resolveConfig({
        APP_VARIANT: undefined,
        GOOGLE_SERVICES_JSON: undefined,
        GOOGLE_SERVICES_PLIST: undefined,
      });
      expect(config.ios).not.toHaveProperty("googleServicesFile");
      expect(config.android).not.toHaveProperty("googleServicesFile");
      // 기존 ios/android 설정은 그대로 보존된다.
      expect(config.ios?.bundleIdentifier).toBe("com.breathlessyouth.mobile");
      expect(config.android?.package).toBe("com.breathlessyouth.mobile");
    });

    it("개발 빌드에 dev 파일을 주면 그대로 반영된다", () => {
      const { json, plist } = FIXTURE("dev");
      const config = resolveConfig({
        APP_VARIANT: undefined,
        GOOGLE_SERVICES_JSON: json,
        GOOGLE_SERVICES_PLIST: plist,
      });
      expect(config.android?.googleServicesFile).toBe(json);
      expect(config.ios?.googleServicesFile).toBe(plist);
    });

    it("production 빌드에 prod 파일을 주면 그대로 반영된다", () => {
      const { json, plist } = FIXTURE("prod");
      const config = resolveConfig({
        APP_VARIANT: "production",
        GOOGLE_SERVICES_JSON: json,
        GOOGLE_SERVICES_PLIST: plist,
      });
      expect(config.android?.googleServicesFile).toBe(json);
      expect(config.ios?.googleServicesFile).toBe(plist);
    });

    it.each([
      ["GOOGLE_SERVICES_JSON", "json"],
      ["GOOGLE_SERVICES_PLIST", "plist"],
    ] as const)("개발 빌드가 prod 파일(%s)을 가리키면 설정 평가가 실패한다", (name, kind) => {
      expect(() =>
        resolveConfig({ APP_VARIANT: undefined, [name]: FIXTURE("prod")[kind] }),
      ).toThrow(/운영 Firebase 프로젝트/);
    });

    it.each([
      ["GOOGLE_SERVICES_JSON", "json"],
      ["GOOGLE_SERVICES_PLIST", "plist"],
    ] as const)("production 빌드가 dev 파일(%s)을 가리키면 설정 평가가 실패한다", (name, kind) => {
      expect(() =>
        resolveConfig({ APP_VARIANT: "production", [name]: FIXTURE("dev")[kind] }),
      ).toThrow(/운영 Firebase 프로젝트/);
    });

    it("production 빌드에 읽을 수 없는 경로를 주면 실패한다 — 파일 누락은 조용히 넘어가지 않는다", () => {
      expect(() =>
        resolveConfig({
          APP_VARIANT: "production",
          GOOGLE_SERVICES_JSON: "./firebase/does-not-exist/google-services.json",
        }),
      ).toThrow(/운영 Firebase 프로젝트/);
    });
  });

  describe("eas.json", () => {
    const profiles = easJson.build as Record<
      string,
      { environment?: string; ios?: { image?: string } }
    >;

    /**
     * 설정 파일은 EAS file 타입 환경변수로 받는다. dev 프로젝트 파일은 `development` 환경에,
     * prod 프로젝트 파일은 `preview`·`production` 환경에 올라가 있다 — 매핑이 어긋나면 qa 빌드가
     * 운영 Remote Config를 읽는다.
     */
    it("프로필별 EAS environment 매핑이 고정돼 있다", () => {
      const mapping = Object.fromEntries(
        Object.entries(profiles).map(([name, profile]) => [name, profile.environment]),
      );
      expect(mapping).toEqual({
        development: "development",
        "development-simulator": "development",
        qa: "development",
        preview: "preview",
        production: "production",
      });
    });

    /**
     * Firebase 12.12+는 Xcode 26.2 이상을 요구하는데 SDK 54의 EAS 기본 이미지는 Xcode 26.0이다.
     * 프로필 하나라도 빠지면 그 빌드만 pod install에서 죽는다.
     */
    it("모든 프로필이 Xcode 26.2 빌드 이미지를 쓴다", () => {
      for (const [name, profile] of Object.entries(profiles)) {
        expect([name, profile.ios?.image]).toEqual([name, "macos-sequoia-15.6-xcode-26.2"]);
      }
    });
  });
});
