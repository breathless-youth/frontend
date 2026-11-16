import fs from "node:fs";
import path from "node:path";

const APP_DIR = path.join(__dirname, "..", "app");

/** `app` 아래의 모든 파일을 `app` 기준 경로로 모은다. */
function listRouteFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listRouteFiles(full) : [path.relative(APP_DIR, full)];
  });
}

describe("앱 라우트", () => {
  // `app` 아래 파일은 모두 딥링크로 열리는 화면이 되어 운영 빌드에도 실린다.
  it("실기기 실험용 화면이 라우트에 남아 있지 않다", () => {
    expect(listRouteFiles(APP_DIR).filter((file) => /spike/i.test(file))).toEqual([]);
  });
});
