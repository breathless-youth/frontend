import { describe, expect, it } from "vitest";

import type { SubjectRef, SubjectResponse } from "@focusmakers/types";

import type { PlannerDay } from "../plannerDay";
import { plannerSubjectItems } from "../subjectItems";

function plannerDay(over: Partial<PlannerDay>): PlannerDay {
  return {
    dateKey: "2026-10-02",
    startMs: 0,
    endMs: 0,
    focusSec: 0,
    studySec: 0,
    paints: [],
    subjectRows: [],
    unassignedFocusSec: 0,
    completedTasks: [],
    subjects: new Map(),
    ...over,
  };
}

const english: SubjectRef = { id: 3, name: "영어", colorIndex: 7, deleted: false };
const math: SubjectRef = { id: 5, name: "수학", colorIndex: 5, deleted: true };

function live(over: Partial<SubjectResponse>): SubjectResponse {
  return { id: 1, name: "영어", colorIndex: 7, studySec: 0, focusSec: 0, tasks: [], ...over };
}

describe("plannerSubjectItems — 플래너 왼쪽 열의 과목 목록", () => {
  const recorded = plannerDay({
    subjectRows: [
      { subjectId: 3, focusSec: 3600 },
      { subjectId: 5, focusSec: 1800 },
    ],
    completedTasks: [{ id: 9, name: "오답 정리", subjectId: 5, doneAtMs: 0, deleted: false }],
    subjects: new Map([
      [3, english],
      [5, math],
    ]),
  });

  it("과목 목록을 못 받았으면 그날 공부한 과목과 그날 완료한 할 일만 보여준다", () => {
    expect(plannerSubjectItems(recorded, null)).toEqual([
      { subjectId: 3, name: "영어", colorIndex: 7, focusSec: 3600, tasks: [], live: false },
      {
        subjectId: 5,
        name: "수학",
        colorIndex: 5,
        focusSec: 1800,
        tasks: [{ id: 9, name: "오답 정리", done: true, live: false }],
        live: false,
      },
    ]);
  });

  it("오늘은 과목 목록 순서대로 전부 보여주고, 공부하지 않은 과목은 0분이다", () => {
    const items = plannerSubjectItems(recorded, [
      live({ id: 8, name: "국어", colorIndex: 1 }),
      live({
        id: 3,
        name: "영어",
        tasks: [
          { id: 20, name: "단어 암기", doneAt: "2026-10-02T01:00:00Z" },
          { id: 21, name: "리스닝", doneAt: null },
        ],
      }),
    ]);

    expect(items.map((item) => [item.name, item.focusSec, item.live])).toEqual([
      ["국어", 0, true],
      ["영어", 3600, true],
      // 공부했지만 지금은 지운 과목은 목록 뒤에 붙는다.
      ["수학", 1800, false],
    ]);
    expect(items[1]!.tasks).toEqual([
      { id: 20, name: "단어 암기", done: true, live: true },
      { id: 21, name: "리스닝", done: false, live: true },
    ]);
  });

  it("지난 날은 과목 목록을 전부 보여주되, 할 일은 그날 완료한 것만 남긴다", () => {
    const items = plannerSubjectItems(
      recorded,
      [
        live({ id: 8, name: "국어", tasks: [{ id: 30, name: "비문학 3지문", doneAt: null }] }),
        live({
          id: 5,
          name: "수학",
          tasks: [{ id: 31, name: "모의고사", doneAt: "2026-10-03T01:00:00Z" }],
        }),
      ],
      false,
    );

    expect(items.map((item) => [item.name, item.focusSec, item.live])).toEqual([
      ["국어", 0, true],
      ["수학", 1800, true],
      ["영어", 3600, false],
    ]);
    // 할 일에는 날짜가 없어 지금 목록의 할 일(미완료·다른 날 완료)은 지난 날에 싣지 않는다.
    expect(items[0]!.tasks).toEqual([]);
    expect(items[1]!.tasks).toEqual([{ id: 9, name: "오답 정리", done: true, live: false }]);
  });

  it("지웠다 다시 만들어 id가 갈린 과목도 이름으로 맞춰 한 줄로 보여준다", () => {
    // 기록에는 옛 id(3)로 남았고, 과목 목록에는 새 id(30)로 살아 있다.
    const items = plannerSubjectItems(recorded, [live({ id: 30, name: "영어" })]);

    expect(items.filter((item) => item.name === "영어")).toEqual([
      { subjectId: 30, name: "영어", colorIndex: 7, focusSec: 3600, tasks: [], live: true },
    ]);
  });

  describe("오늘 플래너의 완료 할 일", () => {
    // 10월 3일 01:00(KST) — 오늘 플래너는 10월 2일 05:00에 시작했고, 과목 목록은 3일 00:00 이후 완료만 준다.
    const now = new Date("2026-10-03T01:00:00+09:00");
    const at = (iso: string) => Date.parse(iso);
    const day = plannerDay({
      startMs: at("2026-10-02T05:00:00+09:00"),
      completedTasks: [
        {
          id: 40,
          name: "전날 밤 완료",
          subjectId: 3,
          doneAtMs: at("2026-10-02T23:00:00+09:00"),
          deleted: false,
        },
        {
          id: 41,
          name: "전날 밤 완료 후 지움",
          subjectId: 3,
          doneAtMs: at("2026-10-02T22:00:00+09:00"),
          deleted: true,
        },
        // 자정 이후 완료했다가 방금 푼 할 일 — 낡은 기록에는 아직 완료로 남아 있다.
        {
          id: 42,
          name: "방금 지운 것",
          subjectId: 3,
          doneAtMs: at("2026-10-03T00:30:00+09:00"),
          deleted: false,
        },
      ],
      subjects: new Map([[3, english]]),
    });

    it("자정 전에 완료해 목록에서 숨은 할 일은 기록에서 채우고, 지운 것과 자정 이후 것은 목록만 따른다", () => {
      const items = plannerSubjectItems(
        day,
        [live({ id: 3, tasks: [{ id: 50, name: "새벽에 완료", doneAt: "2026-10-02T15:40:00Z" }] })],
        true,
        now,
      );

      expect(items[0]!.tasks).toEqual([
        { id: 50, name: "새벽에 완료", done: true, live: true },
        { id: 40, name: "전날 밤 완료", done: true, live: false },
      ]);
    });

    it("05시가 지나면 자정~05시에 완료한 할 일은 오늘 플래너에서 빠진다(전날 플래너의 몫)", () => {
      const morning = plannerDay({ startMs: at("2026-10-03T05:00:00+09:00") });
      const items = plannerSubjectItems(
        morning,
        [
          live({
            id: 3,
            tasks: [
              { id: 50, name: "새벽에 완료", doneAt: "2026-10-02T15:40:00Z" },
              { id: 51, name: "아침에 완료", doneAt: "2026-10-02T21:00:00Z" },
              { id: 52, name: "미완료", doneAt: null },
            ],
          }),
        ],
        true,
        new Date("2026-10-03T08:00:00+09:00"),
      );

      expect(items[0]!.tasks.map((task) => task.id)).toEqual([51, 52]);
    });

    it("지난 날 플래너에는 지운 할 일도 남는다", () => {
      const items = plannerSubjectItems(day, [live({ id: 3 })], false, now);

      expect(items[0]!.tasks.map((task) => task.id)).toEqual([40, 41, 42]);
    });
  });
});
