import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 세션 화면은 `.theme-dark`만 달고 있어 `.theme-soft-blue` 안의 과목 색이 닿지 않는다.
 * 그래서 `.theme-dark`에도 과목 색을 두는데, 다크 과목 색이 세 블록에 따로 적혀 있어
 * 하나만 고치면 세션의 과목 점만 다른 색이 된다. 세 블록의 값을 여기서 맞춰 본다.
 * new URL(..., import.meta.url)은 Vite가 에셋 URL로 바꿔 쓰지 않는다(reducedMotion.test.ts 참고).
 */
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(currentDir, "../index.css"), "utf-8");

/** 선택자로 시작하는 첫 블록에서 과목 색 20개를 읽는다. */
function subjectVars(selectorStart: string): string[] {
  const start = css.indexOf(selectorStart);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Array.from({ length: 20 }, (_, i) => {
    const match = new RegExp(`--subject-${i}:\\s*([^;]+);`).exec(body);
    return match?.[1]?.trim() ?? "";
  });
}

describe("세션 테마의 과목 색", () => {
  it("세션 테마의 과목 색은 다크 블록 값과 같다", () => {
    const session = subjectVars(".theme-dark,");
    expect(session.every((value) => value !== "")).toBe(true);
    expect(session).toEqual(subjectVars(".theme-dark .theme-soft-blue,"));
    expect(session).toEqual(subjectVars(':root:not([data-theme="light"]) .theme-soft-blue {'));
  });
});
