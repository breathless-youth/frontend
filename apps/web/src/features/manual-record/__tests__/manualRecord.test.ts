import { afterEach, describe, expect, it } from "vitest";

import type { StudySessionSummary, SubjectRef } from "@focusmakers/types";

import i18n from "@/lib/i18n";

import { mockDeviceTimeZone } from "@/test/deviceTimeZone";

import {
  applyChip,
  bundleMayContinue,
  bundleOf,
  bundleSpan,
  cellTapTarget,
  clockOf,
  daysAgo,
  defaultSpan,
  endsNextDay,
  manualBundles,
  othersForOverlap,
  overlapNotice,
  reachedNow,
  readAloudLabel,
  spanFromClocks,
  subjectNameOf,
  trimOverlaps,
  validateSpan,
} from "../manualRecord";

const DAY = "2026-10-15";
const NEXT = "2026-10-16";
const pad = (value: number) => String(value).padStart(2, "0");
/** KST 벽시계 → epoch ms. */
const at = (day: string, hour: number, minute = 0, second = 0) =>
  Date.parse(`${day}T${pad(hour)}:${pad(minute)}:${pad(second)}+09:00`);
const iso = (ms: number) => new Date(ms).toISOString();
const span = (startMs: number, endMs: number) => ({ startMs, endMs });

function measured(id: number, startMs: number, endMs: number): StudySessionSummary {
  const sec = (endMs - startMs) / 1000;
  return {
    id,
    statDate: DAY,
    startedAt: iso(startMs),
    endedAt: iso(endMs),
    studySec: sec,
    focusSec: sec,
    focusRate: 100,
    eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    events: [],
    subjectSegments: [],
  };
}

function manual(
  id: number,
  startMs: number,
  endMs: number,
  keyMs: number | null = startMs,
): StudySessionSummary {
  return {
    ...measured(id, startMs, endMs),
    source: "MANUAL",
    ...(keyMs === null ? {} : { submissionStartedAt: iso(keyMs) }),
  };
}

describe("defaultSpan", () => {
  it("오늘은 지금(분 단위 내림)에서 끝나고 1시간 전에 시작한다", () => {
    expect(
      defaultSpan({ dateKey: DAY, todayKey: DAY, nowMs: at(DAY, 15, 42, 30), sessions: [] }),
    ).toEqual(span(at(DAY, 14, 42), at(DAY, 15, 42)));
  });

  it("오늘 마지막 기록이 1시간 전보다 늦게 끝났으면 그 종료(분 단위 올림)에서 시작한다", () => {
    const sessions = [measured(1, at(DAY, 14), at(DAY, 15, 10, 20))];
    expect(
      defaultSpan({ dateKey: DAY, todayKey: DAY, nowMs: at(DAY, 15, 42, 30), sessions }),
    ).toEqual(span(at(DAY, 15, 11), at(DAY, 15, 42)));
  });

  it("오늘 시작은 그날 00:00보다 앞서지 않는다", () => {
    expect(
      defaultSpan({ dateKey: DAY, todayKey: DAY, nowMs: at(DAY, 0, 20), sessions: [] }),
    ).toEqual(span(at(DAY, 0, 0), at(DAY, 0, 20)));
  });

  it("지난 날에 기록이 없으면 09:00부터 1시간이다", () => {
    expect(
      defaultSpan({
        dateKey: DAY,
        todayKey: "2026-10-20",
        nowMs: at("2026-10-20", 12),
        sessions: [],
      }),
    ).toEqual(span(at(DAY, 9), at(DAY, 10)));
  });

  it("지난 날은 그날 마지막 기록 종료부터 1시간이고, 다음 날 기록은 보지 않는다", () => {
    const sessions = [
      measured(1, at(DAY, 20), at(DAY, 21, 30)),
      manual(2, at(NEXT, 8), at(NEXT, 9)),
    ];
    expect(
      defaultSpan({ dateKey: DAY, todayKey: "2026-10-20", nowMs: at("2026-10-20", 12), sessions }),
    ).toEqual(span(at(DAY, 21, 30), at(DAY, 22, 30)));
  });

  it("오늘 마지막 기록이 지금과 같은 분에 끝났어도 시작이 종료를 넘지 않는다", () => {
    const sessions = [measured(1, at(DAY, 14), at(DAY, 15, 42, 20))];
    const result = defaultSpan({
      dateKey: DAY,
      todayKey: DAY,
      nowMs: at(DAY, 15, 42, 30),
      sessions,
    });
    expect(result).toEqual(span(at(DAY, 15, 42), at(DAY, 15, 42)));
    expect(result.startMs).toBeLessThanOrEqual(result.endMs);
  });

  it("지난 날 마지막 기록이 다음 날 00:00에 끝났으면 23:59에서 시작해 날짜를 넘기지 않는다", () => {
    const sessions = [manual(1, at(DAY, 23), at(NEXT, 0))];
    expect(
      defaultSpan({ dateKey: DAY, todayKey: "2026-10-20", nowMs: at("2026-10-20", 12), sessions }),
    ).toEqual(span(at(DAY, 23, 59), at(NEXT, 0, 59)));
  });

  it("어제는 1시간이 지금을 넘으면 지금에서 끝난다", () => {
    const sessions = [manual(1, at(DAY, 23), at(DAY, 23, 50))];
    expect(defaultSpan({ dateKey: DAY, todayKey: NEXT, nowMs: at(NEXT, 0, 20), sessions })).toEqual(
      span(at(DAY, 23, 50), at(NEXT, 0, 20)),
    );
  });

  it("빈 칸 탭은 칸 시각부터 1시간이되 다음 기록 시작이나 지금이 더 이르면 거기까지다", () => {
    const sessions = [measured(1, at(DAY, 14, 40), at(DAY, 15))];
    const base = { dateKey: DAY, todayKey: DAY, cellStartMs: at(DAY, 14) };

    expect(defaultSpan({ ...base, nowMs: at(DAY, 20), sessions })).toEqual(
      span(at(DAY, 14), at(DAY, 14, 40)),
    );
    expect(defaultSpan({ ...base, nowMs: at(DAY, 20), sessions: [] })).toEqual(
      span(at(DAY, 14), at(DAY, 15)),
    );
    expect(defaultSpan({ ...base, nowMs: at(DAY, 14, 25, 10), sessions: [] })).toEqual(
      span(at(DAY, 14), at(DAY, 14, 25)),
    );
  });
});

describe("validateSpan", () => {
  it("1분 미만(시작 = 종료 포함)은 too-short다", () => {
    expect(validateSpan(span(at(DAY, 14), at(DAY, 14)), at(DAY, 20))).toBe("too-short");
    expect(validateSpan(span(at(DAY, 14), at(DAY, 14, 1)), at(DAY, 20))).toBeNull();
  });

  it("종료가 지금 이후면 future이고 지금과 같으면 통과한다", () => {
    expect(validateSpan(span(at(DAY, 15), at(DAY, 16)), at(DAY, 15, 59, 59))).toBe("future");
    expect(validateSpan(span(at(DAY, 15), at(DAY, 16)), at(DAY, 16))).toBeNull();
  });
});

describe("spanFromClocks", () => {
  it("종료가 시작보다 이르면 다음 날 새벽으로 읽는다", () => {
    const crossed = spanFromClocks(DAY, "23:00", "01:00");
    expect(crossed).toEqual(span(at(DAY, 23), at(NEXT, 1)));
    expect(endsNextDay(crossed, DAY)).toBe(true);
  });

  it("같은 시각은 길이 0이고 다음 날로 넘기지 않는다", () => {
    const same = spanFromClocks(DAY, "14:00", "14:00");
    expect(same).toEqual(span(at(DAY, 14), at(DAY, 14)));
    expect(endsNextDay(same, DAY)).toBe(false);
  });
});

describe("기기 시간대가 뉴욕일 때", () => {
  it("서머타임이 시작하는 날의 입력칸 시각은 현지 벽시계다", () => {
    mockDeviceTimeZone("America/New_York");
    // 02:00 EST가 03:00 EDT로 건너뛰어 01:00~04:00은 2시간이다.
    expect(spanFromClocks("2026-03-08", "01:00", "04:00")).toEqual(
      span(Date.parse("2026-03-08T01:00:00-05:00"), Date.parse("2026-03-08T04:00:00-04:00")),
    );
  });

  it("없는 시각을 넣으면 앞으로 민 시각으로 저장하고 다시 열어도 그 시각이다", () => {
    mockDeviceTimeZone("America/New_York");
    const stored = spanFromClocks("2026-03-08", "02:30", "04:00");
    expect(stored).toEqual(
      span(Date.parse("2026-03-08T03:30:00-04:00"), Date.parse("2026-03-08T04:00:00-04:00")),
    );
    expect([clockOf(stored.startMs), clockOf(stored.endMs)]).toEqual(["03:30", "04:00"]);
    expect(spanFromClocks("2026-03-08", clockOf(stored.startMs), clockOf(stored.endMs))).toEqual(
      stored,
    );
  });

  it("두 번 오는 시각은 먼저 오는 쪽으로 저장하고 다시 열어도 그 시각이다", () => {
    mockDeviceTimeZone("America/New_York");
    const stored = spanFromClocks("2026-11-01", "01:30", "03:00");
    expect(stored).toEqual(
      span(Date.parse("2026-11-01T01:30:00-04:00"), Date.parse("2026-11-01T03:00:00-05:00")),
    );
    expect([clockOf(stored.startMs), clockOf(stored.endMs)]).toEqual(["01:30", "03:00"]);
    expect(spanFromClocks("2026-11-01", clockOf(stored.startMs), clockOf(stored.endMs))).toEqual(
      stored,
    );
  });

  describe("두 번 오는 1시대에도 입력칸 값으로 다시 읽으면 같은 구간이다", () => {
    const KEY = "2026-11-01";
    const reread = (value: { startMs: number; endMs: number }) =>
      spanFromClocks(KEY, clockOf(value.startMs), clockOf(value.endMs));

    it("칸에서 연 기본 구간은 벽시계로 1시간이다", () => {
      mockDeviceTimeZone("America/New_York");
      const value = defaultSpan({
        dateKey: KEY,
        todayKey: "2026-11-02",
        nowMs: Date.parse("2026-11-02T12:00:00-05:00"),
        sessions: [],
        cellStartMs: Date.parse("2026-11-01T01:30:00-04:00"),
      });
      expect(value).toEqual(
        span(Date.parse("2026-11-01T01:30:00-04:00"), Date.parse("2026-11-01T02:30:00-05:00")),
      );
      expect(reread(value)).toEqual(value);
    });

    it("지금이 두 번째 1시대여도 오늘 기본 구간은 입력칸 값 그대로다", () => {
      mockDeviceTimeZone("America/New_York");
      const value = defaultSpan({
        dateKey: KEY,
        todayKey: KEY,
        nowMs: Date.parse("2026-11-01T01:20:00-05:00"),
        sessions: [],
      });
      expect([clockOf(value.startMs), clockOf(value.endMs)]).toEqual(["00:20", "01:20"]);
      expect(reread(value)).toEqual(value);
    });

    it("길이 칩은 벽시계로 더한다", () => {
      mockDeviceTimeZone("America/New_York");
      const value = applyChip(
        span(Date.parse("2026-11-01T01:00:00-04:00"), Date.parse("2026-11-01T01:30:00-04:00")),
        30,
        Date.parse("2026-11-02T12:00:00-05:00"),
      );
      expect([clockOf(value.startMs), clockOf(value.endMs)]).toEqual(["01:00", "02:00"]);
      expect(reread(value)).toEqual(value);
    });
  });

  it("서머타임이 끝나는 날 밤을 넘기면 다음 날 현지 새벽으로 읽는다", () => {
    mockDeviceTimeZone("America/New_York");
    const crossed = spanFromClocks("2026-11-01", "23:00", "01:00");
    expect(crossed).toEqual(
      span(Date.parse("2026-11-01T23:00:00-05:00"), Date.parse("2026-11-02T01:00:00-05:00")),
    );
    expect(endsNextDay(crossed, "2026-11-01")).toBe(true);
  });

  it("23시간인 날은 다음 날 현지 자정부터 다음 날이다", () => {
    mockDeviceTimeZone("America/New_York");
    const start = Date.parse("2026-03-08T22:00:00-04:00");
    expect(endsNextDay(span(start, Date.parse("2026-03-08T23:30:00-04:00")), "2026-03-08")).toBe(
      false,
    );
    expect(endsNextDay(span(start, Date.parse("2026-03-09T00:30:00-04:00")), "2026-03-08")).toBe(
      true,
    );
  });

  it("지난 날에 기록이 없으면 현지 09:00부터 1시간이다", () => {
    mockDeviceTimeZone("America/New_York");
    expect(
      defaultSpan({
        dateKey: "2026-03-08",
        todayKey: "2026-03-10",
        nowMs: Date.parse("2026-03-10T12:00:00-04:00"),
        sessions: [],
      }),
    ).toEqual(
      span(Date.parse("2026-03-08T09:00:00-04:00"), Date.parse("2026-03-08T10:00:00-04:00")),
    );
  });

  it("오늘 날 수는 서머타임을 넘어도 정수다", () => {
    mockDeviceTimeZone("America/New_York");
    expect(daysAgo("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysAgo("2026-10-31", "2026-11-02")).toBe(2);
  });
});

describe("applyChip", () => {
  it("누를 때마다 종료에 더하고, 지금을 넘으면 지금(분 단위 내림)에서 멈춘다", () => {
    const nowMs = at(DAY, 10, 40, 30);
    const first = applyChip(span(at(DAY, 9), at(DAY, 10)), 30, nowMs);
    expect(first).toEqual(span(at(DAY, 9), at(DAY, 10, 30)));
    expect(reachedNow(first, nowMs)).toBe(false);

    const capped = applyChip(first, 60, nowMs);
    expect(capped).toEqual(span(at(DAY, 9), at(DAY, 10, 40)));
    expect(reachedNow(capped, nowMs)).toBe(true);
  });

  it("지난 날 09:00에서 다음 날 08:00까지에 1시간을 더하면 24시간이 되기 전 다음 날 08:59에서 멈춘다", () => {
    const nowMs = at("2026-10-20", 12);
    expect(applyChip(span(at(DAY, 9), at(NEXT, 8)), 60, nowMs)).toEqual(
      span(at(DAY, 9), at(NEXT, 8, 59)),
    );
  });

  it("종료가 24시간 상한에 닿았으면 지금 전이어도 칩을 끈다", () => {
    const nowMs = at("2026-10-20", 12);
    expect(reachedNow(span(at(DAY, 9), at(NEXT, 8, 58)), nowMs)).toBe(false);
    expect(reachedNow(span(at(DAY, 9), at(NEXT, 8, 59)), nowMs)).toBe(true);
  });

  it("23시간인 날을 넘기면 다음 날 같은 벽시계 시각 직전에서 멈춘다", () => {
    mockDeviceTimeZone("America/New_York");
    const startMs = Date.parse("2026-03-07T09:00:00-05:00");
    const capped = applyChip(
      span(startMs, Date.parse("2026-03-08T08:00:00-04:00")),
      120,
      Date.parse("2026-03-20T12:00:00-04:00"),
    );
    // 고정 24시간이면 다음 날 09:59 EDT까지 가서 입력칸에서 같은 날 기록으로 읽힌다.
    expect(capped).toEqual(span(startMs, Date.parse("2026-03-08T08:59:00-04:00")));
    expect(clockOf(capped.endMs)).toBe("08:59");
  });

  it("25시간인 날을 넘기면 다음 날 같은 벽시계 시각 직전까지 간다", () => {
    mockDeviceTimeZone("America/New_York");
    const startMs = Date.parse("2026-10-31T09:00:00-04:00");
    const nowMs = Date.parse("2026-11-20T12:00:00-05:00");
    const capped = applyChip(span(startMs, Date.parse("2026-11-01T08:00:00-05:00")), 120, nowMs);
    expect(capped).toEqual(span(startMs, Date.parse("2026-11-01T08:59:00-05:00")));
    expect(reachedNow(capped, nowMs)).toBe(true);
  });
});

describe("trimOverlaps", () => {
  const whole = span(at(DAY, 9), at(DAY, 11));

  it("가운데 겹침은 빼고 앞뒤 조각을 남긴다", () => {
    expect(trimOverlaps(whole, [span(at(DAY, 9, 30), at(DAY, 10))])).toEqual([
      span(at(DAY, 9), at(DAY, 9, 30)),
      span(at(DAY, 10), at(DAY, 11)),
    ]);
  });

  it("전부 겹치면 남는 조각이 없다", () => {
    expect(trimOverlaps(whole, [span(at(DAY, 8), at(DAY, 12))])).toEqual([]);
  });

  it("끝이 닿기만 한 기록은 겹침이 아니다", () => {
    expect(
      trimOverlaps(whole, [span(at(DAY, 8), at(DAY, 9)), span(at(DAY, 11), at(DAY, 12))]),
    ).toEqual([whole]);
  });

  it("초가 있는 측정 기록과 자르면 경계를 분 단위로 안쪽에 맞춘다", () => {
    expect(trimOverlaps(whole, [span(at(DAY, 9, 30, 20), at(DAY, 10, 0, 40))])).toEqual([
      span(at(DAY, 9), at(DAY, 9, 30)),
      span(at(DAY, 10, 1), at(DAY, 11)),
    ]);
  });

  it("1분 미만으로 남는 조각은 버린다", () => {
    expect(trimOverlaps(whole, [span(at(DAY, 9, 0, 40), at(DAY, 11))])).toEqual([]);
  });
});

describe("overlapNotice", () => {
  it("빠지는 시간·구간과 저장될 길이를 명세 문구 꼴로 적는다", () => {
    const requested = span(at(DAY, 13, 30), at(DAY, 15, 30));
    const pieces = trimOverlaps(requested, [span(at(DAY, 14, 30), at(DAY, 15))]);
    expect(overlapNotice(requested, pieces)).toBe(
      "이미 기록된 30분(14:30~15:00)은 제외하고 1시간 30분을 저장해요",
    );
  });

  it("겹침이 여럿이면 합과 가장 이른 구간 하나를 적는다", () => {
    const requested = span(at(DAY, 9), at(DAY, 12));
    const pieces = trimOverlaps(requested, [
      span(at(DAY, 11), at(DAY, 11, 20)),
      span(at(DAY, 9, 30), at(DAY, 10)),
    ]);
    expect(overlapNotice(requested, pieces)).toBe(
      "이미 기록된 50분(09:30~10:00)은 제외하고 2시간 10분을 저장해요",
    );
  });

  it("앞쪽이 겹치면 시작부터 첫 조각까지를 적는다", () => {
    const requested = span(at(DAY, 9), at(DAY, 11));
    const pieces = trimOverlaps(requested, [span(at(DAY, 8), at(DAY, 9, 30))]);
    expect(overlapNotice(requested, pieces)).toBe(
      "이미 기록된 30분(09:00~09:30)은 제외하고 1시간 30분을 저장해요",
    );
  });

  it("겹침이 없거나 전부 겹치면 안내가 없다(전부 겹침은 시트가 따로 막는다)", () => {
    const requested = span(at(DAY, 9), at(DAY, 11));
    expect(overlapNotice(requested, [requested])).toBeNull();
    expect(overlapNotice(requested, [])).toBeNull();
    expect(i18n.t("manual-record:message.allOverlap")).toBe("이미 기록이 있는 시간이에요");
  });
});

describe("묶음", () => {
  const before = manual(1, at(DAY, 23), at(NEXT, 0), at(DAY, 23));
  const after = manual(2, at(NEXT, 0), at(NEXT, 1), at(DAY, 23));
  const other = manual(3, at(NEXT, 2), at(NEXT, 3));
  const sensor = measured(4, at(NEXT, 5), at(NEXT, 6));
  const sessions = [before, after, other, sensor];

  it("같은 키의 수동 조각을 시작 순으로 모은다", () => {
    expect(bundleOf(sessions, 2).map((piece) => piece.id)).toEqual([1, 2]);
    expect(bundleOf(sessions, 3).map((piece) => piece.id)).toEqual([3]);
  });

  it("측정 세션과 키 없는 수동 조각은 그 조각 하나가 묶음이다", () => {
    expect(bundleOf(sessions, 4)).toEqual([sensor]);
    const keyless = manual(5, at(DAY, 9), at(DAY, 10), null);
    expect(bundleOf([keyless, before], 5)).toEqual([keyless]);
  });

  it("앞 조각을 받지 못했어도 키로 묶음 시작을 안다", () => {
    expect(bundleSpan([after])).toEqual(span(at(DAY, 23), at(NEXT, 1)));
    expect(bundleSpan([before, after])).toEqual(span(at(DAY, 23), at(NEXT, 1)));
  });

  it("받은 마지막 조각이 자정에 딱 끝나면 이어질 수 있는 다음 날짜를 준다", () => {
    expect(bundleMayContinue([before])).toBe(NEXT);
    expect(bundleMayContinue([after])).toBeNull();
    expect(bundleMayContinue([before, after])).toBeNull();
  });

  it("수동 묶음만 한 번씩 나열한다", () => {
    expect(manualBundles(sessions).map((bundle) => bundle.map((piece) => piece.id))).toEqual([
      [1, 2],
      [3],
    ]);
  });
});

describe("cellTapTarget", () => {
  const sessions = [measured(1, at(DAY, 9), at(DAY, 11)), manual(2, at(DAY, 14), at(DAY, 15, 30))];
  const nowMs = at(DAY, 20);

  it("빈 칸은 추가다", () => {
    expect(cellTapTarget(at(DAY, 12), sessions, nowMs)).toEqual({ kind: "add" });
  });

  it("수동 기록 안의 칸은 그 묶음 수정이다", () => {
    const target = cellTapTarget(at(DAY, 14, 10), sessions, nowMs);
    expect(target?.kind).toBe("edit");
    expect(target?.kind === "edit" ? target.bundle.map((piece) => piece.id) : []).toEqual([2]);
  });

  it("측정 기록 안과 지금 이후 칸은 반응하지 않는다", () => {
    expect(cellTapTarget(at(DAY, 9, 10), sessions, nowMs)).toBeNull();
    expect(cellTapTarget(at(DAY, 20), sessions, nowMs)).toBeNull();
  });

  it("지금이 속한 분의 칸은 반응하지 않고 그 전 칸은 추가다", () => {
    const now = at(DAY, 14, 0, 30);
    expect(cellTapTarget(at(DAY, 14), [], now)).toBeNull();
    expect(cellTapTarget(at(DAY, 13, 50), [], now)).toEqual({ kind: "add" });
  });

  it("측정 기록 위에 늦게 시작한 수동 기록이 겹치면 겹친 칸은 위에 그려진 수동 기록 수정이다", () => {
    const overlapped = [
      measured(1, at(DAY, 9), at(DAY, 10)),
      manual(2, at(DAY, 9, 30), at(DAY, 10, 30)),
    ];
    const target = cellTapTarget(at(DAY, 9, 40), overlapped, nowMs);
    expect(target?.kind).toBe("edit");
    expect(target?.kind === "edit" ? target.bundle.map((piece) => piece.id) : []).toEqual([2]);
  });

  it("수동 기록 위에 늦게 시작한 측정 기록이 겹치면 겹친 칸은 반응하지 않고 겹치지 않은 칸은 수정이다", () => {
    const overlapped = [
      manual(2, at(DAY, 9), at(DAY, 10)),
      measured(1, at(DAY, 9, 30), at(DAY, 10, 30)),
    ];
    expect(cellTapTarget(at(DAY, 9, 40), overlapped, nowMs)).toBeNull();
    expect(cellTapTarget(at(DAY, 9, 10), overlapped, nowMs)?.kind).toBe("edit");
  });
});

describe("othersForOverlap", () => {
  it("수정 중인 묶음의 조각은 빼고 나머지 기록만 구간으로 돌려준다", () => {
    const before = manual(1, at(DAY, 23), at(NEXT, 0), at(DAY, 23));
    const after = manual(2, at(NEXT, 0), at(NEXT, 1), at(DAY, 23));
    const sensor = measured(3, at(DAY, 9), at(DAY, 10));
    const other = manual(4, at(DAY, 20), at(DAY, 21));
    expect(othersForOverlap([before, after, sensor, other], [before, after])).toEqual([
      span(at(DAY, 9), at(DAY, 10)),
      span(at(DAY, 20), at(DAY, 21)),
    ]);
    expect(othersForOverlap([before, sensor])).toEqual([
      span(at(DAY, 23), at(NEXT, 0)),
      span(at(DAY, 9), at(DAY, 10)),
    ]);
  });
});

describe("readAloudLabel", () => {
  it("같은 오전·오후면 종료에서 생략한다", () => {
    expect(readAloudLabel({ subjectName: "국어", span: span(at(DAY, 14), at(DAY, 15, 30)) })).toBe(
      "수동 기록, 국어, 오후 2시부터 3시 30분, 1시간 30분",
    );
  });

  it("오전에서 오후로 넘어가면 둘 다 적고, 자정은 오전 12시다", () => {
    expect(readAloudLabel({ subjectName: "과목 없음", span: span(at(DAY, 11), at(DAY, 13)) })).toBe(
      "수동 기록, 과목 없음, 오전 11시부터 오후 1시, 2시간",
    );
    expect(readAloudLabel({ subjectName: "국어", span: span(at(DAY, 0), at(DAY, 0, 30)) })).toBe(
      "수동 기록, 국어, 오전 12시부터 12시 30분, 30분",
    );
  });
});

describe("readAloudLabel 영어", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("분을 두 자리로 읽는다(9:05 PM)", async () => {
    await i18n.changeLanguage("en");
    const label = readAloudLabel({
      subjectName: "Math",
      span: span(at(DAY, 21, 5), at(DAY, 22, 7)),
    });
    expect(label).toContain("9:05 PM");
    expect(label).toContain("10:07");
  });
});

describe("subjectNameOf · daysAgo", () => {
  const refs = new Map<number, SubjectRef>([
    [9, { id: 9, name: "물리", colorIndex: 2, deleted: true }],
  ]);

  it("과목이 없거나 이름을 모르면 과목 없음이다", () => {
    expect(subjectNameOf(9, refs)).toBe("물리");
    expect(subjectNameOf(null, refs)).toBe("과목 없음");
    expect(subjectNameOf(1, refs)).toBe("과목 없음");
  });

  it("오늘은 0이고 달이 바뀌어도 날 수로 센다", () => {
    expect(daysAgo(DAY, DAY)).toBe(0);
    expect(daysAgo("2026-10-14", DAY)).toBe(1);
    expect(daysAgo("2026-09-30", "2026-10-01")).toBe(1);
  });
});
