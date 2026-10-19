import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

/**
 * index.css의 직접 만든 변형을 실제 Tailwind로 컴파일해 미디어 쿼리를 고정한다.
 * 조건을 감싼 바깥 괄호가 빠지면 not 조합이 무효 쿼리가 되어 브라우저가 규칙째 버린다.
 * 소스 문자열만 봐서는 이 결과가 보이지 않아 컴파일 산출물을 본다.
 */
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(currentDir, "..");
const css = readFileSync(path.join(srcDir, "index.css"), "utf-8");

/** 워크스페이스는 의존성을 루트로 끌어올리기도 해서 위로 올라가며 패키지 폴더를 찾는다. */
function packageDir(id: string) {
  for (let dir = srcDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", id);
    if (existsSync(candidate)) {
      return candidate;
    }
    if (dir === path.dirname(dir)) {
      throw new Error(`${id} 패키지를 찾지 못했다`);
    }
  }
}

async function loadStylesheet(id: string, base: string) {
  const file = id.startsWith(".")
    ? path.resolve(base, id)
    : (() => {
        const dir = packageDir(id);
        const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8")) as {
          exports: { ".": { style: string } };
        };
        return path.join(dir, manifest.exports["."].style);
      })();
  return { path: file, base: path.dirname(file), content: readFileSync(file, "utf-8") };
}

/** 선언을 가진 블록마다 감싸는 블록의 머리를 바깥부터 모은다. */
function rulesIn(cssText: string) {
  const rules: { ancestors: string[]; declarations: string[] }[] = [];
  const stack: { header: string; declarations: string[] }[] = [];
  let buffer = "";
  for (const char of cssText) {
    if (char === "{") {
      stack.push({ header: buffer.trim(), declarations: [] });
      buffer = "";
    } else if (char === ";") {
      stack.at(-1)?.declarations.push(buffer.trim());
      buffer = "";
    } else if (char === "}") {
      const block = stack.pop();
      if (block !== undefined && block.declarations.length > 0) {
        rules.push({
          ancestors: stack.map((ancestor) => ancestor.header),
          declarations: block.declarations,
        });
      }
      buffer = "";
    } else {
      buffer += char;
    }
  }
  return rules;
}

/** 후보 하나만 빌드해 utilities 층의 규칙을 돌려준다. 빌드는 누적되므로 매번 새로 컴파일한다. */
async function utilityRules(candidate: string) {
  const compiler = await compile(css, { base: srcDir, loadStylesheet });
  return rulesIn(compiler.build([candidate]))
    .filter((rule) => rule.ancestors.includes("@layer utilities"))
    .map((rule) => ({
      media: rule.ancestors
        .filter((header) => header.startsWith("@media "))
        .map((header) => header.slice("@media ".length)),
      declarations: rule.declarations,
    }));
}

describe("직접 만든 반응형 변형", () => {
  it("폭 600 이상이면서 가로 폰이 아닐 때는 not 쿼리가 조건 전체를 감싼다", async () => {
    expect(await utilityRules("sm:not-landscape-compact:size-16")).toEqual([
      {
        media: ["(width >= 37.5rem)", "not ((orientation: landscape) and (height < 30rem))"],
        declarations: ["width: calc(var(--spacing) * 16)", "height: calc(var(--spacing) * 16)"],
      },
    ]);
  });

  it("큰 태블릿은 짧은 변이 1000 이상인 창에 걸린다", async () => {
    expect(await utilityRules("short-side-lg:size-20")).toEqual([
      {
        media: ["((width >= 62.5rem) and (height >= 62.5rem))"],
        declarations: ["width: calc(var(--spacing) * 20)", "height: calc(var(--spacing) * 20)"],
      },
    ]);
  });

  it("가로 폰은 가로 방향이면서 높이 480 미만인 창에 걸린다", async () => {
    expect(await utilityRules("landscape-compact:grid")).toEqual([
      {
        media: ["((orientation: landscape) and (height < 30rem))"],
        declarations: ["display: grid"],
      },
    ]);
  });
});
