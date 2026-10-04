import type { SubjectResponse } from "@focusmakers/types";

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
 * 할 일에는 날짜가 없어 날짜마다 보여 줄 것이 다르다(`tasks`).
 * - `live`(오늘): 목록의 것(미완료 + 자정 이후 완료)을 보여 주고 고칠 수 있다. 완료 기록은 쓰지
 *   않는다 — 방금 완료를 풀거나 지운 할 일이 낡은 기록 때문에 되살아나 보이지 않는다.
 * - `completed`(지난 날): 완료 시각이 그 하루에 든 것만 보여 준다(지운 것 포함). 그날의 미완료는 알 수 없다.
 * - `upcoming`(미래): 지금 미완료인 것을 그대로 보여 준다. 체크는 오늘 플래너에서 한다.
 */
export type PlannerTaskMode = "live" | "completed" | "upcoming";

export function plannerSubjectItems(
  day: PlannerDay,
  liveSubjects: readonly SubjectResponse[] | null,
  tasks: PlannerTaskMode = "live",
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
  if (tasks === "completed") {
    for (const task of day.completedTasks) {
      recordedOf(task.subjectId)?.tasks.push({
        id: task.id,
        name: task.name,
        done: true,
        live: false,
      });
    }
  }

  if (liveSubjects === null) {
    return [...recorded.values()];
  }

  const items: PlannerSubjectItem[] = liveSubjects.map((subject) => {
    const fromRecord = recorded.get(subject.name);
    recorded.delete(subject.name);
    return {
      subjectId: subject.id,
      name: subject.name,
      colorIndex: subject.colorIndex,
      focusSec: fromRecord?.focusSec ?? 0,
      tasks:
        tasks === "live"
          ? subject.tasks.map((task) => ({
              id: task.id,
              name: task.name,
              done: task.doneAt !== null,
              live: true,
            }))
          : tasks === "upcoming"
            ? subject.tasks
                .filter((task) => task.doneAt === null)
                .map((task) => ({ id: task.id, name: task.name, done: false, live: false }))
            : (fromRecord?.tasks ?? []),
      live: true,
    };
  });
  return [...items, ...recorded.values()];
}
