import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { toDownloadPageHtml } from "../downloadPageHtml.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(path.resolve(currentDir, "../../index.html"), "utf-8");

describe("toDownloadPageHtml", () => {
  it("실제 index.html의 OG를 타임랩스 미리보기로 바꾸고 나머지는 그대로 둔다", () => {
    const html = toDownloadPageHtml(indexHtml);

    expect(html).toContain(
      '<meta property="og:image" content="https://web.focusmakers.app/og-timelapse.png" />',
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://web.focusmakers.app/download" />',
    );
    expect(html).not.toContain("og-image.png");
    expect(html).not.toContain("초대");
    expect(html.replace(/<meta property="og:[^>]*>/g, "")).toBe(
      indexHtml.replace(/<meta\s+property="og:[^>]*>/g, ""),
    );
  });

  it("바꿀 태그가 없으면 빌드를 멈춘다", () => {
    expect(() => toDownloadPageHtml("<html><head></head></html>")).toThrow("og:url");
  });
});
