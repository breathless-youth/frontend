import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";
import enLocale from "../../locales/en.json";
import koLocale from "../../locales/ko.json";

/**
 * BY-622: App Store 제품 페이지의 언어(KO/EN)는 App Store Connect 설정이 아니라 **바이너리
 * Info.plist의 `CFBundleLocalizations`·`CFBundleDevelopmentRegion`**에서 정해진다. Expo 템플릿은
 * `developmentRegion = en` 하나만 선언하므로 키를 넣지 않으면 한국어 앱이 EN으로 표시된다
 * (1.0.1까지 실제로 그랬다). `ios.infoPlist`는 prebuild 때 템플릿 값을 덮어쓴다.
 *
 * 영어 권한 문구와 앱 이름이 `locales/en.json`·`app.config.ts`에 들어가서 `en`을 지원 언어로 선언한다.
 * 개발 지역은 `ko`로 남겨 언어가 맞지 않는 기기는 지금처럼 한국어 원문을 본다.
 */
const EXPECTED = {
  CFBundleDevelopmentRegion: "ko",
  CFBundleLocalizations: ["ko", "en"],
  CFBundleAllowMixedLocalizations: true,
};

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

function configFor(variant: "production" | "staging" | undefined): ExpoConfig {
  if (variant === undefined) {
    delete process.env.APP_VARIANT;
  } else {
    process.env.APP_VARIANT = variant;
  }
  delete process.env.EAS_BUILD;
  delete process.env.GOOGLE_SERVICES_JSON;
  delete process.env.GOOGLE_SERVICES_PLIST;
  delete process.env.API_BASE_URL;
  delete process.env.WEB_BASE_URL;
  return buildConfig({ config: appJson.expo as unknown as ExpoConfig } as ConfigContext);
}

describe("iOS 로컬라이제이션 선언 (BY-622)", () => {
  it("app.json이 개발 지역은 한국어, 지원 언어는 한국어와 영어로 선언한다", () => {
    expect(appJson.expo.ios.infoPlist).toMatchObject(EXPECTED);
  });

  it.each([
    ["production", "production"],
    ["staging", "staging"],
    ["development", undefined],
  ] as const)("%s 변형에서도 app.config.ts가 선언을 보존한다", (_label, variant) => {
    expect(configFor(variant).ios?.infoPlist).toMatchObject(EXPECTED);
  });

  /**
   * expo-localization 플러그인은 supportedLocales로 iOS `CFBundleLocalizations`를 덮고
   * Android 13+ 앱별 언어 목록을 만든다.
   * allowDynamicLocaleChangesAndroid를 켜면 언어를 바꿔도 액티비티를 다시 만들지 않아 웹뷰가 이전 lang으로 남는다.
   */
  it("expo-localization 플러그인이 같은 언어 목록을 쓰고 Android 언어 변경 때 화면을 다시 만든다", () => {
    const entry = (appJson.expo.plugins as unknown[]).find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-localization",
    ) as [string, Record<string, unknown>] | undefined;

    expect(entry?.[1]).toEqual({
      supportedLocales: ["ko", "en"],
      allowDynamicLocaleChangesAndroid: false,
    });
  });
});

describe("권한 문구와 앱 이름의 언어별 파일", () => {
  const usageKeys = Object.keys(appJson.expo.ios.infoPlist)
    .filter((key) => key.endsWith("UsageDescription"))
    .sort();

  it("ko·en 파일에 infoPlist의 권한 문구 키가 전부 있다", () => {
    expect(usageKeys.length).toBeGreaterThan(0);
    expect(Object.keys(koLocale).sort()).toEqual(usageKeys);
    expect(Object.keys(enLocale).sort()).toEqual(usageKeys);
  });

  it("ko 파일은 infoPlist의 한국어 확정 문구와 같다", () => {
    const infoPlist = appJson.expo.ios.infoPlist as Record<string, unknown>;
    for (const key of usageKeys) {
      expect({ key, value: (koLocale as Record<string, string>)[key] }).toEqual({
        key,
        value: infoPlist[key],
      });
    }
  });

  it("en 파일은 비어 있지 않고 한글이 없다", () => {
    for (const [key, value] of Object.entries(enLocale)) {
      expect({ key, ok: value.trim() !== "" && !/[가-힣]/.test(value) }).toEqual({ key, ok: true });
    }
  });

  it.each([
    ["production", "production", "포커스 메이커스", "FocusMakers"],
    ["staging", "staging", "포커스 메이커스 STG", "FocusMakers STG"],
    ["development", undefined, "포커스 메이커스 DEV", "FocusMakers DEV"],
  ] as const)(
    "%s 변형의 언어별 앱 이름에 변형 접미가 붙는다",
    (_label, variant, koName, enName) => {
      const out = configFor(variant);

      expect(out.locales).toEqual({
        ko: { ios: { ...koLocale, CFBundleDisplayName: koName }, android: { app_name: koName } },
        en: { ios: { ...enLocale, CFBundleDisplayName: enName } },
      });
      expect(out.extra?.appDisplayName).toBe(koName);
      expect(out.extra?.appDisplayNameEn).toBe(enName);
    },
  );
});

/**
 * Android 앱 이름은 앱 잠금 모듈 문구와 같이 기본(values)을 영어로 둔다.
 * 한국어 이름은 Expo locales가 values-b+ko에 쓴다.
 * expo-localization의 resourceConfigurations가 b+ko·b+en만 남기므로 같은 한정자를 쓴다.
 */
describe("Android 앱 이름 기본값", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withAppDisplayName = require("../../plugins/withAppDisplayName") as (
    config: ExpoConfig,
  ) => ExpoConfig & { mods: { android: { strings: (config: unknown) => Promise<unknown> } } };

  type StringsXml = { resources: { string?: { $: { name: string }; _: string }[] } };

  async function defaultAppName(variant: "production" | "staging" | undefined) {
    const withPlugin = withAppDisplayName(configFor(variant));
    const result = (await withPlugin.mods.android.strings({
      ...withPlugin,
      modResults: { resources: {} },
      modRequest: { platform: "android", modName: "strings", projectRoot: "/", introspect: true },
    })) as { modResults: StringsXml };
    return result.modResults.resources.string?.find((item) => item.$.name === "app_name");
  }

  it.each([
    ["production", "production", "FocusMakers"],
    ["staging", "staging", "FocusMakers STG"],
    ["development", undefined, "FocusMakers DEV"],
  ] as const)("%s 변형의 기본 values app_name은 영어다", async (_label, variant, enName) => {
    const item = await defaultAppName(variant);

    expect(item?._).toBe(enName);
    expect(item?.$).not.toHaveProperty("translatable");
  });
});
