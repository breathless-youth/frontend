import { describe, expect, it } from "vitest";

import type { StudySessionListResponse, StudySessionSummary } from "@focusmakers/types";

import {
  assemblePlannerDay,
  plannerCellFills,
  plannerDayWindow,
  plannerHours,
  plannerDateKeyOf,
} from "../plannerDay";

const DAY = "2026-10-02";
const NEXT = "2026-10-03";
/** KST 시각 → ISO. `day`는 날짜 키, 시·분은 KST. */
const kst = (day: string, hour: number, minute = 0) =>
  new Date(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`,
  ).toISOString();

function session(over: Partial<StudySessionSummary>): StudySessionSummary {
  return {
    id: 1,
    statDate: DAY,
    startedAt: kst(DAY, 9),
    endedAt: kst(DAY, 10),
    studySec: 3600,
    focusSec: 3600,
    focusRate: 100,
    eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    events: [],
    subjectSegments: [],
    completedTasks: [],
    ...over,
  };
}

function stats(
  sessions: StudySessionSummary[],
  over: Partial<StudySessionListResponse> = {},
): StudySessionListResponse {
  return {
    sessions,
    sessionCount: sessions.length,
    totalStudySec: 0,
    totalFocusSec: 0,
    longestFocusSec: 0,
    focusRate: 0,
    totalEventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    studiedDatesInMonth: [],
    subjects: [],
    ...over,
  };
}

describe("플래너의 하루 구간", () => {
  it("05:00에 시작해 다음 날 05:00에 끝난다(KST)", () => {
    const window = plannerDayWindow(DAY);
    expect(new Date(window.startMs).toISOString()).toBe(kst(DAY, 5));
    expect(new Date(window.endMs).toISOString()).toBe(kst(NEXT, 5));
  });

  it("새벽 0~5시의 오늘 플래너는 전날이다", () => {
    expect(plannerDateKeyOf(new Date(kst(NEXT, 4, 59)))).toBe(DAY);
    expect(plannerDateKeyOf(new Date(kst(NEXT, 5)))).toBe(NEXT);
    expect(plannerDateKeyOf(new Date(kst(DAY, 23, 30)))).toBe(DAY);
  });

  it("시 라벨은 5에서 시작해 다음 날 4에서 끝난다", () => {
    const hours = plannerHours();
    expect(hours).toHaveLength(24);
    expect(hours[0]).toBe(5);
    expect(hours[18]).toBe(23);
    expect(hours[19]).toBe(0);
    expect(hours[23]).toBe(4);
  });
});

describe("assemblePlannerDay — 일간 조회 이틀치로 하루를 조립한다", () => {
  it("밤 11시~새벽 1시 공부는 자정에서 나뉘어 와도 전날 한 장에 이어진다", () => {
    const beforeMidnight = session({
      id: 1,
      startedAt: kst(DAY, 23),
      endedAt: kst(NEXT, 0),
      studySec: 3600,
      focusSec: 3600,
    });
    const afterMidnight = session({
      id: 2,
      statDate: NEXT,
      startedAt: kst(NEXT, 0),
      endedAt: kst(NEXT, 1),
      studySec: 3600,
      focusSec: 3000,
    });

    const day = assemblePlannerDay(DAY, stats([beforeMidnight]), stats([afterMidnight]));

    expect(day.focusSec).toBe(6600);
    expect(day.studySec).toBe(7200);
    // 맞닿은 두 조각은 같은 종류라도 세션이 달라 따로 칠해지지만 빈틈 없이 이어진다.
    expect(day.paints[0]!.startMs).toBe(Date.parse(kst(DAY, 23)));
    expect(day.paints[day.paints.length - 1]!.endMs).toBe(Date.parse(kst(NEXT, 1)));
  });

  it("그날 새벽 0~5시와 다음 날 05시 이후의 세션은 이 하루에 넣지 않는다", () => {
    const earlyMorning = session({ id: 1, startedAt: kst(DAY, 1), endedAt: kst(DAY, 2) });
    const nextMorning = session({
      id: 2,
      statDate: NEXT,
      startedAt: kst(NEXT, 9),
      endedAt: kst(NEXT, 10),
    });

    const day = assemblePlannerDay(DAY, stats([earlyMorning]), stats([nextMorning]));

    expect(day.focusSec).toBe(0);
    expect(day.paints).toEqual([]);
  });

  it("05:00을 걸친 세션은 이벤트로 순공·총 공부를 다시 나눈다", () => {
    // 다음 날 04:00~06:00 세션, 04:30~04:40 일시정지, 05:10~05:20 휴대폰.
    const crossing = session({
      id: 3,
      statDate: NEXT,
      startedAt: kst(NEXT, 4),
      endedAt: kst(NEXT, 6),
      studySec: 110 * 60,
      focusSec: 100 * 60,
      events: [
        { status: "PAUSE", startedAt: kst(NEXT, 4, 30), endedAt: kst(NEXT, 4, 40) },
        { status: "PHONE", startedAt: kst(NEXT, 5, 10), endedAt: kst(NEXT, 5, 20) },
      ],
    });

    const day = assemblePlannerDay(DAY, stats([]), stats([crossing]));

    // 이 하루에 드는 것은 04:00~05:00 — 총 공부 50분(일시정지 10분 제외), 순공 50분.
    expect(day.studySec).toBe(50 * 60);
    expect(day.focusSec).toBe(50 * 60);
    expect(day.paints.map((paint) => paint.kind)).toEqual(["focus", "rest", "focus"]);
  });

  it("과목별 시간은 순공 기준이고, 과목 없이 공부한 순공을 따로 센다", () => {
    const studied = session({
      startedAt: kst(DAY, 9),
      endedAt: kst(DAY, 11),
      studySec: 7200,
      focusSec: 6600,
      events: [{ status: "PHONE", startedAt: kst(DAY, 9, 20), endedAt: kst(DAY, 9, 30) }],
      subjectSegments: [
        {
          subjectId: 3,
          startedAt: kst(DAY, 9),
          endedAt: kst(DAY, 10),
          studySec: 3600,
          focusSec: 3000,
        },
      ],
    });

    const day = assemblePlannerDay(
      DAY,
      stats([studied], { subjects: [{ id: 3, name: "영어", colorIndex: 7, deleted: false }] }),
      stats([]),
    );

    expect(day.subjectRows).toEqual([{ subjectId: 3, focusSec: 3000 }]);
    expect(day.unassignedFocusSec).toBe(3600);
    // 과목 구간 안이라도 휴식은 과목 색으로 칠하지 않는다.
    expect(day.paints.map((paint) => paint.kind)).toEqual(["subject", "rest", "subject", "focus"]);
  });

  it("이름이 같은 과목은 대표 과목 하나로 합친다", () => {
    const studied = session({
      startedAt: kst(DAY, 9),
      endedAt: kst(DAY, 11),
      studySec: 7200,
      focusSec: 7200,
      subjectSegments: [
        {
          subjectId: 3,
          startedAt: kst(DAY, 9),
          endedAt: kst(DAY, 10),
          studySec: 3600,
          focusSec: 3600,
        },
        {
          subjectId: 5,
          startedAt: kst(DAY, 10),
          endedAt: kst(DAY, 11),
          studySec: 3600,
          focusSec: 3600,
        },
      ],
      completedTasks: [{ id: 9, name: "단어 암기", subjectId: 3, deleted: false }],
    });

    const day = assemblePlannerDay(
      DAY,
      stats([studied], {
        subjects: [
          { id: 3, name: "소마", colorIndex: 2, deleted: true },
          { id: 5, name: "소마", colorIndex: 7, deleted: false },
        ],
      }),
      stats([]),
    );

    expect(day.subjectRows).toEqual([{ subjectId: 5, focusSec: 7200 }]);
    expect(day.completedTasks).toEqual([
      { id: 9, name: "단어 암기", subjectId: 5, deleted: false },
    ]);
    expect(day.paints).toHaveLength(1);
  });
});

describe("plannerCellFills — 10분 칸 안을 실제 시각대로 나눈다", () => {
  it("칸 안의 2분 휴식은 그 길이만큼만 휴식으로 칠한다", () => {
    // 05:00~05:10 칸: 05:00~05:04 순공, 05:04~05:06 휴식, 05:06~05:10 순공.
    const studied = session({
      startedAt: kst(DAY, 5),
      endedAt: kst(DAY, 5, 10),
      studySec: 600,
      focusSec: 480,
      events: [{ status: "AWAY", startedAt: kst(DAY, 5, 4), endedAt: kst(DAY, 5, 6) }],
    });

    const cells = plannerCellFills(assemblePlannerDay(DAY, stats([studied]), stats([])));

    expect(cells).toHaveLength(144);
    expect(cells[0]).toEqual([
      { left: 0, width: 0.4, paint: { kind: "focus" } },
      { left: 0.4, width: expect.closeTo(0.2), paint: { kind: "rest" } },
      { left: 0.6, width: expect.closeTo(0.4), paint: { kind: "focus" } },
    ]);
    expect(cells[1]).toEqual([]);
  });

  it("여러 칸에 걸친 구간은 칸마다 잘라 넣는다", () => {
    // 09:05~09:25 → 09:00 칸의 뒤 절반, 09:10 칸 전체, 09:20 칸의 앞 절반.
    const studied = session({
      startedAt: kst(DAY, 9, 5),
      endedAt: kst(DAY, 9, 25),
      studySec: 1200,
      focusSec: 1200,
    });

    const cells = plannerCellFills(assemblePlannerDay(DAY, stats([studied]), stats([])));
    const nineOClock = (9 - 5) * 6;

    expect(cells[nineOClock]).toEqual([{ left: 0.5, width: 0.5, paint: { kind: "focus" } }]);
    expect(cells[nineOClock + 1]).toEqual([{ left: 0, width: 1, paint: { kind: "focus" } }]);
    expect(cells[nineOClock + 2]).toEqual([{ left: 0, width: 0.5, paint: { kind: "focus" } }]);
  });
});
