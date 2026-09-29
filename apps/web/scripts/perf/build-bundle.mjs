// 측정용 운영형 빌드
//
// Sentry·Amplitude 초기화는 키가 있을 때만 번들에 남으므로 가짜 키를 넣어야 실제 배포와 같은 크기가 나온다.
// 가짜 키라 전송은 모두 실패한다.
// 소스맵 업로드는 SENTRY_AUTH_TOKEN을 비워 막는다.
//
//   node scripts/perf/build-bundle.mjs <이름>          → .perf/dist-<이름>
//   PANEL=1 node scripts/perf/build-bundle.mjs <이름>  → 세션 측정 패널을 켠 빌드
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const name = process.argv[2];
if (!name) {
  console.error("사용법: node scripts/perf/build-bundle.mjs <이름>");
  process.exit(1);
}
const webDir = fileURLToPath(new URL("../../", import.meta.url));

execFileSync("node", ["scripts/copyMediapipeWasm.js"], { cwd: webDir, stdio: "inherit" });
execFileSync(
  "pnpm",
  ["exec", "vite", "build", "--manifest", "--outDir", `.perf/dist-${name}`, "--emptyOutDir"],
  {
    cwd: webDir,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_SENTRY_DSN: "https://public@o0.ingest.sentry.io/0",
      VITE_AMPLITUDE_API_KEY: "measure-dummy-key",
      VITE_GA4_MEASUREMENT_ID: "",
      VITE_API_BASE_URL: "",
      VITE_DEPLOY_ENV: "",
      SENTRY_AUTH_TOKEN: "",
      VITE_PERF_PANEL: process.env.PANEL === "1" ? "1" : "",
    },
  },
);
