import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";

// App Group은 Apple Developer에 환경마다 따로 등록돼 있어 번들 id와 같은 접미사를 따라가야 서명된다.
describe("방해 앱 잠금 config plugin", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it.each([
    [undefined, "group.com.breathlessyouth.mobile.dev"],
    ["staging", "group.com.breathlessyouth.mobile.staging"],
    ["production", "group.com.breathlessyouth.mobile"],
  ])("APP_VARIANT=%s의 App Group은 %s다", (variant, appGroup) => {
    if (variant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = variant;
    const cfg = buildConfig({ config: appJson.expo as unknown as ExpoConfig } as ConfigContext);
    expect(cfg.plugins).toContainEqual([
      "react-native-device-activity",
      { appleTeamId: "9BCSD3ZRDQ", appGroup },
    ]);
  });
});
