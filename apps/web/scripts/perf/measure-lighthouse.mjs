// Lighthouse 모바일 전후 비교 측정
//
// 두 빌드를 번갈아 띄워 Lighthouse 모바일(devtools 스로틀링)을 페이지마다 3회씩 돌리고 중앙값을 낸다.
// simulate 모드는 요청 타이밍이 조금만 달라도 두 봉우리로 갈려 쓰지 않는다.
//
//   node scripts/perf/measure-lighthouse.mjs <이름A> <이름B>
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { chromium } from "playwright-core";

import { startServer } from "./serve.mjs";

const RUNS = 3;
const PAGES = ["/home?userId=7", "/social/join?code=ABCD12"];
const webDir = fileURLToPath(new URL("../../", import.meta.url));
const names = process.argv.slice(2);
if (names.length !== 2) {
  console.error("사용법: node scripts/perf/measure-lighthouse.mjs <이름A> <이름B>");
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = `${webDir}.perf/results/lighthouse-${stamp}`;
mkdirSync(outDir, { recursive: true });

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

// execFile을 써서 측정 서버가 같은 프로세스에서 응답할 수 있게 한다.
const execFileAsync = promisify(execFile);

async function runOnce(url, file) {
  try {
    await execFileAsync("npx", [
      "--yes",
      "lighthouse@12.8.2",
      url,
      "--only-categories=performance",
      "--throttling-method=devtools",
      `--chrome-path=${chromium.executablePath()}`,
      "--chrome-flags=--headless=new --no-first-run",
      "--output=json",
      `--output-path=${file}`,
      "--quiet",
    ]);
  } catch (error) {
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
  const report = JSON.parse(readFileSync(file, "utf8"));
  return {
    score: Math.round(report.categories.performance.score * 100),
    fcp: report.audits["first-contentful-paint"].numericValue,
    lcp: report.audits["largest-contentful-paint"].numericValue,
    bootup: report.audits["bootup-time"].numericValue,
    transfer: report.audits["total-byte-weight"].numericValue,
  };
}

const rows = [];
for (const page of PAGES) {
  const runs = Object.fromEntries(names.map((name) => [name, []]));
  // 두 빌드를 번갈아 돌려 시간에 따른 기기 상태 차이가 한쪽에 몰리지 않게 한다.
  for (let round = 0; round < RUNS; round++) {
    for (const name of round % 2 === 0 ? names : [...names].reverse()) {
      const server = await startServer({ dist: `${webDir}.perf/dist-${name}`, port: 4620 });
      try {
        const file = `${outDir}/${name}-${page.replace(/\W+/g, "_")}-${round}.json`;
        runs[name].push(await runOnce(`http://localhost:4620${page}`, file));
      } finally {
        await new Promise((done) => server.close(done));
      }
    }
  }
  for (const name of names) {
    const pick = (key) => median(runs[name].map((run) => run[key]));
    rows.push({ page, name, score: pick("score"), fcp: pick("fcp"), lcp: pick("lcp"), bootup: pick("bootup"), transfer: pick("transfer") });
  }
}

const lines = [
  "| 페이지 | 빌드 | 점수 | FCP | LCP | bootup | 총 전송 |",
  "|---|---|---:|---:|---:|---:|---:|",
  ...rows.map(
    (row) =>
      `| ${row.page} | ${row.name} | ${row.score} | ${(row.fcp / 1000).toFixed(2)} s | ${(row.lcp / 1000).toFixed(2)} s | ${Math.round(row.bootup)} ms | ${Math.round(row.transfer / 1024)} KiB |`,
  ),
];
console.log(lines.join("\n"));
writeFileSync(`${outDir}/summary.json`, JSON.stringify(rows, null, 2));
writeFileSync(`${outDir}/summary.md`, `${lines.join("\n")}\n`);
