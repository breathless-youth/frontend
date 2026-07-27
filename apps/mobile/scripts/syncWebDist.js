/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");

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
    .sort();
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
  }

  return { ok: missing.length === 0 && stale.length === 0, missing, stale };
}

module.exports = { syncWebDist };

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
