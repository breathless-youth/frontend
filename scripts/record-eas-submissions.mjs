/**
 * EAS 스토어 제출의 Slack 알림과 Amplitude Release 기록.
 *
 * 처리한 빌드에는 ios/ 또는 android/ 태그를 달아 처리 표시로 쓴다.
 * 고칠 수 없는 Amplitude Release를 먼저 만들고 바로 태그를 달아, 다음 날 재시도가 Release를 다시 만드는 경우를 태그 push 실패 하나로 줄인다.
 * 크론이라 실패를 숨기지 않고 job을 실패로 끝낸다.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRelease } from "./amplitude-release.mjs";
import { repo } from "./github.mjs";
import { formatKst, isDryRun, postMessage } from "./slack.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const HOUR = 3600 * 1000;
const PLATFORM = { IOS: "iOS", ANDROID: "Android" };
const TRACK = { internal: "내부 테스트", production: "프로덕션" };

/** 처리 표시로 쓰는 태그 이름. */
export function tagName(sub) {
  const b = sub.submittedBuild;
  if (!b?.appVersion || !b?.appBuildVersion) return null;
  return `${sub.platform.toLowerCase()}/${b.appVersion}-${b.appBuildVersion}`;
}

/** 기록할 제출과 경고할 제출의 분류. */
export function classifySubmissions(subs, { now, existingTags, isKnownCommit }) {
  const age = (s) => now - new Date(s.completedAt);
  const byTag = new Map();
  const warnings = [];
  // 처음 켰을 때 예전 제출이 한꺼번에 올라가지 않게 7일 안만 본다.
  for (const sub of subs.filter((s) => s.status === "FINISHED" && age(s) < 7 * 24 * HOUR)) {
    const tag = tagName(sub);
    // 처리 표시를 남길 수 없는 제출은 매일 다시 걸리므로 하루 안에 든 것만 한 번 경고한다.
    const warn = (reason) => age(sub) < 24 * HOUR && warnings.push({ sub, reason });
    if (!tag) {
      warn("local");
      continue;
    }
    if (sub.submittedBuild.buildProfile !== "production" || existingTags.has(tag)) continue;
    if (!isKnownCommit(sub.submittedBuild.gitCommitHash)) {
      warn("unknown-commit");
      continue;
    }
    const prev = byTag.get(tag);
    if (!prev || new Date(sub.completedAt) < new Date(prev.completedAt)) byTag.set(tag, sub);
  }
  const byTime = (a, b) => new Date(a.completedAt) - new Date(b.completedAt);
  return {
    toRecord: [...byTag.values()].sort(byTime),
    warnings: warnings.sort((a, b) => byTime(a.sub, b.sub)),
  };
}

/** Android 트랙의 사람용 이름. */
export function trackLabel(track) {
  return TRACK[track] ?? track;
}

/** EAS 대시보드의 제출 상세 주소. */
export function submissionUrl(sub) {
  return `https://expo.dev/accounts/${sub.app.ownerAccount.name}/projects/${sub.app.slug}/submissions/${sub.id}`;
}

function destination(sub) {
  if (sub.platform === "IOS") return "App Store Connect";
  return `Play ${trackLabel(sub.androidConfig?.track)} 트랙`;
}

function buildLabel(sub) {
  const b = sub.submittedBuild;
  return `${PLATFORM[sub.platform]} ${b.appVersion} (${b.appBuildVersion})`;
}

function shortSha(sub) {
  return sub.submittedBuild.gitCommitHash.slice(0, 7);
}

/** 제출 한 건의 Slack 메시지. */
export function formatSubmission(sub) {
  return (
    `📱 ${buildLabel(sub)} ${destination(sub)}에 제출했어요 · ${formatKst(new Date(sub.completedAt))}\n` +
    `커밋 \`${shortSha(sub)}\` · <${submissionUrl(sub)}|EAS 보기>`
  );
}

/** 기록하지 못한 제출의 Slack 경고. */
export function formatWarning({ sub, reason }) {
  const tail = `${formatKst(new Date(sub.completedAt))} · <${submissionUrl(sub)}|EAS 보기>`;
  if (reason === "local") {
    return (
      `⚠️ ${PLATFORM[sub.platform]} 제출 1건은 로컬 빌드라 버전을 알 수 없어요 · ${tail}\n` +
      `${sub.platform.toLowerCase()}/<버전>-<빌드번호> 태그를 달면 다음부터 자동으로 인식해요`
    );
  }
  return `⚠️ ${buildLabel(sub)} 제출의 커밋 \`${shortSha(sub)}\`이 저장소에 없어 기록하지 못했어요 · ${tail}`;
}

/** 제출 한 건의 Amplitude Release 필드. */
export function releaseFor(sub) {
  return {
    version: tagName(sub),
    title: buildLabel(sub),
    description: `${destination(sub)} 제출 · 커밋 ${shortSha(sub)}`,
    releaseStart: new Date(sub.completedAt),
    platforms: [PLATFORM[sub.platform]],
  };
}

/** eas 자식 프로세스 환경 변수. */
export function easEnv(env) {
  // 외부 패키지를 받아 실행하므로 EXPO_TOKEN 말고 다른 토큰은 넘기지 않는다.
  const { GITHUB_TOKEN, GH_TOKEN, SLACK_BOT_TOKEN, AMPLITUDE_SECRET_KEY, ...rest } = env;
  return rest;
}

/**
 * EAS 제출 목록.
 * 팀이 쓰는 eas-cli 21에는 submit:list가 없어 이 명령만 버전을 고정해 실행한다.
 * eas-cli가 받는 최대 개수가 50이고, 한 주에 몇 건이라 네 주 기준선까지 넉넉하다.
 */
export function listSubmissions() {
  const out = execFileSync(
    "pnpm",
    [
      "dlx",
      "eas-cli@27.7.2",
      "submit:list",
      "--platform",
      "all",
      "--json",
      "--non-interactive",
      "--limit",
      "50",
    ],
    {
      // app.config의 Expo 설정 플러그인을 읽어서 모바일 의존성이 있는 위치에서 돌아야 한다.
      cwd: path.join(ROOT, "apps/mobile"),
      env: easEnv(process.env),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return JSON.parse(out);
}

/** 크론 실패 알림에 붙이는 Actions 실행 링크. */
export function runLink(env) {
  // 로컬에서 돌리면 열어 볼 실행 화면이 없다.
  if (!env.GITHUB_RUN_ID) return "로컬 실행";
  const server = env.GITHUB_SERVER_URL ?? "https://github.com";
  return `<${server}/${repo(env)}/actions/runs/${env.GITHUB_RUN_ID}|실행 보기>`;
}

/** 저장소 루트에서 실행한 git 명령의 출력. */
export function git(...args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  } catch (err) {
    // 실패 메시지에 명령줄이 그대로 들어가 인증 헤더가 로그에 남지 않게 가린다.
    err.message = err.message.replace(/(extraheader=AUTHORIZATION: basic )\S+/g, "$1***");
    throw err;
  }
}

// 체크아웃이 쓰기 토큰을 git 설정에 남기지 않아 태그 push에만 인증을 붙인다.
function pushArgs(tag, token) {
  if (!token) return ["push", "origin", tag];
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return [
    "-c",
    `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`,
    "push",
    "origin",
    tag,
  ];
}

function remoteTags(git) {
  const out = git("ls-remote", "--tags", "origin", "ios/*", "android/*");
  // annotated 태그는 가리키는 커밋 줄이 ^{} 접미로 한 번 더 나온다.
  return new Set(
    out
      .split("\n")
      .filter(Boolean)
      .map((line) =>
        line
          .split("\t")[1]
          .replace(/^refs\/tags\//, "")
          .replace(/\^\{\}$/, ""),
      ),
  );
}

function isKnownCommit(sha) {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function record(sub, { env, slack, dryRun, deps }) {
  const release = releaseFor(sub);
  await deps.createRelease({
    apiKey: env.AMPLITUDE_API_KEY,
    secretKey: env.AMPLITUDE_SECRET_KEY,
    dryRun,
    ...release,
  });
  const tagArgs = ["tag", "-a", release.version, sub.submittedBuild.gitCommitHash];
  const message = `${release.title} 스토어 제출`;
  if (dryRun) {
    console.log(`git ${tagArgs.join(" ")} -m "${message}"`);
    console.log(`git push origin ${release.version}`);
  } else {
    try {
      deps.git(...tagArgs, "-m", message);
      deps.git(...pushArgs(release.version, env.GITHUB_TOKEN));
    } catch (err) {
      // Slack까지 보내면 다음 날 재시도 때 같은 제출 알림이 한 번 더 올라간다.
      err.releaseWithoutTag = true;
      throw err;
    }
  }
  await deps.postMessage({ ...slack, text: formatSubmission(sub) });
}

const defaultDeps = {
  listSubmissions,
  git,
  isKnownCommit,
  createRelease,
  postMessage,
  now: () => new Date(),
};

/** 새 제출을 기록하고 기록이나 경고에 실패한 건수를 돌려준다. */
export async function recordSubmissions(env, deps = defaultDeps) {
  const dryRun = isDryRun(env);
  if (!dryRun && (!env.SLACK_BOT_TOKEN || !env.SLACK_DEPLOY_CHANNEL_ID)) {
    throw new Error("SLACK_BOT_TOKEN 또는 SLACK_DEPLOY_CHANNEL_ID가 비어 있습니다");
  }
  // 태그가 처리 완료 표시라 키 없이 진행하면 그 제출의 Release를 다시 만들 수 없다.
  if (!dryRun && (!env.AMPLITUDE_API_KEY || !env.AMPLITUDE_SECRET_KEY)) {
    throw new Error("AMPLITUDE_API_KEY 또는 AMPLITUDE_SECRET_KEY가 비어 있습니다");
  }
  // DRY_RUN은 시크릿 없이도 보낼 본문을 확인할 수 있어야 한다.
  const slack = {
    token: env.SLACK_BOT_TOKEN,
    channel: env.SLACK_DEPLOY_CHANNEL_ID || "dry-run",
    dryRun,
  };

  const { toRecord, warnings } = classifySubmissions(deps.listSubmissions(), {
    now: deps.now(),
    existingTags: remoteTags(deps.git),
    isKnownCommit: deps.isKnownCommit,
  });
  console.log(`기록할 제출 ${toRecord.length}건, 경고 ${warnings.length}건`);

  let failed = 0;
  const untagged = [];
  for (const sub of toRecord) {
    try {
      await record(sub, { env, slack, dryRun, deps });
    } catch (err) {
      // 한 제출이 막혀도 나머지 제출은 오늘 기록되어야 한다.
      console.log(`::error::${tagName(sub)} 기록 실패: ${err.message.split("\n")[0]}`);
      failed++;
      if (err.releaseWithoutTag) untagged.push(tagName(sub));
    }
  }
  for (const w of warnings) {
    try {
      await deps.postMessage({ ...slack, text: formatWarning(w) });
    } catch (err) {
      // 경고 하나가 막혀도 나머지 경고와 실패 알림은 올라가야 한다.
      console.log(`::error::제출 경고를 올리지 못했습니다: ${err.message.split("\n")[0]}`);
      failed++;
    }
  }

  if (failed) {
    const duplicate = untagged.length
      ? ` · ${untagged.join(", ")} 태그를 달지 못해 내일 Amplitude Release가 한 번 더 생길 수 있어요`
      : "";
    await deps.postMessage({ ...slack, text: `⚠️ EAS 기록 실패${duplicate} · ${runLink(env)}` });
  }
  return failed;
}

// 테스트가 이 모듈을 import해도 CLI가 돌지 않도록 직접 실행일 때만 부른다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  recordSubmissions(process.env)
    .then((failed) => {
      if (failed) process.exitCode = 1;
    })
    .catch((err) => {
      console.log(`::error::EAS 기록 실패: ${err.message}`);
      process.exit(1);
    });
}
