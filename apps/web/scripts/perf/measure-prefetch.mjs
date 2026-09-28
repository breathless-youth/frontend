// 홈 유휴 사전로딩 전후 비교 하네스.
// 같은 브라우저 컨텍스트에서 홈 문서를 연 뒤 세션 문서를 연다. 탭 웹뷰와 세션 웹뷰가 HTTP 캐시를
// 나눠 쓰는 앱 구조와 같다. 변형마다 n회, 매 회 새 컨텍스트(콜드 캐시)에서 재고 두 변형을 번갈아 돈다.
// 브라우저 기동 직후의 콜드 비용이 한 변형에만 쏠리지 않게 변형마다 버리는 예열 1회를 먼저 돌고,
// 측정 라운드는 순서를 ABBA로 바꾼다(0번째 라운드 전→후, 1번째 후→전, ...).
// 회차가 끝날 때마다 결과를 JSONL에 덧붙여 뒤에서 시간 초과가 나도 앞 회차를 잃지 않는다.
// 먼저 perf:build:before·perf:build:after로 두 벌을 만든다. 절차는 docs/runbooks/vision-prefetch-measurement.md.
//
// 환경변수
//   RUNS           변형당 반복 횟수(기본 5)
//   PERF_PORT      전 서버 포트(기본 4611). 후는 PERF_PORT+1
//   HOME_DWELL_MS  홈 통계가 뜬 뒤 세션으로 넘어가기 전 머무는 시간(기본 15000). 두 변형이 같다
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

import { certSpkiHash, ensureCert, startServer } from "./serve.mjs";

const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RUNS = Number(process.env.RUNS ?? 5);
const PORT = Number(process.env.PERF_PORT ?? 4611);
const HOME_DWELL_MS = Number(process.env.HOME_DWELL_MS ?? 15_000);

/** 로컬 실험과 같은 망·CPU 조건. 결과 표에 그대로 적힌다. */
const CONDITIONS = { downMbps: 9, upMbps: 1.5, latencyMs: 150, cpuSlowdown: 4 };
const VARIANTS = [
  { name: "before", dist: `${WEB_ROOT}.perf/dist-before` },
  { name: "after", dist: `${WEB_ROOT}.perf/dist-after` },
];
const HOME_PATH = "/home?userId=7";
const SESSION_PATH = "/room/1?userId=7";
const STATS_TEXT = "오늘 순공시간";
// visionConfig.ts의 MODEL_PATHS[DEFAULT_MODEL_VARIANT]와 같은 값이어야 한다.
// Node 스크립트라 TS 상수를 가져올 수 없어 손으로 맞춘다.
const MODEL_PATH = "/models/efficientdet_lite0_int8.tflite";

/** 홈 문서에서 통계 카드가 DOM에 들어온 시각을 남긴다. addInitScript로 모든 문서 앞에 주입된다. */
function recordStatsShown(text) {
  if (location.pathname !== "/home") {
    return;
  }
  const observer = new MutationObserver(() => {
    if (document.body?.textContent?.includes(text)) {
      window.__homeStatsAt = performance.now();
      observer.disconnect();
    }
  });
  observer.observe(document, { childList: true, subtree: true });
}

function round(value) {
  return typeof value === "number" ? Math.round(value) : null;
}

async function measureOnce(browser, origin) {
  const context = await browser.newContext({ permissions: ["camera"] });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: CONDITIONS.latencyMs,
      downloadThroughput: (CONDITIONS.downMbps * 1_000_000) / 8,
      uploadThroughput: (CONDITIONS.upMbps * 1_000_000) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CONDITIONS.cpuSlowdown });
    await page.addInitScript(recordStatsShown, STATS_TEXT);

    await page.goto(`${origin}${HOME_PATH}`);
    await page.waitForFunction(() => window.__homeStatsAt !== undefined, null, {
      timeout: 60_000,
      polling: 200,
    });
    // 두 변형이 같은 시간을 머문다. 후 빌드는 이 사이에 유휴 사전로딩이 끝난다.
    await page.waitForTimeout(HOME_DWELL_MS);
    const home = await page.evaluate(
      (modelPath) => ({
        protocol: performance.getEntriesByType("navigation")[0]?.nextHopProtocol ?? null,
        fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
        statsMs: window.__homeStatsAt,
        prefetchDoneMs:
          performance
            .getEntriesByType("resource")
            .find((entry) => new URL(entry.name).pathname === modelPath)?.responseEnd ?? null,
      }),
      MODEL_PATH,
    );

    // 새 문서로 연다. 앱에서 세션이 새 웹뷰로 열리는 것과 같다.
    await page.goto(`${origin}${SESSION_PATH}`);
    await page.waitForFunction(() => window.__visionPerf !== undefined, null, {
      timeout: 180_000,
      polling: 200,
    });
    const session = await page.evaluate(() => window.__visionPerf);

    return {
      protocol: home.protocol,
      homeFcpMs: round(home.fcpMs),
      homeStatsMs: round(home.statsMs),
      prefetchDoneMs: round(home.prefetchDoneMs),
      sessionDocToReadyMs: round(session.readyAtMs),
      sessionLoadToReadyMs: session.loadMs,
      wasmCache: session.wasm.cache,
      wasmTransferBytes: session.wasm.transferSize,
      modelCache: session.model.cache,
      modelTransferBytes: session.model.transferSize,
    };
  } finally {
    await context.close();
  }
}

/** 값이 있는 회차만의 중앙값과 그 회차 수. 빠진 회차가 표에서 드러나도록 n을 함께 돌려준다. */
function median(values) {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return { value: null, n };
  }
  const middle = Math.floor(n / 2);
  const value =
    n % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  return { value, n };
}

function formatMedian({ value, n }) {
  return `${value === null ? "-" : value.toLocaleString("en-US")} (n=${n})`;
}

/** 결과가 어느 코드에서 나왔는지. 커밋 안 된 변경이 있으면 -dirty를 붙인다. */
function gitRevision() {
  try {
    const git = (...args) => execFileSync("git", args, { cwd: WEB_ROOT, encoding: "utf8" }).trim();
    return `${git("rev-parse", "--short", "HEAD")}${git("status", "--porcelain") === "" ? "" : "-dirty"}`;
  } catch {
    return "unknown";
  }
}

function tally(runs, key) {
  const counts = {};
  for (const run of runs) {
    counts[run[key]] = (counts[run[key]] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([value, count]) => `${value} ${count}`)
    .join(", ");
}

function formatDiff(before, after) {
  if (before === null || after === null) {
    return "-";
  }
  const diff = after - before;
  const sign = diff >= 0 ? "+" : "";
  const percent = before === 0 ? "" : ` (${sign}${Math.round((diff / before) * 100)}%)`;
  return `${sign}${diff}${percent}`;
}

const METRICS = [
  ["sessionDocToReadyMs", "세션 문서 로드→검출기 준비"],
  ["sessionLoadToReadyMs", "세션 로딩 시작→준비"],
  ["homeFcpMs", "홈 FCP"],
  ["homeStatsMs", "홈 통계 표시"],
  ["prefetchDoneMs", "홈 사전로딩 완료"],
];

const { cert } = ensureCert();
const servers = await Promise.all(
  VARIANTS.map((variant, index) =>
    startServer({ dist: variant.dist, port: PORT + index, http2: true }),
  ),
);
const browser = await chromium.launch({
  args: [
    `--ignore-certificate-errors-spki-list=${certSpkiHash(cert)}`,
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const browserVersion = browser.version();
const revision = gitRevision();
const date = new Date().toISOString();
const stamp = date.replace(/[:.]/g, "-");
const outDir = `${WEB_ROOT}.perf/results`;
const jsonlPath = `${outDir}/prefetch-${stamp}.jsonl`;
mkdirSync(outDir, { recursive: true });
const originOf = (variant) => `https://127.0.0.1:${PORT + VARIANTS.indexOf(variant)}`;
const results = { before: [], after: [] };
try {
  for (const variant of VARIANTS) {
    await measureOnce(browser, originOf(variant));
    console.log(`[${variant.name} 예열] 버림`);
  }
  for (let round = 0; round < RUNS; round += 1) {
    const order = round % 2 === 0 ? VARIANTS : [...VARIANTS].reverse();
    for (const [position, variant] of order.entries()) {
      const result = {
        variant: variant.name,
        round,
        order: order.map(({ name }) => name).join("→"),
        position,
        ...(await measureOnce(browser, originOf(variant))),
      };
      if (variant.name === "after" && result.prefetchDoneMs === null) {
        // 홈 체류 시간 안에 사전로딩이 끝나지 않았다. 이 회차의 세션 수치는 캐시 이득을 온전히 못 받는다.
        result.prefetchIncomplete = true;
        console.warn(
          `[after ${round + 1}/${RUNS}] 경고: 홈 체류 ${HOME_DWELL_MS} ms 안에 사전로딩이 끝나지 않았다`,
        );
      }
      results[variant.name].push(result);
      appendFileSync(jsonlPath, `${JSON.stringify(result)}\n`);
      console.log(`[${variant.name} ${round + 1}/${RUNS}]`, JSON.stringify(result));
    }
  }
} finally {
  await browser.close();
  await Promise.all(servers.map((server) => new Promise((done) => server.close(done))));
}

const markdown = [
  "# 홈 유휴 사전로딩 전후 비교 (하네스)",
  "",
  `- 일시: ${date}`,
  `- 브라우저: Chromium ${browserVersion} (headless, 가짜 카메라)`,
  `- 프로토콜: ${results.after[0]?.protocol ?? "-"} (자체 서명 TLS)`,
  `- 망: 다운로드 ${CONDITIONS.downMbps} Mbps, 업로드 ${CONDITIONS.upMbps} Mbps, 요청당 지연 ${CONDITIONS.latencyMs} ms (CDP), 서버 지연 0 ms`,
  `- CPU: ${CONDITIONS.cpuSlowdown}x 감속 (CDP)`,
  `- 반복: 변형당 ${RUNS}회(예열 1회 제외), 순서 ABBA, 매 회 새 컨텍스트, 홈 체류 ${HOME_DWELL_MS} ms`,
  `- 코드: ${revision}`,
  "",
  "| 지표 (중앙값, ms) | 전 | 후 | 차이 |",
  "|---|---:|---:|---:|",
  ...METRICS.map(([key, label]) => {
    const before = median(results.before.map((run) => run[key]));
    const after = median(results.after.map((run) => run[key]));
    return `| ${label} | ${formatMedian(before)} | ${formatMedian(after)} | ${formatDiff(before.value, after.value)} |`;
  }),
  "",
  "| 세션 캐시 판정 | 전 | 후 |",
  "|---|---|---|",
  `| wasm | ${tally(results.before, "wasmCache")} | ${tally(results.after, "wasmCache")} |`,
  `| 모델 | ${tally(results.before, "modelCache")} | ${tally(results.after, "modelCache")} |`,
].join("\n");

writeFileSync(
  `${outDir}/prefetch-${stamp}.json`,
  JSON.stringify(
    {
      date,
      revision,
      variants: Object.fromEntries(
        VARIANTS.map(({ name, dist }) => [name, dist.slice(WEB_ROOT.length)]),
      ),
      browser: browserVersion,
      conditions: {
        ...CONDITIONS,
        serverDelayMs: 0,
        homeDwellMs: HOME_DWELL_MS,
        runs: RUNS,
        warmupRunsPerVariant: 1,
        order: "ABBA",
      },
      results,
    },
    null,
    2,
  ),
);
writeFileSync(`${outDir}/prefetch-${stamp}.md`, `${markdown}\n`);
console.log(`\n${markdown}\n\n저장: ${outDir}/prefetch-${stamp}.{json,jsonl,md}`);
