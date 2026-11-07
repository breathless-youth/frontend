import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SubjectsStore } from "@/features/study-session/useSubjects";
import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import { PlannerSessionSubjectPanel } from "../PlannerSessionSubjectPanel";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
});
it("오늘의 가상 회차를 그대로 표시하고 완료 때 opaque key로 저장한다", async () => {
  const requests: string[] = [];
  const date = "2026-11-05";
  const task = plannerTask({ key: `r:4:${date}`, taskId: null, seriesId: 4, date });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      requests.push(`${init?.method ?? "GET"} ${String(input)}`);
      return Response.json(
        init?.method === "PATCH"
          ? { ...task, taskId: 42, done: true, doneAt: new Date().toISOString() }
          : plannerDay({ date, subjects: [plannerSubject({ tasks: [task] })] }),
      );
    }),
  );
  const store = {
    subjects: [
      { id: 3, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] },
      { id: 4, name: "영어", colorIndex: 1, studySec: 0, focusSec: 0, tasks: [] },
    ],
    status: "ready",
    reload: vi.fn(),
  } as unknown as SubjectsStore;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlannerSessionSubjectPanel
        userId={7}
        store={store}
        selection={null}
        onSelect={() => {}}
        onRequestClose={() => {}}
        paused={false}
        onNotice={() => {}}
        liveTotals={new Map()}
        landscape={false}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole("checkbox", { name: task.name }));
  await waitFor(() =>
    expect(requests.some((url) => url.includes(`PATCH /api/planner/tasks/r%3A4%3A${date}`))).toBe(
      true,
    ),
  );
  expect(screen.getByText("다른 과목")).toBeInTheDocument();
  expect(requests.some((url) => url.includes("/api/subjects/3/tasks"))).toBe(false);
  client.clear();
});
it("다른 과목의 재생은 오늘에 등록한 뒤 측정 과목으로 고른다", async () => {
  const selected = vi.fn();
  const order: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input, init) => {
      if (init?.method === "PUT") {
        order.push("registered");
        return new Response(null, { status: 204 });
      }
      return Response.json(plannerDay({ date: "2026-11-05" }));
    }),
  );
  const store = {
    subjects: [{ id: 4, name: "영어", colorIndex: 1, studySec: 0, focusSec: 0, tasks: [] }],
    status: "ready",
    reload: vi.fn(),
  } as unknown as SubjectsStore;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlannerSessionSubjectPanel
        userId={7}
        store={store}
        selection={null}
        onSelect={(id) => {
          order.push("selected");
          selected(id);
        }}
        onRequestClose={() => {}}
        paused={false}
        onNotice={() => {}}
        liveTotals={new Map()}
        landscape={false}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole("button", { name: /영어.*시작/ }));
  await waitFor(() => expect(selected).toHaveBeenCalledWith(4));
  expect(order).toEqual(["registered", "selected"]);
  client.clear();
});
