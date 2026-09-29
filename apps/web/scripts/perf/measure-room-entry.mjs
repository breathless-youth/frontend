// 폰 Chrome 세션 진입 비용 측정
//
// adb reverse로 측정 서버 포트를, adb forward로 9222를 미리 열어 둔다.
// Playwright connectOverCDP는 안드로이드 Chrome에서 응답 없이 멈춰 CDP WebSocket에 직접 붙는다.
// direct는 /room/1을 바로 열고, via-home은 /home을 열어 유휴 시간 미리 받기가 끝날 때까지 기다린 뒤 /room/1로 간다.
// 카메라 권한은 포트마다 처음 한 번 폰에서 허용해야 한다.
//
//   node scripts/perf/measure-room-entry.mjs <포트> <direct|via-home> [회수=3]

const [port, mode, runsArg] = process.argv.slice(2);
if (!port || !["direct", "via-home"].includes(mode)) {
  console.error("사용법: node scripts/perf/measure-room-entry.mjs <포트> <direct|via-home> [회수]");
  process.exit(1);
}
const RUNS = Number(runsArg ?? 3);
const HOME_SETTLE_MS = 8_000;
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;
const DEVTOOLS = "http://localhost:9222";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// CDP 세션 하나를 열어 send로 명령을 보내고 id로 응답을 매칭한다.
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const waiters = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiters.has(message.id)) {
      waiters.get(message.id)(message);
      waiters.delete(message.id);
    }
  };
  const ready = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return {
    ready,
    send: (method, params = {}) =>
      new Promise((resolve) => {
        id += 1;
        waiters.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      }),
    close: () => ws.close(),
  };
}

// 안드로이드 Chrome은 원격으로 새 탭을 만들지 못해(/json/new 거절) 이미 열린 탭을 재사용한다.
const targets = await (await fetch(`${DEVTOOLS}/json/list`)).json();
const target = targets.find((entry) => entry.type === "page");
if (!target) {
  console.error("연결 실패: 열린 탭이 없다. 폰 Chrome에서 페이지를 하나 띄워둘 것.");
  process.exit(1);
}
const page = cdp(target.webSocketDebuggerUrl);
await page.ready;
await page.send("Page.enable");
await page.send("Network.enable");
await page.send("Page.bringToFront");

// readyAtMs가 찍힐 때까지 1초 간격으로 최대 60초 기다린다.
async function waitForReady() {
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const response = await page.send("Runtime.evaluate", {
      expression: "window.__visionPerf?.readyAtMs ?? null",
      returnByValue: true,
    });
    const readyAtMs = response.result?.result?.value ?? null;
    if (readyAtMs != null) {
      return readyAtMs;
    }
  }
  return null;
}

for (let round = 0; round < RUNS; round++) {
  // 다음 이동이 새 문서로 뜨도록 빈 페이지를 먼저 연다.
  await page.send("Page.navigate", { url: "about:blank" });
  await sleep(1_000);
  // 이전 회차의 HTTP 캐시가 남으면 direct도 미리 받은 것처럼 보인다.
  await page.send("Network.clearBrowserCache");
  if (mode === "via-home") {
    await page.send("Page.navigate", { url: `http://localhost:${port}/home?userId=7` });
    await sleep(HOME_SETTLE_MS);
  }
  await page.send("Page.navigate", { url: `http://localhost:${port}/room/1?userId=7` });
  const readyAtMs = await waitForReady();
  if (readyAtMs == null) {
    console.error(
      `시간 초과: ${READY_TIMEOUT_MS / 1000}초 안에 readyAtMs가 찍히지 않았다. 폰에서 카메라 권한 팝업이 떠 있는지 확인할 것.`,
    );
    process.exit(1);
  }
  const response = await page.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
      roomScripts: performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.includes("/assets/RoomPage"))
        .map((entry) => ({ transferSize: entry.transferSize, duration: Math.round(entry.duration) })),
    })`,
    returnByValue: true,
  });
  const result = JSON.parse(response.result?.result?.value ?? "{}");
  console.log(JSON.stringify({ round, mode, port, ...result, readyAtMs }));
}
page.close();
