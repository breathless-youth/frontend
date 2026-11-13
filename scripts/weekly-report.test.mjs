import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appSubmissionCounts,
  ciMetrics,
  deployMetrics,
  formatWeeklyReport,
  leadTimeSec,
  median,
  previousWeek,
} from "./weekly-report.mjs";

const range = previousWeek(new Date("2026-11-09T00:30:00Z")); // 11/09(월) 09:30 KST

describe("previousWeek", () => {
  it("직전 월요일 00시 KST부터 7일이다", () => {
    assert.equal(range.start.toISOString(), "2026-11-01T15:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-11-08T15:00:00.000Z");
  });
  it("일요일 23:59 KST에 돌면 그 전 주다", () => {
    assert.equal(
      previousWeek(new Date("2026-11-08T14:59:00Z")).start.toISOString(),
      "2026-10-25T15:00:00.000Z",
    );
  });
});

describe("median", () => {
  it("홀수 개", () => assert.equal(median([3, 1, 2]), 2));
  it("짝수 개는 가운데 평균", () => assert.equal(median([1, 2, 3, 4]), 2.5));
  it("빈 배열은 null", () => assert.equal(median([]), null));
});

const run = (id, conclusion, created, ended) => ({
  id,
  conclusion,
  created_at: created,
  run_started_at: created,
  updated_at: ended,
  head_sha: `s${id}`,
});

describe("deployMetrics", () => {
  const runs = [
    run(1, "success", "2026-11-03T01:00:00Z", "2026-11-03T01:04:00Z"),
    run(2, "failure", "2026-11-04T01:00:00Z", "2026-11-04T01:03:00Z"),
    run(3, "success", "2026-11-04T01:45:00Z", "2026-11-04T01:49:00Z"),
    run(4, "cancelled", "2026-11-05T01:00:00Z", "2026-11-05T01:01:00Z"),
    run(5, "success", "2026-11-10T01:00:00Z", "2026-11-10T01:04:00Z"),
  ];
  it("배포 수, 실패율(취소 제외), 실패→다음 실행", () => {
    assert.deepEqual(deployMetrics(runs, range), {
      deploys: 2,
      failures: 1,
      failureRate: 1 / 3,
      failureToNextSec: 42 * 60,
    });
  });
  it("실패가 없으면 null", () => {
    const m = deployMetrics([runs[0]], range);
    assert.equal(m.failureToNextSec, null);
    assert.equal(m.failures, 0);
  });
  it("실패 뒤 다음 실행이 없으면 실패 수는 남고 시간은 null이다", () => {
    const m = deployMetrics(runs.slice(0, 2), range);
    assert.equal(m.failures, 1);
    assert.equal(m.failureToNextSec, null);
  });
  it("같은 실행을 다시 돌린 시도는 앞 시도의 끝부터 다음 시도의 시작까지다", () => {
    // 재실행한 시도는 실행 생성 시각이 첫 시도와 같다.
    const first = run(7, "failure", "2026-11-04T01:00:00Z", "2026-11-04T01:03:00Z");
    const retry = { ...first, conclusion: "success", run_started_at: "2026-11-04T02:00:00Z" };
    retry.updated_at = "2026-11-04T02:04:00Z";
    assert.deepEqual(deployMetrics([retry, first], range), {
      deploys: 1,
      failures: 1,
      failureRate: 1 / 2,
      failureToNextSec: 57 * 60,
    });
  });
  it("범위는 시도를 시작한 시각으로 정한다", () => {
    const first = run(8, "failure", "2026-10-29T01:00:00Z", "2026-10-29T01:03:00Z");
    const retry = { ...first, conclusion: "success", run_started_at: "2026-11-03T01:00:00Z" };
    assert.deepEqual(deployMetrics([first, retry], range), {
      deploys: 1,
      failures: 0,
      failureRate: 0,
      failureToNextSec: null,
    });
  });
});

describe("leadTimeSec", () => {
  it("PR 머지부터 운영 배포까지의 중앙값", () => {
    const finishedAt = new Date("2026-11-04T10:00:00Z");
    const prs = [
      { mergedAt: new Date("2026-11-04T09:00:00Z") },
      { mergedAt: new Date("2026-11-04T07:00:00Z") },
    ];
    assert.equal(leadTimeSec([{ finishedAt, prs }]), 2 * 3600);
  });
});

describe("ciMetrics", () => {
  it("취소를 빼고 실패율과 평균 시간을 구한다", () => {
    const runs = [
      run(1, "success", "2026-11-03T01:00:00Z", "2026-11-03T01:06:00Z"),
      run(2, "failure", "2026-11-03T02:00:00Z", "2026-11-03T02:08:00Z"),
      run(3, "cancelled", "2026-11-03T03:00:00Z", "2026-11-03T03:01:00Z"),
    ];
    assert.deepEqual(ciMetrics(runs, range), { ciFailureRate: 0.5, ciAvgDurationSec: 420 });
  });
});

describe("appSubmissionCounts", () => {
  const s = (platform, v, b, completedAt) => ({
    status: "FINISHED",
    platform,
    completedAt,
    submittedBuild: {
      appVersion: v,
      appBuildVersion: b,
      buildProfile: "production",
      gitCommitHash: "x",
    },
  });
  it("범위 안 production 제출을 빌드당 한 번 센다", () => {
    const subs = [
      s("IOS", "26.45.1", "19", "2026-11-04T21:01:59Z"),
      s("IOS", "26.45.1", "19", "2026-11-04T22:00:00Z"),
      s("ANDROID", "26.45.1", "23", "2026-11-04T21:01:00Z"),
      s("IOS", "26.46.0", "23", "2026-11-11T16:42:22Z"),
    ];
    assert.deepEqual(appSubmissionCounts(subs, range), { ios: 1, android: 1 });
  });
});

describe("formatWeeklyReport", () => {
  const m = {
    weeks: 1,
    deploysPerWeek: 7,
    failureRate: 0,
    leadTimeSec: 19 * 3600,
    failureToNextSec: null,
    ciFailureRate: 0.12,
    ciAvgDurationSec: 400,
    appSubmissionsPerWeek: { ios: 1, android: 1 },
  };
  const b = {
    ...m,
    weeks: 4,
    deploysPerWeek: 5.5,
    failureRate: 0.04,
    leadTimeSec: 31 * 3600,
    failureToNextSec: 2520,
    ciFailureRate: 0.15,
    ciAvgDurationSec: 430,
    appSubmissionsPerWeek: { ios: 1.25, android: 1.5 },
  };
  it("기준선과 나란히 쓴다", () => {
    assert.equal(
      formatWeeklyReport(m, b, range),
      [
        "📈 지난주 배포 지표 (11/02~11/08) · 괄호는 기준선",
        "운영 웹 배포  7회 (5.5회)",
        "배포 실패율  0% (4%)",
        "PR→운영 리드타임  중앙값 19시간 0분 (31시간 0분)",
        "실패→다음 실행  실패 없음 (42분 0초)",
        "PR CI 실패율  12% (15%)",
        "PR CI 평균 시간  6분 40초 (7분 10초)",
        "앱 제출  iOS 1 · Android 1 (iOS 1.3 · Android 1.5)",
      ].join("\n"),
    );
  });
  it("실패했는데 다음 실행이 없으면 실패 없음과 구분한다", () => {
    assert.match(
      formatWeeklyReport(
        { ...m, failures: 1 },
        { ...b, failures: 0, failureToNextSec: null },
        range,
      ),
      /\n실패→다음 실행  다음 실행 없음 \(실패 없음\)\n/,
    );
  });
  it("기준선이 없으면 괄호를 뺀다", () => {
    assert.match(
      formatWeeklyReport(m, null, range),
      /^📈 지난주 배포 지표 \(11\/02~11\/08\)\n운영 웹 배포  7회\n/,
    );
  });
});
