import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { compress, precompressDir, shouldPrecompress } from "../precompressAssets.js";

describe("shouldPrecompress", () => {
  it("mediapipe 아래 wasm과 models 아래 파일만 고른다", () => {
    expect(shouldPrecompress("mediapipe/1.0.0/wasm/vision_wasm_internal.wasm")).toBe(true);
    expect(shouldPrecompress("models/efficientdet_lite0_int8-0720bf24.tflite")).toBe(true);
    expect(shouldPrecompress("models/face_landmarker-64184e22.task")).toBe(true);
    expect(shouldPrecompress("mediapipe/1.0.0/wasm/vision_wasm_internal.js")).toBe(false);
    expect(shouldPrecompress("assets/index-x.js")).toBe(false);
    expect(shouldPrecompress("sounds/rain-trp-cefd1558.mp3")).toBe(false);
    // 업로드 단계는 mediapipe 아래 wasm만 br로 올리므로 다른 곳의 wasm을 압축하면 업로드에서 빠진다.
    expect(shouldPrecompress("assets/other-x.wasm")).toBe(false);
    expect(shouldPrecompress("models/debug.map")).toBe(false);
  });
});

describe("compress", () => {
  it("같은 입력이면 같은 바이트를 낸다", () => {
    const input = Buffer.from("focusmakers ".repeat(1000));
    expect(compress(input).equals(compress(input))).toBe(true);
  });
});

describe("precompressDir", () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("대상만 brotli로 덮어쓰고 풀면 원본과 같다", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "precompress-"));
    const wasm = Buffer.from("wasm ".repeat(2000));
    const model = Buffer.from("model ".repeat(2000));
    const loader = "console.log('loader')";
    fs.mkdirSync(path.join(dir, "mediapipe/1.0.0/wasm"), { recursive: true });
    fs.mkdirSync(path.join(dir, "models"));
    fs.writeFileSync(path.join(dir, "mediapipe/1.0.0/wasm/a.wasm"), wasm);
    fs.writeFileSync(path.join(dir, "mediapipe/1.0.0/wasm/a.js"), loader);
    fs.writeFileSync(path.join(dir, "models/m-11111111.tflite"), model);

    const done = precompressDir(dir);

    expect(done.map((entry) => entry.path).sort()).toEqual(
      [path.join("mediapipe/1.0.0/wasm/a.wasm"), path.join("models/m-11111111.tflite")].sort(),
    );
    const read = (rel: string) => fs.readFileSync(path.join(dir, rel));
    expect(zlib.brotliDecompressSync(read("mediapipe/1.0.0/wasm/a.wasm")).equals(wasm)).toBe(true);
    expect(zlib.brotliDecompressSync(read("models/m-11111111.tflite")).equals(model)).toBe(true);
    expect(read("mediapipe/1.0.0/wasm/a.js").toString()).toBe(loader);
    expect(done.every((entry) => entry.after < entry.before)).toBe(true);
  });
});
