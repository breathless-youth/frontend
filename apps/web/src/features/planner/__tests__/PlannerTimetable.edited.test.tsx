import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import { PlannerTimetable } from "../PlannerTimetable";
import { plannerPlanDay } from "../plannerPlanDay";

afterEach(cleanup);

it("과목 없는 수정 기록도 플래너 격자에서 연필과 수정 설명을 유지한다", () => {
  const day = plannerPlanDay(
    plannerDay({
      records: [plannerRecord({ subjectSegments: [], edited: true })],
    }),
  );
  render(<PlannerTimetable day={day} nowMs={Date.parse("2026-11-08T00:00:00Z")} size="plan" />);
  const timetable = screen.getByRole("img", { name: /수정됨/ });
  expect(timetable.querySelectorAll("[data-record-edited]")).toHaveLength(1);
});
