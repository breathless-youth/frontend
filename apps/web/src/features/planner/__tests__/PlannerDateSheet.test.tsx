import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlannerDateSheet } from "../PlannerDateSheet";

const request = vi.fn<typeof fetch>();
let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  request.mockReset();
  vi.stubGlobal("fetch", request);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

describe("PlannerDateSheet", () => {
  it("마지막 선택 날짜를 지정하면 그 다음 날부터 고를 수 없다", async () => {
    const onPick = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <PlannerDateSheet
          open
          userId={null}
          dateKey="2026-11-04"
          todayKey="2026-11-05"
          maxDate="2026-11-05"
          onOpenChange={() => {}}
          onPick={onPick}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("button", { name: /11월 4일/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /11월 5일.*오늘/ })).toBeEnabled();
    const future = screen.getByRole("button", { name: /11월 6일/ });
    expect(future).toBeDisabled();
    await userEvent.click(future);
    expect(onPick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /11월 5일.*오늘/ }));
    expect(onPick).toHaveBeenCalledExactlyOnceWith("2026-11-05");
  });
  it("날짜 이동을 저장하는 동안 Escape 닫기를 막고 저장 뒤에만 닫는다", async () => {
    request.mockResolvedValue(Response.json([]));
    let finish!: () => void;
    const confirmation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <PlannerDateSheet
          open
          userId={7}
          dateKey="2026-11-06"
          todayKey="2026-11-05"
          minDate="2026-11-05"
          title="어느 날로 옮길까요?"
          confirmLabel={() => "옮기기"}
          onConfirm={() => confirmation}
          onOpenChange={onOpenChange}
          onPick={() => {}}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /11월 7일/ }));
    await userEvent.click(screen.getByRole("button", { name: "옮기기" }));
    expect(screen.getByRole("button", { name: "옮기기" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "어느 날로 옮길까요?" })).toBeInTheDocument();
    await act(async () => {
      finish();
      await confirmation;
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false));
  });
  it("이동은 과거와 원래 날짜를 막고 확인 전에는 저장하지 않는다", async () => {
    request.mockResolvedValue(Response.json([]));
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={client}>
        <PlannerDateSheet
          open
          userId={7}
          dateKey="2026-11-06"
          todayKey="2026-11-05"
          minDate="2026-11-05"
          excludeDate="2026-11-06"
          title="어느 날로 옮길까요?"
          confirmLabel={(date) => `${date}로 옮기기`}
          onConfirm={save}
          onOpenChange={() => {}}
          onPick={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("button", { name: /11월 4일/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /11월 6일/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /11월 7일/ }));
    expect(save).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "2026-11-07로 옮기기" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("2026-11-07"));
  });
  it("공부한 날·할 일만 있는 날·오늘을 구분하고 미래 날짜를 고른다", async () => {
    request.mockResolvedValue(
      Response.json(
        Array.from({ length: 30 }, (_, index) => ({
          date: `2026-11-${String(index + 1).padStart(2, "0")}`,
          taskCount: index === 5 ? 1 : 0,
          completedCount: 0,
          studySec: index === 3 ? 3600 : 0,
          focusSec: index === 3 ? 3000 : 0,
          studied: index === 3,
          hasTasks: index === 5,
          goalSec: null,
        })),
      ),
    );
    const onPick = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <PlannerDateSheet
          open
          userId={7}
          dateKey="2026-11-05"
          todayKey="2026-11-05"
          onOpenChange={onOpenChange}
          onPick={onPick}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: /11월 4일.*공부한 날/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /11월 5일.*오늘/ })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /11월 6일.*할 일 있는 날/ }));

    await waitFor(() => expect(onPick).toHaveBeenCalledWith("2026-11-06"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(request.mock.calls[0]?.[0]).toBe(
      "/api/planner/summary?from=2026-11-01&to=2026-11-30&timeZone=Asia%2FSeoul",
    );
  });
});
