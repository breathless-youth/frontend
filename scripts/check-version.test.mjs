import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { APP_VERSION, evaluate } from "./check-version.mjs";

describe("evaluate", () => {
  it("웹은 증가하면 통과한다", () => {
    assert.equal(evaluate("26.37.0", "0.0.0", true).ok, true);
  });
  it("웹은 같은 값이면 실패한다", () => {
    assert.equal(evaluate("26.37.0", "26.37.0", true).ok, false);
  });
  it("웹은 내려가면 실패한다", () => {
    assert.equal(evaluate("26.36.0", "26.37.0", true).ok, false);
  });
  it("앱은 같은 값이어도 통과한다", () => {
    assert.equal(evaluate("26.37.0", "26.37.0", false).ok, true);
  });
  it("앱은 내려가면 실패한다", () => {
    assert.equal(evaluate("26.36.0", "26.37.0", false).ok, false);
  });
  it("형식이 틀린 head는 실패한다", () => {
    const r = evaluate("26.01.0", "1.0.2", true);
    assert.equal(r.ok, false);
    assert.match(r.reason, /형식/);
  });
  it("비CalVer base는 숫자 비교로 통과한다", () => {
    assert.equal(evaluate("26.37.0", "1.0.2", true).ok, true);
  });
  it("앱 x.y.z 형식은 CalVer가 아니어도 통과한다", () => {
    assert.equal(evaluate("1.0.3", "1.0.2", false, APP_VERSION, "x.y.z").ok, true);
  });
  it("앱 x.y.z 형식도 내려가면 실패한다", () => {
    assert.equal(evaluate("1.0.2", "1.0.3", false, APP_VERSION, "x.y.z").ok, false);
  });
});

describe("CLI git 실패", () => {
  it("없는 ref는 파일명과 함께 exit 1로 끝난다", () => {
    const script = fileURLToPath(new URL("./check-version.mjs", import.meta.url));
    let code = 0;
    let out = "";
    try {
      out = execFileSync("node", [script, "--base", "no-such-ref-xyz"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      code = e.status;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    assert.equal(code, 1);
    assert.match(out, /package\.json/);
  });
});
