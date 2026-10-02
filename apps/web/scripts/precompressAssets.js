/**
 * 큰 정적 자산 사전 압축
 *
 * CloudFront는 10MB를 넘는 파일과 application/octet-stream을 압축하지 않아 wasm과 모델이 원본 크기로 나간다.
 * 업로드 전에 brotli로 압축해 같은 이름으로 덮어쓰고, 업로드 단계가 Content-Encoding: br을 붙인다.
 * 같은 파일에 두 번 돌리면 이중으로 압축되므로 갓 빌드한 dist에 한 번만 돌린다.
 *
 * 사용: node scripts/precompressAssets.js dist
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

/**
 * 압축 대상 판정
 *
 * deploy-web.yml이 br로 올리는 범위(mediapipe 아래 wasm, .map을 뺀 models)와 같아야 한다.
 * 범위를 넘게 고르면 압축만 되고 어느 업로드에도 실리지 않는다.
 */
export function shouldPrecompress(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  return (
    (normalized.startsWith("mediapipe/") && normalized.endsWith(".wasm")) ||
    (normalized.startsWith("models/") && !normalized.endsWith(".map"))
  );
}

export function compress(buffer) {
  return zlib.brotliCompressSync(buffer, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length,
    },
  });
}

export function precompressDir(dir) {
  const done = [];
  for (const rel of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, rel);
    if (!shouldPrecompress(rel) || !fs.statSync(file).isFile()) {
      continue;
    }
    const original = fs.readFileSync(file);
    const packed = compress(original);
    fs.writeFileSync(file, packed);
    done.push({ path: rel, before: original.length, after: packed.length });
  }
  return done;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error("사용: node scripts/precompressAssets.js <dist 경로>");
    process.exit(1);
  }
  const done = precompressDir(dir);
  for (const { path: rel, before, after } of done) {
    console.log(`${rel} ${before} → ${after}`);
  }
  // 대상이 하나도 없으면 압축 없이 배포되는데 아무도 모르므로 실패로 둔다.
  if (done.length === 0) {
    console.error("압축할 wasm·모델을 찾지 못했다");
    process.exit(1);
  }
}
