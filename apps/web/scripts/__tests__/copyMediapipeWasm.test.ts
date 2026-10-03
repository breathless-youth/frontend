import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MEDIAPIPE_VERSION,
  WASM_PUBLIC_DIR,
  WASM_PUBLIC_ROOT,
  pruneOtherVersions,
} from "../copyMediapipeWasm.js";

const WEB_ROOT = path.resolve(__dirname, "../..");

describe("MEDIAPIPE_VERSION", () => {
  it("설치된 패키지의 버전이다", () => {
    expect(MEDIAPIPE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("WASM_PUBLIC_DIR이 그 버전 폴더의 wasm을 가리킨다", () => {
    expect(WASM_PUBLIC_ROOT).toBe(path.join(WEB_ROOT, "public/mediapipe"));
    expect(WASM_PUBLIC_DIR).toBe(path.join(WASM_PUBLIC_ROOT, MEDIAPIPE_VERSION, "wasm"));
  });

  // 화면 코드는 같은 버전을 define으로 받아 경로를 조립한다.
  // 폴더 모양이 바뀌면 여기서 걸려야 wasm 404를 빌드 전에 잡는다.
  it("visionConfig.ts의 MEDIAPIPE_WASM_PATH가 같은 폴더 모양을 쓴다", () => {
    const source = fs.readFileSync(
      path.join(WEB_ROOT, "src/features/study-session/vision/visionConfig.ts"),
      "utf8",
    );
    const shape = path
      .relative(path.join(WEB_ROOT, "public"), WASM_PUBLIC_DIR)
      .replace(MEDIAPIPE_VERSION, "${__MEDIAPIPE_VERSION__}");

    expect(source).toContain("`/" + shape + "`");
  });
});

describe("pruneOtherVersions", () => {
  let root = "";

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("현재 버전 폴더만 남기고 나머지를 지운다", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "mediapipe-"));
    fs.mkdirSync(path.join(root, "1.0.0", "wasm"), { recursive: true });
    fs.mkdirSync(path.join(root, "0.10.22", "wasm"), { recursive: true });
    fs.mkdirSync(path.join(root, "wasm"), { recursive: true });

    const removed = pruneOtherVersions({ rootDir: root, keep: "1.0.0" });

    expect(removed.sort()).toEqual(["0.10.22", "wasm"]);
    expect(fs.readdirSync(root)).toEqual(["1.0.0"]);
  });

  it("루트 폴더가 없으면 아무것도 지우지 않는다", () => {
    const missing = path.join(os.tmpdir(), `mediapipe-missing-${Date.now()}`);

    expect(pruneOtherVersions({ rootDir: missing, keep: "1.0.0" })).toEqual([]);
  });
});
