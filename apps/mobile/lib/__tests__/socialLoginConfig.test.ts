import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig, { VARIANT_TABLE } from "../../app.config";
import appJson from "../../app.json";
import { socialLoginProvidersFor } from "../socialLogin";

/**
 * 소셜 로그인 설정 가드
 *
 * 카카오 네이티브 앱 키와 구글 iOS 클라이언트 ID는 앱 종류마다 다르고 지금은 운영 값만 있다.
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

  it("운영 앱은 카카오 plugin에 운영 네이티브 앱 키와 로그인 복귀 처리를 넣는다", () => {
    expect(findPlugin(resolveConfig("production"), "@react-native-kakao/core")).toEqual([
      "@react-native-kakao/core",
      {
        nativeAppKey: "31b5a6b5a878defcff1e99d69391649e",
        android: { authCodeHandlerActivity: true },
        ios: { handleKakaoOpenUrl: true },
      },
    ]);
  });

  it("운영 앱은 구글 plugin에 운영 iOS 클라이언트 ID의 역순 URL scheme을 넣는다", () => {
    expect(findPlugin(resolveConfig("production"), "react-native-nitro-google-signin")).toEqual([
      "react-native-nitro-google-signin",
      {
        iosUrlScheme: "com.googleusercontent.apps.320200622450-npt1a7o4bpd6ois9tkld1qnn3l2sdi9u",
      },
    ]);
  });

  it("구글 iOS 클라이언트 ID가 있는 앱에만 구글 로그인 복귀 URL 처리를 AppDelegate에 넣는다", () => {
    const googleOpenUrl = "./plugins/withGoogleSignInOpenUrl";
    expect(findPlugin(resolveConfig("production"), googleOpenUrl)).toBe(googleOpenUrl);
    expect(findPlugin(resolveConfig("staging"), googleOpenUrl)).toBeUndefined();
    expect(findPlugin(resolveConfig("development"), googleOpenUrl)).toBeUndefined();
  });

  it.each(["staging", "development"] as const)(
    "%s 앱은 키가 없어 카카오·구글 plugin을 넣지 않는다",
    (variant) => {
      const cfg = resolveConfig(variant);
      expect(findPlugin(cfg, "@react-native-kakao/core")).toBeUndefined();
      expect(findPlugin(cfg, "react-native-nitro-google-signin")).toBeUndefined();
      expect(cfg.extra?.socialLogin).toEqual({
        kakaoNativeAppKey: "",
        googleIosClientId: "",
        googleWebClientId: GOOGLE_WEB_CLIENT_ID,
      });
    },
  );

  it.each([
    ["production", "ios", ["GOOGLE", "KAKAO", "APPLE"]],
    ["production", "android", ["GOOGLE", "KAKAO"]],
    ["staging", "ios", ["APPLE"]],
    ["staging", "android", ["GOOGLE"]],
    ["development", "ios", ["APPLE"]],
    ["development", "android", ["GOOGLE"]],
  ] as const)("%s %s 앱의 공급자 목록은 %j다", (variant, os, expected) => {
    expect(socialLoginProvidersFor(os, resolveConfig(variant).extra?.socialLogin)).toEqual(
      expected,
    );
  });

  it.each(["staging", "development"] as const)(
    "%s 표에 키를 채우면 그 공급자의 plugin이 붙고 목록에 들어온다",
    (variant) => {
      const saved = { ...VARIANT_TABLE[variant] };
      VARIANT_TABLE[variant].kakaoNativeAppKey = "0123456789abcdef0123456789abcdef";
      VARIANT_TABLE[variant].googleIosClientId = "1-abc.apps.googleusercontent.com";
      try {
        const cfg = resolveConfig(variant);
        expect(findPlugin(cfg, "@react-native-kakao/core")).toBeDefined();
        expect(findPlugin(cfg, "react-native-nitro-google-signin")).toEqual([
          "react-native-nitro-google-signin",
          { iosUrlScheme: "com.googleusercontent.apps.1-abc" },
        ]);
        expect(findPlugin(cfg, "./plugins/withGoogleSignInOpenUrl")).toBeDefined();
        expect(socialLoginProvidersFor("ios", cfg.extra?.socialLogin)).toEqual([
          "GOOGLE",
          "KAKAO",
          "APPLE",
        ]);
        expect(socialLoginProvidersFor("android", cfg.extra?.socialLogin)).toEqual([
          "GOOGLE",
          "KAKAO",
        ]);
      } finally {
        VARIANT_TABLE[variant] = saved;
      }
    },
  );

  it("staging 표에 카카오 키만 채우면 카카오만 붙고 구글 iOS는 그대로 빠진다", () => {
    const saved = { ...VARIANT_TABLE.staging };
    VARIANT_TABLE.staging.kakaoNativeAppKey = "0123456789abcdef0123456789abcdef";
    try {
      const cfg = resolveConfig("staging");
      expect(findPlugin(cfg, "@react-native-kakao/core")).toBeDefined();
      expect(findPlugin(cfg, "react-native-nitro-google-signin")).toBeUndefined();
      expect(findPlugin(cfg, "./plugins/withGoogleSignInOpenUrl")).toBeUndefined();
      expect(socialLoginProvidersFor("ios", cfg.extra?.socialLogin)).toEqual(["KAKAO", "APPLE"]);
      expect(socialLoginProvidersFor("android", cfg.extra?.socialLogin)).toEqual([
        "GOOGLE",
        "KAKAO",
      ]);
    } finally {
      VARIANT_TABLE.staging = saved;
    }
  });

  it("staging 표에 구글 iOS 클라이언트 ID만 채우면 구글 iOS만 붙고 카카오는 그대로 빠진다", () => {
    const saved = { ...VARIANT_TABLE.staging };
    VARIANT_TABLE.staging.googleIosClientId = "1-abc.apps.googleusercontent.com";
    try {
      const cfg = resolveConfig("staging");
      expect(findPlugin(cfg, "@react-native-kakao/core")).toBeUndefined();
      expect(findPlugin(cfg, "react-native-nitro-google-signin")).toBeDefined();
      expect(findPlugin(cfg, "./plugins/withGoogleSignInOpenUrl")).toBeDefined();
      expect(socialLoginProvidersFor("ios", cfg.extra?.socialLogin)).toEqual(["GOOGLE", "APPLE"]);
      expect(socialLoginProvidersFor("android", cfg.extra?.socialLogin)).toEqual(["GOOGLE"]);
    } finally {
      VARIANT_TABLE.staging = saved;
    }
  });

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
