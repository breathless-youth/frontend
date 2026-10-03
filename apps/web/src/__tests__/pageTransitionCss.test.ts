import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 페이지 슬라이드 정책을 index.css에서 고정한다. 전환 규칙이 모션 축소 가드 밖으로 새면
 * 동작 줄이기를 켠 사용자에게도 화면이 밀려 다닌다.
 * new URL(..., import.meta.url)은 Vite가 에셋 URL로 바꿔 쓰지 않는다(reducedMotion.test.ts 참고).
 */
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(currentDir, "../index.css"), "utf-8");

const transitionBlock =
  css.match(
    /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?view-transition[\s\S]*?\n\}/,
  )?.[0] ?? "";

describe("페이지 슬라이드 CSS", () => {
  it("iOS형 곡선 토큰을 정의한다", () => {
    expect(css).toContain("--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)");
  });

  it("전환 규칙은 모션 축소 가드 안에만 있다", () => {
    expect(transitionBlock).not.toBe("");
    const outside = css.replace(transitionBlock, "");
    expect(outside).not.toMatch(/::view-transition-(old|new)/);
  });

  it("300ms와 드로어 곡선을 쓰고 기본 블렌드를 끈다", () => {
    expect(transitionBlock).toContain("animation-duration: 300ms");
    expect(transitionBlock).toContain("var(--ease-drawer)");
    expect(transitionBlock).toContain("mix-blend-mode: normal");
  });

  it("방향마다 들어오는 화면과 나가는 화면에 키프레임을 건다", () => {
    for (const rule of [
      /\[data-page-transition="forward"\]::view-transition-new\(root\)[^}]*page-enter-from-right/,
      /\[data-page-transition="forward"\]::view-transition-old\(root\)[^}]*page-exit-to-left/,
      /\[data-page-transition="back"\]::view-transition-new\(root\)[^}]*page-enter-from-left/,
      /\[data-page-transition="back"\]::view-transition-old\(root\)[^}]*page-exit-to-right/,
    ]) {
      expect(transitionBlock).toMatch(rule);
    }
  });
});
