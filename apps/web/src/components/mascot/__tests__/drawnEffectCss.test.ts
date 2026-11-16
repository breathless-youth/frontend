import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 코드로 그리는 효과의 모션 축소와 작은 크기 규칙을 index.css에서 고정한다.
 * 움직이는 규칙을 더하고 모션 축소 블록에 넣지 않으면 동작 줄이기를 켠 사용자에게도 효과가 움직인다.
 */
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(currentDir, "../../../index.css"), "utf-8");

/** 여는 중괄호부터 짝이 맞는 닫는 중괄호까지의 블록 본문 */
function blockAt(source: string, head: string, contains: string): string {
  let from = 0;
  for (;;) {
    const start = source.indexOf(head, from);
    if (start < 0) return "";
    let depth = 0;
    for (let i = source.indexOf("{", start); i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      if (source[i] === "}") depth -= 1;
      if (depth === 0) {
        const body = source.slice(start, i + 1);
        if (body.includes(contains)) return body;
        from = i;
        break;
      }
    }
  }
}

const reduced = blockAt(css, "@media (prefers-reduced-motion: reduce)", ".mascot-fx-glow");
const compact = blockAt(css, "@container mascot-fx", "[data-fx-detail]");

/** 블록 밖에서 animation을 붙이는 .mascot-fx- 규칙의 클래스 이름 */
function animatedClasses(): string[] {
  const outside = css.replace(reduced, "").replace(compact, "");
  const names = new Set<string>();
  for (const match of outside.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = match;
    if (!/animation(-name)?\s*:/.test(body)) continue;
    for (const name of selector.matchAll(/\.(mascot-fx-[\w-]+)/g)) {
      names.add(name[1]);
    }
  }
  return [...names];
}

describe("코드로 그리는 효과 CSS", () => {
  it("움직이는 규칙은 모두 모션 축소에서 멈추거나 숨긴다", () => {
    const animated = animatedClasses();
    expect(reduced).not.toBe("");
    expect(animated.length).toBeGreaterThan(20);
    const missing = animated.filter((name) => !reduced.includes(`.${name}`));
    expect(missing).toEqual([]);
  });

  it("작은 크기에서는 덜어 낼 부분을 숨기고 밤하늘 원판을 돌리지 않는다", () => {
    expect(css).toMatch(/\.mascot-fx-board\s*\{[^}]*container:\s*mascot-fx\s*\/\s*inline-size/);
    expect(compact).toMatch(/@container mascot-fx \(max-width: \d+px\)/);
    expect(compact).toMatch(/\[data-fx-detail\][^{]*\{[^}]*display:\s*none/);
    expect(compact).toMatch(/\.mascot-fx-starry-disc[^{]*\{[^}]*animation:\s*none/);
  });

  it("작은 크기 기준은 그룹 책상 마스코트보다 크고 소품 미리 보기보다 작다", () => {
    const limit = Number(/@container mascot-fx \(max-width: (\d+)px\)/.exec(compact)?.[1]);
    // 기준 상자는 마스코트 판보다 1440 / 1024배 넓은 소품 판이다.
    const mascotSide = limit / (1440 / 1024);
    expect(mascotSide).toBeGreaterThanOrEqual(104);
    expect(mascotSide).toBeLessThan(144);
  });
});
