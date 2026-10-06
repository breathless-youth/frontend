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
    completedTasks: [{ id: 9, name: "오답 정리", subjectId: 5, doneAtMs: 0 }],
    subjects: new Map([
      [3, english],
      [5, math],
    ]),
  });

  it("과목 목록을 못 받았으면 그날 공부한 과목과 그날 완료한 할 일만 보여준다", () => {
    expect(plannerSubjectItems(recorded, null, "completed")).toEqual([
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
      "completed",
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

  it("미래 날짜는 지금 미완료인 할 일을 그대로 보여주되 고칠 수 없게 한다", () => {
    const items = plannerSubjectItems(
      plannerDay({}),
      [
        live({
          id: 3,
          tasks: [
            { id: 20, name: "단어 암기", doneAt: "2026-10-02T01:00:00Z" },
            { id: 21, name: "리스닝", doneAt: null },
          ],
        }),
      ],
      "upcoming",
    );

    expect(items).toEqual([
      {
        subjectId: 3,
        name: "영어",
        colorIndex: 7,
        focusSec: 0,
        tasks: [{ id: 21, name: "리스닝", done: false, live: false }],
        live: true,
      },
    ]);
  });

  it("지웠다 다시 만들어 id가 갈린 과목도 이름으로 맞춰 한 줄로 보여준다", () => {
    // 기록에는 옛 id(3)로 남았고, 과목 목록에는 새 id(30)로 살아 있다.
    const items = plannerSubjectItems(recorded, [live({ id: 30, name: "영어" })]);

    expect(items.filter((item) => item.name === "영어")).toEqual([
      { subjectId: 30, name: "영어", colorIndex: 7, focusSec: 3600, tasks: [], live: true },
    ]);
  });

  describe("완료 기록(완료 시각 기준)", () => {
    const day = plannerDay({
      completedTasks: [
        { id: 40, name: "완료", subjectId: 3, doneAtMs: 1 },
        { id: 41, name: "완료 후 지움", subjectId: 3, doneAtMs: 2 },
      ],
      subjects: new Map([[3, english]]),
    });

    it("오늘 플래너는 완료 기록을 쓰지 않고 목록만 따른다 — 방금 완료를 풀거나 지운 할 일이 되살아나지 않는다", () => {
      const items = plannerSubjectItems(
        day,
        [live({ id: 3, tasks: [{ id: 40, name: "완료", doneAt: null }] })],
        "live",
      );

      expect(items[0]!.tasks).toEqual([{ id: 40, name: "완료", done: false, live: true }]);
    });

    it("지난 날 플래너에는 그날 완료한 할 일이 지운 것까지 남는다", () => {
      const items = plannerSubjectItems(day, [live({ id: 3 })], "completed");

      expect(items[0]!.tasks.map((task) => task.id)).toEqual([40, 41]);
    });

    it("미래 날짜에는 완료 기록을 싣지 않는다", () => {
      const items = plannerSubjectItems(day, [live({ id: 3 })], "upcoming");

      expect(items[0]!.tasks).toEqual([]);
    });
  });
});
