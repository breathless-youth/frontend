import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";

/**
 * BY-622: App Store 제품 페이지의 언어(KO/EN)는 App Store Connect 설정이 아니라 **바이너리
 * Info.plist의 `CFBundleLocalizations`·`CFBundleDevelopmentRegion`**에서 정해진다. Expo 템플릿은
 * `developmentRegion = en` 하나만 선언하므로 키를 넣지 않으면 한국어 앱이 EN으로 표시된다
 * (1.0.1까지 실제로 그랬다). `ios.infoPlist`는 prebuild 때 템플릿 값을 덮어쓴다.
 *
 * `en`은 영어 문구를 실제로 넣기 전에는 추가하지 않는다 — 스토어에 지원 언어로 표시된다.
 */
describe("iOS 로컬라이제이션 선언 (BY-622)", () => {
  const baseConfig = appJson.expo as unknown as ExpoConfig;
  const EXPECTED = {
    CFBundleDevelopmentRegion: "ko",
    CFBundleLocalizations: ["ko"],
    CFBundleAllowMixedLocalizations: true,
  };

  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("app.json이 개발 지역과 지원 언어를 한국어로 선언한다", () => {
    expect(appJson.expo.ios.infoPlist).toMatchObject(EXPECTED);
  });

  it.each([
    ["production", "production"],
    ["staging", "staging"],
    ["development", undefined],
  ] as const)("%s 변형에서도 app.config.ts가 선언을 보존한다", (_label, variant) => {
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
    const out = buildConfig({ config: baseConfig } as ConfigContext);
    expect(out.ios?.infoPlist).toMatchObject(EXPECTED);
  });
});
