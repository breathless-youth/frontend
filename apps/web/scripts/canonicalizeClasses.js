import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

/**
 * Tailwind IntelliSense의 `suggestCanonicalClasses` 경고를 찾고, `--write`면 고친다.
 *
 * 판정은 IntelliSense가 부르는 `canonicalizeCandidates`를 그대로 쓴다. 정규식으로 따로 만들면
 * 에디터와 결과가 갈린다. 인자 없이 돌리면 목록만 출력하고 1건이라도 있으면 종료 코드 1이다.
 */

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(WEB_ROOT, "src");

export async function loadCanonicalizer(cssPath = path.join(SRC_DIR, "index.css")) {
  // `@tailwindcss/node`는 직접 의존성이 아니라 `@tailwindcss/vite`를 거쳐 설치된다.
  const require = createRequire(import.meta.url);
  const nodeEntry = createRequire(require.resolve("@tailwindcss/vite")).resolve(
    "@tailwindcss/node",
  );
  const { __unstable__loadDesignSystem } = await import(pathToFileURL(nodeEntry).href);
  const ds = await __unstable__loadDesignSystem(fs.readFileSync(cssPath, "utf8"), {
    base: path.dirname(cssPath),
  });
  // 둘 다 공개 API가 아니라서 Tailwind를 올리면 사라지거나 바뀔 수 있다.
  if (typeof ds.canonicalizeCandidates !== "function" || typeof ds.candidatesToCss !== "function") {
    throw new Error(
      "@tailwindcss/node에 canonicalizeCandidates·candidatesToCss가 없다. Tailwind 버전을 확인할 것.",
    );
  }
  const cache = new Map();
  return (token) => {
    if (!cache.has(token)) {
      const isClass = ds.candidatesToCss([token])[0];
      const next = isClass ? ds.canonicalizeCandidates([token], { rem: 16 })[0] : token;
      if (typeof next !== "string") throw new TypeError(`${token}의 표준 표기가 문자열이 아니다.`);
      cache.set(token, next);
    }
    return cache.get(token);
  };
}

const CLASS_NAME = /class/i;
// 이 저장소는 클래스 묶음을 `SIZE`·`SESSION_PILL_BASE`처럼 대문자 상수에 담는다.
// ponytail: 대문자 상수에 든 일반 문구도 바꿀 수 있다. --write 뒤 출력 목록을 diff와 대조하고, 오탐이 나오면 이 이름 규칙을 좁힌다.
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;
const CLASS_CALLS = new Set(["cn", "cva", "clsx", "cx", "twMerge", "toHaveClass"]);

// `expect(el.className).toContain(...)`처럼 단언 대상이 클래스 문자열인 매처 호출인지 본다.
function assertsOnClass(call) {
  let target = call.expression;
  while (ts.isPropertyAccessExpression(target)) target = target.expression;
  return (
    target !== call.expression &&
    ts.isCallExpression(target) &&
    target.expression.getText() === "expect" &&
    CLASS_NAME.test(target.arguments[0]?.getText() ?? "")
  );
}

// 클래스가 들어가는 자리인지 위로 올라가며 본다. 클래스처럼 생긴 문구·testid까지 바꾸지 않으려고
// 정해 둔 자리에서만 바꾼다.
function inClassContext(node) {
  for (let child = node, n = node.parent; n; child = n, n = n.parent) {
    if (ts.isJsxAttribute(n)) return CLASS_NAME.test(n.name.getText());
    if (ts.isCallExpression(n) && child !== n.expression) {
      const callee = ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression;
      return (ts.isIdentifier(callee) && CLASS_CALLS.has(callee.text)) || assertsOnClass(n);
    }
    if (
      (ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n) || ts.isPropertyDeclaration(n)) &&
      child !== n.name
    ) {
      const name = n.name.getText();
      if (CLASS_NAME.test(name) || (ts.isVariableDeclaration(n) && CONSTANT_NAME.test(name))) {
        return true;
      }
    }
  }
  return false;
}

// 문자열 조각의 소스 범위. `${` 앞뒤 토큰은 완성된 클래스 이름이 아니라서 건너뛴다.
function literalPieces(node, sf) {
  const start = node.getStart(sf);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [{ from: start + 1, to: node.getEnd() - 1, skipFirst: false, skipLast: false }];
  }
  const parts = [node.head, ...node.templateSpans.map((s) => s.literal)];
  return parts.map((p, i) => {
    const last = i === parts.length - 1;
    return {
      from: p.getStart(sf) + 1,
      to: p.getEnd() - (last ? 1 : 2),
      skipFirst: i > 0,
      skipLast: !last,
    };
  });
}

export function canonicalizeSource(fileName, source, canonicalize) {
  const kind = fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const edits = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      for (const piece of inClassContext(node) ? literalPieces(node, sf) : []) {
        const raw = source.slice(piece.from, piece.to);
        for (const m of raw.matchAll(/\S+/g)) {
          const at = m.index;
          const end = at + m[0].length;
          if (piece.skipFirst && at === 0) continue;
          if (piece.skipLast && end === raw.length) continue;
          if (/["'`\\]/.test(m[0])) continue;
          const next = canonicalize(m[0]);
          if (typeof next !== "string") {
            throw new TypeError(`${m[0]}의 표준 표기가 문자열이 아니다.`);
          }
          if (next !== m[0]) edits.push({ pos: piece.from + at, from: m[0], to: next });
        }
      }
      if (!ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  let text = source;
  for (const e of [...edits].sort((a, b) => b.pos - a.pos)) {
    text = text.slice(0, e.pos) + e.to + text.slice(e.pos + e.from.length);
  }
  const changes = edits.map((e) => ({
    line: sf.getLineAndCharacterOfPosition(e.pos).line + 1,
    from: e.from,
    to: e.to,
  }));
  return { text, changes };
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts") ? [p] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--write");
  const canonicalize = await loadCanonicalizer();
  let total = 0;
  for (const file of sourceFiles(SRC_DIR).sort()) {
    const source = fs.readFileSync(file, "utf8");
    const { text, changes } = canonicalizeSource(file, source, canonicalize);
    if (changes.length === 0) continue;
    total += changes.length;
    const rel = path.relative(WEB_ROOT, file);
    for (const c of changes) console.log(`${rel}:${c.line} ${c.from} → ${c.to}`);
    if (write) fs.writeFileSync(file, text);
  }
  console.log(write ? `${total}건을 고쳤다.` : `표준 표기가 아닌 클래스 ${total}건`);
  if (!write && total > 0) process.exit(1);
}
