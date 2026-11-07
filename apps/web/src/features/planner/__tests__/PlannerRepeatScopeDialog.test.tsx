import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
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
