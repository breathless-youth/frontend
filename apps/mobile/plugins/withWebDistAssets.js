const path = require("node:path");

const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const { addWebDistBuildPhase, copyWebDistToAndroidAssets } = require("./webDistAssets");

/**
 * `apps/mobile/assets/web-dist`를 설치된 앱 바이너리 안으로 넣는 config plugin.
 *
 * 무엇을 왜 이렇게 하는지는 `./webDistAssets.js` 상단 주석에 있다. 이 파일은 그 로직을
 * Expo prebuild 흐름에 붙이기만 한다 — 로직을 여기 두지 않는 이유는 Expo 모듈을 불러오지
 * 않고 단위 테스트할 수 있게 하기 위해서다.
 */
const withWebDistAssets = (config) => {
  const withIos = withXcodeProject(config, (iosConfig) => {
    iosConfig.modResults = addWebDistBuildPhase(iosConfig.modResults);
    return iosConfig;
  });

  return withDangerousMod(withIos, [
    "android",
    (androidConfig) => {
      // iOS는 빌드 시점에 복사하지만(스크립트 단계), 안드로이드는 그런 자리가 없어
      // prebuild 시점에 소스 트리로 넣어둔다. 여기서 던지면 prebuild가 멈춘다 — 의도한
      // 동작이다. web-dist 없이 만들어진 앱은 실행해봐야 전부 404다.
      copyWebDistToAndroidAssets({
        webDistDir: path.join(androidConfig.modRequest.projectRoot, "assets", "web-dist"),
        androidMainDir: path.join(
          androidConfig.modRequest.platformProjectRoot,
          "app",
          "src",
          "main",
        ),
      });
      return androidConfig;
    },
  ]);
};

module.exports = withWebDistAssets;
