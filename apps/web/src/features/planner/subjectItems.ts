import type { SubjectResponse } from "@focusmakers/types";

import type { PlannerDay } from "./plannerDay";

export interface PlannerTaskItem {
  id: number;
  name: string;
  done: boolean;
}

export interface PlannerSubjectItem {
  /** 살아있는 과목이면 그 id, 기록에만 남은 과목이면 기록의 대표 id. */
  subjectId: number;
  name: string;
  colorIndex: number;
  focusSec: number;
  tasks: PlannerTaskItem[];
  /** 과목 목록에 살아있는 과목인가 — 지운 과목은 기록에만 남아 관리할 수 없다. */
  live: boolean;
}

/**
 * 플래너 왼쪽 열의 과목 목록 — 순수 함수.
 *
 * 오늘 플래너(`liveSubjects`가 있다)는 과목 목록 순서 그대로 전부 보여 주고, 공부했지만 지금은
 * 지운 과목을 그 뒤에 붙인다. 지난 날 플래너(`liveSubjects`가 `null`)는 그날 공부한 과목과
 * 그날 완료한 할 일만 보여 준다. 과목은 이름으로 맞춘다 — 지웠다 다시 만들어 id가 갈려도 한 줄이다.
 */
export function plannerSubjectItems(
  day: PlannerDay,
  liveSubjects: readonly SubjectResponse[] | null,
): PlannerSubjectItem[] {
  const recorded = new Map<string, PlannerSubjectItem>();
  const recordedOf = (subjectId: number) => {
    const ref = day.subjects.get(subjectId);
    if (ref === undefined) {
      return undefined;
    }
    let item = recorded.get(ref.name);
    if (item === undefined) {
      item = {
        subjectId: ref.id,
        name: ref.name,
        colorIndex: ref.colorIndex,
        focusSec: 0,
        tasks: [],
        live: false,
      };
      recorded.set(ref.name, item);
    }
    return item;
  };
  for (const row of day.subjectRows) {
    const item = recordedOf(row.subjectId);
    if (item !== undefined) {
      item.focusSec += row.focusSec;
    }
  }
  for (const task of day.completedTasks) {
    recordedOf(task.subjectId)?.tasks.push({ id: task.id, name: task.name, done: true });
  }

  if (liveSubjects === null) {
    return [...recorded.values()];
  }

  const items: PlannerSubjectItem[] = liveSubjects.map((subject) => {
    const fromRecord = recorded.get(subject.name);
    recorded.delete(subject.name);
    const liveTaskIds = new Set(subject.tasks.map((task) => task.id));
    return {
      subjectId: subject.id,
      name: subject.name,
      colorIndex: subject.colorIndex,
      focusSec: fromRecord?.focusSec ?? 0,
      tasks: [
        ...subject.tasks.map((task) => ({
          id: task.id,
          name: task.name,
          done: task.doneAt !== null,
        })),
        // 세션에서 완료한 뒤 지운 할 일은 목록에는 없지만 그날 한 일이라 완료로 남긴다.
        ...(fromRecord?.tasks.filter((task) => !liveTaskIds.has(task.id)) ?? []),
      ],
      live: true,
    };
  });
  return [...items, ...recorded.values()];
}
