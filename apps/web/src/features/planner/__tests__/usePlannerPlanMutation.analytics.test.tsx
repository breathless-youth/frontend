import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PlannerTaskCreateRequest } from "@focusmakers/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { trackSubjectItemAdded } from "@/lib/amplitude";
import { plannerTask } from "@/test/plannerFixtures";

import { usePlannerPlanMutation } from "../usePlannerPlanMutation";

vi.mock("@/lib/amplitude", () => ({ trackSubjectItemAdded: vi.fn() }));

const request = vi.fn<typeof fetch>();
let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  vi.stubGlobal("fetch", request);
  request.mockReset();
  vi.mocked(trackSubjectItemAdded).mockReset();
});

afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const createBody = {
  subjectId: 3,
  name: "단어 외우기",
  date: "2026-11-12",
} satisfies PlannerTaskCreateRequest;

it("새 플래너에서 할 일 저장에 성공하면 플래너 할 일 추가로 한 번 기록한다", async () => {
  request.mockResolvedValue(Response.json(plannerTask()));
  const { result } = renderHook(() => usePlannerPlanMutation(7), { wrapper });

  await result.current.mutateAsync({ kind: "createTask", body: createBody });

  expect(trackSubjectItemAdded).toHaveBeenCalledTimes(1);
  expect(trackSubjectItemAdded).toHaveBeenCalledWith("task", false, "planner");
});

it("할 일 저장이 실패하면 기록하지 않는다", async () => {
  request.mockResolvedValue(Response.json({ code: "INVALID" }, { status: 400 }));
  const { result } = renderHook(() => usePlannerPlanMutation(7), { wrapper });

  await expect(
    result.current.mutateAsync({ kind: "createTask", body: createBody }),
  ).rejects.toThrow();

  expect(trackSubjectItemAdded).not.toHaveBeenCalled();
});

it("할 일 저장이 아닌 플래너 변경은 기록하지 않는다", async () => {
  request.mockResolvedValue(new Response(null, { status: 204 }));
  const { result } = renderHook(() => usePlannerPlanMutation(7), { wrapper });

  await result.current.mutateAsync({ kind: "deleteTask", key: "t-1", scope: "THIS" });

  expect(trackSubjectItemAdded).not.toHaveBeenCalled();
});
