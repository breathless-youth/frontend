import type { ExpoConfig } from "expo/config";

type AppDelegateMod = (config: unknown) => Promise<{ modResults: { contents: string } }>;
type PluginResult = ExpoConfig & { mods: { ios: { appDelegate: AppDelegateMod } } };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withGoogleSignInOpenUrl = require("../../plugins/withGoogleSignInOpenUrl") as (
  config: ExpoConfig,
) => PluginResult;

const baseConfig = { name: "FocusMakers", slug: "focusmakers" } as ExpoConfig;

/** Expo SDK 57 템플릿의 AppDelegate.swift 중 이 plugin이 고치는 부분 */
const TEMPLATE_APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }
}
`;

async function runAppDelegateMod(contents: string, language = "swift"): Promise<string> {
  const withPlugin = withGoogleSignInOpenUrl(baseConfig);
  const result = await withPlugin.mods.ios.appDelegate({
    ...withPlugin,
    modResults: { path: "AppDelegate.swift", contents, language },
    modRequest: { platform: "ios", modName: "appDelegate", projectRoot: "/", introspect: true },
  });
  return result.modResults.contents;
}

describe("구글 로그인 복귀 URL config plugin", () => {
  it("AppDelegate의 URL 열기 함수 맨 앞에서 구글 로그인 복귀 URL을 먼저 처리한다", async () => {
    const contents = await runAppDelegateMod(TEMPLATE_APP_DELEGATE);

    expect(contents).toContain("import GoogleSignIn\n");
    expect(contents).toMatch(
      /options: \[UIApplication\.OpenURLOptionsKey: Any\] = \[:\]\n {2}\) -> Bool \{\n {4}if GIDSignIn\.sharedInstance\.handle\(url\) \{\n {6}return true\n {4}\}\n {4}return super\.application/,
    );
  });

  it("두 번 돌려도 한 번만 넣는다", async () => {
    const once = await runAppDelegateMod(TEMPLATE_APP_DELEGATE);
    const twice = await runAppDelegateMod(once);

    expect(twice).toBe(once);
  });

  it("URL 열기 함수가 없는 AppDelegate면 빌드를 멈춘다", async () => {
    await expect(
      runAppDelegateMod("internal import Expo\nclass AppDelegate: ExpoAppDelegate {}\n"),
    ).rejects.toThrow(/application\(_:open:options:\)/);
  });

  it("Swift가 아닌 AppDelegate면 빌드를 멈춘다", async () => {
    await expect(runAppDelegateMod("@implementation AppDelegate\n@end\n", "objc")).rejects.toThrow(
      /Swift/,
    );
  });
});
