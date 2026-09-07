import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * New Architecture에서 react-native-webview의 Fabric 래퍼는 backgroundColor를 안쪽
 * RNCWebViewImpl에 전달하지 않는다. 그러면 WKWebView가 기본 흰 바탕으로 만들어져 문서가
 * 채우지 못한 여백이 흰색으로 드러난다. 패치가 그 전달을 더한다.
 *
 * 이 테스트는 패치 선언이 사라지는 것을 막는다. 라이브러리 버전을 올릴 때 여기가 실패하면,
 * 업스트림이 배경색을 전달하게 됐는지 먼저 확인하고 그렇다면 패치와 이 테스트를 함께 지운다.
 */
const repoRoot = path.resolve(__dirname, "../../../..");
const PATCH_KEY = "react-native-webview@13.15.0";
const PATCH_PATH = "patches/react-native-webview@13.15.0.patch";

describe("react-native-webview 배경색 전달 패치", () => {
  const rootPackageJson = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf-8"),
  ) as { pnpm?: { patchedDependencies?: Record<string, string> } };

  it("루트 package.json이 패치를 선언한다", () => {
    expect(rootPackageJson.pnpm?.patchedDependencies?.[PATCH_KEY]).toBe(PATCH_PATH);
  });

  it("패치가 배경색을 안쪽 뷰로 전달하는 변경을 담는다", () => {
    const patchFile = path.join(repoRoot, PATCH_PATH);
    expect(existsSync(patchFile)).toBe(true);

    const patch = readFileSync(patchFile, "utf-8");
    expect(patch).toContain("setBackgroundColor");
    expect(patch).toContain("RCTUIColorFromSharedColor");
  });
});
