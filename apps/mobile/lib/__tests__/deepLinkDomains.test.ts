import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";

/**
 * 스킴과 App Link 선언이 빌드 변형에서 파생되는지 고정한다.
 *
 * BY-450이 apex(`focusmakers.app`)를 선등록했는데 BY-464가 확정한 실제 웹 호스트는
 * `web.focusmakers.app`이어서, 신 도메인 유니버설 링크가 아무 표시 없이 죽는 어긋남이 실제로
 * 있었다. 웹 주소에서 호스트를 뽑아 대조하므로 운영 웹 주소가 바뀌면 여기서 잡힌다.
 */
// production 분기는 Firebase 설정 파일 주입을 요구한다. 이 파일의 관심사가 아니라 운영 fixture를 준다.
const PROD_FIREBASE_ENV = {
  GOOGLE_SERVICES_JSON: "./lib/__tests__/fixtures/firebase/prod/google-services.json",
  GOOGLE_SERVICES_PLIST: "./lib/__tests__/fixtures/firebase/prod/GoogleService-Info.plist",
};

describe("딥링크 선언은 APP_VARIANT에서 파생된다", () => {
  // JSON import는 문자열이 전부 string으로 넓혀져 ExpoConfig의 유니언 타입과 안 맞는다.
  // 실데이터 검증이 목적이므로 캐스트한다.
  const baseConfig = appJson.expo as unknown as ExpoConfig;
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function build(variant: string | undefined, extraEnv: Record<string, string> = {}) {
    if (variant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = variant;
    delete process.env.API_BASE_URL;
    delete process.env.WEB_BASE_URL;
    delete process.env.GOOGLE_SERVICES_JSON;
    delete process.env.GOOGLE_SERVICES_PLIST;
    Object.assign(process.env, extraEnv);
    return buildConfig({ config: baseConfig } as ConfigContext);
  }

  it("app.json에는 정적 딥링크 선언이 없다", () => {
    expect(appJson.expo).not.toHaveProperty("scheme");
    expect(appJson.expo.ios).not.toHaveProperty("associatedDomains");
    expect(appJson.expo.android).not.toHaveProperty("intentFilters");
  });

  it("production은 대표·레거시 스킴과 운영·레거시 호스트를 선언한다", () => {
    const cfg = build("production", PROD_FIREBASE_ENV);
    expect(cfg.scheme).toEqual(["focusmakers", "focuson"]);
    const webHost = new URL(cfg.extra?.webBaseUrl as string).hostname;
    expect(cfg.ios?.associatedDomains).toEqual([
      `applinks:${webHost}`,
      "applinks:web.sunqstudio.kr",
    ]);
    expect(cfg.android?.intentFilters).toEqual([
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: webHost, pathPrefix: "/social/join" },
          { scheme: "https", host: "web.sunqstudio.kr", pathPrefix: "/social/join" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ]);
    expect(cfg.extra?.appSchemes).toEqual(["focusmakers", "focuson"]);
    expect(cfg.extra?.deepLinkHosts).toEqual([webHost, "web.sunqstudio.kr"]);
  });

  it("staging은 전용 스킴과 web-dev 호스트만 선언한다", () => {
    const cfg = build("staging");
    expect(cfg.scheme).toEqual(["focusmakers-staging"]);
    const webHost = new URL(cfg.extra?.webBaseUrl as string).hostname;
    expect(cfg.ios?.associatedDomains).toEqual([`applinks:${webHost}`]);
    expect(cfg.android?.intentFilters?.[0]?.data).toEqual([
      { scheme: "https", host: webHost, pathPrefix: "/social/join" },
    ]);
    expect(cfg.extra?.deepLinkHosts).toEqual([webHost]);
  });

  it("development는 스킴만 두고 App Link를 선언하지 않는다", () => {
    const cfg = build(undefined);
    expect(cfg.scheme).toEqual(["focusmakers-dev"]);
    expect(cfg.ios).not.toHaveProperty("associatedDomains");
    expect(cfg.android).not.toHaveProperty("intentFilters");
    expect(cfg.extra?.appSchemes).toEqual(["focusmakers-dev"]);
    expect(cfg.extra?.deepLinkHosts).toEqual([]);
  });
});
