import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { PlannerRepeatSheet } from "../PlannerRepeatSheet";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("평일 반복을 고르면 월요일부터 금요일까지를 한 규칙으로 저장한다", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <PlannerRepeatSheet
      open
      onOpenChange={() => {}}
      dateKey="2026-11-06"
      userId={7}
      initial={null}
      onSave={save}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "평일" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      weekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      endDate: null,
    }),
  );
});

it("반복 종료일을 고른 뒤 종료일 시트에서 확인하고 전체 규칙을 저장한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json([])),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={client}>
      <PlannerRepeatSheet
        open
        onOpenChange={() => {}}
        dateKey="2026-11-06"
        userId={7}
        initial={{
          weekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
          endDate: null,
        }}
        onSave={save}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: /반복 종료일/ }));
  await userEvent.click(screen.getByRole("radio", { name: /날짜 정하기/ }));
  await userEvent.click(screen.getByRole("button", { name: /11월 30일/ }));
  expect(screen.getByRole("radio", { name: /날짜 정하기/ })).toBeChecked();
  expect(save).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(screen.getByText("11월 6일부터 11월 30일까지 평일마다 넣어요")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      weekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      endDate: "2026-11-30",
    }),
  );
  client.clear();
});

it("반복 저장이 지난 날이라 거절되면 그 이유를 보여 준다", async () => {
  const save = vi.fn().mockRejectedValue(new ApiError("past", 400, "PLANNER_PAST_DAY"));
  render(
    <PlannerRepeatSheet
      open
      onOpenChange={() => {}}
      dateKey="2026-11-06"
      userId={7}
      initial={null}
      onSave={save}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "평일" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("지난 날의 계획은 바꿀 수 없어요");
});
