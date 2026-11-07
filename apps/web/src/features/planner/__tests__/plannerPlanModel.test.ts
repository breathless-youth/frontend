import { describe, expect, it } from "vitest";

import { plannerDay, plannerRecord, plannerSubject, plannerTask } from "@/test/plannerFixtures";

import { plannerPlanModel } from "../plannerPlanModel";

describe("plannerPlanModel", () => {
  it("서버가 합친 과목 순서와 출시 전 삭제 과목을 보존하며 실제 기록이 있으면 빼기를 막는다", () => {
    const model = plannerPlanModel(
      plannerDay({
        focusSec: 1700,
        studySec: 2200,
        subjects: [
          plannerSubject({ id: 9, name: "선택한 과목" }),
          plannerSubject({ id: 3, name: "할 일 과목", selected: false, tasks: [plannerTask()] }),
          plannerSubject({
            id: 4,
            name: "출시 전 삭제 과목",
            selected: false,
            deleted: true,
            focusSec: 1700,
            studySec: 2200,
          }),
        ],
        records: [
          plannerRecord({
            subjectSegments: [
              {
                subjectId: 4,
                startedAt: "2026-11-06T00:00:00Z",
                endedAt: "2026-11-06T01:00:00Z",
                studySec: 2200,
                focusSec: 1700,
              },
            ],
          }),
        ],
      }),
      "2026-11-06",
    );

    expect(model.subjects.map((subject) => subject.id)).toEqual([9, 3, 4]);
    expect(model.subjects.map((subject) => subject.canRemove)).toEqual([true, true, false]);
    expect(model.subjects[2]?.name).toBe("출시 전 삭제 과목");
    expect(model.focusSec).toBe(1700);
    expect(model.studySec).toBe(2200);
  });

  it("그날의 가상 반복 회차도 30개 한도에 포함한다", () => {
    const tasks = Array.from({ length: 29 }, (_, index) =>
      plannerTask({ key: `t:${index + 1}`, taskId: index + 1 }),
    );
    tasks.push(
      plannerTask({
        key: "r:4:2026-11-06",
        taskId: null,
        seriesId: 4,
        occurrenceDate: "2026-11-06",
      }),
    );

    const model = plannerPlanModel(
      plannerDay({ subjects: [plannerSubject({ tasks })] }),
      "2026-11-05",
    );

    expect(model.subjects[0]?.canAddTask).toBe(false);
    expect(model.subjects[0]?.tasks).toHaveLength(30);
    expect(model.subjects[0]?.tasks[29]?.taskId).toBeNull();
  });

  it("30개 미만이어도 과거와 삭제된 과목에는 추가하지 못하고 미래 과목에는 추가할 수 있다", () => {
    const past = plannerPlanModel(plannerDay({ subjects: [plannerSubject()] }), "2026-11-07");
    const future = plannerPlanModel(
      plannerDay({ subjects: [plannerSubject(), plannerSubject({ id: 4, deleted: true })] }),
      "2026-11-05",
    );

    expect(past.subjects[0]?.canAddTask).toBe(false);
    expect(future.subjects.map((subject) => subject.canAddTask)).toEqual([true, false]);
    expect(past.subjects[0]?.canRemove).toBe(false);
  });
});
