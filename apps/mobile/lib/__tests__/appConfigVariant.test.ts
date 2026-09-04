import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";

/**
 * BY-402: 앱 설정의 개발/운영 환경 분기.
 *
 * `app.config.ts`는 app.json을 받아 `APP_VARIANT`에 따라 주소만 덮어쓰는 순수 함수다 —
 * 여기서는 그 함수를 직접 호출해 분기 계약을 고정한다. `APP_VARIANT`는 EAS 빌드
 * 프로필(eas.json)이 주입하고, 로컬 Metro에서는 없다(= 안전 기본값으로 떨어져야 한다).
 */
// production 분기는 이제 Firebase 설정 파일 주입을 요구한다(app.config.ts). 이 파일의 관심사가
// 아니므로 운영 fixture 경로를 함께 준다.
const PROD_FIREBASE_ENV = {
  GOOGLE_SERVICES_JSON: "./lib/__tests__/fixtures/firebase/prod/google-services.json",
  GOOGLE_SERVICES_PLIST: "./lib/__tests__/fixtures/firebase/prod/GoogleService-Info.plist",
};

describe("app.config 환경 분기", () => {
  // JSON import는 문자열이 전부 string으로 넓혀져 ExpoConfig의 유니언 타입과 안 맞는다 —
  // 실데이터 검증이 목적이므로 캐스트한다.
  const baseConfig = appJson.expo as unknown as ExpoConfig;

  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function resolveExtra(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return buildConfig({ config: baseConfig } as ConfigContext).extra;
  }

  it("APP_VARIANT가 production이면 운영 주소가 들어간다", () => {
    const extra = resolveExtra({ APP_VARIANT: "production", ...PROD_FIREBASE_ENV });
    expect(extra?.apiBaseUrl).toBe("https://api.focusmakers.app");
    expect(extra?.webBaseUrl).toBe("https://web.focusmakers.app");
  });

  it("APP_VARIANT가 없으면 주소가 빈 문자열이다 — 안전 기본값", () => {
    const extra = resolveExtra({
      APP_VARIANT: undefined,
      API_BASE_URL: undefined,
      WEB_BASE_URL: undefined,
    });
    expect(extra?.apiBaseUrl).toBe("");
    expect(extra?.webBaseUrl).toBe("");
    // app.json 자체에도 운영 주소가 남아 있으면 안 된다 — 분기 없이 소비하는 코드가
    // 생겼을 때 운영을 바라보는 사고를 막는 핀이다.
    expect(appJson.expo.extra.apiBaseUrl).toBe("");
    expect(appJson.expo.extra.webBaseUrl).toBe("");
  });

  it("개발에서 WEB_BASE_URL과 API_BASE_URL 환경변수를 주면 그 값이 반영된다", () => {
    const extra = resolveExtra({
      APP_VARIANT: undefined,
      API_BASE_URL: "http://localhost:8080",
      WEB_BASE_URL: "https://192.168.0.19:5173",
    });
    expect(extra?.apiBaseUrl).toBe("http://localhost:8080");
    expect(extra?.webBaseUrl).toBe("https://192.168.0.19:5173");
  });

  it("production에서는 환경변수 주입을 무시한다 — 운영 산출물 오염 방지", () => {
    const extra = resolveExtra({
      APP_VARIANT: "production",
      ...PROD_FIREBASE_ENV,
      API_BASE_URL: "http://localhost:8080",
      WEB_BASE_URL: "https://192.168.0.19:5173",
    });
    expect(extra?.apiBaseUrl).toBe("https://api.focusmakers.app");
    expect(extra?.webBaseUrl).toBe("https://web.focusmakers.app");
  });

  it.each([
    ["API_BASE_URL", "https://api.sunqstudio.kr"],
    ["API_BASE_URL", "https://api.focusmakers.app"],
    ["WEB_BASE_URL", "https://web.sunqstudio.kr"],
    ["WEB_BASE_URL", "https://web.focusmakers.app"],
    ["API_BASE_URL", "api.focusmakers.app"],
  ])("개발에서 %s이 운영 주소(%s)면 설정 평가가 실패한다", (name, url) => {
    expect(() =>
      resolveExtra({
        APP_VARIANT: undefined,
        API_BASE_URL: undefined,
        WEB_BASE_URL: undefined,
        [name]: url,
      }),
    ).toThrow(/운영 주소/);
  });

  describe("APP_VARIANT 3단계 파생", () => {
    it("staging은 dev 주소 상수와 .staging 아이덴티티, STG 표시명을 낸다", () => {
      process.env.APP_VARIANT = "staging";
      delete process.env.API_BASE_URL;
      delete process.env.WEB_BASE_URL;
      const out = buildConfig({ config: baseConfig } as ConfigContext);
      expect(out.extra?.apiBaseUrl).toBe("https://api-dev.focusmakers.app");
      expect(out.extra?.webBaseUrl).toBe("https://web-dev.focusmakers.app");
      expect(out.ios?.bundleIdentifier).toBe("com.breathlessyouth.mobile.staging");
      expect(out.android?.package).toBe("com.breathlessyouth.mobile.staging");
      expect(out.extra?.appDisplayName).toBe("포커스 메이커스 STG");
      expect(out.extra?.appEnv).toBe("staging");
    });

    it("staging은 env 주소를 무시한다", () => {
      process.env.APP_VARIANT = "staging";
      process.env.API_BASE_URL = "http://localhost:8080";
      process.env.WEB_BASE_URL = "http://localhost:5173";
      const out = buildConfig({ config: baseConfig } as ConfigContext);
      expect(out.extra?.apiBaseUrl).toBe("https://api-dev.focusmakers.app");
      expect(out.extra?.webBaseUrl).toBe("https://web-dev.focusmakers.app");
    });

    it("미설정은 development로 보고 .dev 아이덴티티와 DEV 표시명을 낸다", () => {
      delete process.env.APP_VARIANT;
      delete process.env.API_BASE_URL;
      delete process.env.WEB_BASE_URL;
      const out = buildConfig({ config: baseConfig } as ConfigContext);
      expect(out.ios?.bundleIdentifier).toBe("com.breathlessyouth.mobile.dev");
      expect(out.android?.package).toBe("com.breathlessyouth.mobile.dev");
      expect(out.extra?.appDisplayName).toBe("포커스 메이커스 DEV");
      expect(out.extra?.appEnv).toBe("development");
    });

    it("production은 app.json의 아이덴티티·표시명을 그대로 낸다", () => {
      process.env.APP_VARIANT = "production";
      Object.assign(process.env, PROD_FIREBASE_ENV);
      const out = buildConfig({ config: baseConfig } as ConfigContext);
      expect(out.ios?.bundleIdentifier).toBe(appJson.expo.ios.bundleIdentifier);
      expect(out.android?.package).toBe(appJson.expo.android.package);
      expect(out.extra?.appDisplayName).toBe(appJson.expo.extra.appDisplayName);
      expect(out.extra?.appEnv).toBe("production");
    });

    it.each(["stagin", "prod", "qa", "preview"])(
      "알 수 없는 값(%s)은 설정 평가가 실패한다",
      (raw) => {
        process.env.APP_VARIANT = raw;
        expect(() => buildConfig({ config: baseConfig } as ConfigContext)).toThrow(/APP_VARIANT/);
      },
    );
  });

  describe("eas.json 프로필", () => {
    const easJson = require("../../eas.json") as {
      build: Record<
        string,
        {
          distribution?: string;
          env?: Record<string, string>;
          environment?: string;
          autoIncrement?: boolean;
        }
      >;
    };

    it("프로필은 정확히 네 개다", () => {
      expect(Object.keys(easJson.build).sort()).toEqual([
        "development",
        "development-simulator",
        "production",
        "staging",
      ]);
    });

    it.each([
      ["development", "development"],
      ["development-simulator", "development"],
      ["staging", "staging"],
      ["production", "production"],
    ])("%s 프로필은 APP_VARIANT=%s 한 줄만 env로 준다", (profile, variant) => {
      expect(easJson.build[profile].env).toEqual({ APP_VARIANT: variant });
    });

    it("distribution과 autoIncrement가 ADR 표와 같다", () => {
      expect(easJson.build.development.distribution).toBe("internal");
      expect(easJson.build["development-simulator"].distribution).toBe("internal");
      expect(easJson.build.staging.distribution).toBe("internal");
      expect(easJson.build.production.distribution).toBeUndefined();
      expect(easJson.build.production.autoIncrement).toBe(true);
      expect(easJson.build.staging.autoIncrement).toBeUndefined();
    });
  });
});
