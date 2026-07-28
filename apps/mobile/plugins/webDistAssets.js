const fs = require("node:fs");
const path = require("node:path");

const { syncWebDist } = require("../scripts/syncWebDist");

/**
 * `apps/web` 빌드 산출물을 **설치된 앱 바이너리 안**으로 넣는 순수 로직.
 *
 * `scripts/syncWebDist.js`가 `apps/web/dist` → `apps/mobile/assets/web-dist`까지 옮기지만,
 * 그 디렉터리는 아무도 `require()`하지 않으므로 Metro가 번들에 넣어주지 않는다. 즉 여기까지만
 * 하면 설치된 앱 안에는 그 파일들이 존재하지 않는다 — 서버는 뜨는데 전부 404가 되는,
 * 원인과 증상이 어긋나는 실패다. 이 모듈이 그 마지막 한 칸을 채운다.
 *
 * 도착지는 `@dr.pogodin/react-native-static-server`의 `resolveAssetsPath('web-dist')`가
 * 보는 자리로 못박혀 있다(라이브러리 `utils.js`):
 *
 * - iOS: `MainBundlePath/web-dist` → 앱 번들 리소스 루트. 빌드 시 복사하면 끝이다.
 * - Android: `DocumentDirectoryPath/web-dist` → **번들 asset이 아니다.** 안드로이드는 번들
 *   asset을 일반 파일로 열 수 없어서, 빌드 때 `assets/web-dist`로 넣어두고 앱이 첫 실행에
 *   문서 디렉터리로 풀어내야 한다(추출은 런타임 쪽 책임이며 여기서는 넣기까지만 한다).
 *
 * Expo CNG라 `ios/`·`android/`는 매 prebuild마다 다시 만들어지는 생성물이다. 그래서
 * 라이브러리 README가 안내하는 "Xcode에서 폴더 참조를 추가한다"·"build.gradle을 고친다"는
 * 수동 절차는 다음 prebuild에서 사라진다 — config plugin으로 매번 다시 넣는 이유다.
 */

/** 서빙 루트의 이름. `staticWebAssetServer.ts`의 `WEB_ASSET_DIR`과 같은 값이어야 한다. */
const WEB_DIST_DIR_NAME = "web-dist";

/** Xcode 빌드 단계 이름. 중복 등록 검사의 열쇠이므로 바꾸면 기존 프로젝트에 하나 더 생긴다. */
const IOS_BUILD_PHASE_NAME = "Bundle web-dist assets";

/**
 * iOS 번들에 web-dist를 넣는 셸 스크립트 빌드 단계의 본문.
 *
 * Xcode 프로젝트에 **폴더 참조(folder reference)를 등록하는 대신** 스크립트로 복사한다.
 * 폴더 참조는 파일 참조 하나하나를 pbxproj에 기록하는 방식이라 prebuild가 프로젝트를
 * 다시 만들 때마다 정합성을 맞춰야 하고, 중복 등록·유령 참조 같은 조용한 고장이 붙는다.
 * 스크립트 단계는 매 빌드에 실제 디렉터리를 그대로 밀어 넣으므로 그런 상태가 없다 —
 * 그리고 **소스가 없으면 빌드가 그 자리에서 실패한다.**
 *
 * `$PROJECT_DIR`은 `apps/mobile/ios`이므로 `../assets/web-dist`가 동기화 대상 디렉터리다.
 * `$BUILT_PRODUCTS_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH`는 만들어지는 `.app` 번들의
 * 리소스 루트이고, 그 아래 `web-dist`가 곧 런타임의 `MainBundlePath/web-dist`다.
 */
function buildIosShellScript() {
  return [
    "set -e",
    'SRC="$PROJECT_DIR/../assets/web-dist"',
    'DEST="$BUILT_PRODUCTS_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/web-dist"',
    'if [ ! -d "$SRC" ]; then',
    // Xcode는 "error:"로 시작하는 줄을 빌드 오류로 표시한다 — 로그에 묻히지 않게 한다.
    '  echo "error: apps/web 빌드 산출물이 없습니다: $SRC" >&2',
    '  echo "error: pnpm --filter web build && pnpm --filter mobile sync-web 를 먼저 실행하세요." >&2',
    "  exit 1",
    "fi",
    // 소스에서 사라진 옛 청크가 번들에 남으면 앱이 계속 불어나고, 더 나쁘게는 옛 파일이
    // 여전히 서빙된다. 통째로 지우고 다시 넣는다.
    'rm -rf "$DEST"',
    'mkdir -p "$DEST"',
    'cp -R "$SRC/" "$DEST/"',
  ].join("\n");
}

/** 이미 우리 빌드 단계가 등록돼 있는지 본다. 라이브러리가 이름을 따옴표째 저장한다. */
function hasWebDistBuildPhase(project) {
  const section = project.hash?.project?.objects?.PBXShellScriptBuildPhase ?? {};
  return Object.values(section).some(
    (phase) =>
      typeof phase === "object" &&
      phase !== null &&
      String(phase.name ?? "").replace(/"/g, "") === IOS_BUILD_PHASE_NAME,
  );
}

/**
 * Xcode 프로젝트에 web-dist 복사 단계를 붙인다.
 *
 * **두 번 붙이지 않는다.** `expo prebuild`를 `--clean` 없이 돌리면 기존 `ios/`를 재사용하면서
 * plugin을 다시 태우므로, 검사 없이는 빌드할 때마다 같은 단계가 하나씩 늘어난다.
 */
function addWebDistBuildPhase(project) {
  if (hasWebDistBuildPhase(project)) {
    return project;
  }

  // 마지막에 붙는다 — "Copy Bundle Resources"가 끝난 뒤 리소스 루트에 얹어야 한다.
  project.addBuildPhase([], "PBXShellScriptBuildPhase", IOS_BUILD_PHASE_NAME, null, {
    shellPath: "/bin/sh",
    shellScript: buildIosShellScript(),
  });

  return project;
}

/**
 * Android 프로젝트의 번들 asset 자리로 web-dist를 복사한다.
 *
 * iOS와 달리 여기서 끝이 아니다 — 안드로이드의 번들 asset은 파일시스템 경로가 없어서
 * 서버가 직접 열 수 없고, 앱이 첫 실행에 `copyFileAssets`로 문서 디렉터리에 풀어야 한다.
 * 이 함수는 "풀 수 있는 자리에 넣는" 데까지만 책임진다.
 *
 * @returns 복사한 대상 디렉터리의 절대 경로.
 */
function copyWebDistToAndroidAssets({ webDistDir, androidMainDir }) {
  if (!fs.existsSync(webDistDir)) {
    throw new Error(
      `apps/web 빌드 산출물이 없습니다: ${webDistDir}\n` +
        "'pnpm --filter web build && pnpm --filter mobile sync-web'를 먼저 실행하세요.",
    );
  }

  const destDir = path.join(androidMainDir, "assets", WEB_DIST_DIR_NAME);
  fs.mkdirSync(destDir, { recursive: true });
  // 복사·정리 규칙은 scripts/syncWebDist.js 하나만 쓴다 — 두 벌로 갈리면 한쪽만 고쳐진다.
  syncWebDist({ srcDir: webDistDir, destDir, mode: "copy" });

  return destDir;
}

module.exports = {
  IOS_BUILD_PHASE_NAME,
  WEB_DIST_DIR_NAME,
  addWebDistBuildPhase,
  buildIosShellScript,
  copyWebDistToAndroidAssets,
  hasWebDistBuildPhase,
};
