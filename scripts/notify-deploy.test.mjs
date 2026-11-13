import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";

import {
  findWebRelease,
  formatPrList,
  formatStatusMessage,
  formatThread,
  parseMergedPrs,
  releaseDescription,
  releaseHeadings,
  resolveMention,
  runFinish,
  toSlackMrkdwn,
} from "./notify-deploy.mjs";

const US = "\x1f";
const RS = "\x1e";
const log =
  [
    [
      "17632cd",
      "Merge pull request #528 from breathless-youth/dev",
      "2026-11-11T19:21:16+09:00",
      "[release] 웹 릴리즈: 26.46.3\n",
    ],
    [
      "786bcaf",
      "Merge pull request #527 from breathless-youth/chore/web-26.46.3",
      "2026-11-11T19:14:47+09:00",
      "[chore] 웹 버전 26.46.3\n",
    ],
    ["4ccd928", "Merge branch 'dev' into feature/x", "2026-11-11T19:00:00+09:00", ""],
  ]
    .map((f) => f.join(US))
    .join(RS) + RS;

describe("parseMergedPrs", () => {
  it("PR 머지 커밋만 읽고 dev 릴리즈 PR은 뺀다", () => {
    const prs = parseMergedPrs(log);
    assert.equal(prs.length, 1);
    assert.equal(prs[0].number, 527);
    assert.equal(prs[0].title, "[chore] 웹 버전 26.46.3");
    assert.equal(prs[0].mergedAt.toISOString(), "2026-11-11T10:14:47.000Z");
  });
});

describe("releaseHeadings", () => {
  it("## 제목만 뽑고 모든 노트에 있는 버전 표 제목은 뺀다", () => {
    assert.deepEqual(releaseHeadings("## 버전\n| a |\n## 로그인\n- x\n### 세부\n## 운영·기타"), [
      "로그인",
      "운영·기타",
    ]);
  });
});

describe("findWebRelease", () => {
  const rels = [
    { tag_name: "web/26.46.3", body: "  ", draft: true },
    { tag_name: "web/26.46.3", body: "## 로그인", draft: true, html_url: "u" },
  ];
  it("버전이 같고 본문이 있는 첫 Release를 찾는다(Draft 포함)", () => {
    assert.equal(findWebRelease(rels, "26.46.3").html_url, "u");
  });
  it("없으면 null이다", () => assert.equal(findWebRelease(rels, "26.47.0"), null));
});

describe("resolveMention", () => {
  it("짝이 있으면 멤버 ID로 멘션한다", () =>
    assert.equal(resolveMention("wonza-hub", '{"wonza-hub":"U1"}'), "<@U1>"));
  it("짝이 없으면 @here다", () =>
    assert.equal(resolveMention("x", '{"wonza-hub":"U1"}'), "<!here>"));
  it("JSON이 깨졌으면 @here다", () => assert.equal(resolveMention("x", "{"), "<!here>"));
  it("변수가 없으면 @here다", () => assert.equal(resolveMention("x", undefined), "<!here>"));
});

describe("formatStatusMessage", () => {
  const base = { version: "26.47.0", sha: "abc1234def", actor: "wonza-hub", runUrl: "R" };
  it("진행 중", () => {
    assert.equal(
      formatStatusMessage({ ...base, state: "running" }),
      "🟡 운영 웹 배포 중 · 26.47.0 · <R|실행 보기>\n`abc1234` · wonza-hub 머지",
    );
  });
  it("완료(노트 있음)", () => {
    assert.equal(
      formatStatusMessage({
        ...base,
        state: "success",
        durationSec: 252,
        release: { headings: ["로그인", "운영·기타"], url: "N" },
      }),
      "✅ 운영 웹 배포 완료 · 26.47.0 · 4분 12초 · <R|실행 보기>\n주요 변경: 로그인 · 운영·기타\n<N|릴리즈 노트 보기>",
    );
  });
  it("완료(노트 없음)", () => {
    assert.equal(
      formatStatusMessage({
        ...base,
        state: "success",
        durationSec: 252,
        release: null,
        prCount: 3,
      }),
      "✅ 운영 웹 배포 완료 · 26.47.0 · 4분 12초 · <R|실행 보기>\n릴리즈 노트 없음 · PR 3건",
    );
  });
  it("실패", () => {
    assert.equal(
      formatStatusMessage({
        ...base,
        state: "failure",
        failedStep: "Upload to S3",
        mention: "<@U1>",
      }),
      "🔴 운영 웹 배포 실패 · 26.47.0 · Upload to S3 단계 · <R|실행 보기>\n<@U1> 확인해 주세요",
    );
  });
  it("실패 단계를 모르면 단계 조각을 뺀다", () => {
    assert.match(
      formatStatusMessage({ ...base, state: "failure", mention: "<!here>" }),
      /^🔴 운영 웹 배포 실패 · 26\.47\.0 · <R\|실행 보기>/,
    );
  });
  it("취소", () => {
    assert.equal(
      formatStatusMessage({ ...base, state: "cancelled" }),
      "⚪ 운영 웹 배포 취소됨 · 26.47.0 · <R|실행 보기>",
    );
  });
});

describe("formatThread", () => {
  const prs = [
    { number: 529, title: "[feat] BY-1237 로그인", branch: "feature/x", mergedAt: new Date() },
  ];
  it("노트, PR, 이벤트 순서다", () => {
    const msgs = formatThread({
      release: { body: "## 로그인" },
      prs,
      eventDiffText: "📊 이벤트 변경 없음",
      repoName: "o/r",
    });
    assert.equal(msgs.length, 3);
    assert.equal(msgs[0], "*로그인*");
    assert.match(
      msgs[1],
      /^포함된 PR 1건\n• \[feat\] BY-1237 로그인 \(<https:\/\/github\.com\/o\/r\/pull\/529\|#529>\)$/,
    );
  });
  it("노트가 없으면 PR부터다", () => {
    assert.equal(
      formatThread({ release: null, prs: [], eventDiffText: "E", repoName: "o/r" })[0],
      "포함된 PR 없음",
    );
  });
});

describe("releaseDescription", () => {
  it("노트가 없으면 PR 제목 목록이다", () => {
    assert.equal(
      releaseDescription({ release: null, prs: [{ number: 1, title: "t" }] }),
      "- t (#1)",
    );
  });
});

describe("toSlackMrkdwn", () => {
  const body = [
    "## 버전",
    "",
    "| 대상 | 버전 | 배포 |",
    "|---|---|---|",
    "| 웹 | `26.46.3` | 운영 배포 |",
    "",
    "> 웹만 바뀌어서 앱 빌드는 필요 없다.",
    "",
    "## 로그인",
    "",
    "- 로그인 화면을 바꿨다. (BY-1237, #529)",
    "* 이벤트 `social_login_tapped`를 추가했다.",
    "",
    "",
    "",
    "### 세부",
    "",
    "**웹 전체 변경**: [비교](https://github.com/o/r/compare/web/26.46.2...web/26.46.3)",
  ].join("\n");
  const out = toSlackMrkdwn(body);

  it("## 버전 절은 제목째 뺀다", () => {
    assert.doesNotMatch(out, /버전|대상|웹만/);
  });
  it("표 줄은 어디에 있어도 뺀다", () => {
    assert.equal(toSlackMrkdwn("## 로그인\n| a | b |\n- x"), "*로그인*\n• x");
  });
  it("## 와 ### 제목은 굵게 쓴다", () => {
    assert.match(out, /^\*로그인\*$/m);
    assert.match(out, /^\*세부\*$/m);
  });
  it("**굵게**는 *굵게*다", () => assert.match(out, /^\*웹 전체 변경\*: /m));
  it("마크다운 링크는 Slack 링크다", () => {
    assert.match(
      out,
      /<https:\/\/github\.com\/o\/r\/compare\/web\/26\.46\.2\.\.\.web\/26\.46\.3\|비교>/,
    );
  });
  it("- 와 * 목록은 •이다", () => {
    assert.match(out, /^• 로그인 화면을 바꿨다\. \(BY-1237, #529\)$/m);
    assert.match(out, /^• 이벤트 `social_login_tapped`를 추가했다\.$/m);
  });
  it("인용은 > 그대로 둔다", () => {
    assert.equal(toSlackMrkdwn("> 웹만 바뀌었다"), "> 웹만 바뀌었다");
  });
  it("빈 줄은 하나로 줄이고 앞뒤를 자른다", () => {
    assert.doesNotMatch(out, /\n\n\n/);
    assert.equal(out, out.trim());
  });
  it("본문의 &, <, >는 이스케이프하고 링크는 살린다", () => {
    assert.equal(
      toSlackMrkdwn("a < b & c [x](https://e.com/?a=1)"),
      "a &lt; b &amp; c <https://e.com/?a=1|x>",
    );
  });
  it("실제 노트 모양을 통째로 바꾼다", () => {
    assert.equal(
      out,
      [
        "*로그인*",
        "",
        "• 로그인 화면을 바꿨다. (BY-1237, #529)",
        "• 이벤트 `social_login_tapped`를 추가했다.",
        "",
        "*세부*",
        "",
        "*웹 전체 변경*: <https://github.com/o/r/compare/web/26.46.2...web/26.46.3|비교>",
      ].join("\n"),
    );
  });
});

describe("runFinish", () => {
  let log;
  before(() => {
    log = mock.method(console, "log", () => {});
  });
  after(() => mock.restoreAll());

  const env = {
    GITHUB_REPOSITORY: "o/r",
    RUN_ID: "9",
    HEAD_SHA: "abc1234def",
    GITHUB_ACTOR: "dev",
    DEPLOY_RESULT: "success",
    SLACK_BOT_TOKEN: "xoxb",
    SLACK_DEPLOY_CHANNEL_ID: "C1",
    SLACK_TS: "111.1",
    AMPLITUDE_API_KEY: "a",
    AMPLITUDE_SECRET_KEY: "b",
  };
  const fail = (msg) => async () => {
    throw new Error(msg);
  };
  // 지난 운영 배포가 없는 상황을 기본으로 둬서 git 비교 없이 흐름만 본다.
  const fake = (over = {}) => {
    const calls = [];
    const deps = {
      githubGet: async () => ({
        jobs: [
          {
            name: "deploy",
            started_at: "2026-11-11T10:21:22Z",
            completed_at: "2026-11-11T10:25:20Z",
            steps: [],
          },
        ],
      }),
      githubGetAll: async (path) =>
        path.endsWith("/releases")
          ? [{ tag_name: "web/26.46.3", body: "## 로그인\n- a", html_url: "https://r" }]
          : [],
      git: (...args) => {
        if (args[0] === "show" && args[1].endsWith(":apps/web/package.json")) {
          return '{"version":"26.46.3"}';
        }
        throw new Error("git 없음");
      },
      postMessage: async (p) => {
        calls.push(["post", p]);
        return "222.2";
      },
      updateMessage: async (p) => {
        calls.push(["update", p]);
      },
      createRelease: async (p) => {
        calls.push(["release", p]);
      },
      ...over,
    };
    return { deps, calls };
  };
  const names = (calls) => calls.map(([n]) => n);

  it("정상이면 메인 메시지, 스레드, Release 순서로 하고 실패가 없다", async () => {
    const { deps, calls } = fake();
    assert.equal(await runFinish(env, deps), false);
    assert.deepEqual(names(calls), ["update", "post", "release"]);
    assert.match(calls[0][1].text, /^✅ 운영 웹 배포 완료 · 26\.46\.3 · 3분 58초 · /);
    assert.equal(calls[1][1].threadTs, "111.1");
    assert.deepEqual(calls[2][1].platforms, ["Web"]);
  });
  it("jobs API가 실패해도 메인 메시지를 고치고 실패로 끝낸다", async () => {
    const { deps, calls } = fake({ githubGet: fail("GitHub 500") });
    assert.equal(await runFinish(env, deps), true);
    assert.equal(calls[0][0], "update");
    assert.match(calls[0][1].text, /^✅ 운영 웹 배포 완료 · 26\.46\.3 · <https/);
  });
  it("Release 목록을 못 읽으면 릴리즈 노트 없음으로 고친다", async () => {
    const { deps, calls } = fake({
      githubGetAll: async (path) => (path.endsWith("/releases") ? fail("GitHub 502")() : []),
    });
    assert.equal(await runFinish(env, deps), true);
    assert.match(calls[0][1].text, /\n릴리즈 노트 없음$/);
  });
  it("Slack이 ok:false여도 Amplitude Release를 만든다", async () => {
    const { deps, calls } = fake({
      updateMessage: fail("Slack chat.update 실패: not_in_channel"),
      postMessage: fail("Slack chat.postMessage 실패: not_in_channel"),
    });
    assert.equal(await runFinish(env, deps), true);
    assert.deepEqual(names(calls), ["release"]);
  });
  it("시작 메시지를 고치지 못하면 결과를 새로 올리고 그 아래에 스레드를 단다", async () => {
    const { deps, calls } = fake({
      updateMessage: fail("Slack chat.update 실패: message_not_found"),
    });
    assert.equal(await runFinish(env, deps), true);
    assert.deepEqual(names(calls), ["post", "post", "release"]);
    assert.match(calls[0][1].text, /^✅ 운영 웹 배포 완료/);
    assert.equal(calls[0][1].threadTs, undefined);
    assert.equal(calls[1][1].threadTs, "222.2");
  });
  it("Amplitude가 실패하면 스레드에 경고한다", async () => {
    const { deps, calls } = fake({ createRelease: fail("Amplitude release 500: <x>") });
    assert.equal(await runFinish(env, deps), true);
    const [name, last] = calls.at(-1);
    assert.equal(name, "post");
    assert.equal(last.threadTs, "111.1");
    assert.equal(
      last.text,
      "⚠️ Amplitude Release를 만들지 못했어요: Amplitude release 500: &lt;x&gt;",
    );
  });
  it("시작 메시지가 없으면 결과를 새로 올리고 그 아래에 스레드를 단다", async () => {
    const { deps, calls } = fake();
    await runFinish({ ...env, SLACK_TS: "" }, deps);
    assert.deepEqual(names(calls), ["post", "post", "release"]);
    assert.equal(calls[0][1].threadTs, undefined);
    assert.equal(calls[1][1].threadTs, "222.2");
  });
  it("시크릿이 없으면 Slack과 Amplitude를 건너뛰고 경고만 한다", async () => {
    const { deps, calls } = fake();
    const bare = { ...env };
    for (const k of ["SLACK_BOT_TOKEN", "SLACK_DEPLOY_CHANNEL_ID", "AMPLITUDE_API_KEY"]) {
      delete bare[k];
    }
    log.mock.resetCalls();
    assert.equal(await runFinish(bare, deps), false);
    assert.deepEqual(calls, []);
    const skipped = log.mock.calls.filter((c) => /^::warning::.*건너뜁니다$/.test(c.arguments[0]));
    assert.equal(skipped.length, 2);
  });
  it("DRY_RUN이면 토큰과 채널이 없어도 보낼 본문을 낸다", async () => {
    const { deps, calls } = fake();
    const bare = { ...env, DRY_RUN: "1" };
    delete bare.SLACK_BOT_TOKEN;
    delete bare.SLACK_DEPLOY_CHANNEL_ID;
    delete bare.AMPLITUDE_API_KEY;
    delete bare.AMPLITUDE_SECRET_KEY;
    await runFinish(bare, deps);
    assert.equal(calls[0][1].channel, "dry-run");
    assert.equal(calls[0][1].dryRun, true);
    const [name, release] = calls.at(-1);
    assert.equal(name, "release");
    assert.equal(release.dryRun, true);
  });
});
