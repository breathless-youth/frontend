import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Pretendard 자체 호스팅 — `index.css`가 실제로 `@font-face`를 선언하고
 * `--font-sans`가 Pretendard를 우선하되 시스템 폴백 체인을 유지하는지 고정한다.
 * 폰트 로드 실패(오프라인 등) 시에도 시스템 폰트로 무너지는 게 핵심 불변식이다.
 *
 * `new URL("../index.css", import.meta.url)` 형태는 쓰지 않는다 — Vite가 이 리터럴
 * 패턴을 정적으로 인식해 에셋 URL(`http://localhost:3000/...`)로 바꿔치기해서 실제
 * 파일 경로를 잃는다(Vite의 "new URL(url, import.meta.url)" 에셋 처리 규칙). 대신
 * `import.meta.url`을 먼저 경로로 변환한 뒤 `path.resolve`로 상대 경로를 푼다.
 */
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.resolve(currentDir, "../index.css");
const css = readFileSync(cssPath, "utf-8");

describe("index.css font stack", () => {
  it("declares an @font-face for Pretendard served from /fonts/PretendardVariable.woff2", () => {
    const fontFaceMatch = css.match(/@font-face\s*{[^}]*}/);
    expect(fontFaceMatch).not.toBeNull();

    const fontFaceBlock = fontFaceMatch?.[0] ?? "";
    expect(fontFaceBlock).toMatch(/font-family:\s*["']Pretendard["']/);
    expect(fontFaceBlock).toMatch(/\/fonts\/PretendardVariable\.woff2/);
  });

  it("defines --font-sans with Pretendard first, then the system fallback chain", () => {
    const fontSansMatch = css.match(/--font-sans:\s*([^;]+);/);
    expect(fontSansMatch).not.toBeNull();

    const value = fontSansMatch?.[1] ?? "";
    const families = value.split(",").map((family) => family.trim());

    expect(families).toEqual([
      '"Pretendard"',
      "system-ui",
      "-apple-system",
      '"Segoe UI"',
      "Roboto",
      "sans-serif",
    ]);
  });
});
