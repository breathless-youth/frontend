/** @jest-environment node */
/* global describe, beforeEach, afterEach, it, expect */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { syncWebDist } = require("../syncWebDist");

describe("syncWebDist", () => {
  let srcDir;
  let destDir;

  beforeEach(() => {
    srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-src-"));
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-dest-"));
  });

  afterEach(() => {
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  it("copy 모드는 중첩 디렉터리까지 그대로 복사한다", () => {
    fs.mkdirSync(path.join(srcDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(srcDir, "index.html"), "<html></html>");
    fs.writeFileSync(path.join(srcDir, "assets", "app.js"), "console.log(1);");

    const result = syncWebDist({ srcDir, destDir, mode: "copy" });

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(destDir, "index.html"), "utf8")).toBe("<html></html>");
    expect(fs.readFileSync(path.join(destDir, "assets", "app.js"), "utf8")).toBe("console.log(1);");
  });

  it("copy 모드는 소스에서 사라진 옛 파일을 대상에서 지운다", () => {
    fs.writeFileSync(path.join(srcDir, "index.html"), "new");
    fs.writeFileSync(path.join(destDir, "old-chunk.js"), "stale");

    syncWebDist({ srcDir, destDir, mode: "copy" });

    expect(fs.existsSync(path.join(destDir, "old-chunk.js"))).toBe(false);
  });

  it("check 모드는 내용이 다르면 stale로 보고하고 파일을 고치지 않는다", () => {
    fs.writeFileSync(path.join(srcDir, "index.html"), "new");
    fs.writeFileSync(path.join(destDir, "index.html"), "old");

    const result = syncWebDist({ srcDir, destDir, mode: "check" });

    expect(result.ok).toBe(false);
    expect(result.stale).toEqual(["index.html"]);
    expect(fs.readFileSync(path.join(destDir, "index.html"), "utf8")).toBe("old");
  });

  it("check 모드는 대상에 없는 파일을 missing으로 보고한다", () => {
    fs.writeFileSync(path.join(srcDir, "index.html"), "new");

    const result = syncWebDist({ srcDir, destDir, mode: "check" });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["index.html"]);
  });

  it("소스와 대상이 같으면 check가 통과한다", () => {
    fs.writeFileSync(path.join(srcDir, "index.html"), "same");
    fs.writeFileSync(path.join(destDir, "index.html"), "same");

    expect(syncWebDist({ srcDir, destDir, mode: "check" })).toEqual({
      ok: true,
      missing: [],
      stale: [],
    });
  });
});
