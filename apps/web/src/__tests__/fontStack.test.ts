import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 웹 폰트는 pretendard 패키지의 가변 다이나믹 서브셋을 엔트리에서 불러온다. 화면에 쓰인 글자
 * 구간의 조각만 받고, Vite가 조각 파일명에 해시를 붙여 긴 캐시를 걸 수 있다. index.css가
 * 자체 @font-face를 다시 들이면 해시 없는 경로로 되돌아가 매 실행 재확인이 생긴다.
 * 폰트를 못 받아도(오프라인 등) 시스템 폰트로 무너지는 폴백 체인도 함께 고정한다.
 *
 * new URL("../index.css", import.meta.url) 형태는 쓰지 않는다. Vite가 이 리터럴 패턴을
 * 에셋 URL로 바꿔치기해 실제 파일 경로를 잃는다. import.meta.url을 먼저 경로로 바꾼 뒤
 * path.resolve로 상대 경로를 푼다.
 */
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(currentDir, "../index.css"), "utf-8");
const main = readFileSync(path.resolve(currentDir, "../main.tsx"), "utf-8");

describe("폰트 스택", () => {
  it("엔트리가 Pretendard 가변 다이나믹 서브셋 CSS를 불러온다", () => {
    expect(main).toContain(
      'import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";',
    );
  });

  it("index.css는 자체 @font-face와 나눔스퀘어라운드 참조를 두지 않는다", () => {
    expect(css).not.toMatch(/@font-face/);
    expect(css).not.toMatch(/NanumSquareRound/i);
  });

  it("--font-sans는 Pretendard를 앞에 두고 시스템 폴백을 유지한다", () => {
    const families = (css.match(/--font-sans:\s*([^;]+);/)?.[1] ?? "")
      .split(",")
      .map((family) => family.trim());

    expect(families).toEqual([
      '"Pretendard Variable"',
      '"Pretendard"',
      "system-ui",
      "-apple-system",
      '"Segoe UI"',
      "Roboto",
      "sans-serif",
    ]);
  });
});
