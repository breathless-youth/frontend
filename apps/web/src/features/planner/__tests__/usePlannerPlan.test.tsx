import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import * as tokenSource from "@/lib/auth/tokenSource";
import { mockDeviceTimeZone } from "@/test/deviceTimeZone";

import { usePlannerPlan } from "../usePlannerPlan";
import { usePlannerPlanMutation } from "../usePlannerPlanMutation";

const request = vi.fn<typeof fetch>();
let client: QueryClient;

function Wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00+09:00"));
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  request.mockReset();
  vi.stubGlobal("fetch", request);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("usePlannerPlan", () => {
  it("미래 계획도 통합 API로 조회하고 가상 반복의 null taskId와 날짜를 보존한다", async () => {
    request.mockResolvedValue(
      Response.json(
        plannerDay({
          subjects: [
            plannerSubject({
              tasks: [
                plannerTask({
                  key: "r:4:2026-11-06",
                  taskId: null,
                  seriesId: 4,
                  occurrenceDate: "2026-11-06",
                }),
              ],
            }),
          ],
        }),
      ),
    );

    const { result } = renderHook(() => usePlannerPlan(7, "2026-11-06"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.plan?.mode).toBe("future");
    expect(result.current.plan?.subjects[0]?.tasks[0]?.key).toBe("r:4:2026-11-06");
    expect(result.current.plan?.subjects[0]?.tasks[0]?.taskId).toBeNull();
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/planner/days/2026-11-06?timeZone=Asia%2FSeoul",
    ]);
  });

  it("고정해 연 날짜가 05시에 과거가 되면 새 완료 상태를 다시 조회한다", async () => {
    vi.setSystemTime(new Date("2026-11-06T04:59:00+09:00"));
    let done = false;
    request.mockImplementation(async () =>
      Response.json(
        plannerDay({
          date: "2026-11-05",
          subjects: [
            plannerSubject({
              tasks: [
                plannerTask({
                  date: "2026-11-05",
                  done,
                  doneAt: done ? "2026-11-06T04:59:00+09:00" : null,
                }),
              ],
            }),
          ],
        }),
      ),
    );
    const { result } = renderHook(() => usePlannerPlan(7, "2026-11-05"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.plan?.mode).toBe("today"));
    expect(result.current.plan?.subjects[0]?.tasks[0]?.done).toBe(false);

    done = true;
    vi.setSystemTime(new Date("2026-11-06T05:00:00+09:00"));
    fireEvent(document, new Event("visibilitychange"));

    await waitFor(() => expect(result.current.plan?.subjects[0]?.tasks[0]?.done).toBe(true));
    expect(result.current.plan?.mode).toBe("past");
  });

  it("다른 날의 30개가 미래 날짜의 추가를 막지 않고 성공 후 새 목록을 받는다", async () => {
    let added = false;
    request.mockImplementation(async (url, init) => {
      const path = new URL(String(url), "http://localhost");
      if (init?.method === "POST") {
        expect(path.pathname).toBe("/api/planner/tasks");
        expect(JSON.parse(String(init.body))).toEqual({
          subjectId: 3,
          date: "2026-11-07",
          name: "새 계획",
          repeat: null,
        });
        added = true;
        return Response.json(plannerTask({ date: "2026-11-07", name: "새 계획" }), { status: 201 });
      }
      const date = path.pathname.split("/").at(-1)!;
      const tasks =
        date === "2026-11-06"
          ? Array.from({ length: 30 }, (_, index) =>
              plannerTask({ key: `t:${index + 1}`, taskId: index + 1 }),
            )
          : added
            ? [plannerTask({ date, name: "새 계획" })]
            : [];
      return Response.json(plannerDay({ date, subjects: [plannerSubject({ tasks })] }));
    });
    const { result, rerender } = renderHook(
      ({ date }) => ({
        query: usePlannerPlan(7, date),
        mutation: usePlannerPlanMutation(7),
      }),
      { wrapper: Wrapper, initialProps: { date: "2026-11-06" } },
    );
    await waitFor(() => expect(result.current.query.plan?.subjects[0]?.canAddTask).toBe(false));
    rerender({ date: "2026-11-07" });
    await waitFor(() => expect(result.current.query.plan?.subjects[0]?.canAddTask).toBe(true));

    await act(async () => {
      await result.current.mutation.mutateAsync({
        kind: "createTask",
        body: { subjectId: 3, date: "2026-11-07", name: "새 계획", repeat: null },
      });
    });

    await waitFor(() =>
      expect(result.current.query.plan?.subjects[0]?.tasks.map((task) => task.name)).toEqual([
        "새 계획",
      ]),
    );
  });

  it("지난 반복 회차를 늦게 완료해도 원래 key와 계획 날짜에 남는다", async () => {
    let done = false;
    const task = () =>
      plannerTask({
        key: "r:4:2026-11-04",
        date: "2026-11-04",
        seriesId: 4,
        occurrenceDate: "2026-11-04",
        done,
        doneAt: done ? "2026-11-05T03:00:00Z" : null,
      });
    request.mockImplementation(async (url, init) => {
      if (init?.method === "PATCH") {
        expect(String(url)).toBe("/api/planner/tasks/r%3A4%3A2026-11-04?timeZone=Asia%2FSeoul");
        expect(JSON.parse(String(init.body))).toEqual({ done: true });
        done = true;
        return Response.json(task());
      }
      return Response.json(
        plannerDay({ date: "2026-11-04", subjects: [plannerSubject({ tasks: [task()] })] }),
      );
    });
    const { result } = renderHook(
      () => ({ query: usePlannerPlan(7, "2026-11-04"), mutation: usePlannerPlanMutation(7) }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    await act(async () => {
      await result.current.mutation.mutateAsync({
        kind: "updateTask",
        key: "r:4:2026-11-04",
        body: { done: true },
      });
    });

    await waitFor(() =>
      expect(result.current.query.plan?.subjects[0]?.tasks[0]).toMatchObject({
        key: "r:4:2026-11-04",
        date: "2026-11-04",
        done: true,
        doneAt: "2026-11-05T03:00:00Z",
      }),
    );
  });

  it("회차 이동 후 원래 날짜와 대상 날짜를 모두 갱신하고 다른 사용자 캐시는 유지한다", async () => {
    let moved = false;
    client.setQueryData(["planner", 8, "day", "2026-11-06", "Asia/Seoul"], plannerDay());
    request.mockImplementation(async (url, init) => {
      const path = new URL(String(url), "http://localhost");
      if (init?.method === "PUT") {
        expect(path.pathname).toBe("/api/planner/tasks/r%3A4%3A2026-11-06/date");
        expect(JSON.parse(String(init.body))).toEqual({ date: "2026-11-07" });
        moved = true;
        return Response.json(
          plannerTask({
            key: "r:4:2026-11-06",
            date: "2026-11-07",
            seriesId: 4,
            occurrenceDate: "2026-11-06",
          }),
        );
      }
      const date = path.pathname.split("/").at(-1)!;
      const includesTask = date === "2026-11-06" ? !moved : moved;
      return Response.json(
        plannerDay({
          date,
          subjects: [
            plannerSubject({
              tasks: includesTask
                ? [
                    plannerTask({
                      key: "r:4:2026-11-06",
                      date,
                      seriesId: 4,
                      occurrenceDate: "2026-11-06",
                    }),
                  ]
                : [],
            }),
          ],
        }),
      );
    });
    const { result } = renderHook(
      () => ({
        source: usePlannerPlan(7, "2026-11-06"),
        target: usePlannerPlan(7, "2026-11-07"),
        mutation: usePlannerPlanMutation(7),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(result.current.source.isSuccess && result.current.target.isSuccess).toBe(true),
    );

    await act(async () => {
      await result.current.mutation.mutateAsync({
        kind: "moveTask",
        key: "r:4:2026-11-06",
        body: { date: "2026-11-07" },
      });
    });

    await waitFor(() => expect(result.current.source.plan?.subjects[0]?.tasks).toHaveLength(0));
    expect(result.current.target.plan?.subjects[0]?.tasks[0]).toMatchObject({
      key: "r:4:2026-11-06",
      date: "2026-11-07",
      occurrenceDate: "2026-11-06",
    });
    expect(
      client.getQueryState(["planner", 8, "day", "2026-11-06", "Asia/Seoul"])?.isInvalidated,
    ).toBe(false);
  });

  it("반복 회차 삭제는 THIS 범위를 보내고 그날 목록에서만 제거한다", async () => {
    let deleted = false;
    request.mockImplementation(async (url, init) => {
      if (init?.method === "DELETE") {
        expect(String(url)).toBe(
          "/api/planner/tasks/r%3A4%3A2026-11-06?scope=THIS&timeZone=Asia%2FSeoul",
        );
        deleted = true;
        return new Response(null, { status: 204 });
      }
      return Response.json(
        plannerDay({
          subjects: [
            plannerSubject({
              tasks: deleted
                ? []
                : [
                    plannerTask({
                      key: "r:4:2026-11-06",
                      seriesId: 4,
                      occurrenceDate: "2026-11-06",
                    }),
                  ],
            }),
          ],
        }),
      );
    });
    const { result } = renderHook(
      () => ({ query: usePlannerPlan(7, "2026-11-06"), mutation: usePlannerPlanMutation(7) }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.query.plan?.subjects[0]?.tasks).toHaveLength(1));

    await act(async () => {
      await result.current.mutation.mutateAsync({
        kind: "deleteTask",
        key: "r:4:2026-11-06",
        scope: "THIS",
      });
    });

    await waitFor(() => expect(result.current.query.plan?.subjects[0]?.tasks).toHaveLength(0));
  });

  it("과목 선택 성공 뒤 그날 선택한 과목을 조회한다", async () => {
    let selected = false;
    request.mockImplementation(async (url, init) => {
      if (init?.method === "PUT") {
        expect(String(url)).toBe("/api/planner/days/2026-11-06/subjects/3?timeZone=Asia%2FSeoul");
        selected = true;
        return new Response(null, { status: 204 });
      }
      return Response.json(plannerDay({ subjects: selected ? [plannerSubject()] : [] }));
    });
    const { result } = renderHook(
      () => ({ query: usePlannerPlan(7, "2026-11-06"), mutation: usePlannerPlanMutation(7) }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    await act(async () => {
      await result.current.mutation.mutateAsync({
        kind: "selectSubject",
        date: "2026-11-06",
        subjectId: 3,
      });
    });

    await waitFor(() =>
      expect(result.current.query.plan?.subjects[0]).toMatchObject({ id: 3, selected: true }),
    );
  });

  it("이 날에서 과목을 빼면 응답의 할 일과 과목 목록을 함께 갱신한다", async () => {
    let removed = false;
    request.mockImplementation(async (url, init) => {
      if (init?.method === "DELETE") {
        expect(String(url)).toBe("/api/planner/days/2026-11-06/subjects/3?timeZone=Asia%2FSeoul");
        removed = true;
        return new Response(null, { status: 204 });
      }
      return Response.json(
        plannerDay({ subjects: removed ? [] : [plannerSubject({ tasks: [plannerTask()] })] }),
      );
    });
    const { result } = renderHook(
      () => ({ query: usePlannerPlan(7, "2026-11-06"), mutation: usePlannerPlanMutation(7) }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.query.plan?.subjects).toHaveLength(1));

    await act(async () => {
      await result.current.mutation.mutateAsync({
        kind: "removeSubject",
        date: "2026-11-06",
        subjectId: 3,
      });
    });

    await waitFor(() => expect(result.current.query.plan?.subjects).toHaveLength(0));
  });

  it("그날 과목 순서를 저장하고 서버가 확정한 순서를 표시한다", async () => {
    let reordered = false;
    request.mockImplementation(async (url, init) => {
      if (init?.method === "PUT") {
        expect(String(url)).toBe(
          "/api/planner/days/2026-11-06/subjects/order?timeZone=Asia%2FSeoul",
        );
        expect(JSON.parse(String(init.body))).toEqual({ subjectIds: [8, 3] });
        reordered = true;
        return new Response(null, { status: 204 });
      }
      return Response.json(
        plannerDay({ subjects: (reordered ? [8, 3] : [3, 8]).map((id) => plannerSubject({ id })) }),
      );
    });
    const { result } = renderHook(
      () => ({ query: usePlannerPlan(7, "2026-11-06"), mutation: usePlannerPlanMutation(7) }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    await act(async () => {
      await result.current.mutation.mutateAsync({
        kind: "reorderSubjects",
        date: "2026-11-06",
        body: { subjectIds: [8, 3] },
      });
    });

    await waitFor(() =>
      expect(result.current.query.plan?.subjects.map((subject) => subject.id)).toEqual([8, 3]),
    );
  });

  it("이동 충돌은 상태와 원래 날짜를 보존하고 자동으로 다시 저장하지 않는다", async () => {
    request.mockImplementation(async (_url, init) =>
      init?.method === "PUT"
        ? Response.json(
            { code: "CONFLICT", message: "같은 반복 할 일이 이미 있는 날짜입니다" },
            { status: 409 },
          )
        : Response.json(plannerDay({ subjects: [plannerSubject({ tasks: [plannerTask()] })] })),
    );
    const { result } = renderHook(
      () => ({ query: usePlannerPlan(7, "2026-11-06"), mutation: usePlannerPlanMutation(7) }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    await act(async () => {
      await expect(
        result.current.mutation.mutateAsync({
          kind: "moveTask",
          key: "t:12",
          body: { date: "2026-11-07" },
        }),
      ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    });

    await waitFor(() => expect(result.current.mutation.isError).toBe(true));
    expect(result.current.query.plan?.subjects[0]?.tasks[0]).toMatchObject({
      date: "2026-11-06",
      done: false,
    });
    expect(request.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  });

  it("조회 실패 뒤 다시 시도하면 계획을 받는다", async () => {
    request.mockResolvedValueOnce(
      Response.json({ code: "INTERNAL_ERROR", message: "failed" }, { status: 500 }),
    );
    request.mockResolvedValue(Response.json(plannerDay({ subjects: [plannerSubject()] })));
    const { result } = renderHook(() => usePlannerPlan(7, "2026-11-06"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.plan?.subjects[0]?.name).toBe("수학"));
    expect(result.current.isSuccess).toBe(true);
  });

  it("사용자가 바뀌면 이전 사용자의 계획 캐시를 표시하지 않는다", async () => {
    request.mockResolvedValueOnce(
      Response.json(plannerDay({ subjects: [plannerSubject({ name: "첫 사용자" })] })),
    );
    request.mockResolvedValue(
      Response.json(plannerDay({ subjects: [plannerSubject({ name: "다른 사용자" })] })),
    );
    const { result, rerender } = renderHook(
      ({ userId }: { userId: number | null }) => usePlannerPlan(userId, "2026-11-06"),
      { wrapper: Wrapper, initialProps: { userId: 7 as number | null } },
    );
    await waitFor(() => expect(result.current.plan?.subjects[0]?.name).toBe("첫 사용자"));

    rerender({ userId: 8 });
    expect(result.current.plan).toBeUndefined();
    await waitFor(() => expect(result.current.plan?.subjects[0]?.name).toBe("다른 사용자"));
    rerender({ userId: null });
    expect(result.current.plan).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("시간대가 바뀌면 이전 요청을 중단하고 새 시간대의 응답만 표시한다", async () => {
    let finishOld = () => {};
    let oldSignal: AbortSignal | null | undefined;
    request.mockImplementation(async (url, init) => {
      if (new URL(String(url), "http://localhost").searchParams.get("timeZone") === "Asia/Seoul") {
        oldSignal = init?.signal;
        return new Promise<Response>((resolve) => {
          finishOld = () =>
            resolve(
              Response.json(plannerDay({ subjects: [plannerSubject({ name: "이전 시간대" })] })),
            );
        });
      }
      return Response.json(
        plannerDay({
          timeZone: "America/New_York",
          subjects: [plannerSubject({ name: "새 시간대" })],
        }),
      );
    });
    const { result } = renderHook(() => usePlannerPlan(7, "2026-11-06"), { wrapper: Wrapper });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    mockDeviceTimeZone("America/New_York");
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(result.current.plan?.subjects[0]?.name).toBe("새 시간대"));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => finishOld());
    expect(result.current.plan?.timeZone).toBe("America/New_York");
    expect(result.current.plan?.subjects[0]?.name).toBe("새 시간대");
  });
});

it("여러 과목 추가의 후속 요청은 원래 계정과 현재 계정이 다르면 보내지 않는다", async () => {
  const source = {
    getUserId: () => 8,
    getAccessToken: async () => "new-token",
    getCurrentToken: () => "new-token",
    refresh: async () => "new-token",
    hasSettled: () => true,
    subscribe: () => () => {},
  };
  const spy = vi.spyOn(tokenSource, "getTokenSource").mockReturnValue(source);
  const { result } = renderHook(() => usePlannerPlanMutation(8), { wrapper: Wrapper });
  await expect(
    result.current.mutateAsync({
      kind: "selectSubject",
      ownerId: 7,
      date: "2026-11-06",
      subjectId: 3,
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect(request).not.toHaveBeenCalled();
  spy.mockRestore();
});
