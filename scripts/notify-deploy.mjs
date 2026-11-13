/**
 * 운영 웹 배포의 Slack 알림과 Amplitude Release 기록.
 *
 * start는 배포 job 안에서 진행 중 메시지를 올리고, finish는 별도 job에서 그 메시지를 결과로 고친다.
 * 성공하면 스레드에 릴리즈 노트, PR 목록, 이벤트 변경을 올리고 Amplitude Release를 만든다.
 * 알림이 실패해도 배포 결과는 바뀌지 않도록 워크플로가 continue-on-error로 감싼다.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRelease } from "./amplitude-release.mjs";
import { githubGet, githubGetAll, githubToken, repo } from "./github.mjs";
import { formatDuration, isDryRun, postMessage, updateMessage } from "./slack.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const WEB_PACKAGE = "apps/web/package.json";
const PR_MERGE = /^Merge pull request #(\d+) from [^/]+\/(.+)$/;

// Slack은 &, <, >를 링크·멘션 문법으로 읽으므로 본문에 그대로 두면 문구가 깨지거나 엉뚱한 멘션이 된다.
function escapeSlack(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** git log 출력에서 읽은 PR 머지 목록. */
export function parseMergedPrs(log) {
  const prs = [];
  for (const record of log.split("\x1e")) {
    const [, subject, committedAt, body = ""] = record.replace(/^\n/, "").split("\x1f");
    const m = subject?.match(PR_MERGE);
    // dev에서 main으로 가는 릴리즈 PR은 안에 든 PR을 다시 묶은 것일 뿐이다.
    if (!m || m[2] === "dev") continue;
    prs.push({
      number: Number(m[1]),
      title: body.split("\n")[0].trim(),
      branch: m[2],
      mergedAt: new Date(committedAt),
    });
  }
  return prs;
}

/**
 * GitHub 마크다운 릴리즈 노트의 Slack mrkdwn 변환.
 * Slack은 제목·표·**굵게**·[링크](url)를 렌더링하지 않아 기호가 그대로 보인다.
 */
export function toSlackMrkdwn(markdown) {
  const lines = [];
  let inVersion = false;
  for (const raw of markdown.split(/\r?\n/)) {
    // 버전 표는 상태 줄에 이미 있는 내용이다.
    if (/^## /.test(raw)) inVersion = /^## 버전\s*$/.test(raw);
    if (inVersion || raw.startsWith("|")) continue;
    // 링크 문법을 만들기 전에 이스케이프해야 만든 링크의 <, >가 살아남는다.
    const line = escapeSlack(raw)
      .replace(/^&gt; /, "> ")
      .replace(/^#{2,3} (.+)$/, "*$1*")
      .replace(/^(\s*)[-*] /, "$1• ")
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "<$2|$1>");
    lines.push(line);
  }
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 릴리즈 노트의 ## 제목 목록. */
export function releaseHeadings(body) {
  // 버전 표는 모든 노트에 있어서 주요 변경을 알려 주지 않는다.
  return [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()).filter((h) => h !== "버전");
}

/** 이번 버전의 본문 있는 웹 Release. */
export function findWebRelease(releases, version) {
  return releases.find((r) => r.tag_name === `web/${version}` && r.body?.trim()) ?? null;
}

/** 머지한 사람의 Slack 멘션. */
export function resolveMention(actor, userMapJson) {
  try {
    const id = JSON.parse(userMapJson)[actor];
    if (id) return `<@${id}>`;
  } catch {
    // 변수가 없거나 JSON이 깨져도 실패 알림은 누군가 봐야 한다.
  }
  return "<!here>";
}

/** 채널에 보이는 배포 상태 메시지. */
export function formatStatusMessage(p) {
  const link = `<${p.runUrl}|실행 보기>`;
  const duration = p.durationSec == null ? [] : [formatDuration(p.durationSec)];
  if (p.state === "running") {
    return `🟡 운영 웹 배포 중 · ${p.version} · ${link}\n\`${p.sha.slice(0, 7)}\` · ${p.actor} 머지`;
  }
  if (p.state === "success") {
    const head = ["✅ 운영 웹 배포 완료", p.version, ...duration, link].join(" · ");
    if (!p.release) {
      return `${head}\n릴리즈 노트 없음${p.prCount == null ? "" : ` · PR ${p.prCount}건`}`;
    }
    const lines = [head];
    if (p.release.headings.length) lines.push(`주요 변경: ${p.release.headings.join(" · ")}`);
    lines.push(`<${p.release.url}|릴리즈 노트 보기>`);
    return lines.join("\n");
  }
  if (p.state === "failure") {
    const step = p.failedStep ? [`${p.failedStep} 단계`] : [];
    return `${["🔴 운영 웹 배포 실패", p.version, ...duration, ...step, link].join(" · ")}\n${p.mention} 확인해 주세요`;
  }
  return ["⚪ 운영 웹 배포 취소됨", p.version, ...duration, link].join(" · ");
}

/** 스레드에 올릴 PR 목록. */
export function formatPrList(prs, repoName) {
  if (!prs.length) return "포함된 PR 없음";
  const lines = prs.map(
    (pr) =>
      `• ${escapeSlack(pr.title)} (<https://github.com/${repoName}/pull/${pr.number}|#${pr.number}>)`,
  );
  return [`포함된 PR ${prs.length}건`, ...lines].join("\n");
}

/**
 * 성공한 배포의 스레드 메시지 목록.
 * 지난 운영 배포를 못 찾으면 prs와 eventDiffText가 null이라 그 덩어리를 뺀다.
 */
export function formatThread({ release, prs, eventDiffText, repoName }) {
  const msgs = [];
  if (release) msgs.push(toSlackMrkdwn(release.body));
  if (prs) msgs.push(formatPrList(prs, repoName));
  if (eventDiffText) msgs.push(eventDiffText);
  return msgs;
}

/** Amplitude Release 설명. */
export function releaseDescription({ release, prs }) {
  if (release) return release.body.trim();
  return (prs ?? []).map((pr) => `- ${pr.title} (#${pr.number})`).join("\n");
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function versionAt(sha, deps) {
  return JSON.parse(deps.git("show", `${sha}:${WEB_PACKAGE}`)).version;
}

function slackConfig(env) {
  const token = env.SLACK_BOT_TOKEN;
  const channel = env.SLACK_DEPLOY_CHANNEL_ID;
  // DRY_RUN은 시크릿 없이도 보낼 본문을 확인할 수 있어야 한다.
  if (isDryRun(env)) return { token, channel: channel || "dry-run", dryRun: true };
  if (token && channel) return { token, channel, dryRun: false };
  console.log(
    "::warning::SLACK_BOT_TOKEN 또는 SLACK_DEPLOY_CHANNEL_ID가 비어 Slack 알림을 건너뜁니다",
  );
  return null;
}

function runUrl(env, runId) {
  return `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo(env)}/actions/runs/${runId}`;
}

const firstLine = (err) => err.message.split("\n")[0];

async function start(env) {
  const slack = slackConfig(env);
  if (!slack) return;
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, WEB_PACKAGE), "utf8")).version;
  const text = formatStatusMessage({
    state: "running",
    version,
    sha: env.GITHUB_SHA,
    actor: env.GITHUB_ACTOR,
    runUrl: runUrl(env, env.GITHUB_RUN_ID),
  });
  const ts = await postMessage({ ...slack, text });
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `ts=${ts}\n`);
}

// 지난 운영 배포 커밋이 있어야 PR 목록과 이벤트 변경을 만들 수 있다.
async function changesSincePrevious({ env, token, runId, headSha, version, deps, optional }) {
  const none = { prs: null, eventDiffText: null };
  const runs = await optional("지난 운영 배포를 조회하지 못했습니다", () =>
    deps.githubGetAll(
      `/repos/${repo(env)}/actions/workflows/deploy-web.yml/runs?branch=main&status=success`,
      "workflow_runs",
      { token, max: 30 },
    ),
  );
  if (!runs) return none;
  // 같은 커밋을 다시 배포한 실행은 비교 기준이 될 수 없다.
  const prev = runs.find((r) => String(r.id) !== String(runId) && r.head_sha !== headSha)?.head_sha;
  if (!prev) {
    console.log("::warning::지난 운영 배포를 찾지 못해 PR 목록과 이벤트 변경을 뺍니다");
    return none;
  }
  // 얕은 체크아웃 등으로 git 기록이 없어도 결과 메시지는 올라가야 한다.
  const changes = await optional("지난 운영 배포와 비교하지 못했습니다", async () => {
    // start는 의존성 설치 전에 돌아 typescript를 쓰는 이 모듈을 처음부터 불러올 수 없다.
    const { AMPLITUDE_FILE, diffEvents, extractEvents, formatEventDiff } =
      await import("./amplitude-events.mjs");
    const log = deps.git(
      "log",
      "--merges",
      "--format=%H%x1f%s%x1f%cI%x1f%b%x1e",
      `${prev}..${headSha}`,
    );
    const diff = diffEvents(
      extractEvents(deps.git("show", `${prev}:${AMPLITUDE_FILE}`)),
      extractEvents(deps.git("show", `${headSha}:${AMPLITUDE_FILE}`)),
    );
    const eventDiffText = formatEventDiff(diff, {
      fromVersion: versionAt(prev, deps),
      toVersion: version,
      compareUrl: `https://github.com/${repo(env)}/compare/${prev.slice(0, 7)}...${headSha.slice(0, 7)}`,
    });
    return { prs: parseMergedPrs(log), eventDiffText };
  });
  return changes ?? none;
}

const defaultDeps = { githubGet, githubGetAll, git, postMessage, updateMessage, createRelease };

/**
 * 배포 결과 메시지, 스레드, Amplitude Release 처리.
 * 부가 정보나 한쪽 외부 호출이 실패해도 나머지는 끝까지 하고, 실패가 있었으면 true를 돌려준다.
 */
export async function runFinish(env, deps = defaultDeps) {
  let failed = false;
  // 걸린 시간·PR·노트는 덧붙이는 정보라 못 구해도 결과 알림을 막지 않는다.
  const optional = async (label, fn) => {
    try {
      return await fn();
    } catch (err) {
      console.log(`::warning::${label}: ${firstLine(err)}`);
      failed = true;
      return null;
    }
  };
  const token = githubToken(env);
  const runId = env.RUN_ID ?? env.GITHUB_RUN_ID;
  const headSha = env.HEAD_SHA ?? env.GITHUB_SHA;
  const version = versionAt(headSha, deps);

  const jobs = await optional("deploy job 정보를 읽지 못했습니다", () =>
    deps.githubGet(`/repos/${repo(env)}/actions/runs/${runId}/jobs`, { token }),
  );
  const job = jobs?.jobs.find((j) => j.name === "deploy");
  // 결과 job이 돌 때 deploy job이 아직 마무리 중이면 종료 시각이 비어 있다.
  const endedAt = job?.completed_at ? new Date(job.completed_at) : new Date();
  const durationSec = job?.started_at ? (endedAt - new Date(job.started_at)) / 1000 : undefined;
  const failedStep = job?.steps?.find((s) => s.conclusion === "failure")?.name;

  // skipped는 앞 단계가 막혀 배포가 일어나지 않은 경우라 취소와 같게 보인다.
  const state = ["success", "failure"].includes(env.DEPLOY_RESULT)
    ? env.DEPLOY_RESULT
    : "cancelled";
  const base = { version, sha: headSha, actor: env.GITHUB_ACTOR, runUrl: runUrl(env, runId) };

  let text;
  let thread = [];
  let release = null;
  let prs = null;
  if (state === "success") {
    const changes = await changesSincePrevious({
      env,
      token,
      runId,
      headSha,
      version,
      deps,
      optional,
    });
    prs = changes.prs;
    const releases = await optional("Release 목록을 읽지 못했습니다", () =>
      deps.githubGetAll(`/repos/${repo(env)}/releases`, null, { token, max: 50 }),
    );
    release = releases && findWebRelease(releases, version);
    text = formatStatusMessage({
      ...base,
      state,
      durationSec,
      release: release && { headings: releaseHeadings(release.body), url: release.html_url },
      prCount: prs?.length,
    });
    thread = formatThread({
      release,
      prs,
      eventDiffText: changes.eventDiffText,
      repoName: repo(env),
    });
  } else if (state === "failure") {
    text = formatStatusMessage({
      ...base,
      state,
      failedStep,
      mention: resolveMention(env.GITHUB_ACTOR, env.SLACK_USER_MAP),
    });
  } else {
    text = formatStatusMessage({ ...base, state });
  }

  const slack = slackConfig(env);
  let parentTs = null;
  if (slack) {
    try {
      // 시작 메시지를 못 올렸으면 결과를 새 메시지로 올린다.
      if (env.SLACK_TS && env.SLACK_TS !== "dry-run") {
        try {
          await deps.updateMessage({ ...slack, ts: env.SLACK_TS, text });
          parentTs = env.SLACK_TS;
        } catch (err) {
          // 시작 메시지가 지워졌어도 채널에 최종 결과는 남아야 한다.
          console.log(`::error::시작 메시지를 고치지 못해 새로 올립니다: ${firstLine(err)}`);
          failed = true;
        }
      }
      parentTs ??= await deps.postMessage({ ...slack, text });
      for (const msg of thread) await deps.postMessage({ ...slack, text: msg, threadTs: parentTs });
    } catch (err) {
      // Slack이 막혀도 Amplitude Release는 따로 남아야 한다.
      console.log(`::error::Slack 알림 실패: ${firstLine(err)}`);
      failed = true;
    }
  }

  if (state !== "success") return failed;
  // DRY_RUN은 키 없이도 보낼 본문을 확인할 수 있어야 한다.
  if (!isDryRun(env) && (!env.AMPLITUDE_API_KEY || !env.AMPLITUDE_SECRET_KEY)) {
    console.log(
      "::warning::AMPLITUDE_API_KEY 또는 AMPLITUDE_SECRET_KEY가 비어 Amplitude Release를 건너뜁니다",
    );
    return failed;
  }
  try {
    await deps.createRelease({
      apiKey: env.AMPLITUDE_API_KEY,
      secretKey: env.AMPLITUDE_SECRET_KEY,
      dryRun: isDryRun(env),
      version: `web/${version}`,
      title: `웹 ${version}`,
      description: releaseDescription({ release, prs }),
      releaseStart: endedAt,
      platforms: ["Web"],
    });
  } catch (err) {
    // Release API에는 수정이 없어 같은 버전이 두 번 생기지 않도록 다시 시도하지 않는다.
    console.log(`::error::${err.message}`);
    failed = true;
    if (slack && parentTs) {
      await optional("Amplitude 실패 경고를 Slack에 올리지 못했습니다", () =>
        deps.postMessage({
          ...slack,
          text: `⚠️ Amplitude Release를 만들지 못했어요: ${escapeSlack(err.message)}`,
          threadTs: parentTs,
        }),
      );
    }
  }
  return failed;
}

async function finish(env) {
  // 워크플로가 continue-on-error라 실패로 끝내도 배포 결과는 바뀌지 않고 로그만 눈에 띈다.
  if (await runFinish(env)) process.exitCode = 1;
}

// 테스트가 이 모듈을 import해도 CLI가 돌지 않도록 직접 실행일 때만 부른다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = { start, finish }[process.argv[2]];
  if (!command) {
    console.error("사용법: node scripts/notify-deploy.mjs start|finish");
    process.exit(1);
  }
  command(process.env).catch((err) => {
    console.log(`::error::배포 알림 실패: ${err.message}`);
    process.exit(1);
  });
}
