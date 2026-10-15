import appJson from "../../app.json";

/**
 * iOS 씬 생명주기 설정 가드
 *
 * iOS 27 SDK(Xcode 27)로 빌드한 앱은 UIScene 생명주기를 쓰지 않으면 실행 직후 강제 종료된다.
 * Expo 57은 expo-build-properties의 `ios.enableSceneSupport`로 씬 매니페스트를 넣고 AppDelegate를 바꾼다.
 * 이 플래그가 빠지면 빌드는 정상으로 끝나고 iOS 27 기기에서 스플래시 직후 꺼진다.
 */
describe("app.json iOS 씬 생명주기", () => {
  const plugins = appJson.expo.plugins as unknown[];
  const buildProperties = plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === "expo-build-properties",
  ) as [string, { ios?: Record<string, unknown> }] | undefined;

  it("expo-build-properties의 ios.enableSceneSupport가 켜져 있다", () => {
    expect(buildProperties?.[1].ios?.enableSceneSupport).toBe(true);
  });
});
