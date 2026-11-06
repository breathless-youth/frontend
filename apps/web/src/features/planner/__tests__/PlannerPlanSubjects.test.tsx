import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import { PlannerPlanSubjects, type PlanSubjectActions } from "../PlannerPlanSubjects";
import { plannerPlanModel } from "../plannerPlanModel";

it("과목 순공을 다음 분으로 올려 한글 시간으로 읽고 할 일을 완료할 수 있다", async () => {
  const task = plannerTask();
  const plan = plannerPlanModel(
    plannerDay({ subjects: [plannerSubject({ focusSec: 3601, tasks: [task] })] }),
    "2026-11-06",
  );
  const actions: PlanSubjectActions = {
    addSubject: vi.fn(),
    addTask: vi.fn(),
    task: vi.fn(),
    toggle: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(async () => {}),
  };
  render(
    <PlannerPlanSubjects subjects={plan.subjects} mode="today" pending={false} actions={actions} />,
  );
  expect(screen.getByText("1시간 1분")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: task.name }));
  expect(actions.toggle).toHaveBeenCalledWith(task);
});
