import fs from "node:fs";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { WASM_PUBLIC_DIR, WASM_SENTINEL_FILE } from "./scripts/copyMediapipeWasm.js";

/**
 * MediaPipe wasm이 `public/`에 실제로 있는지 **빌드 시작 전에** 확인한다.
 *
 * `public/mediapipe/`는 생성물이라 `.gitignore` 대상이고, 갓 클론한 저장소에는 없다.
 * `pnpm --filter web build`는 앞에 복사 스크립트를 달고 있지만 `vite build`를 직접 부르면
 * 그 스텝을 건너뛰게 되고, 그러면 **에러 없이 wasm 없는 `dist`가 나온다.** 그 산출물은
 * `syncWebDist.js`를 타고 앱 번들까지 그대로 흘러가서, 사용자가 세션을 시작하는 순간에야
 * 404로 죽는다 — 빌드에서 잡을 수 있었던 실패를 런타임까지 미루는 셈이다.
 *
 * 모델(`public/models/`)은 커밋되어 있어 이 검사가 필요 없다. 없으면 그건 자산 문제가 아니라
 * 체크아웃 문제다.
 */
function requireMediapipeWasm() {
  return {
    name: "focuson:require-mediapipe-wasm",
    // dev 서버·vitest에는 걸지 않는다. 이 검사가 막으려는 것은 "잘못된 산출물"이다.
    apply: "build",
    buildStart() {
      const sentinel = path.join(WASM_PUBLIC_DIR, WASM_SENTINEL_FILE);
      if (!fs.existsSync(sentinel)) {
        throw new Error(
          `MediaPipe wasm 런타임이 없습니다: ${sentinel}\n` +
            "'pnpm --filter web prepare-assets'를 실행한 뒤 다시 빌드하세요 " +
            "(pnpm --filter web build는 이 스텝을 자동으로 먼저 돌립니다).",
        );
      }
    },
  } as const;
}

export default defineConfig({
  plugins: [react(), tailwindcss(), requireMediapipeWasm()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // 개발 서버(52.78.219.53)가 CORS 헤더를 안 보내므로 dev에서는 same-origin 프록시로 우회한다.
    proxy: {
      "/api": {
        target: "http://52.78.219.53:8080",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
