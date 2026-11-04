const { withAppDelegate } = require("expo/config-plugins");

const IMPORT_LINE = "import GoogleSignIn";
const HANDLE_CALL = "GIDSignIn.sharedInstance.handle(url)";
const OPEN_URL_FUNCTION =
  /func application\(\s*_ \w+: UIApplication,\s*open url: URL,\s*options: \[UIApplication\.OpenURLOptionsKey: Any\] = \[:\]\s*\) -> Bool \{\n/;

/**
 * 구글 로그인 복귀 URL 처리
 *
 * 씬 생명주기를 쓰는 앱은 구글 로그인 SDK가 복귀 URL을 받도록 `GIDSignIn.sharedInstance.handle(url)`을 직접 불러야 한다.
 * Expo의 SceneDelegate는 실행 중 복귀와 앱을 새로 띄운 복귀 모두 AppDelegate의 `application(_:open:options:)`으로 넘기므로 그 함수 맨 앞에 넣는다.
 * 템플릿이 바뀌어 넣을 자리를 못 찾으면 로그인 복귀가 빠진 바이너리가 나가지 않도록 빌드를 멈춘다.
 */
module.exports = function withGoogleSignInOpenUrl(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error("withGoogleSignInOpenUrl: Swift AppDelegate만 고칠 수 있습니다.");
    }
    let contents = cfg.modResults.contents;
    if (contents.includes(HANDLE_CALL)) {
      return cfg;
    }
    const match = OPEN_URL_FUNCTION.exec(contents);
    if (match === null) {
      throw new Error(
        "withGoogleSignInOpenUrl: AppDelegate에서 application(_:open:options:)를 찾지 못했습니다.",
      );
    }
    const insertAt = match.index + match[0].length;
    contents = `${contents.slice(0, insertAt)}    if ${HANDLE_CALL} {\n      return true\n    }\n${contents.slice(insertAt)}`;
    cfg.modResults.contents = `${IMPORT_LINE}\n${contents}`;
    return cfg;
  });
};
