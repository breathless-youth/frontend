import fs from "node:fs";
import path from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";
import easJson from "../../eas.json";
import mobilePackageJson from "../../package.json";

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

  const FIXTURE = (variant: "dev" | "staging" | "prod" | "typo") => ({
    json: `./lib/__tests__/fixtures/firebase/${variant}/google-services.json`,
    plist: `./lib/__tests__/fixtures/firebase/${variant}/GoogleService-Info.plist`,
  });

  // 비운영 변형은 읽지 못한 경로도 그대로 반환하므로, 성공 케이스는 fixture가 사라져도 통과한다.
  // 파일이 실제로 있는지 여기서 못박는다.
  const expectFixturesExist = (paths: string[]) => {
    for (const filePath of paths) {
      expect([filePath, fs.existsSync(path.resolve(__dirname, "../..", filePath))]).toEqual([
        filePath,
        true,
      ]);
    }
  };

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
      expect(config.ios?.bundleIdentifier).toBe("com.breathlessyouth.mobile.dev");
      expect(config.android?.package).toBe("com.breathlessyouth.mobile.dev");
    });

    it("개발 빌드에 dev 파일을 주면 그대로 반영된다", () => {
      const { json, plist } = FIXTURE("dev");
      expectFixturesExist([json, plist]);
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
      expectFixturesExist([json, plist]);
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
      ).toThrow(/프로젝트 파일이 아닙니다/);
    });

    it.each([
      ["GOOGLE_SERVICES_JSON", "json"],
      ["GOOGLE_SERVICES_PLIST", "plist"],
    ] as const)(
      "개발 빌드가 제3 프로젝트 파일(%s)을 가리키면 설정 평가가 실패한다",
      (name, kind) => {
        expect(() =>
          resolveConfig({ APP_VARIANT: undefined, [name]: FIXTURE("typo")[kind] }),
        ).toThrow(/프로젝트 파일이 아닙니다/);
      },
    );

    it.each([
      ["GOOGLE_SERVICES_JSON", "json"],
      ["GOOGLE_SERVICES_PLIST", "plist"],
    ] as const)("production 빌드가 dev 파일(%s)을 가리키면 설정 평가가 실패한다", (name, kind) => {
      expect(() =>
        resolveConfig({
          APP_VARIANT: "production",
          GOOGLE_SERVICES_JSON: FIXTURE("prod").json,
          GOOGLE_SERVICES_PLIST: FIXTURE("prod").plist,
          [name]: FIXTURE("dev")[kind],
        }),
      ).toThrow(/프로젝트 파일이 아닙니다/);
    });

    it.each(["GOOGLE_SERVICES_JSON", "GOOGLE_SERVICES_PLIST"] as const)(
      "EAS 빌더의 production 빌드에 %s가 없으면 설정 평가가 실패한다",
      (name) => {
        expect(() =>
          resolveConfig({
            APP_VARIANT: "production",
            EAS_BUILD: "true",
            GOOGLE_SERVICES_JSON: FIXTURE("prod").json,
            GOOGLE_SERVICES_PLIST: FIXTURE("prod").plist,
            [name]: undefined,
          }),
        ).toThrow(/비어 있습니다/);
      },
    );

    /**
     * BY-620: eas-cli는 업로드 전에 로컬에서도 설정을 평가하는데, EAS production 환경의 file 변수는
     * secret이라 빌더에서만 풀린다. 로컬 평가에서 누락을 막으면 production 빌드를 시작조차 못 한다.
     */
    it("EAS 빌더 밖의 production 평가는 파일이 없어도 통과하고 googleServicesFile 키를 넣지 않는다", () => {
      const config = resolveConfig({
        APP_VARIANT: "production",
        EAS_BUILD: undefined,
        GOOGLE_SERVICES_JSON: undefined,
        GOOGLE_SERVICES_PLIST: undefined,
      });
      expect(config.ios).not.toHaveProperty("googleServicesFile");
      expect(config.android).not.toHaveProperty("googleServicesFile");
      expect(config.ios?.bundleIdentifier).toBe("com.breathlessyouth.mobile");
      expect(config.android?.package).toBe("com.breathlessyouth.mobile");
    });

    it.each([
      ["GOOGLE_SERVICES_JSON", "json"],
      ["GOOGLE_SERVICES_PLIST", "plist"],
    ] as const)(
      "EAS 빌더 밖이라도 production에 dev 파일(%s)을 주면 실패한다 — 파일이 있을 때의 검사는 어디서든 한다",
      (name, kind) => {
        expect(() =>
          resolveConfig({
            APP_VARIANT: "production",
            EAS_BUILD: undefined,
            [name]: FIXTURE("dev")[kind],
          }),
        ).toThrow(/프로젝트 파일이 아닙니다/);
      },
    );

    it("staging 빌드는 env가 없으면 googleServicesFile 키를 넣지 않는다", () => {
      const config = resolveConfig({
        APP_VARIANT: "staging",
        GOOGLE_SERVICES_JSON: undefined,
        GOOGLE_SERVICES_PLIST: undefined,
      });
      expect(config.ios).not.toHaveProperty("googleServicesFile");
      expect(config.android).not.toHaveProperty("googleServicesFile");
    });

    it("staging 빌드에 staging 아이덴티티의 dev 프로젝트 파일을 주면 반영된다", () => {
      const { json, plist } = FIXTURE("staging");
      expectFixturesExist([json, plist]);
      const config = resolveConfig({
        APP_VARIANT: "staging",
        GOOGLE_SERVICES_JSON: json,
        GOOGLE_SERVICES_PLIST: plist,
      });
      expect(config.android?.googleServicesFile).toBe(json);
      expect(config.ios?.googleServicesFile).toBe(plist);
    });

    it.each([
      ["GOOGLE_SERVICES_JSON", "json"],
      ["GOOGLE_SERVICES_PLIST", "plist"],
    ] as const)(
      "staging 빌드가 .dev 아이덴티티 파일(%s)을 가리키면 설정 평가가 실패한다",
      (name, kind) => {
        expect(() =>
          resolveConfig({ APP_VARIANT: "staging", [name]: FIXTURE("dev")[kind] }),
        ).toThrow(/아이덴티티/);
      },
    );

    it.each([
      ["GOOGLE_SERVICES_JSON", "json"],
      ["GOOGLE_SERVICES_PLIST", "plist"],
    ] as const)(
      "development 빌드가 .staging 아이덴티티 파일(%s)을 가리키면 설정 평가가 실패한다",
      (name, kind) => {
        expect(() =>
          resolveConfig({ APP_VARIANT: undefined, [name]: FIXTURE("staging")[kind] }),
        ).toThrow(/아이덴티티/);
      },
    );

    it("staging 빌드의 실패 메시지는 EAS preview environment를 가리킨다", () => {
      expect(() =>
        resolveConfig({ APP_VARIANT: "staging", GOOGLE_SERVICES_JSON: FIXTURE("dev").json }),
      ).toThrow(/preview environment/);
    });

    it("production 빌드에 읽을 수 없는 경로를 주면 실패한다 — 파일 누락은 조용히 넘어가지 않는다", () => {
      expect(() =>
        resolveConfig({
          APP_VARIANT: "production",
          GOOGLE_SERVICES_JSON: "./firebase/does-not-exist/google-services.json",
        }),
      ).toThrow(/운영 Firebase 프로젝트/);
    });

    it.each([
      ["GOOGLE_SERVICES_JSON", "android", "./firebase/does-not-exist/google-services.json"],
      ["GOOGLE_SERVICES_PLIST", "ios", "./firebase/does-not-exist/GoogleService-Info.plist"],
    ] as const)(
      "staging 빌드는 읽을 수 없는 경로(%s)를 그대로 통과시킨다. Metro만 띄우는 개발을 막지 않으려고 파일 누락은 prebuild가 잡게 둔다",
      (name, platform, filePath) => {
        const config = resolveConfig({ APP_VARIANT: "staging", [name]: filePath });
        expect(config[platform]?.googleServicesFile).toBe(filePath);
      },
    );
  });

  describe("eas.json", () => {
    const profiles = easJson.build as Record<
      string,
      { environment?: string; ios?: { image?: string } }
    >;

    /**
     * 설정 파일은 EAS file 타입 환경변수로 받는다. dev 프로젝트의 `.dev` 파일은 `development` 환경에,
     * dev 프로젝트의 `.staging` 파일은 `preview` 환경에, prod 프로젝트 파일은 `production` 환경에
     * 올라가 있다. 매핑이 어긋나면 staging 빌드가 운영 Remote Config를 읽는다.
     */
    it("프로필별 EAS environment 매핑이 고정돼 있다", () => {
      const mapping = Object.fromEntries(
        Object.entries(profiles).map(([name, profile]) => [name, profile.environment]),
      );
      expect(mapping).toEqual({
        development: "development",
        "development-simulator": "development",
        staging: "preview",
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

/**
 * `@react-native-firebase/remote-config`는 `@react-native-firebase/analytics`를 peer로 요구해 pnpm이
 * 자동 설치한다. 그대로 두면 autolinking이 Firebase Analytics SDK(GoogleAppMeasurement)를 앱에 링크해
 * 자동 수집이 시작된다 — GA를 붙이지 않기로 한 결정(설계 문서 "확정한 결정")과 스토어 개인정보 라벨에
 * 어긋난다. 패키지는 남겨 두되 네이티브 링크만 막는다.
 */
describe("Firebase Analytics 미링크 (BY-585)", () => {
  it("package.json의 expo.autolinking.exclude가 analytics를 뺀다", () => {
    expect(mobilePackageJson.expo.autolinking.exclude).toContain(
      "@react-native-firebase/analytics",
    );
  });

  it("앱 의존성에 analytics를 직접 넣지 않는다 — peer로만 존재한다", () => {
    expect(mobilePackageJson.dependencies).not.toHaveProperty("@react-native-firebase/analytics");
  });
});

describe("커스텀 엔트리 (BY-586)", () => {
  it("package.json main은 index.ts다 — FCM 백그라운드 핸들러를 React 트리 밖에서 걸기 위해", () => {
    expect(mobilePackageJson.main).toBe("index.ts");
  });
});
