import type { SubjectResponse } from "@focusmakers/types";

import { kstDateKey } from "@/features/records/recordsFormat";
import { kstDayStartMs } from "@/features/records/recordsTimetable";

import type { PlannerDay } from "./plannerDay";

export interface PlannerTaskItem {
  id: number;
  name: string;
  done: boolean;
  /** 과목 목록에 살아있는 할 일인가 — 기록에만 남은 할 일은 고칠 수 없다. */
  live: boolean;
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
 * 과목 목록(`liveSubjects`)이 있으면 그 순서대로 전부 보여 주고(공부하지 않은 과목은 0분), 그날
 * 공부했지만 지금은 지운 과목을 그 뒤에 붙인다. 목록을 못 받았으면(`null`) 그날 기록에 남은 과목만
 * 보여 준다. 과목은 이름으로 맞춘다 — 지웠다 다시 만들어 id가 갈려도 한 줄이다.
 *
 * 할 일은 오늘 플래너(`withLiveTasks`)에서만 목록의 것(미완료 + 오늘 완료)을 보여 준다. 지난 날은
 * 그날 완료한 할 일만 보여 준다 — 할 일에는 날짜가 없어 그날의 미완료를 알 수 없다.
 *
 * 오늘 플래너에서 목록과 완료 기록이 맡는 범위는 겹치지 않는다. 목록은 자정(KST) 이후 완료한 것만
 * 주므로 그 전에 완료한 것만 기록에서 채우고(새벽 0~5시의 오늘 플래너), 자정 이후는 목록을 따른다 —
 * 방금 완료를 풀거나 지운 할 일이 낡은 기록 때문에 되살아나 보이지 않는다.
 */
export function plannerSubjectItems(
  day: PlannerDay,
  liveSubjects: readonly SubjectResponse[] | null,
  withLiveTasks = true,
  now: Date = new Date(),
): PlannerSubjectItem[] {
  const liveSinceMs = kstDayStartMs(kstDateKey(now));
  const doneAtMsById = new Map(day.completedTasks.map((task) => [task.id, task.doneAtMs]));
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
    // 오늘 플래너에서는 지운 할 일을 숨긴다. 지난 날은 기록이라 남긴다.
    if (withLiveTasks && task.deleted) {
      continue;
    }
    recordedOf(task.subjectId)?.tasks.push({
      id: task.id,
      name: task.name,
      done: true,
      live: false,
    });
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
      tasks: withLiveTasks
        ? [
            ...subject.tasks
              // 자정~05시에 완료한 것은 전날 플래너의 몫이다.
              .filter((task) => task.doneAt === null || Date.parse(task.doneAt) >= day.startMs)
              .map((task) => ({
                id: task.id,
                name: task.name,
                done: task.doneAt !== null,
                live: true,
              })),
            ...(fromRecord?.tasks.filter(
              (task) => !liveTaskIds.has(task.id) && (doneAtMsById.get(task.id) ?? 0) < liveSinceMs,
            ) ?? []),
          ]
        : (fromRecord?.tasks ?? []),
      live: true,
    };
  });
  return [...items, ...recorded.values()];
}
