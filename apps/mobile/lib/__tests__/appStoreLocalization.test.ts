import { APP_LOCALES } from "@focusmakers/types";
import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";
import enLocale from "../../locales/en.json";
import jaLocale from "../../locales/ja.json";
import koLocale from "../../locales/ko.json";
import zhHantLocale from "../../locales/zh-Hant.json";

/**
 * BY-622: App Store 제품 페이지의 언어(KO/EN)는 App Store Connect 설정이 아니라 **바이너리
 * Info.plist의 `CFBundleLocalizations`·`CFBundleDevelopmentRegion`**에서 정해진다. Expo 템플릿은
 * `developmentRegion = en` 하나만 선언하므로 키를 넣지 않으면 한국어 앱이 EN으로 표시된다
 * (1.0.1까지 실제로 그랬다). `ios.infoPlist`는 prebuild 때 템플릿 값을 덮어쓴다.
 *
 * 지원 언어는 앱 셸·웹과 같은 APP_LOCALES다.
 * 개발 지역을 영어로 두어야 지원하지 않는 언어의 기기가 한국어 대신 영어를 본다.
 */
const EXPECTED = {
  CFBundleDevelopmentRegion: "en",
  CFBundleLocalizations: [...APP_LOCALES],
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
  it("app.json이 개발 지역은 영어, 지원 언어는 APP_LOCALES 네 언어로 선언한다", () => {
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
      supportedLocales: [...APP_LOCALES],
      allowDynamicLocaleChangesAndroid: false,
    });
  });
});

describe("권한 문구와 앱 이름의 언어별 파일", () => {
  const usageKeys = Object.keys(appJson.expo.ios.infoPlist)
    .filter((key) => key.endsWith("UsageDescription"))
    .sort();

  const localeFiles: Record<string, Record<string, string>> = {
    ko: koLocale,
    en: enLocale,
    ja: jaLocale,
    "zh-Hant": zhHantLocale,
  };

  const localeKeys = usageKeys;

  it("네 언어 파일에 infoPlist의 권한 문구 키가 전부 있다", () => {
    expect(usageKeys.length).toBeGreaterThan(0);
    expect(Object.keys(localeFiles)).toEqual([...APP_LOCALES]);
    for (const [locale, file] of Object.entries(localeFiles)) {
      expect({ locale, keys: Object.keys(file).sort() }).toEqual({ locale, keys: localeKeys });
    }
  });

  it.each([
    [
      "ko",
      "공부방에서 그룹 멤버와 이야기할 때 사용해요. 목소리는 멤버만 들을 수 있고 녹음하거나 저장하지 않아요.",
    ],
    [
      "en",
      "FocusMakers uses the microphone when you talk with your group members in a study room. Only your members can hear you, and your voice isn't recorded or saved.",
    ],
    [
      "ja",
      "スタディルームでグループのメンバーと話すときに使います。声を聞けるのはメンバーだけで、録音や保存はされません。",
    ],
    ["zh-Hant", "在讀書室與群組成員交談時使用。只有成員聽得到你的聲音，也不會錄音或儲存。"],
  ])("%s 파일의 마이크 권한 문구", (locale, text) => {
    expect(localeFiles[locale]?.NSMicrophoneUsageDescription).toBe(text);
  });

  // InfoPlist.strings에 큰따옴표가 이스케이프 없이 들어가면 문자열이 중간에서 끊긴다.
  it("어느 언어 파일에도 ASCII 큰따옴표가 없다", () => {
    for (const [locale, file] of Object.entries(localeFiles)) {
      for (const [key, value] of Object.entries(file)) {
        expect({ locale, key, ok: !value.includes('"') }).toEqual({ locale, key, ok: true });
      }
    }
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

  it.each([
    ["en", enLocale],
    ["ja", jaLocale],
    ["zh-Hant", zhHantLocale],
  ] as const)("%s 파일은 비어 있지 않고 한글이 없다", (_locale, file) => {
    for (const [key, value] of Object.entries(file)) {
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
        ja: { ios: { ...jaLocale, CFBundleDisplayName: enName } },
        "zh-Hant": { ios: { ...zhHantLocale, CFBundleDisplayName: enName } },
      });
      expect(out.extra?.appDisplayName).toBe(koName);
      expect(out.extra?.appDisplayNameEn).toBe(enName);
    },
  );
});

/**
 * Android 앱 이름은 앱 잠금 모듈 문구와 같이 기본(values)을 영어로 둔다.
 * 한국어 이름은 Expo locales가 values-b+ko에 쓴다.
 * expo-localization의 resourceConfigurations가 b+ko·b+en·b+ja·b+zh+Hant만 남기므로 같은 한정자를 쓴다.
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
