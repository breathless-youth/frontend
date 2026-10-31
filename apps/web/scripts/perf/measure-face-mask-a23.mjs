// 소셜룸 얼굴 가림 합성 발열·전력 기록기 (Galaxy A23)
//
//   node scripts/perf/measure-face-mask-a23.mjs <라벨> <분> [adb 시리얼]
//   예: node scripts/perf/measure-face-mask-a23.mjs webgl 20
//
// 10초마다 온도·발열 단계·CPU 사용률·배터리 전류와 전압·합성 통계를 CSV로 남기고, 끝나면 요약을 출력한다.
// 앱 화면 위 디버그 오버레이 대신 웹뷰 원격 디버깅(CDP)으로 window.__faceMaskStats()를 읽는다.
// 시리얼을 주지 않으면 adb devices의 첫 기기를 쓴다.
// 충전 중에는 전류가 배터리 소모를 말해 주지 않으므로 시작하지 않는다.
// 결과는 apps/web/.perf/face-mask/<라벨>-<시각>/에 쓴다.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ADB = process.env.ADB ?? `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const APP_PACKAGE = "com.breathlessyouth.mobile.dev";
const CDP_PORT = 9333;
const SAMPLE_MS = 10_000;

const [label, minutesArg, serialArg] = process.argv.slice(2);
if (label === undefined || minutesArg === undefined) {
  console.error("사용법: node scripts/perf/measure-face-mask-a23.mjs <라벨> <분> [adb 시리얼]");
  process.exit(1);
}
const durationMs = Number(minutesArg) * 60_000;

function firstDevice() {
  const out = execFileSync(ADB, ["devices"], { encoding: "utf8", timeout: 20_000 });
  const line = out
    .split("\n")
    .slice(1)
    .find((row) => /\sdevice$/.test(row.trim()));
  return line?.split(/\s+/)[0];
}

const serial = serialArg ?? firstDevice();
if (serial === undefined) {
  console.error("연결된 adb 기기가 없다.");
  process.exit(1);
}

function adb(...args) {
  return execFileSync(ADB, ["-s", serial, ...args], { encoding: "utf8", timeout: 20_000 });
}

function battery() {
  const out = adb("shell", "dumpsys", "battery");
  const level = Number(/level: (\d+)/.exec(out)?.[1]);
  const temp = Number(/temperature: (\d+)/.exec(out)?.[1]) / 10;
  const plugged = /(AC|USB|Wireless) powered: true/.test(out);
  return { level, temp, plugged };
}

function readSys(name) {
  try {
    const value = Number(adb("shell", "cat", `/sys/class/power_supply/battery/${name}`).trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function power() {
  const currentUa = readSys("current_now");
  const voltageUv = readSys("voltage_now");
  // 제조사마다 방전 전류의 부호가 달라 크기만 쓴다.
  // ponytail: 단위를 µA·µV로 가정한다. 다른 기기에서 값이 1000배 어긋나면 이 식을 기기별로 나눈다.
  const powerMw =
    currentUa === null || voltageUv === null ? null : (Math.abs(currentUa) * voltageUv) / 1e9;
  return { currentUa, voltageUv, powerMw };
}

function thermal() {
  const out = adb("shell", "dumpsys", "thermalservice");
  const status = Number(/Thermal Status: (\d+)/.exec(out)?.[1]);
  // 캐시가 아니라 지금 HAL이 읽은 값만 본다.
  const current = out.split("Current temperatures from HAL:")[1] ?? out;
  const read = (name) =>
    Number(new RegExp(`mValue=([0-9.]+), mType=\\d+, mName=${name},`).exec(current)?.[1]);
  return { status, ap: read("AP"), skin: read("SKIN") };
}

function cpu() {
  // 첫 화면은 부팅 이후 누적이라 1초 간격 두 번째 화면만 쓴다.
  const out = adb("shell", "top", "-b", "-n", "2", "-d", "1", "-o", "PID,%CPU,NAME");
  const last =
    out
      .split(/\n\s*\n/)
      .filter((block) => /%CPU/.test(block))
      .at(-1) ?? out;
  let app = 0;
  let renderer = 0;
  for (const line of last.split("\n")) {
    const match = /^\s*\d+\s+([0-9.]+)\s+(\S+)/.exec(line);
    if (match === null) continue;
    const value = Number(match[1]);
    if (match[2] === APP_PACKAGE) app += value;
    else if (match[2].startsWith("com.google.android.webview:sandboxed_process")) renderer += value;
  }
  return { app, renderer };
}

async function maskStats() {
  try {
    const pid = adb("shell", "pidof", APP_PACKAGE).trim();
    adb("forward", `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
    const pages = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    const page =
      pages.find((p) => p.type === "page" && /\/social|\/room/.test(p.url)) ??
      pages.find((p) => p.type === "page");
    if (page === undefined) return null;
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP 응답 없음")), 5_000);
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: {
              expression:
                "JSON.stringify(window.__faceMaskStats ? window.__faceMaskStats() : null)",
              returnByValue: true,
            },
          }),
        );
      socket.onmessage = (event) => {
        clearTimeout(timer);
        resolve(JSON.parse(event.data).result?.result?.value);
      };
      socket.onerror = reject;
    });
    socket.close();
    return JSON.parse(result ?? "null");
  } catch {
    return null;
  }
}

const start = battery();
if (start.plugged) {
  console.error("충전 중이다. 케이블을 뽑고 다시 시작한다(무선 adb를 쓴다).");
  process.exit(1);
}

const webDir = fileURLToPath(new URL("../../", import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(webDir, ".perf", "face-mask", `${label}-${stamp}`);
mkdirSync(outDir, { recursive: true });
const csvPath = join(outDir, "samples.csv");
writeFileSync(
  csvPath,
  "t_sec,level,plugged,batt_c,ap_c,skin_c,thermal_status,cpu_app,cpu_renderer,current_ua,voltage_uv,power_mw,mask_fps,mask_video_ms,mask_sticker_ms\n",
);

const rows = [];
const startedAt = Date.now();
console.log(`기록 시작: ${label}, ${minutesArg}분, 기기 ${serial} → ${outDir}`);
while (Date.now() - startedAt <= durationMs) {
  const tickAt = Date.now();
  const b = battery();
  const t = thermal();
  const c = cpu();
  const p = power();
  const m = await maskStats();
  const row = {
    t: Math.round((tickAt - startedAt) / 1000),
    level: b.level,
    plugged: b.plugged,
    batt: b.temp,
    ap: t.ap,
    skin: t.skin,
    status: t.status,
    cpuApp: c.app,
    cpuRenderer: c.renderer,
    currentUa: p.currentUa ?? "",
    voltageUv: p.voltageUv ?? "",
    powerMw: p.powerMw === null ? "" : p.powerMw.toFixed(0),
    fps: m?.fps ?? "",
    videoMs: m?.videoMs ?? "",
    stickerMs: m?.stickerMs ?? "",
  };
  rows.push(row);
  appendFileSync(csvPath, `${Object.values(row).join(",")}\n`);
  console.log(
    `${String(row.t).padStart(4)}s  AP ${row.ap}°  표면 ${row.skin}°  배터리 ${row.batt}° (${row.level}%${row.plugged ? " 충전 중" : ""})  단계 ${row.status}  CPU 앱 ${row.cpuApp}% 웹뷰 ${row.cpuRenderer}%  ${row.powerMw || "-"}mW  fps ${row.fps === "" ? "-" : row.fps}  video ${row.videoMs === "" ? "-" : row.videoMs}ms`,
  );
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, SAMPLE_MS - (Date.now() - tickAt))),
  );
}

const avg = (key) => {
  const values = rows
    .filter((r) => r[key] !== "")
    .map((r) => Number(r[key]))
    .filter(Number.isFinite);
  return values.length === 0 ? "-" : (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
};
const first = rows[0];
const last = rows.at(-1);
const summary = [
  `라벨 ${label}, 기기 ${serial}, 표본 ${rows.length}개`,
  `평균 전력 ${avg("powerMw")}mW`,
  `배터리 온도 ${first.batt}° → ${last.batt}°, 잔량 ${first.level}% → ${last.level}%`,
  `AP 온도 ${first.ap}° → ${last.ap}° (최고 ${Math.max(...rows.map((r) => r.ap))}°)`,
  `표면 온도 ${first.skin}° → ${last.skin}° (최고 ${Math.max(...rows.map((r) => r.skin))}°)`,
  `발열 단계 최고 ${Math.max(...rows.map((r) => r.status))}`,
  `CPU 평균 앱 ${avg("cpuApp")}%, 웹뷰 ${avg("cpuRenderer")}%`,
  `합성 fps 평균 ${avg("fps")}, video 평균 ${avg("videoMs")}ms, sticker 평균 ${avg("stickerMs")}ms`,
].join("\n");
writeFileSync(join(outDir, "summary.txt"), `${summary}\n`);
console.log(`\n${summary}`);
