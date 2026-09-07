import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it } from "vitest";

/**
 * 초기 테마는 nativeTheme.ts가 아니라 index.html의 인라인 스크립트가 붙인다.
 * 모듈 번들이 평가되기 전, 즉 첫 페인트 전에 data-theme이 있어야 라이트 화면이
 * 한 프레임 보이는 번쩍임이 없다. 그 위치와 동작을 여기서 고정한다.
 *
 * new URL("../../index.html", import.meta.url) 형태는 쓰지 않는다. Vite가 이 리터럴을
 * 정적으로 인식해 에셋 URL로 바꿔치기해서 실제 파일 경로를 잃는다.
 */
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.resolve(currentDir, "../../index.html"), "utf-8");
const css = readFileSync(path.resolve(currentDir, "../index.css"), "utf-8");

/** <head> 안 첫 인라인 스크립트의 본문만 떼어낸다. src가 있는 태그는 건너뛴다. */
function headInlineScript(): string {
  const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";
  return /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/.exec(head)?.[1] ?? "";
}

function runInlineScript(search: string): void {
  window.history.replaceState(null, "", search);
  new Function(headInlineScript())();
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  window.history.replaceState(null, "", "/");
});

describe("index.html 테마 선반영", () => {
  it("문서 언어를 한국어로 선언한다", () => {
    expect(html).toContain('<html lang="ko">');
  });

  it("UA 기본 캔버스와 폼 컨트롤이 두 테마를 따르도록 color-scheme 메타를 둔다", () => {
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
  });

  it("인라인 스크립트가 charset 메타 뒤, 다른 어떤 head 요소보다 앞에 온다", () => {
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";
    const charsetAt = head.indexOf("<meta charset=");
    const scriptAt = head.indexOf("<script>");
    const firstOtherTagAt = head.search(/<(link|meta name|style)\b/);

    expect(charsetAt).toBeGreaterThanOrEqual(0);
    expect(scriptAt).toBeGreaterThan(charsetAt);
    expect(scriptAt).toBeLessThan(firstOtherTagAt);
  });

  it("theme=dark로 열면 첫 페인트 전에 data-theme을 붙인다", () => {
    runInlineScript("/?theme=dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("theme=light도 그대로 붙인다", () => {
    runInlineScript("/?theme=light");

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("theme 파라미터가 없으면 건드리지 않는다", () => {
    runInlineScript("/");

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("두 값 밖의 theme은 무시한다", () => {
    runInlineScript("/?theme=blue");

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe("index.css color-scheme", () => {
  it("라이트 기본값과 다크 두 블록 모두에 color-scheme을 선언한다", () => {
    const light = /:root\s*{[^}]*}/.exec(css)?.[0] ?? "";
    expect(light).toContain("color-scheme: light;");

    const media =
      /@media \(prefers-color-scheme: dark\)\s*{\s*:root:not\(\[data-theme="light"\]\)\s*{[^}]*}/.exec(
        css,
      )?.[0] ?? "";
    expect(media).toContain("color-scheme: dark;");

    const attribute = /:root\[data-theme="dark"\]\s*{[^}]*}/.exec(css)?.[0] ?? "";
    expect(attribute).toContain("color-scheme: dark;");
  });

  it("시스템이 다크여도 data-theme=light면 미디어쿼리 다크 블록이 적용되지 않는다", () => {
    const mediaBlock = /@media \(prefers-color-scheme: dark\)\s*{\s*([^{]+){/
      .exec(css)?.[1]
      ?.trim();

    expect(mediaBlock).toBe(':root:not([data-theme="light"])');
  });
});
