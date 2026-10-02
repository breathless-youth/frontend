import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 오버레이 모션 축소 정책을 `index.css` 에서 직접 고정한다.
 *
 * 애니메이션을 통째로 끄는 쪽이 얼핏 자연스러워 보이지만 그러면 두 가지가 깨진다.
 * Radix 가 닫힘을 기다릴 animationend 가 오지 않고, 오버레이가 떴는지 걷혔는지 알
 * 단서까지 사라진다. 그래서 이동량과 배율만 중립값으로 덮고 페이드는 남긴다.
 * 이 의도는 주석으로만 지켜지고 있어 여기서 못 박는다.
 *
 * `new URL("../index.css", import.meta.url)` 형태는 쓰지 않는다. Vite 가 그 리터럴을
 * 에셋 URL 로 바꿔치기해 실제 파일 경로를 잃는다.
 */
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(currentDir, "../index.css"), "utf-8");

const overlayReducedMotionBlock =
  css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\*,[\s\S]*?\n\}/)?.[0] ?? "";

describe("오버레이 모션 축소 정책", () => {
  it("이동량과 배율 변수를 중립값으로 덮는다", () => {
    expect(overlayReducedMotionBlock).not.toBe("");

    for (const declaration of [
      "--tw-enter-translate-x: 0",
      "--tw-enter-translate-y: 0",
      "--tw-exit-translate-x: 0",
      "--tw-exit-translate-y: 0",
      "--tw-enter-scale: 1",
      "--tw-exit-scale: 1",
    ]) {
      expect(overlayReducedMotionBlock).toContain(declaration);
    }
  });

  it("애니메이션 자체를 끄지 않는다", () => {
    expect(overlayReducedMotionBlock).not.toMatch(/animation\s*:\s*none/);
  });

  it("페이드를 남긴다", () => {
    expect(overlayReducedMotionBlock).not.toMatch(/--tw-(enter|exit)-opacity/);
  });
});
