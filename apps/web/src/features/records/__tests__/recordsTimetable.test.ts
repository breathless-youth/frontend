import { describe, expect, it } from "vitest";

import {
  SLOTS_PER_DAY,
  completedTasksOf,
  dayTimetable,
  kstDayStartMs,
  sessionTimetable,
  subjectRefMap,
  subjectTotalsOf,
} from "../recordsTimetable";

const DAY = "2026-09-21";
const dayStart = kstDayStartMs(DAY);
const iso = (minutes: number) => new Date(dayStart + minutes * 60_000).toISOString();

const session = {
  startedAt: iso(9 * 60 + 12), // 09:12 KST
  endedAt: iso(10 * 60 + 36), // 10:36
  events: [{ status: "PHONE" as const, startedAt: iso(9 * 60 + 40), endedAt: iso(9 * 60 + 50) }],
  subjectSegments: [
    {
      subjectId: 3,
      startedAt: iso(9 * 60 + 12),
      endedAt: iso(10 * 60),
      studySec: 2880,
      focusSec: 2280,
    },
    {
      subjectId: 5,
      startedAt: iso(10 * 60),
      endedAt: iso(10 * 60 + 20),
      studySec: 1200,
      focusSec: 1200,
    },
  ],
  completedTasks: [{ id: 12, name: "문제집 1장 풀기", subjectId: 3, deleted: false }],
};

describe("recordsTimetable — 일간 응답을 2분 칸으로 바꾼다", () => {
  it("KST 자정 기준 720칸이고 세션 밖은 비어 있다", () => {
    const slots = dayTimetable([session], DAY);
    expect(slots).toHaveLength(SLOTS_PER_DAY);
    expect(slots[0]).toEqual({ kind: "empty" });
    expect(slots[SLOTS_PER_DAY - 1]).toEqual({ kind: "empty" });
  });

  it("휴식 > 과목 > 집중 순으로 칸을 덮는다", () => {
    const slots = dayTimetable([session], DAY);
    const slotOf = (minutes: number) => slots[Math.floor(minutes / 2)];
    expect(slotOf(9 * 60 + 12)).toEqual({ kind: "subject", subjectId: 3 }); // 09:12 영어
    expect(slotOf(9 * 60 + 44)).toEqual({ kind: "rest", status: "PHONE" }); // PHONE이 과목을 덮는다
    expect(slotOf(10 * 60 + 10)).toEqual({ kind: "subject", subjectId: 5 });
    expect(slotOf(10 * 60 + 30)).toEqual({ kind: "focus" }); // 과목 미선택
    expect(slotOf(10 * 60 + 36)).toEqual({ kind: "empty" }); // 세션 끝(반개구간)
  });

  it("세션 하나만 칠하는 바텀시트용도 같은 칸 규칙이다", () => {
    const other = {
      ...session,
      startedAt: iso(14 * 60),
      endedAt: iso(15 * 60),
      events: [],
      subjectSegments: [],
    };
    const day = dayTimetable([session, other], DAY);
    const single = sessionTimetable(session, DAY);
    expect(day[Math.floor((14 * 60 + 30) / 2)]).toEqual({ kind: "focus" });
    expect(single[Math.floor((14 * 60 + 30) / 2)]).toEqual({ kind: "empty" });
  });

  it("과목별 합은 서버가 준 구간 값을 더하고 첫 등장 순을 지킨다", () => {
    expect(subjectTotalsOf([session, session])).toEqual([
      { subjectId: 3, studySec: 5760, focusSec: 4560 },
      { subjectId: 5, studySec: 2400, focusSec: 2400 },
    ]);
  });

  it("완료 할 일은 세션 순서대로 중복 없이 모은다", () => {
    expect(completedTasksOf([session, session])).toEqual(session.completedTasks);
    expect(completedTasksOf([{}])).toEqual([]);
  });

  it("subjectRefMap — 지운 과목도 이름·색을 찾을 수 있고, 없으면 빈 맵이다", () => {
    const map = subjectRefMap([
      { id: 3, name: "영어", colorIndex: 2, deleted: false },
      { id: 5, name: "수학", colorIndex: 5, deleted: true },
    ]);
    expect(map.get(5)?.deleted).toBe(true);
    expect(subjectRefMap(undefined).size).toBe(0);
  });
});
