/** @jest-environment node */
/* global describe, beforeEach, afterEach, it, expect */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  IOS_BUILD_PHASE_NAME,
  WEB_DIST_DIR_NAME,
  addWebDistBuildPhase,
  buildIosShellScript,
  copyWebDistToAndroidAssets,
} = require("../webDistAssets");

/**
 * `xcode` 패키지의 프로젝트 객체 중 이 모듈이 실제로 만지는 부분만 흉내 낸다.
 * 진짜 pbxproj를 파싱하려면 픽스처가 필요한데, 여기서 검증할 것은 "무엇을 어디에
 * 등록하는가"와 "두 번 등록하지 않는가" 둘뿐이라 그 비용을 치를 이유가 없다.
 */
function createFakeXcodeProject() {
  const objects = {};
  return {
    hash: { project: { objects } },
    addBuildPhase(files, type, comment, target, options) {
      objects[type] = objects[type] ?? {};
      const uuid = `UUID${Object.keys(objects[type]).length}`;
      objects[type][uuid] = {
        isa: type,
        // 실제 라이브러리가 이름을 따옴표째 저장한다 — 그 형태를 그대로 재현해야
        // 중복 검사가 진짜 프로젝트에서도 동작한다.
        name: `"${comment}"`,
        shellPath: options.shellPath,
        shellScript: options.shellScript,
      };
      objects[type][`${uuid}_comment`] = comment;
      // 실제 라이브러리의 반환 모양({ uuid, buildPhase })을 그대로 흉내 낸다 —
      // 호출부가 반환값을 분해해 플래그를 세우므로 모양이 다르면 테스트가 거짓 통과한다.
      return { uuid, buildPhase: objects[type][uuid] };
    },
  };
}

describe("buildIosShellScript", () => {
  it("번들 리소스 경로로 복사한다 — resolveAssetsPath('web-dist')가 찾는 자리다", () => {
    const script = buildIosShellScript();

    expect(script).toContain('"$BUILT_PRODUCTS_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/web-dist"');
    expect(script).toContain('"$PROJECT_DIR/../assets/web-dist"');
  });

  it("소스가 없으면 빌드를 실패시킨다 — 옛 화면이 담긴 앱이 조용히 나오지 않게", () => {
    const script = buildIosShellScript();

    expect(script).toContain("exit 1");
    expect(script).toContain("sync-web");
  });

  it("복사 전에 대상을 지운다 — 소스에서 사라진 옛 청크가 번들에 남지 않게", () => {
    expect(buildIosShellScript()).toContain("rm -rf");
  });
});

describe("addWebDistBuildPhase", () => {
  it("셸 스크립트 빌드 단계를 등록한다", () => {
    const project = createFakeXcodeProject();

    addWebDistBuildPhase(project);

    const phases = project.hash.project.objects.PBXShellScriptBuildPhase;
    const entries = Object.values(phases).filter((value) => typeof value === "object");
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe(`"${IOS_BUILD_PHASE_NAME}"`);
    expect(entries[0].shellScript).toBe(buildIosShellScript());
  });

  it("의존성 분석을 끈다 — 매 빌드 돌아야 하고, 경고가 로그를 덮으면 안 된다", () => {
    const project = createFakeXcodeProject();

    addWebDistBuildPhase(project);

    const [phase] = Object.values(project.hash.project.objects.PBXShellScriptBuildPhase).filter(
      (value) => typeof value === "object",
    );
    expect(phase.alwaysOutOfDate).toBe(1);
  });

  it("이미 있으면 다시 등록하지 않는다 — prebuild를 --clean 없이 두 번 돌려도 안전해야 한다", () => {
    const project = createFakeXcodeProject();

    addWebDistBuildPhase(project);
    addWebDistBuildPhase(project);

    const entries = Object.values(project.hash.project.objects.PBXShellScriptBuildPhase).filter(
      (value) => typeof value === "object",
    );
    expect(entries).toHaveLength(1);
  });

  it("다른 이름의 단계가 이미 있어도 우리 것을 등록한다", () => {
    const project = createFakeXcodeProject();
    project.addBuildPhase(
      [],
      "PBXShellScriptBuildPhase",
      "Bundle React Native code and images",
      null,
      {
        shellPath: "/bin/sh",
        shellScript: "echo hi",
      },
    );

    addWebDistBuildPhase(project);

    const entries = Object.values(project.hash.project.objects.PBXShellScriptBuildPhase).filter(
      (value) => typeof value === "object",
    );
    expect(entries).toHaveLength(2);
  });
});

describe("copyWebDistToAndroidAssets", () => {
  let webDistDir;
  let androidMainDir;

  beforeEach(() => {
    webDistDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-dist-"));
    androidMainDir = fs.mkdtempSync(path.join(os.tmpdir(), "android-main-"));
  });

  afterEach(() => {
    fs.rmSync(webDistDir, { recursive: true, force: true });
    fs.rmSync(androidMainDir, { recursive: true, force: true });
  });

  it("android 번들 asset 경로로 중첩 디렉터리까지 복사한다", () => {
    fs.mkdirSync(path.join(webDistDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(webDistDir, "index.html"), "<html></html>");
    fs.writeFileSync(path.join(webDistDir, "assets", "app.js"), "console.log(1);");

    const destDir = copyWebDistToAndroidAssets({ webDistDir, androidMainDir });

    expect(destDir).toBe(path.join(androidMainDir, "assets", WEB_DIST_DIR_NAME));
    expect(fs.readFileSync(path.join(destDir, "index.html"), "utf8")).toBe("<html></html>");
    expect(fs.readFileSync(path.join(destDir, "assets", "app.js"), "utf8")).toBe("console.log(1);");
  });

  it("소스에서 사라진 옛 파일을 대상에서 지운다", () => {
    fs.writeFileSync(path.join(webDistDir, "index.html"), "new");
    const destDir = path.join(androidMainDir, "assets", WEB_DIST_DIR_NAME);
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, "old-chunk.js"), "stale");

    copyWebDistToAndroidAssets({ webDistDir, androidMainDir });

    expect(fs.existsSync(path.join(destDir, "old-chunk.js"))).toBe(false);
  });

  it("소스가 없으면 던진다 — prebuild가 조용히 빈 앱을 만들지 않게", () => {
    fs.rmSync(webDistDir, { recursive: true, force: true });

    expect(() => copyWebDistToAndroidAssets({ webDistDir, androidMainDir })).toThrow(/sync-web/);
  });
});
