import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "vite";
import type { Plugin } from "vite";

import { MEDIAPIPE_VERSION } from "../scripts/copyMediapipeWasm.js";

/**
 * Vision 벤치 — 앱과 따로 빌드되는 개발 도구.
 *
 * 판정 코드는 `../src`에서 그대로 가져온다. 바꾸는 것은 두 가지뿐이다.
 *
 * 1. `focusDetector.ts`의 `../vision/frameLoop` → `bench/src/steppedFrameLoop.ts`
 *    (영상 시각으로 한 프레임씩 돌리기 위해. 실시간 모드는 원래 루프를 그대로 쓴다)
 * 2. 빌드에서만 모델·wasm 경로를 절대경로(`/models/…`)에서 산출물 기준 상대경로로 바꾼다.
 *    벤치를 하위 경로(정적 호스팅·아티팩트)에 올려도 자산을 찾게 하려는 것이고, 판정 값은 건드리지 않는다.
 */

const webRoot = path.resolve(__dirname, "..");

function git(command: string, fallback: string): string {
  try {
    return execSync(command, { cwd: webRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

/**
 * 모델 파일에 덧붙일 확장자. 확장자로 형식을 거르는 호스팅(예: claude.ai 아티팩트는 .tflite·.task를
 * 서빙하지 않는다)에 올릴 때 `BENCH_MODEL_SUFFIX=.wasm`처럼 준다. MediaPipe는 모델을 바이트로 읽으므로
 * 이름만 바뀌고 내용은 같다.
 */
const MODEL_SUFFIX = process.env.BENCH_MODEL_SUFFIX ?? "";

function relativeAssetPaths(): Plugin {
  return {
    name: "bench:relative-vision-assets",
    apply: "build",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(path.join("vision", "visionConfig.ts"))) {
        return null;
      }
      // 산출물의 모든 청크(메인·워커)는 assets/ 한 단계 아래에 있다.
      const next = code
        .replace(
          "`/mediapipe/${__MEDIAPIPE_VERSION__}/wasm`",
          "new URL(/* @vite-ignore */ `../mediapipe/${__MEDIAPIPE_VERSION__}/wasm`, import.meta.url).href",
        )
        .replace(
          /"\/models\/([^"]+)"/g,
          `new URL(/* @vite-ignore */ "../models/$1${MODEL_SUFFIX}", import.meta.url).href`,
        );
      if (next === code) {
        throw new Error(
          "visionConfig.ts의 자산 경로 형식이 바뀌었습니다 — bench/vite.config.ts를 맞춰 주세요",
        );
      }
      return { code: next, map: null };
    },
  };
}

/**
 * 산출물에 앱 public/ 전체가 아니라 판정에 필요한 자산만 복사한다(모델 3개 + MediaPipe wasm).
 */
function copyVisionAssets(): Plugin {
  return {
    name: "bench:copy-vision-assets",
    apply: "build",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      const pub = path.join(webRoot, "public");
      const wasmDir = path.join("mediapipe", MEDIAPIPE_VERSION, "wasm");
      if (!fs.existsSync(path.join(pub, wasmDir))) {
        throw new Error(
          "MediaPipe wasm이 없습니다 — 먼저 'pnpm --filter web prepare-assets'를 실행하세요",
        );
      }
      fs.cpSync(path.join(pub, wasmDir), path.join(outDir, wasmDir), { recursive: true });
      fs.mkdirSync(path.join(outDir, "models"), { recursive: true });
      for (const name of fs.readdirSync(path.join(pub, "models"))) {
        fs.copyFileSync(
          path.join(pub, "models", name),
          path.join(outDir, "models", `${name}${MODEL_SUFFIX}`),
        );
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  root: __dirname,
  base: "./",
  // dev에서는 앱의 public/(모델·wasm)을 루트 경로 그대로 서빙한다.
  publicDir: command === "serve" ? path.join(webRoot, "public") : false,
  plugins: [relativeAssetPaths(), copyVisionAssets()],
  define: {
    __MEDIAPIPE_VERSION__: JSON.stringify(MEDIAPIPE_VERSION),
    __DEPLOY_ENV__: JSON.stringify("development"),
    __RELEASE__: JSON.stringify("vision-bench"),
    __API_BASE__: JSON.stringify(""),
    __WEB_VERSION__: JSON.stringify("bench"),
    __BENCH_COMMIT__: JSON.stringify(git("git rev-parse --short HEAD", "unknown")),
    __BENCH_COMMIT_DATE__: JSON.stringify(git("git log -1 --format=%cs", "")),
  },
  resolve: {
    alias: [
      {
        find: /^\.\.\/vision\/frameLoop$/,
        replacement: path.resolve(__dirname, "src/steppedFrameLoop.ts"),
      },
      { find: "@", replacement: path.join(webRoot, "src") },
    ],
  },
  worker: { format: "es" as const, plugins: () => [relativeAssetPaths()] },
  server: {
    fs: { allow: [webRoot, path.resolve(webRoot, "../..")] },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
}));
