import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";

import {
  classifySubmissions,
  easEnv,
  formatSubmission,
  git as runGit,
  formatWarning,
  recordSubmissions,
  releaseFor,
  tagName,
  trackLabel,
} from "./record-eas-submissions.mjs";

const app = { slug: "mobile", ownerAccount: { name: "breathless-youth" } };
const sub = (o = {}) => ({
  id: "s1",
  status: "FINISHED",
  platform: "IOS",
  app,
  androidConfig: null,
  completedAt: "2026-11-11T16:42:22.512Z",
  submittedBuild: {
    appVersion: "26.46.0",
    appBuildVersion: "23",
    buildProfile: "production",
    gitCommitHash: "f7e3a89c07338c11",
  },
  ...o,
});
const now = new Date("2026-11-12T18:00:00Z");
const ctx = { now, existingTags: new Set(), isKnownCommit: () => true };

describe("tagName", () => {
  it("플랫폼/버전-빌드번호다", () => assert.equal(tagName(sub()), "ios/26.46.0-23"));
  it("로컬 빌드는 null이다", () => assert.equal(tagName(sub({ submittedBuild: null })), null));
});

describe("classifySubmissions", () => {
  it("완료된 production 제출을 기록한다", () => {
    assert.equal(classifySubmissions([sub()], ctx).toRecord.length, 1);
  });
  it("이미 태그가 있으면 건너뛴다", () => {
    const r = classifySubmissions([sub()], {
      ...ctx,
      existingTags: new Set(["ios/26.46.0-23"]),
    });
    assert.equal(r.toRecord.length, 0);
  });
  it("같은 빌드를 두 번 제출했으면 먼저 끝난 하나만 남긴다", () => {
    const r = classifySubmissions(
      [sub({ id: "b", completedAt: "2026-11-11T17:00:00Z" }), sub({ id: "a" })],
      ctx,
    );
    assert.deepEqual(
      r.toRecord.map((s) => s.id),
      ["a"],
    );
  });
  it("실패한 제출과 production이 아닌 제출은 뺀다", () => {
    const staging = sub({ submittedBuild: { ...sub().submittedBuild, buildProfile: "staging" } });
    assert.equal(
      classifySubmissions([sub({ status: "ERRORED" }), staging], ctx).toRecord.length,
      0,
    );
  });
  it("7일이 지난 제출은 보지 않는다", () => {
    assert.equal(
      classifySubmissions([sub({ completedAt: "2026-11-05T17:59:00Z" })], ctx).toRecord.length,
      0,
    );
  });
  it("로컬 빌드는 24시간 안이면 경고한다", () => {
    const r = classifySubmissions(
      [sub({ submittedBuild: null, completedAt: "2026-11-12T01:00:00Z" })],
      ctx,
    );
    assert.deepEqual(
      r.warnings.map((w) => w.reason),
      ["local"],
    );
  });
  it("로컬 빌드가 24시간이 지났으면 경고하지 않는다", () => {
    const r = classifySubmissions(
      [sub({ submittedBuild: null, completedAt: "2026-11-11T17:59:00Z" })],
      ctx,
    );
    assert.equal(r.warnings.length, 0);
  });
  it("커밋이 저장소에 없으면 기록하지 않고 경고한다", () => {
    const r = classifySubmissions([sub({ completedAt: "2026-11-12T10:00:00Z" })], {
      ...ctx,
      isKnownCommit: () => false,
    });
    assert.equal(r.toRecord.length, 0);
    assert.deepEqual(
      r.warnings.map((w) => w.reason),
      ["unknown-commit"],
    );
  });
});

describe("문구", () => {
  it("iOS 제출 메시지", () => {
    assert.equal(
      formatSubmission(sub()),
      "📱 iOS 26.46.0 (23) App Store Connect에 제출했어요 · 11/12 01:42\n커밋 `f7e3a89` · <https://expo.dev/accounts/breathless-youth/projects/mobile/submissions/s1|EAS 보기>",
    );
  });
  it("Android는 트랙 이름을 쓴다", () => {
    const a = sub({ platform: "ANDROID", androidConfig: { track: "internal" } });
    assert.match(
      formatSubmission(a),
      /^📱 Android 26\.46\.0 \(23\) Play 내부 테스트 트랙에 제출했어요/,
    );
  });
  it("모르는 트랙은 그대로 쓴다", () => assert.equal(trackLabel("alpha"), "alpha"));
  it("로컬 빌드 경고", () => {
    assert.match(
      formatWarning({ sub: sub({ submittedBuild: null }), reason: "local" }),
      /^⚠️ iOS 제출 1건은 로컬 빌드라 버전을 알 수 없어요 · 11\/12 01:42 · <.+\|EAS 보기>\nios\/<버전>-<빌드번호> 태그를 달면 다음부터 자동으로 인식해요$/,
    );
  });
  it("Release 제목과 설명", () => {
    const r = releaseFor(sub());
    assert.equal(r.title, "iOS 26.46.0 (23)");
    assert.equal(r.version, "ios/26.46.0-23");
    assert.equal(r.description, "App Store Connect 제출 · 커밋 f7e3a89");
    assert.deepEqual(r.platforms, ["iOS"]);
  });
});

describe("recordSubmissions", () => {
  before(() => mock.method(console, "log", () => {}));
  after(() => mock.restoreAll());

  const env = {
    SLACK_BOT_TOKEN: "xoxb",
    SLACK_DEPLOY_CHANNEL_ID: "C1",
    AMPLITUDE_API_KEY: "a",
    AMPLITUDE_SECRET_KEY: "b",
  };
  const boom = (msg) => {
    throw new Error(msg);
  };
  const fake = (over = {}) => {
    const calls = [];
    const gitArgs = [];
    const deps = {
      listSubmissions: () => [sub()],
      now: () => now,
      isKnownCommit: () => true,
      git: (...args) => {
        calls.push(`git ${args[0] === "-c" ? args[2] : args[0]}`);
        gitArgs.push(args);
        return "";
      },
      createRelease: async () => calls.push("release"),
      postMessage: async ({ text }) => {
        calls.push(text.startsWith("📱") ? "slack" : text);
        return "1";
      },
      ...over,
    };
    return { deps, calls, gitArgs };
  };
  const pushOf = (gitArgs) => gitArgs.find((a) => a.includes("push"));

  it("Amplitude, 태그, Slack 순서로 처리한다", async () => {
    const { deps, calls } = fake();
    assert.equal(await recordSubmissions(env, deps), 0);
    assert.deepEqual(calls, ["git ls-remote", "release", "git tag", "git push", "slack"]);
  });
  it("Amplitude가 실패하면 태그도 Slack도 없이 실패를 알린다", async () => {
    const { deps, calls } = fake({ createRelease: async () => boom("Amplitude release 500") });
    assert.equal(await recordSubmissions(env, deps), 1);
    assert.deepEqual(calls, ["git ls-remote", "⚠️ EAS 기록 실패 · 로컬 실행"]);
  });
  it("태그 push가 실패하면 Slack 없이 Release 중복 가능성을 알린다", async () => {
    const { deps, calls } = fake();
    const git = deps.git;
    deps.git = (...args) => (args.includes("push") ? boom("rejected") : git(...args));
    assert.equal(await recordSubmissions(env, deps), 1);
    assert.deepEqual(calls, [
      "git ls-remote",
      "release",
      "git tag",
      "⚠️ EAS 기록 실패 · ios/26.46.0-23 태그를 달지 못해 내일 Amplitude Release가 한 번 더 생길 수 있어요 · 로컬 실행",
    ]);
  });
  it("태그를 단 뒤 Slack이 실패하면 실패로 기록한다", async () => {
    const { deps, calls } = fake();
    const post = deps.postMessage;
    deps.postMessage = async (p) => (p.text.startsWith("📱") ? boom("Slack 실패") : post(p));
    assert.equal(await recordSubmissions(env, deps), 1);
    assert.deepEqual(calls, [
      "git ls-remote",
      "release",
      "git tag",
      "git push",
      "⚠️ EAS 기록 실패 · 로컬 실행",
    ]);
  });
  it("Amplitude 키가 없으면 Release만 건너뛴다", async () => {
    const { deps, calls } = fake();
    assert.equal(await recordSubmissions({ ...env, AMPLITUDE_API_KEY: "" }, deps), 0);
    assert.deepEqual(calls, ["git ls-remote", "git tag", "git push", "slack"]);
  });
  it("DRY_RUN이면 시크릿 없이도 본문을 내고 태그는 달지 않는다", async () => {
    const { deps, calls } = fake();
    const releases = [];
    deps.createRelease = async (p) => {
      releases.push(p);
      calls.push("release");
    };
    const channels = [];
    const post = deps.postMessage;
    deps.postMessage = async (p) => {
      channels.push([p.channel, p.dryRun]);
      return post(p);
    };
    assert.equal(await recordSubmissions({ DRY_RUN: "1" }, deps), 0);
    assert.deepEqual(calls, ["git ls-remote", "release", "slack"]);
    assert.equal(releases[0].dryRun, true);
    assert.deepEqual(channels, [["dry-run", true]]);
  });
  it("경고 한 건을 못 올려도 나머지 경고와 실패 알림을 올린다", async () => {
    const recent = (id) => sub({ id, completedAt: "2026-11-12T10:00:00Z" });
    const { deps, calls } = fake({
      listSubmissions: () => [recent("w1"), recent("w2")],
      isKnownCommit: () => false,
    });
    const post = deps.postMessage;
    deps.postMessage = async (p) =>
      p.text.includes("submissions/w1|") ? boom("Slack 실패") : post(p);
    assert.equal(await recordSubmissions(env, deps), 1);
    assert.equal(calls.length, 3);
    assert.match(calls[1], /submissions\/w2\|/);
    assert.equal(calls[2], "⚠️ EAS 기록 실패 · 로컬 실행");
  });
  it("GITHUB_TOKEN이 있으면 태그 push에만 인증 헤더를 붙인다", async () => {
    const { deps, gitArgs } = fake();
    assert.equal(await recordSubmissions({ ...env, GITHUB_TOKEN: "ghs_abc" }, deps), 0);
    const basic = Buffer.from("x-access-token:ghs_abc").toString("base64");
    assert.deepEqual(pushOf(gitArgs), [
      "-c",
      `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`,
      "push",
      "origin",
      "ios/26.46.0-23",
    ]);
    assert.equal(gitArgs.filter((a) => a[0] === "-c").length, 1);
  });
  it("GITHUB_TOKEN이 없으면 인증 없이 push한다", async () => {
    const { deps, gitArgs } = fake();
    assert.equal(await recordSubmissions(env, deps), 0);
    assert.deepEqual(pushOf(gitArgs), ["push", "origin", "ios/26.46.0-23"]);
  });
  it("DRY_RUN 출력에는 토큰이 나오지 않는다", async () => {
    const { deps } = fake();
    const before = console.log.mock.calls.length;
    await recordSubmissions({ DRY_RUN: "1", GITHUB_TOKEN: "ghs_abc" }, deps);
    const out = console.log.mock.calls
      .slice(before)
      .map((c) => c.arguments.join(" "))
      .join("\n");
    assert.match(out, /git push origin ios\/26\.46\.0-23/);
    assert.doesNotMatch(out, /ghs_abc|eC1hY2Nlc3MtdG9rZW46Z2hzX2FiYw/);
  });
  it("DRY_RUN이 아니면 Slack 시크릿이 없을 때 시작하지 않는다", async () => {
    const { deps } = fake();
    await assert.rejects(recordSubmissions({}, deps), /SLACK_BOT_TOKEN/);
  });
});

describe("easEnv", () => {
  it("eas 자식 프로세스에는 EXPO_TOKEN만 남기고 다른 토큰을 뺀다", () => {
    const env = easEnv({
      PATH: "/bin",
      EXPO_TOKEN: "e",
      GITHUB_TOKEN: "g",
      GH_TOKEN: "h",
      SLACK_BOT_TOKEN: "s",
      AMPLITUDE_SECRET_KEY: "k",
    });
    assert.deepEqual(env, { PATH: "/bin", EXPO_TOKEN: "e" });
  });
});

describe("git", () => {
  it("실패 메시지에서 인증 헤더 값을 가린다", () => {
    const header = "http.https://github.com/.extraheader=AUTHORIZATION: basic c2VjcmV0";
    assert.throws(
      () => runGit("-c", header, "rev-parse", "--verify", "--quiet", "refs/tags/no-such-tag-x"),
      (err) => !err.message.includes("c2VjcmV0") && err.message.includes("basic ***"),
    );
  });
});
