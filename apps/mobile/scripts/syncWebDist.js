/* global __dirname */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/**
 * 복사본 전체의 지문을 담는 파일 이름.
 *
 * **안드로이드 때문에 있다.** 안드로이드는 번들 asset을 파일로 열 수 없어 앱이 문서
 * 디렉터리로 풀어내는데(`staticWebAssetServer.ts`), 그렇게 풀린 파일은 **앱을 업데이트해도
 * 자동으로 지워지지 않는다.** 지문 없이는 새 앱이 옛 화면을 계속 서빙하게 된다 —
 * 이 스크립트가 애초에 막으려던 바로 그 실패다.
 *
 * 파일 하나의 내용만 비교하면 그 파일을 안 건드린 변경(자산 추가·삭제 등)을 놓치므로,
 * 경로와 내용을 전부 넣어 해시한다.
 */
const BUILD_STAMP_NAME = ".build-stamp";

/**
 * apps/web 빌드 산출물을 apps/mobile 번들 asset으로 동기화한다.
 *
 * `copy`는 실제로 복사하고, `check`는 아무것도 고치지 않고 차이만 보고한다 —
 * CI가 "웹을 고치고 복사를 깜빡한 채 빌드된 앱"을 잡는 가드로 쓴다. 그 실패는
 * 에러 없이 옛 화면이 담긴 앱을 만들기 때문에 자동 검사가 필요하다
 * (설계 문서 §1 빌드 파이프라인).
 */
function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
    })
    .filter((rel) => rel !== BUILD_STAMP_NAME)
    .sort();
}

/** 파일 목록의 경로+내용으로 만든 지문. 같은 입력이면 항상 같은 값이 나온다. */
function buildStamp(dir, files) {
  const hash = crypto.createHash("sha256");
  for (const rel of files) {
    hash.update(rel);
    hash.update(fs.readFileSync(path.join(dir, rel)));
  }
  return hash.digest("hex");
}

function syncWebDist({ srcDir, destDir, mode }) {
  const srcFiles = listFiles(srcDir);
  const missing = [];
  const stale = [];

  for (const rel of srcFiles) {
    const from = path.join(srcDir, rel);
    const to = path.join(destDir, rel);

    if (mode === "check") {
      if (!fs.existsSync(to)) {
        missing.push(rel);
      } else if (!fs.readFileSync(from).equals(fs.readFileSync(to))) {
        stale.push(rel);
      }
      continue;
    }

    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }

  if (mode === "copy") {
    // 소스에서 사라진 옛 청크가 남으면 앱 번들이 계속 불어난다.
    const keep = new Set(srcFiles);
    for (const rel of listFiles(destDir)) {
      if (!keep.has(rel)) {
        fs.rmSync(path.join(destDir, rel));
      }
    }
    // 정리까지 끝난 뒤에 찍는다 — 지문은 최종 상태를 가리켜야 한다.
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, BUILD_STAMP_NAME), buildStamp(srcDir, srcFiles));
  }

  return { ok: missing.length === 0 && stale.length === 0, missing, stale };
}

module.exports = { BUILD_STAMP_NAME, syncWebDist };

if (require.main === module) {
  const mode = process.argv.includes("--check") ? "check" : "copy";
  const srcDir = path.resolve(__dirname, "../../web/dist");
  const destDir = path.resolve(__dirname, "../assets/web-dist");

  if (!fs.existsSync(srcDir)) {
    console.error(
      `apps/web 빌드 산출물이 없습니다: ${srcDir}\n먼저 'pnpm --filter web build'를 실행하세요.`,
    );
    process.exit(1);
  }

  const result = syncWebDist({ srcDir, destDir, mode });
  if (!result.ok) {
    console.error("assets/web-dist가 apps/web 빌드와 다릅니다.");
    for (const rel of result.missing) console.error(`  누락: ${rel}`);
    for (const rel of result.stale) console.error(`  낡음: ${rel}`);
    console.error("'pnpm --filter mobile sync-web'을 실행한 뒤 다시 커밋하세요.");
    process.exit(1);
  }
  console.log(mode === "check" ? "web-dist 동기화 상태 정상" : `web-dist 동기화 완료 → ${destDir}`);
}
