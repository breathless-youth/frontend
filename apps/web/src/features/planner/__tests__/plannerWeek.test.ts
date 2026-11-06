import { describe, expect, it } from "vitest";
import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import { initialWeekExpanded, plannerWeek, previewWeekTaskMove } from "../plannerWeekModel";

describe("주간 계획 모델", () => {
  it("선택 날짜의 월요일부터 일요일까지 연도 경계를 넘겨 표시한다", () => {
    expect(plannerWeek("2027-01-01", "2026-11-05", []).dates).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("해당 주 안의 오늘과 다음 날만 처음 펼치고 다른 주는 접는다", () => {
    expect(initialWeekExpanded("2026-11-05", "2026-11-05")).toEqual(["2026-11-05", "2026-11-06"]);
    expect(initialWeekExpanded("2026-11-08", "2026-11-08")).toEqual(["2026-11-08"]);
    expect(initialWeekExpanded("2026-11-15", "2026-11-05")).toEqual([]);
  });

  it("완료 수와 전체 수를 구분하고 수정된 일간 순공을 과목 시간이 아닌 응답 합계로 더한다", () => {
    const week = plannerWeek("2026-11-05", "2026-11-05", [
      plannerDay({
        date: "2026-11-04",
        focusSec: 61,
        subjects: [
          plannerSubject({
            focusSec: 99999,
            tasks: [
              plannerTask({ date: "2026-11-04", done: true }),
              plannerTask({ key: "opaque", date: "2026-11-04" }),
            ],
          }),
        ],
      }),
      plannerDay({
        date: "2026-11-06",
        focusSec: 119,
        subjects: [plannerSubject({ tasks: [plannerTask()] })],
      }),
      plannerDay({ date: "2026-11-12", focusSec: 99999 }),
    ]);
    expect(week.focusSec).toBe(180);
    expect(week.days.find((day) => day.date === "2026-11-04")).toMatchObject({
      mode: "past",
      taskCount: 2,
      completedCount: 1,
    });
    expect(week.days.find((day) => day.date === "2026-11-06")).toMatchObject({
      mode: "future",
      taskCount: 1,
      completedCount: 0,
    });
  });

  it("이동 미리보기는 key와 가상 회차의 null taskId를 보존하고 원본을 수정하지 않는다", () => {
    const task = plannerTask({
      key: "r:opaque/4:2026-11-04",
      taskId: null,
      date: "2026-11-04",
      seriesId: 4,
      occurrenceDate: "2026-11-04",
    });
    const source = [
      plannerDay({ date: "2026-11-04", subjects: [plannerSubject({ tasks: [task] })] }),
      plannerDay({ date: "2026-11-06" }),
    ];
    const preview = previewWeekTaskMove(source, task.key, "2026-11-06");
    expect(preview[0]?.subjects[0]?.tasks).toEqual([]);
    expect(preview[1]?.subjects[0]?.tasks).toEqual([{ ...task, date: "2026-11-06" }]);
    expect(source[0]?.subjects[0]?.tasks[0]?.date).toBe("2026-11-04");
  });
});
