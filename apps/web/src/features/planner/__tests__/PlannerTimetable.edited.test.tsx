import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import { PlannerTimetable } from "../PlannerTimetable";
import { plannerPlanDay } from "../plannerPlanDay";

afterEach(cleanup);

it("일반 플래너는 수정 기록도 연필과 수정 설명 없이 시간을 칠한다", () => {
  const day = plannerPlanDay(
    plannerDay({
      records: [plannerRecord({ subjectSegments: [], edited: true })],
    }),
  );
  render(<PlannerTimetable day={day} nowMs={Date.parse("2026-11-08T00:00:00Z")} size="plan" />);
  const timetable = screen.getByRole("img");
  expect(timetable).not.toHaveAccessibleName(/수정됨/);
  expect(timetable.querySelectorAll("[data-record-edited]")).toHaveLength(0);
  expect(timetable.querySelector("[data-paint]")).not.toBeNull();
});
