import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { PlannerRepeatScopeDialog } from "../PlannerRepeatScopeDialog";
afterEach(cleanup);
it("삭제 범위는 이 날만이 기본이고 앞으로 모두로 바꿀 수 있다", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <PlannerRepeatScopeDialog open onOpenChange={() => {}} action="delete" onConfirm={save} />,
  );
  expect(screen.getByRole("radio", { name: "이 날만" })).toBeChecked();
  await userEvent.click(screen.getByRole("radio", { name: "이 날부터 앞으로 모두" }));
  await userEvent.click(screen.getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith("FUTURE"));
});

it("지난 날이라 거절되면 그 이유를 보여 준다", async () => {
  const save = vi.fn().mockRejectedValue(new ApiError("past", 400, "PLANNER_PAST_DAY"));
  render(
    <PlannerRepeatScopeDialog open onOpenChange={() => {}} action="delete" onConfirm={save} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "삭제" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("지난 날의 계획은 바꿀 수 없어요");
});
