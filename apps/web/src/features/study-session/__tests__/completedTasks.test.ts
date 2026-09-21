import { describe, expect, it } from "vitest";

import type { SubjectResponse } from "@focusmakers/types";

import { completedTaskIdsSince } from "../completedTasks";

const START = Date.UTC(2026, 8, 21, 1, 0, 0);

function subject(id: number, tasks: { id: number; doneAt: string | null }[]): SubjectResponse {
  return {
    id,
    name: `과목${id}`,
    colorIndex: 0,
    studySec: 0,
    focusSec: 0,
    tasks: tasks.map((task) => ({ ...task, name: `할 일${task.id}` })),
  };
}

describe("completedTaskIdsSince", () => {
  it("목록이 비어 있으면 빈 배열이다", () => {
    expect(completedTaskIdsSince([], START)).toEqual([]);
  });

  it("미완료(doneAt null)와 세션 시작 전에 완료한 할 일은 뺀다", () => {
    const subjects = [
      subject(1, [
        { id: 10, doneAt: null },
        { id: 11, doneAt: new Date(START - 1).toISOString() },
      ]),
    ];
    expect(completedTaskIdsSince(subjects, START)).toEqual([]);
  });

  it("세션 시작 시각과 같은 순간에 완료한 할 일은 포함한다(경계 포함)", () => {
    const subjects = [subject(1, [{ id: 10, doneAt: new Date(START).toISOString() }])];
    expect(completedTaskIdsSince(subjects, START)).toEqual([10]);
  });

  it("여러 과목의 완료 할 일을 목록 순서대로 평탄화한다", () => {
    const subjects = [
      subject(2, [
        { id: 20, doneAt: new Date(START + 60_000).toISOString() },
        { id: 21, doneAt: null },
      ]),
      subject(1, [{ id: 10, doneAt: new Date(START + 120_000).toISOString() }]),
    ];
    expect(completedTaskIdsSince(subjects, START)).toEqual([20, 10]);
  });

  it("파싱할 수 없는 doneAt은 뺀다", () => {
    const subjects = [subject(1, [{ id: 10, doneAt: "not-a-date" }])];
    expect(completedTaskIdsSince(subjects, START)).toEqual([]);
  });
});
