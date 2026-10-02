// Vision 워커 전후 비교 하네스
//
// 워커를 끈 측정 빌드와 켠 측정 빌드의 세션 화면을 번갈아 열어 메인 스레드 막힘 ①②③을 측정하고, 마지막에 같은 녹화 프레임을 두 경로에 넣어 판정이 같은지 본다.
// 먼저 perf:build:worker-off·perf:build:worker-on으로 두 벌을 만든다.
// 절차는 docs/runbooks/vision-worker-measurement.md에 있다.
//
// 환경변수
//   FAKE_VIDEO    가짜 카메라로 재생할 .mjpeg(필수). 얼굴이 담긴 영상이라 저장소 밖에 둔다
//   SAMPLE_VIDEO  판정 일치 확인에 쓸 원본 영상(.mp4). 없으면 판정 일치 확인을 건너뛴다
//   RUNS          variant당 반복 횟수(기본 5)
//   PERF_PORT     워커 끈 빌드 포트(기본 4630). 켠 빌드는 PERF_PORT+1
//   CPU_SLOWDOWN  CPU 감속 배수(기본 4)
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

import { startServer } from "./serve.mjs";

const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FAKE_VIDEO = process.env.FAKE_VIDEO;
const SAMPLE_VIDEO = process.env.SAMPLE_VIDEO;
const RUNS = Number(process.env.RUNS ?? 5);
const PORT = Number(process.env.PERF_PORT ?? 4630);
const CPU_SLOWDOWN = Number(process.env.CPU_SLOWDOWN ?? 4);
const SESSION_PATH = "/room/1?userId=7";
const VARIANTS = [
  { name: "worker-off", dist: `${WEB_ROOT}.perf/dist-worker-off`, runtime: "main" },
  { name: "worker-on", dist: `${WEB_ROOT}.perf/dist-worker-on`, runtime: "worker" },
];
const METRICS = [
  ["startupMaxGapMs", "① 시작 직후 최장 멈춤 (ms)"],
  ["longTaskExcessMs", "② Long Task 50 ms 초과분 합계 (ms)"],
  ["longTaskCount", "② Long Task 건수"],
  ["frameGapsOver50", "③ 50 ms 넘는 rAF 간격 (회)"],
  ["loadMs", "참고: 로딩→준비 (ms)"],
];

if (FAKE_VIDEO === undefined || !existsSync(FAKE_VIDEO)) {
  throw new Error("FAKE_VIDEO에 .mjpeg 경로를 지정하세요. 런북의 준비 단계를 참고하세요.");
}

async function measureOnce(browser, origin, expectedRuntime) {
  const context = await browser.newContext({ permissions: ["camera"] });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
    await page.goto(`${origin}${SESSION_PATH}`);
    await page.waitForFunction(() => window.__visionPerf?.mainThread.complete === true, null, {
      timeout: 300_000,
      polling: 1_000,
    });
    const perf = await page.evaluate(() => window.__visionPerf);
    const video = await page.evaluate(() => {
      const element = document.querySelector("video");
      return element === null ? null : `${element.videoWidth}x${element.videoHeight}`;
    });
    if (perf.runtime !== expectedRuntime) {
      throw new Error(
        `런타임이 ${perf.runtime}다. ${expectedRuntime}이어야 한다(빌드 플래그 확인)`,
      );
    }
    if (video === "640x480") {
      // Chromium 기본 가짜 카메라 크기다. 파일 대신 기본 패턴이 나오면 사람이 없는 장면만 측정한다.
      throw new Error("가짜 카메라가 녹화본이 아니라 기본 패턴이다. FAKE_VIDEO를 확인하세요.");
    }
    return { runtime: perf.runtime, loadMs: perf.loadMs, video, ...perf.mainThread };
  } finally {
    await context.close();
  }
}

async function checkParity(browser, origin) {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/perf/worker-parity`);
    await page.waitForFunction(
      () =>
        window.__workerParity !== undefined ||
        document.querySelector("[data-parity-status]")?.textContent?.startsWith("실패"),
      null,
      { timeout: 900_000, polling: 1_000 },
    );
    const parity = await page.evaluate(() => window.__workerParity ?? null);
    if (parity === null) {
      throw new Error(`판정 일치 페이지 실패: ${await page.textContent("[data-parity-status]")}`);
    }
    return parity;
  } finally {
    await page.close();
  }
}

function median(values) {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (sorted.length === 0) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
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

function gitRevision() {
  try {
    const git = (...args) => execFileSync("git", args, { cwd: WEB_ROOT, encoding: "utf8" }).trim();
    return `${git("rev-parse", "--short", "HEAD")}${git("status", "--porcelain") === "" ? "" : "-dirty"}`;
  } catch {
    return "unknown";
  }
}

// 판정 일치 페이지가 재생할 영상.
// Playwright의 Chromium은 H.264를 못 읽어 VP9 webm으로 바꾼다.
// 키프레임을 촘촘히 둬서 0.5초 간격 위치 이동이 정확한 프레임에 멈추게 한다.
// 서버는 요청 때 디스크에서 읽으므로 판정 페이지를 열기 전에만 있으면 되지만, 실행 순서를 단순하게 두려고 맨 앞에서 만든다.
const workerOn = VARIANTS[1];
if (SAMPLE_VIDEO !== undefined) {
  mkdirSync(`${workerOn.dist}/perf-media`, { recursive: true });
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    SAMPLE_VIDEO,
    "-an",
    "-g",
    "15",
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "2M",
    `${workerOn.dist}/perf-media/sample.webm`,
  ]);
}

const servers = await Promise.all(
  VARIANTS.map((variant, index) => startServer({ dist: variant.dist, port: PORT + index })),
);
const browser = await chromium.launch({
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-video-capture=${FAKE_VIDEO}`,
  ],
});
const browserVersion = browser.version();
const originOf = (variant) => `http://127.0.0.1:${PORT + VARIANTS.indexOf(variant)}`;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = `${WEB_ROOT}.perf/results`;
mkdirSync(outDir, { recursive: true });
const jsonlPath = `${outDir}/worker-${stamp}.jsonl`;
const results = { "worker-off": [], "worker-on": [] };
let parity = null;
try {
  for (const variant of VARIANTS) {
    await measureOnce(browser, originOf(variant), variant.runtime);
    console.log(`[${variant.name} 예열] 버림`);
  }
  for (let round = 0; round < RUNS; round += 1) {
    // 순서를 ABBA로 바꿔 한쪽만 늘 먼저 도는 치우침을 없앤다.
    const order = round % 2 === 0 ? VARIANTS : [...VARIANTS].reverse();
    for (const variant of order) {
      const result = {
        variant: variant.name,
        round,
        ...(await measureOnce(browser, originOf(variant), variant.runtime)),
      };
      results[variant.name].push(result);
      appendFileSync(jsonlPath, `${JSON.stringify(result)}\n`);
      console.log(`[${variant.name} ${round + 1}/${RUNS}]`, JSON.stringify(result));
    }
  }
  if (SAMPLE_VIDEO !== undefined) {
    parity = await checkParity(browser, originOf(workerOn));
    console.log("[판정 일치]", JSON.stringify(parity));
  }
} finally {
  await browser.close();
  await Promise.all(servers.map((server) => new Promise((done) => server.close(done))));
}

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const markdown = [
  "# Vision 워커 전후 비교 (하네스)",
  "",
  `- 일시: ${new Date().toISOString()}`,
  `- 브라우저: Chromium ${browserVersion} (headless), CPU ${CPU_SLOWDOWN}x 감속`,
  `- 가짜 카메라: ${results["worker-on"][0]?.video ?? "-"}`,
  `- 반복: 변형당 ${RUNS}회(예열 1회 제외), 순서 ABBA, 매 회 새 컨텍스트(콜드 캐시)`,
  `- 코드: ${gitRevision()}`,
  "- 주의: CPU 감속은 메인 스레드에만 걸리고 워커에는 걸리지 않는다. 속도가 섞인 ①·로딩→준비는 워커 쪽에 유리하게 나오므로 공정한 비교는 실기기 결과로 한다. ②·③(메인 스레드 막힘)은 그대로 유효하다.",
  "",
  "| 지표 (중앙값) | 워커 끔 | 워커 켬 | 차이 |",
  "|---|---:|---:|---:|",
  ...METRICS.map(([key, label]) => {
    const before = median(results["worker-off"].map((run) => run[key]));
    const after = median(results["worker-on"].map((run) => run[key]));
    return `| ${label} | ${before ?? "-"} | ${after ?? "-"} | ${formatDiff(before, after)} |`;
  }),
  "",
  parity === null
    ? "판정 일치: 건너뜀(SAMPLE_VIDEO 없음)"
    : `판정 일치(${parity.frames}프레임): 사람 ${pct(parity.personAgreement)}, 휴대폰 ${pct(parity.phoneAgreement)}, 최대 점수차 사람 ${parity.maxScoreDiff.person.toFixed(3)} · 휴대폰 ${parity.maxScoreDiff.phone.toFixed(3)}`,
].join("\n");

writeFileSync(
  `${outDir}/worker-${stamp}.json`,
  JSON.stringify({ cpuSlowdown: CPU_SLOWDOWN, runs: RUNS, results, parity }, null, 2),
);
writeFileSync(`${outDir}/worker-${stamp}.md`, `${markdown}\n`);
console.log(`\n${markdown}\n\n저장: ${outDir}/worker-${stamp}.{json,jsonl,md}`);
