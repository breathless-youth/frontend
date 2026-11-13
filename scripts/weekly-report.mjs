/**
 * 지난주 운영 배포·CI·앱 제출 지표의 Slack 주간 보고.
 *
 * --baseline이면 같은 계산을 정해 둔 네 주에 돌려 기준선 파일로 남긴다.
 * 실행 기록이 보관 기간을 넘어 사라져도 기준선이 바뀌지 않게 하려는 것이다.
 * 크론이라 실패를 숨기지 않고 job을 실패로 끝낸다.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { githubGet, githubGetAll, githubToken, repo } from "./github.mjs";
import { parseMergedPrs } from "./notify-deploy.mjs";
import { listSubmissions, runLink, tagName } from "./record-eas-submissions.mjs";
import { formatDuration, formatKstDate, isDryRun, postMessage } from "./slack.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const BASELINE_FILE = path.join(ROOT, "scripts/release-metrics-baseline.json");
const BASELINE_RANGE = {
  start: new Date("2026-10-12T00:00:00+09:00"),
  end: new Date("2026-11-09T00:00:00+09:00"),
};
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const KST_OFFSET = 9 * HOUR;

/** now가 속한 주(KST) 바로 앞의 월요일 00시부터 다음 월요일 00시까지. */
export function previousWeek(now) {
  const kst = new Date(now.getTime() + KST_OFFSET);
  const daysSinceMonday = (kst.getUTCDay() + 6) % 7;
  const thisMonday =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - daysSinceMonday) -
    KST_OFFSET;
  return { start: new Date(thisMonday - 7 * DAY), end: new Date(thisMonday) };
}

/** 중앙값. */
export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const inRange = (date, { start, end }) => new Date(date) >= start && new Date(date) < end;
const seconds = (from, to) => (new Date(to) - new Date(from)) / 1000;

// 취소와 skipped는 코드 품질과 무관해서 실패율 분모에 넣지 않는다.
function failureRate(runs) {
  const done = runs.filter((r) => r.conclusion === "success" || r.conclusion === "failure");
  if (!done.length) return null;
  return done.filter((r) => r.conclusion === "failure").length / done.length;
}

/**
 * 운영 웹 배포 수, 실패 수, 실패율, 실패 뒤 다음 실행까지 걸린 시간.
 * attempts는 실행마다 재실행한 앞 시도까지 펼친 목록이다.
 */
export function deployMetrics(attempts, range) {
  // 재실행한 시도는 실행 생성 시각이 첫 시도와 같아서 시작 시각으로 줄 세운다.
  const started = (r) => new Date(r.run_started_at);
  const sorted = [...attempts].sort((a, b) => started(a) - started(b));
  const inside = sorted.filter((r) => inRange(r.run_started_at, range));
  const failures = inside.filter((r) => r.conclusion === "failure");
  const gaps = [];
  for (const f of failures) {
    // 다음 실행은 범위 밖이어도 되도록 받아 둔 전체 목록에서 찾는다.
    const next = sorted.find((r) => started(r) > started(f));
    // 실패가 끝나기 전에 시작한 실행은 기다린 시간이 없으므로 0으로 본다.
    if (next) gaps.push(Math.max(0, seconds(f.updated_at, next.run_started_at)));
  }
  return {
    deploys: inside.filter((r) => r.conclusion === "success").length,
    failures: failures.length,
    failureRate: failureRate(inside),
    failureToNextSec: median(gaps),
  };
}

/** PR 머지부터 그 PR이 든 운영 배포가 끝나기까지의 중앙값(초). */
export function leadTimeSec(deploys) {
  return median(deploys.flatMap((d) => d.prs.map((pr) => seconds(pr.mergedAt, d.finishedAt))));
}

/** PR CI 실패율과 평균 시간. */
export function ciMetrics(runs, range) {
  const inside = runs.filter((r) => inRange(r.created_at, range));
  const done = inside.filter((r) => r.conclusion === "success" || r.conclusion === "failure");
  return {
    ciFailureRate: failureRate(inside),
    ciAvgDurationSec: done.length
      ? done.reduce((sum, r) => sum + seconds(r.run_started_at, r.updated_at), 0) / done.length
      : null,
  };
}

/** 범위 안에 끝난 production 제출 수(같은 빌드는 한 번). */
export function appSubmissionCounts(subs, range) {
  const tags = new Set(
    subs
      .filter(
        (s) =>
          s.status === "FINISHED" &&
          s.submittedBuild?.buildProfile === "production" &&
          inRange(s.completedAt, range),
      )
      .map(tagName)
      .filter(Boolean),
  );
  const count = (prefix) => [...tags].filter((t) => t.startsWith(prefix)).length;
  return { ios: count("ios/"), android: count("android/") };
}

const num = (v) => String(Math.round(v * 10) / 10);
const pct = (v) => (v == null ? "없음" : `${Math.round(v * 100)}%`);
const dur = (v) => (v == null ? "없음" : formatDuration(v));
const apps = (v) => (v == null ? "확인 못 함" : `iOS ${num(v.ios)} · Android ${num(v.android)}`);

/** 주간 보고 Slack 메시지. */
export function formatWeeklyReport(metrics, baseline, range) {
  const dates = `${formatKstDate(range.start)}~${formatKstDate(new Date(range.end - 1))}`;
  const line = (label, value, fmt = value) =>
    `${label}  ${value(metrics)}${baseline ? ` (${fmt(baseline)})` : ""}`;
  return [
    `📈 지난주 배포 지표 (${dates})${baseline ? " · 괄호는 기준선" : ""}`,
    line("운영 웹 배포", (m) => `${num(m.deploysPerWeek)}회`),
    line("배포 실패율", (m) => pct(m.failureRate)),
    line(
      "PR→운영 리드타임",
      (m) => (m.leadTimeSec == null ? "없음" : `중앙값 ${formatDuration(m.leadTimeSec)}`),
      (m) => dur(m.leadTimeSec),
    ),
    line("실패→다음 실행", (m) => {
      if (m.failureToNextSec != null) return formatDuration(m.failureToNextSec);
      // 실패 뒤 아직 다시 돌지 않은 경우를 실패가 없던 주와 섞지 않는다.
      return m.failures ? "다음 실행 없음" : "실패 없음";
    }),
    line("PR CI 실패율", (m) => pct(m.ciFailureRate)),
    line("PR CI 평균 시간", (m) => dur(m.ciAvgDurationSec)),
    line("앱 제출", (m) => apps(m.appSubmissionsPerWeek)),
  ].join("\n");
}

/** 필터를 건 실행 목록이 검색 상한에 닿지 않았는지 확인한 목록. */
export function checkSearchCap(runs) {
  // created 같은 필터를 건 실행 목록은 GitHub가 1000건까지만 줘서 그 이상은 지표가 조용히 틀린다.
  if (runs.length >= 1000) {
    throw new Error("GitHub API 검색 상한 1000건에 닿아 지표가 잘렸을 수 있습니다");
  }
  return runs;
}

// GitHub 실행 목록 필터는 밀리초 없는 ISO 시각을 받는다.
const iso = (d) => `${d.toISOString().slice(0, 19)}Z`;

async function collect(env, range, weeks) {
  const token = githubToken(env);
  // 범위 첫 배포가 담은 PR을 찾으려면 그 앞 성공 배포가 필요해 8일 전부터 받는다.
  const since = encodeURIComponent(`>=${iso(new Date(range.start - 8 * DAY))}`);
  const deployRuns = checkSearchCap(
    await githubGetAll(
      `/repos/${repo(env)}/actions/workflows/deploy-web.yml/runs?branch=main&created=${since}`,
      "workflow_runs",
      { token },
    ),
  );
  const successes = deployRuns
    .filter((r) => r.conclusion === "success")
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const deploys = [];
  successes.forEach((r, i) => {
    if (i === 0 || !inRange(r.created_at, range)) return;
    const log = execFileSync(
      "git",
      [
        "log",
        "--merges",
        "--format=%H%x1f%s%x1f%cI%x1f%b%x1e",
        `${successes[i - 1].head_sha}..${r.head_sha}`,
      ],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    deploys.push({ finishedAt: new Date(r.updated_at), prs: parseMergedPrs(log) });
  });

  // 실행 목록은 마지막 시도만 보여 줘서 실패 뒤 다시 돌려 성공한 배포의 실패가 사라진다.
  const earlierAttempts = [];
  for (const r of deployRuns) {
    for (let n = 1; n < (r.run_attempt ?? 1); n++) {
      earlierAttempts.push(
        await githubGet(`/repos/${repo(env)}/actions/runs/${r.id}/attempts/${n}`, { token }),
      );
    }
  }

  const ciRuns = checkSearchCap(
    await githubGetAll(
      `/repos/${repo(env)}/actions/workflows/ci.yml/runs?event=pull_request&created=${iso(range.start)}..${iso(range.end)}`,
      "workflow_runs",
      { token },
    ),
  );

  let counts = null;
  try {
    counts = appSubmissionCounts(listSubmissions(), range);
  } catch (err) {
    // 앱 제출을 못 세도 나머지 지표는 올리고 job만 실패로 끝낸다.
    console.log(`::error::EAS 제출 목록을 읽지 못했습니다: ${err.message.split("\n")[0]}`);
  }

  const d = deployMetrics([...deployRuns, ...earlierAttempts], range);
  return {
    metrics: {
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      weeks,
      deploysPerWeek: d.deploys / weeks,
      failures: d.failures,
      failureRate: d.failureRate,
      leadTimeSec: leadTimeSec(deploys),
      failureToNextSec: d.failureToNextSec,
      ...ciMetrics(ciRuns, range),
      appSubmissionsPerWeek: counts && { ios: counts.ios / weeks, android: counts.android / weeks },
    },
    appFailed: !counts,
  };
}

function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function main(env, baselineMode) {
  if (baselineMode) {
    const { metrics, appFailed } = await collect(env, BASELINE_RANGE, 4);
    const json = `${JSON.stringify(metrics, null, 2)}\n`;
    fs.writeFileSync(BASELINE_FILE, json);
    console.log(json);
    if (appFailed) process.exit(1);
    return;
  }

  const dryRun = isDryRun(env);
  if (!dryRun && (!env.SLACK_BOT_TOKEN || !env.SLACK_DEPLOY_CHANNEL_ID)) {
    throw new Error("SLACK_BOT_TOKEN 또는 SLACK_DEPLOY_CHANNEL_ID가 비어 있습니다");
  }
  // DRY_RUN은 시크릿 없이도 보낼 본문을 확인할 수 있어야 한다.
  const slack = {
    token: env.SLACK_BOT_TOKEN,
    channel: env.SLACK_DEPLOY_CHANNEL_ID || "dry-run",
    dryRun,
  };
  try {
    const range = previousWeek(new Date());
    const { metrics, appFailed } = await collect(env, range, 1);
    await postMessage({ ...slack, text: formatWeeklyReport(metrics, readBaseline(), range) });
    if (appFailed) process.exit(1);
  } catch (err) {
    console.log(`::error::주간 보고 실패: ${err.message}`);
    await postMessage({
      ...slack,
      text: `⚠️ 주간 배포 지표를 만들지 못했어요 · ${runLink(env)}`,
    });
    process.exit(1);
  }
}

// 테스트가 이 모듈을 import해도 CLI가 돌지 않도록 직접 실행일 때만 부른다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.env, process.argv.includes("--baseline")).catch((err) => {
    console.log(`::error::주간 보고 실패: ${err.message}`);
    process.exit(1);
  });
}
