import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * pnpm 10은 package.json의 pnpm 필드를 읽지 않는다. 패치 목록이 pnpm-workspace.yaml에 없으면
 * lockfile을 다시 만드는 설치에서 목록이 빠지고 패치가 오류 없이 사라진다. 그러면 iOS 탭 바 위
 * 흰 줄과 FCM 토큰 실패가 되돌아온다. 이 테스트는 선언 위치와 세 패치의 존재를 고정한다.
 *
 * 라이브러리 버전을 올릴 때 여기가 실패하면, 업스트림이 해당 수정을 포함했는지 먼저 확인하고
 * 그렇다면 패치와 이 단언을 함께 지운다.
 */
const repoRoot = path.resolve(__dirname, "../../../..");

const PATCHES: Record<string, string> = {
  "expo-constants@18.0.13": "patches/expo-constants@18.0.13.patch",
  "@react-native-firebase/messaging@26.3.3":
    "patches/@react-native-firebase__messaging@26.3.3.patch",
  "react-native-webview@13.15.0": "patches/react-native-webview@13.15.0.patch",
};

const ONLY_BUILT = ["@sentry/cli", "esbuild", "unrs-resolver"];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * YAML 파서 없이 최상위 키 아래 블록만 잘라낸다. 들여쓴 줄이 이어지는 동안이 그 키의 값이고,
 * 다음 최상위 키에서 끝난다. 키가 없으면 빈 문자열이라 어떤 항목도 그 안에서 못 찾는다.
 * 파일 전체에서 줄만 찾으면 키가 지워지거나 이름이 바뀌어 pnpm이 못 읽게 돼도 통과해 버린다.
 */
function yamlSection(yaml: string, topLevelKey: string): string {
  const match = new RegExp(
    `^${escapeRegExp(topLevelKey)}:[^\\n]*\\n((?:[ \\t]+[^\\n]*\\n?)*)`,
    "m",
  ).exec(yaml);
  return match?.[1] ?? "";
}

/** 블록 안의 "키: 값" 한 줄. 키나 값에 따옴표가 있어도 없어도 맞는다. */
function yamlEntry(key: string, value: string): RegExp {
  return new RegExp(
    `^\\s+["']?${escapeRegExp(key)}["']?:\\s*["']?${escapeRegExp(value)}["']?\\s*$`,
    "m",
  );
}

function yamlListItem(value: string): RegExp {
  return new RegExp(`^\\s+-\\s*["']?${escapeRegExp(value)}["']?\\s*$`, "m");
}

describe("pnpm 패치 선언", () => {
  const workspaceYaml = readFileSync(path.join(repoRoot, "pnpm-workspace.yaml"), "utf-8");
  const patchedSection = yamlSection(workspaceYaml, "patchedDependencies");
  const onlyBuiltSection = yamlSection(workspaceYaml, "onlyBuiltDependencies");

  it.each(Object.entries(PATCHES))(
    "pnpm-workspace.yaml의 patchedDependencies가 %s 패치를 선언하고 패치 파일이 있다",
    (key, patchPath) => {
      expect(patchedSection).toMatch(yamlEntry(key, patchPath));
      expect(existsSync(path.join(repoRoot, patchPath))).toBe(true);
    },
  );

  it.each(ONLY_BUILT)(
    "pnpm-workspace.yaml의 onlyBuiltDependencies가 %s 빌드 스크립트를 허용한다",
    (name) => {
      expect(onlyBuiltSection).toMatch(yamlListItem(name));
    },
  );

  it("루트 package.json에 pnpm 필드가 없다", () => {
    const rootPackageJson = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf-8"),
    ) as { pnpm?: unknown };
    expect(rootPackageJson.pnpm).toBeUndefined();
  });

  it("웹뷰 패치가 배경색을 안쪽 뷰로 전달하는 변경을 담는다", () => {
    const patch = readFileSync(
      path.join(repoRoot, PATCHES["react-native-webview@13.15.0"]),
      "utf-8",
    );
    expect(patch).toContain("setBackgroundColor");
    expect(patch).toContain("RCTUIColorFromSharedColor");
  });
});
