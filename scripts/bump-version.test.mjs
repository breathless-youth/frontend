import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  bumpFile,
  compareVersions,
  isoWeek,
  nextVersion,
  resolveTargets,
} from "./bump-version.mjs";

describe("isoWeek", () => {
  it("2026-09-07은 ISO 2026년 37주다", () => {
    assert.deepEqual(isoWeek(new Date(2026, 8, 7)), { yy: 26, ww: 37 });
  });

  it("2026-01-01은 목요일이라 그해 1주에 들어간다", () => {
    assert.deepEqual(isoWeek(new Date(2026, 0, 1)), { yy: 26, ww: 1 });
  });

  it("2027-01-01은 금요일이라 ISO 2026년 53주다", () => {
    assert.deepEqual(isoWeek(new Date(2027, 0, 1)), { yy: 26, ww: 53 });
  });

  it("2027-01-04 월요일부터 27년 1주가 시작한다", () => {
    assert.deepEqual(isoWeek(new Date(2027, 0, 4)), { yy: 27, ww: 1 });
  });
});

describe("nextVersion", () => {
  it("같은 주차면 P를 올린다", () => {
    assert.equal(nextVersion("26.37.2", new Date(2026, 8, 7)), "26.37.3");
  });

  it("주차가 바뀌면 P가 0부터 다시 시작한다", () => {
    assert.equal(nextVersion("26.36.4", new Date(2026, 8, 7)), "26.37.0");
  });

  it("비CalVer 현재값은 별도 분기 없이 YY.WW.0이 된다", () => {
    assert.equal(nextVersion("1.0.2", new Date(2026, 8, 7)), "26.37.0");
    assert.equal(nextVersion("0.0.0", new Date(2026, 8, 7)), "26.37.0");
  });

  it("연말 53주 다음은 27.1.0이다", () => {
    assert.equal(nextVersion("26.53.1", new Date(2027, 0, 4)), "27.1.0");
  });
});

describe("compareVersions", () => {
  it("CalVer가 구형식보다 크다", () => {
    assert.equal(compareVersions("26.37.0", "1.0.2"), 1);
  });

  it("세그먼트를 문자열이 아니라 숫자로 비교한다", () => {
    assert.equal(compareVersions("26.9.0", "26.10.0"), -1);
  });

  it("같으면 0이다", () => {
    assert.equal(compareVersions("26.37.0", "26.37.0"), 0);
  });
});

describe("resolveTargets", () => {
  it("빈 인자는 던진다", () => {
    assert.throws(() => resolveTargets([]), /대상이 없습니다/);
  });
  it("모르는 인자는 던진다", () => {
    assert.throws(() => resolveTargets(["--both"]), /모르는 인자: --both/);
  });
  it("--web --app을 순서대로 돌려준다", () => {
    const t = resolveTargets(["--web", "--app"]);
    assert.equal(t.length, 2);
  });
});

describe("bumpFile", () => {
  it("같은 주차 파일의 P를 올리고 배열 형식을 건드리지 않는다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-"));
    const file = path.join(dir, "app.json");
    fs.writeFileSync(file, '{\n  "version": "26.37.1",\n  "list": ["a", "b"]\n}\n');
    const { before, after } = bumpFile(file, (j) => j.version, new Date(2026, 8, 7));
    assert.equal(before, "26.37.1");
    assert.equal(after, "26.37.2");
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /"version": "26.37.2"/);
    assert.match(text, /"list": \["a", "b"\]/); // 배열이 여러 줄로 펼쳐지지 않았다
  });
  it("주차가 바뀌면 P가 0이 된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-"));
    const file = path.join(dir, "package.json");
    fs.writeFileSync(file, '{\n  "version": "0.0.0"\n}\n');
    const { after } = bumpFile(file, (j) => j.version, new Date(2026, 8, 7));
    assert.equal(after, "26.37.0");
  });
});
