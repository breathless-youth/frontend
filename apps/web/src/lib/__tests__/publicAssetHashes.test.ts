import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MODEL_PATHS } from "@/features/study-session/vision/visionConfig";
import { WATCHER_ASSET_DIR } from "@/features/timer-background/watcher/watcherClips";

/**
 * public 자산 파일명 해시 가드.
 *
 * 모델, 사운드, 공간 소재는 1년 immutable 캐시로 나간다.
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

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));
}

/**
 * 여러 파일을 한 벌로 쓰는 공간 소재는 폴더 이름에 해시를 둔다.
 * `find . -type f | sort | xargs shasum -a 256 | shasum -a 256`의 앞 8자와 같은 값이다.
 */
function folderHash(dir: string): string {
  const lines = listFiles(dir)
    .map((file) => `./${file}`)
    .sort()
    .map(
      (file) =>
        `${createHash("sha256")
          .update(fs.readFileSync(path.join(dir, file)))
          .digest("hex")}  ${file}\n`,
    )
    .join("");
  return createHash("sha256").update(lines).digest("hex").slice(0, 8);
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

  // 공간 소재는 `spaces/<종류>/` 아래에 해시 이름 파일이나 해시 이름 폴더로만 둔다.
  it("spaces/의 파일명·폴더명 해시가 내용과 맞는다", () => {
    const spacesDir = path.join(PUBLIC_DIR, "spaces");
    const entries = fs
      .readdirSync(spacesDir, { withFileTypes: true })
      .filter((kind) => kind.isDirectory())
      .flatMap((kind) =>
        fs
          .readdirSync(path.join(spacesDir, kind.name), { withFileTypes: true })
          .filter((entry) => !entry.name.startsWith("."))
          .map((entry) => ({ entry, rel: `spaces/${kind.name}/${entry.name}` })),
      );

    expect(entries.length).toBeGreaterThan(0);

    for (const { entry, rel } of entries) {
      const full = path.join(PUBLIC_DIR, rel);
      if (entry.isDirectory()) {
        const actual = folderHash(full);
        expect(entry.name, `${rel} → ${path.dirname(rel)}/${actual}`).toBe(actual);
      } else {
        const actual = contentHash(full);
        const match = HASHED_NAME.exec(entry.name);
        const stem = match ? match[1] : entry.name.slice(0, -path.extname(entry.name).length);
        expect(match?.[2], `${rel} → ${stem}-${actual}${path.extname(entry.name)}`).toBe(actual);
      }
    }
  });

  it("감독관 소재 경로가 spaces/ 아래의 실제 폴더를 가리킨다", () => {
    expect(WATCHER_ASSET_DIR.startsWith("/spaces/")).toBe(true);
    expect(fs.existsSync(path.join(PUBLIC_DIR, WATCHER_ASSET_DIR))).toBe(true);
  });

  it("MODEL_PATHS가 가리키는 파일이 실제로 있다", () => {
    for (const modelPath of Object.values(MODEL_PATHS)) {
      expect(fs.existsSync(path.join(PUBLIC_DIR, modelPath)), modelPath).toBe(true);
    }
  });
});
