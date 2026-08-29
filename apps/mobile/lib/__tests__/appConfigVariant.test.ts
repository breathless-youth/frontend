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
    const extra = resolveExtra({ APP_VARIANT: "production" });
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

  it("eas.json의 production과 preview 프로필이 APP_VARIANT=production을 선언한다", () => {
    // 이 선언이 빠지면 스토어 빌드가 빈 주소로 나가 웹뷰 폴백만 뜬다 — 조용한 회귀 방지 핀.
    const easJson = require("../../eas.json") as {
      build: Record<string, { env?: Record<string, string> }>;
    };
    expect(easJson.build.production.env?.APP_VARIANT).toBe("production");
    expect(easJson.build.preview.env?.APP_VARIANT).toBe("production");
    // 반대 방향 가드 — 개발 프로필에 production이 들어가면 개발 빌드가 운영을 바라보는
    // 사고(이 티켓이 막은 것)가 부활한다.
    expect(easJson.build.development.env?.APP_VARIANT).not.toBe("production");
    expect(easJson.build["development-simulator"].env?.APP_VARIANT).not.toBe("production");
  });
});
