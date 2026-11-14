import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDuration, formatKst, formatKstDate, slackCall } from "./slack.mjs";

describe("formatDuration", () => {
  it("1분 미만은 초만 쓴다", () => assert.equal(formatDuration(59), "59초"));
  it("1시간 미만은 분과 초를 쓴다", () => assert.equal(formatDuration(252), "4분 12초"));
  it("1시간 이상은 시간과 분을 쓴다", () => assert.equal(formatDuration(3600), "1시간 0분"));
  it("하루를 넘어도 시간으로 쓴다", () => assert.equal(formatDuration(90000), "25시간 0분"));
  it("소수는 반올림한다", () => assert.equal(formatDuration(59.6), "1분 0초"));
});

describe("formatKst", () => {
  it("UTC 시각을 KST 월/일 시:분으로 쓴다", () => {
    assert.equal(formatKst(new Date("2026-11-11T16:42:22Z")), "11/12 01:42");
  });
  it("날짜만 쓸 수 있다", () => {
    assert.equal(formatKstDate(new Date("2026-11-02T15:00:00Z")), "11/03");
  });
});

describe("slackCall", () => {
  it("ok가 false면 HTTP 200이어도 throw한다", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ ok: false, error: "channel_not_found" }));
    await assert.rejects(
      slackCall("chat.postMessage", {}, { token: "x", fetchImpl }),
      /channel_not_found/,
    );
  });
  it("DRY_RUN이면 보내지 않는다", async () => {
    const fetchImpl = async () => assert.fail("호출되면 안 된다");
    const res = await slackCall(
      "chat.postMessage",
      { text: "a" },
      { token: "x", dryRun: true, fetchImpl },
    );
    assert.equal(res.ts, "dry-run");
  });
});
