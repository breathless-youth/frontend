import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";

/**
 * 운영 웹 호스트와 딥링크 등록 도메인이 함께 움직이는지 고정한다.
 *
 * BY-450이 apex(`focusmakers.app`)를 선등록했는데 BY-464가 확정한 실제 웹 호스트는
 * `web.focusmakers.app`이어서, 신 도메인 유니버설 링크가 조용히 죽는 어긋남이 실제로
 * 있었다(BY-451에서 발견). 운영 웹 주소가 바뀌면 이 테스트가 등록 누락을 잡는다.
 */
describe("딥링크 도메인 등록", () => {
  const baseConfig = appJson.expo as unknown as ExpoConfig;

  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function prodWebHost(): string {
    process.env.APP_VARIANT = "production";
    const extra = buildConfig({ config: baseConfig } as ConfigContext).extra;
    return new URL(extra?.webBaseUrl as string).hostname;
  }

  it("iOS associatedDomains에 운영 웹 호스트가 등록돼 있다", () => {
    expect(appJson.expo.ios.associatedDomains).toContain(`applinks:${prodWebHost()}`);
  });

  it("Android intentFilters에 운영 웹 호스트가 등록돼 있다", () => {
    const hosts = appJson.expo.android.intentFilters.flatMap((filter) =>
      filter.data.map((entry) => entry.host),
    );
    expect(hosts).toContain(prodWebHost());
  });

  it("구 도메인은 그대로 남아 있다 — 구 바이너리와 이미 공유된 링크가 계속 살아야 한다", () => {
    expect(appJson.expo.ios.associatedDomains).toContain("applinks:web.sunqstudio.kr");
    const hosts = appJson.expo.android.intentFilters.flatMap((filter) =>
      filter.data.map((entry) => entry.host),
    );
    expect(hosts).toContain("web.sunqstudio.kr");
  });
});
