import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MODEL_PATHS } from "@/features/study-session/vision/visionConfig";

/**
 * public 자산 파일명 해시 가드.
 *
 * 모델과 사운드는 1년 immutable 캐시로 나간다.
 * 내용을 바꾸고 이름을 그대로 두면 이미 받은 사용자는 1년 동안 옛 파일을 쓴다.
 * 그래서 파일명의 해시 8자리를 내용에서 다시 계산해 대조한다.
 * 실패 메시지가 올바른 새 이름을 알려준다.
 *
 * 경로를 `import.meta.url`로 잡으면 안 된다.
 * Vite가 애셋 참조로 해석해 `http:` URL로 바꿔 `readFileSync`가 죽는다.
 */
const PUBLIC_DIR = path.resolve(__dirname, "../../../public");

const HASHED_DIRS: Record<string, RegExp> = {
  models: /\.tflite$/,
  sounds: /\.mp3$/,
};

const HASHED_NAME = /^(.+)-([0-9a-f]{8})(\.[a-z0-9]+)$/;

function contentHash(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
}

describe("public 자산 파일명 해시", () => {
  for (const [dir, ext] of Object.entries(HASHED_DIRS)) {
    it(`${dir}/의 파일명 해시가 내용과 맞는다`, () => {
      const names = fs.readdirSync(path.join(PUBLIC_DIR, dir)).filter((name) => ext.test(name));

      expect(names.length).toBeGreaterThan(0);

      for (const name of names) {
        const actual = contentHash(path.join(PUBLIC_DIR, dir, name));
        const match = HASHED_NAME.exec(name);
        const stem = match ? match[1] : name.slice(0, -path.extname(name).length);
        const hint = `${dir}/${name} → ${stem}-${actual}${path.extname(name)}`;

        expect(match?.[2], hint).toBe(actual);
      }
    });
  }

  it("MODEL_PATHS가 가리키는 파일이 실제로 있다", () => {
    for (const modelPath of Object.values(MODEL_PATHS)) {
      expect(fs.existsSync(path.join(PUBLIC_DIR, modelPath)), modelPath).toBe(true);
    }
  });
});
