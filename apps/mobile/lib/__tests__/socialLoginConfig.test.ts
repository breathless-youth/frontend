import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig, { VARIANT_TABLE } from "../../app.config";
import appJson from "../../app.json";
import { socialLoginProvidersFor } from "../socialLogin";

/**
 * 소셜 로그인 설정 가드
 *
 * 카카오 네이티브 앱 키와 구글 iOS 클라이언트 ID는 앱 종류마다 다르고 세 앱 종류 모두 값이 있다.
 * 값이 없는 앱 종류는 그 공급자의 config plugin을 넣지 않고 웹에도 알리지 않는다.
 * 런타임은 `extra.socialLogin`을 `socialLoginProvidersFor`로 읽으므로 여기서 둘을 이어서 확인한다.
 */
describe("소셜 로그인 설정", () => {
  const baseConfig = appJson.expo as unknown as ExpoConfig;
  const pluginName = (entry: unknown) => (Array.isArray(entry) ? (entry[0] as string) : entry);
  const findPlugin = (cfg: ExpoConfig, name: string) =>
    cfg.plugins?.find((p) => pluginName(p) === name);

  const PROD_FIREBASE_ENV = {
    GOOGLE_SERVICES_JSON: "./lib/__tests__/fixtures/firebase/prod/google-services.json",
    GOOGLE_SERVICES_PLIST: "./lib/__tests__/fixtures/firebase/prod/GoogleService-Info.plist",
  };
  const GOOGLE_WEB_CLIENT_ID =
    "320200622450-5bqjf3j6lu8akp20p4oikiio7t8brjtd.apps.googleusercontent.com";

  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function resolveConfig(variant: "production" | "staging" | "development") {
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
    process.env.APP_VARIANT = variant;
    if (variant === "production") {
      Object.assign(process.env, PROD_FIREBASE_ENV);
    }
    return buildConfig({ config: baseConfig } as ConfigContext);
  }

  // 앱 종류별 기대값. 코드의 표와 따로 적어 두어야 값이 바뀌거나 섞이면 잡힌다.
  const KEYS = {
    production: {
      kakao: "31b5a6b5a878defcff1e99d69391649e",
      googleIos: "320200622450-npt1a7o4bpd6ois9tkld1qnn3l2sdi9u",
    },
    staging: {
      kakao: "142548c8a85d8e92f38505ab48bd7490",
      googleIos: "320200622450-1cbim0i0qvvk94msh2hqc20milaqpckn",
    },
    development: {
      kakao: "bff73043eb717b1be9775b230fdb5470",
      googleIos: "320200622450-7n4tsnasdc036knt49sgs66pigb2o2sg",
    },
  } as const;
  const VARIANTS = ["production", "staging", "development"] as const;

  /** 표의 키를 잠시 바꿔 설정을 만들고, 끝나면 되돌린다. */
  function resolveWithKeys(
    variant: (typeof VARIANTS)[number],
    keys: { kakaoNativeAppKey?: string; googleIosClientId?: string },
  ) {
    const saved = { ...VARIANT_TABLE[variant] };
    Object.assign(VARIANT_TABLE[variant], keys);
    try {
      return resolveConfig(variant);
    } finally {
      VARIANT_TABLE[variant] = saved;
    }
  }

  it.each(VARIANTS)(
    "%s 앱은 카카오 plugin에 그 앱의 네이티브 앱 키와 로그인 복귀 처리를 넣는다",
    (variant) => {
      expect(findPlugin(resolveConfig(variant), "@react-native-kakao/core")).toEqual([
        "@react-native-kakao/core",
        {
          nativeAppKey: KEYS[variant].kakao,
          android: { authCodeHandlerActivity: true },
          ios: { handleKakaoOpenUrl: true },
        },
      ]);
    },
  );

  it.each(VARIANTS)(
    "%s 앱은 구글 plugin에 그 앱의 iOS 클라이언트 ID의 역순 URL scheme을 넣는다",
    (variant) => {
      expect(findPlugin(resolveConfig(variant), "react-native-nitro-google-signin")).toEqual([
        "react-native-nitro-google-signin",
        { iosUrlScheme: `com.googleusercontent.apps.${KEYS[variant].googleIos}` },
      ]);
    },
  );

  it.each(VARIANTS)("%s 앱은 구글 로그인 복귀 URL 처리를 AppDelegate에 넣는다", (variant) => {
    const googleOpenUrl = "./plugins/withGoogleSignInOpenUrl";
    expect(findPlugin(resolveConfig(variant), googleOpenUrl)).toBe(googleOpenUrl);
  });

  it.each(VARIANTS)(
    "%s 앱은 extra.socialLogin에 그 앱의 키와 공용 웹 클라이언트 ID를 싣는다",
    (variant) => {
      expect(resolveConfig(variant).extra?.socialLogin).toEqual({
        kakaoNativeAppKey: KEYS[variant].kakao,
        googleIosClientId: `${KEYS[variant].googleIos}.apps.googleusercontent.com`,
        googleWebClientId: GOOGLE_WEB_CLIENT_ID,
      });
    },
  );

  it.each([
    ["production", "ios", ["GOOGLE", "KAKAO", "APPLE"]],
    ["production", "android", ["GOOGLE", "KAKAO"]],
    ["staging", "ios", ["GOOGLE", "KAKAO", "APPLE"]],
    ["staging", "android", ["GOOGLE", "KAKAO"]],
    ["development", "ios", ["GOOGLE", "KAKAO", "APPLE"]],
    ["development", "android", ["GOOGLE", "KAKAO"]],
  ] as const)("%s %s 앱의 공급자 목록은 %j다", (variant, os, expected) => {
    expect(socialLoginProvidersFor(os, resolveConfig(variant).extra?.socialLogin)).toEqual(
      expected,
    );
  });

  it.each(VARIANTS)(
    "%s 표의 키를 모두 비우면 카카오·구글 plugin이 빠지고 목록에서도 빠진다",
    (variant) => {
      const cfg = resolveWithKeys(variant, { kakaoNativeAppKey: "", googleIosClientId: "" });
      expect(findPlugin(cfg, "@react-native-kakao/core")).toBeUndefined();
      expect(findPlugin(cfg, "react-native-nitro-google-signin")).toBeUndefined();
      expect(findPlugin(cfg, "./plugins/withGoogleSignInOpenUrl")).toBeUndefined();
      expect(cfg.extra?.socialLogin).toEqual({
        kakaoNativeAppKey: "",
        googleIosClientId: "",
        googleWebClientId: GOOGLE_WEB_CLIENT_ID,
      });
      expect(socialLoginProvidersFor("ios", cfg.extra?.socialLogin)).toEqual(["APPLE"]);
      expect(socialLoginProvidersFor("android", cfg.extra?.socialLogin)).toEqual(["GOOGLE"]);
    },
  );

  it.each(VARIANTS)(
    "%s 표의 카카오 키만 비우면 카카오만 빠지고 구글 iOS는 그대로 남는다",
    (variant) => {
      const cfg = resolveWithKeys(variant, { kakaoNativeAppKey: "" });
      expect(findPlugin(cfg, "@react-native-kakao/core")).toBeUndefined();
      expect(findPlugin(cfg, "react-native-nitro-google-signin")).toBeDefined();
      expect(findPlugin(cfg, "./plugins/withGoogleSignInOpenUrl")).toBeDefined();
      expect(socialLoginProvidersFor("ios", cfg.extra?.socialLogin)).toEqual(["GOOGLE", "APPLE"]);
      expect(socialLoginProvidersFor("android", cfg.extra?.socialLogin)).toEqual(["GOOGLE"]);
    },
  );

  it.each(VARIANTS)(
    "%s 표의 구글 iOS 클라이언트 ID만 비우면 구글 iOS만 빠지고 카카오는 그대로 남는다",
    (variant) => {
      const cfg = resolveWithKeys(variant, { googleIosClientId: "" });
      expect(findPlugin(cfg, "@react-native-kakao/core")).toBeDefined();
      expect(findPlugin(cfg, "react-native-nitro-google-signin")).toBeUndefined();
      expect(findPlugin(cfg, "./plugins/withGoogleSignInOpenUrl")).toBeUndefined();
      expect(socialLoginProvidersFor("ios", cfg.extra?.socialLogin)).toEqual(["KAKAO", "APPLE"]);
      expect(socialLoginProvidersFor("android", cfg.extra?.socialLogin)).toEqual([
        "GOOGLE",
        "KAKAO",
      ]);
    },
  );

  it.each(["production", "staging", "development"] as const)(
    "%s 앱도 애플 로그인 권한을 켠다 — 서버가 모든 앱 종류의 번들을 받는다",
    (variant) => {
      const cfg = resolveConfig(variant);
      expect(cfg.ios?.usesAppleSignIn).toBe(true);
      expect(findPlugin(cfg, "expo-apple-authentication")).toBeDefined();
    },
  );

  it("카카오 SDK의 Maven 저장소를 모든 앱 종류에 둔다 — 키가 없어도 네이티브 모듈은 함께 빌드된다", () => {
    const buildProperties = (appJson.expo.plugins as unknown[]).find(
      (plugin) => pluginName(plugin) === "expo-build-properties",
    ) as [string, { android?: { extraMavenRepos?: string[] } }];
    expect(buildProperties[1].android?.extraMavenRepos).toContain(
      "https://devrepo.kakao.com/nexus/content/groups/public/",
    );
  });
});
