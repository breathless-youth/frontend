import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildReleaseBody, createRelease, formatReleaseStart } from "./amplitude-release.mjs";

const release = {
  version: "web/26.46.3",
  title: "웹 26.46.3",
  description: "d",
  releaseStart: new Date("2026-11-11T10:25:20Z"),
};

describe("formatReleaseStart", () => {
  it("UTC 기준 yyyy-MM-dd HH:mm:ss다", () => {
    assert.equal(formatReleaseStart(new Date("2026-11-11T10:25:20.512Z")), "2026-11-11 10:25:20");
  });
});

describe("buildReleaseBody", () => {
  it("차트 표시를 켜고 필수 필드를 채운다", () => {
    assert.deepEqual(buildReleaseBody(release), {
      version: "web/26.46.3",
      release_start: "2026-11-11 10:25:20",
      title: "웹 26.46.3",
      description: "d",
      chart_visibility: true,
      created_by: "GitHub Actions",
    });
  });
  it("플랫폼이 있으면 platforms를 목록으로 넣는다", () => {
    assert.deepEqual(buildReleaseBody({ ...release, platforms: ["Web"] }).platforms, ["Web"]);
  });
});

describe("createRelease", () => {
  it("실패 응답이면 throw한다", async () => {
    const fetchImpl = async () => new Response("bad", { status: 400 });
    await assert.rejects(
      createRelease({ apiKey: "a", secretKey: "b", fetchImpl, ...release }),
      /Amplitude release 400/,
    );
  });
  it("Basic 인증과 JSON 본문으로 Release API에 POST한다", async () => {
    let call;
    const fetchImpl = async (url, init) => {
      call = { url, init };
      return new Response("{}");
    };
    await createRelease({ apiKey: "a", secretKey: "b", fetchImpl, ...release, platforms: ["iOS"] });
    assert.equal(call.url, "https://amplitude.com/api/2/release");
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers.Authorization, `Basic ${Buffer.from("a:b").toString("base64")}`);
    assert.equal(call.init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(call.init.body), {
      ...buildReleaseBody(release),
      chart_visibility: true,
      platforms: ["iOS"],
    });
  });
  it("DRY_RUN이면 호출하지 않는다", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return new Response("{}");
    };
    await createRelease({ apiKey: "a", secretKey: "b", dryRun: true, fetchImpl, ...release });
    assert.equal(called, false);
  });
});
