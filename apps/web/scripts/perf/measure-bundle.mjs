// manifest 기반 초기 JS 크기 측정
//
// 빌드 manifest에서 index.html 엔트리가 정적 import로 닿는 JS를 모두 더해 초기 JS로 본다.
// 동적 import로만 닿는 청크는 지연 JS로 따로 센다.
//
//   node scripts/perf/measure-bundle.mjs <이름> [<이름>...]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const webDir = fileURLToPath(new URL("../../", import.meta.url));
const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("사용법: node scripts/perf/measure-bundle.mjs <이름> [<이름>...]");
  process.exit(1);
}

function sizes(dist, file) {
  const buffer = readFileSync(`${dist}/${file}`);
  return { raw: buffer.length, gzip: gzipSync(buffer, { level: 9 }).length };
}

function measure(name) {
  const dist = `${webDir}.perf/dist-${name}`;
  const manifest = JSON.parse(readFileSync(`${dist}/.vite/manifest.json`, "utf8"));
  const initial = new Set();
  const visit = (key) => {
    const entry = manifest[key];
    if (!entry || initial.has(entry.file)) return;
    initial.add(entry.file);
    for (const child of entry.imports ?? []) visit(child);
  };
  visit("index.html");
  const lazy = new Set(
    Object.values(manifest)
      .map((entry) => entry.file)
      .filter((file) => file.endsWith(".js") && !initial.has(file)),
  );
  const sum = (files) =>
    [...files].reduce(
      (total, file) => {
        const size = sizes(dist, file);
        return { raw: total.raw + size.raw, gzip: total.gzip + size.gzip };
      },
      { raw: 0, gzip: 0 },
    );
  const largestLazy = [...lazy]
    .map((file) => ({ file, ...sizes(dist, file) }))
    .sort((a, b) => b.raw - a.raw)
    .slice(0, 8);
  return {
    name,
    initialFiles: initial.size,
    initial: sum(initial),
    lazyFiles: lazy.size,
    lazy: sum(lazy),
    largestLazy,
  };
}

const results = names.map(measure);
const base = results[0];
console.log("| 빌드 | 초기 JS 파일 | 초기 raw | 초기 gzip | 기준 대비 | 지연 JS 파일 | 지연 raw |");
console.log("|---|---:|---:|---:|---:|---:|---:|");
for (const result of results) {
  const delta = ((result.initial.raw / base.initial.raw - 1) * 100).toFixed(1);
  console.log(
    `| ${result.name} | ${result.initialFiles} | ${result.initial.raw.toLocaleString()} | ${result.initial.gzip.toLocaleString()} | ${result === base ? "기준" : `${delta}%`} | ${result.lazyFiles} | ${result.lazy.raw.toLocaleString()} |`,
  );
}
mkdirSync(`${webDir}.perf/results`, { recursive: true });
const out = `${webDir}.perf/results/bundle-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`\n저장: ${out}`);
