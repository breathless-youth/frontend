import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { plannerTask } from "@/test/plannerFixtures";
import { mockDeviceTimeZone } from "@/test/deviceTimeZone";
import { usePlannerCarryover } from "../usePlannerCarryover";

const auth = vi.hoisted(() => ({ token: true }));
vi.mock("@/lib/userId", () => ({ hasTokenSource: () => auth.token }));
const subjectsApi = vi.hoisted(() => ({ listSubjects: vi.fn(async () => []) }));
vi.mock("@/lib/subjectApi", () => subjectsApi);
const request = vi.fn<typeof fetch>();
let client: QueryClient;
function Wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const tasks = [
  plannerTask({ key: "t:1", date: "2026-11-04" }),
  plannerTask({ key: "t:2", date: "2026-11-03" }),
];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00+09:00"));
  focusManager.setFocused(true);
  auth.token = true;
  subjectsApi.listSubjects.mockReset().mockResolvedValue([]);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  request.mockReset().mockImplementation(async () => Response.json(tasks));
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  client.clear();
  focusManager.setFocused(undefined);
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
});
it("결과를 받지 못한 가져오기는 선택을 바꾸지 않고 같은 본문으로 재시도한다", async () => {
  let first = true;
  request.mockImplementation(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(tasks);
    if (first) {
      first = false;
      throw new TypeError("response lost");
    }
    return Response.json([]);
  });
  const { result } = renderHook(() => usePlannerCarryover(7, { ready: true, blocked: false }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.open).toBe(true));
  await act(async () => {
    await expect(result.current.submit(["t:1"])).rejects.toThrow();
  });
  expect(result.current.uncertain).toBe(true);
  await act(async () => {
    await result.current.submit([]);
  });
  const bodies = request.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));
  expect(bodies).toEqual([
    { offeredKeys: ["t:1", "t:2"], selectedKeys: ["t:1"] },
    { offeredKeys: ["t:1", "t:2"], selectedKeys: ["t:1"] },
  ]);
  expect(result.current.open).toBe(false);
});

it("다른 창이 닫히면 같은 홈 접속에서 후보를 조회한다", async () => {
  const { result, rerender } = renderHook(
    ({ blocked }) => usePlannerCarryover(7, { ready: true, blocked }),
    { wrapper: Wrapper, initialProps: { blocked: true } },
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(request).not.toHaveBeenCalled();
  rerender({ blocked: false });
  await waitFor(() => expect(result.current.tasks).toHaveLength(2));
  expect(String(request.mock.calls[0]![0])).toBe("/api/planner/carryover?timeZone=Asia%2FSeoul");
});

it("토큰 출처가 없는 구 앱은 새 플래너 API를 호출하지 않는다", async () => {
  auth.token = false;
  const { result } = renderHook(() => usePlannerCarryover(7, { ready: true, blocked: false }), {
    wrapper: Wrapper,
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.open).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

it("권한과 팝업 판단을 기다리고 늦은 복구 동안 후보만 잠시 숨긴다", async () => {
  const { result, rerender } = renderHook(
    ({ ready, blocked }) => usePlannerCarryover(7, { ready, blocked }),
    { wrapper: Wrapper, initialProps: { ready: false, blocked: false } },
  );
  expect(request).not.toHaveBeenCalled();
  rerender({ ready: true, blocked: false });
  await waitFor(() => expect(result.current.open).toBe(true));
  rerender({ ready: true, blocked: true });
  expect(result.current.open).toBe(false);
  expect(result.current.tasks).toEqual(tasks);
  rerender({ ready: true, blocked: false });
  await waitFor(() => expect(result.current.open).toBe(true));
  expect(request).toHaveBeenCalledTimes(1);
});

it("사용자가 명시적으로 보류한 안내는 다른 창을 닫아도 같은 접속에 다시 열지 않는다", async () => {
  const { result, rerender } = renderHook(
    ({ blocked }) => usePlannerCarryover(7, { ready: true, blocked }),
    { wrapper: Wrapper, initialProps: { blocked: false } },
  );
  await waitFor(() => expect(result.current.open).toBe(true));
  act(() => result.current.defer());
  rerender({ blocked: true });
  rerender({ blocked: false });
  expect(result.current.open).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
  act(() => focusManager.setFocused(false));
  act(() => focusManager.setFocused(true));
  await waitFor(() => expect(result.current.open).toBe(true));
  expect(request).toHaveBeenCalledTimes(2);
});

it("05시 날짜와 시간대 변경은 머무는 홈에서 새 창을 띄우지 않고 다음 접속에 다시 판단한다", async () => {
  vi.setSystemTime(new Date("2026-11-06T04:59:00+09:00"));
  request.mockResolvedValue(Response.json([]));
  const { result, rerender } = renderHook(
    () => usePlannerCarryover(7, { ready: true, blocked: false }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  await act(async () => {
    await Promise.resolve();
  });
  request.mockResolvedValue(Response.json(tasks));
  vi.setSystemTime(new Date("2026-11-06T05:00:00+09:00"));
  rerender();
  expect(result.current.open).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
  act(() => focusManager.setFocused(false));
  act(() => focusManager.setFocused(true));
  await waitFor(() => expect(result.current.open).toBe(true));
  mockDeviceTimeZone("America/New_York");
  rerender();
  expect(result.current.open).toBe(false);
  expect(request).toHaveBeenCalledTimes(2);
});

it("조회 실패나 알 수 없는 응답은 다음 접속까지 쉬고 자동으로 서버 무시를 보내지 않는다", async () => {
  request.mockResolvedValueOnce(Response.json({ tasks }));
  const { result } = renderHook(() => usePlannerCarryover(7, { ready: true, blocked: false }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.open).toBe(false);
  act(() => focusManager.setFocused(false));
  act(() => focusManager.setFocused(true));
  await waitFor(() => expect(result.current.open).toBe(true));
  expect(request.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
});

it("한도 거부는 후보와 선택을 보존하고 재시도 성공 때만 요청한 사용자 캐시를 갱신한다", async () => {
  let refuse = true;
  request.mockImplementation(async (_url, init) =>
    init?.method === "POST"
      ? refuse
        ? Response.json({ code: "CONFLICT", message: "limit" }, { status: 409 })
        : Response.json([])
      : Response.json(tasks),
  );
  client.setQueryData(["planner", 7, "day", "2026-11-04", "Asia/Seoul"], { original: true });
  client.setQueryData(["planner", 8, "day", "2026-11-04", "Asia/Seoul"], { other: true });
  const { result } = renderHook(() => usePlannerCarryover(7, { ready: true, blocked: false }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.open).toBe(true));
  await act(async () => {
    await expect(result.current.submit(["t:2"])).rejects.toMatchObject({ status: 409 });
  });
  expect(result.current.tasks).toHaveLength(2);
  expect(
    client.getQueryState(["planner", 7, "day", "2026-11-04", "Asia/Seoul"])?.isInvalidated,
  ).toBe(false);
  refuse = false;
  await act(async () => {
    await result.current.submit(["t:2"]);
  });
  expect(result.current.open).toBe(false);
  expect(
    JSON.parse(String(request.mock.calls.find(([, init]) => init?.method === "POST")![1]?.body)),
  ).toEqual({
    offeredKeys: ["t:1", "t:2"],
    selectedKeys: ["t:2"],
  });
  expect(
    client.getQueryState(["planner", 7, "day", "2026-11-04", "Asia/Seoul"])?.isInvalidated,
  ).toBe(true);
  expect(
    client.getQueryState(["planner", 8, "day", "2026-11-04", "Asia/Seoul"])?.isInvalidated,
  ).toBe(false);
});

it("사용자가 바뀌면 남의 후보를 즉시 숨기고 다음 접속에 새 사용자로 조회한다", async () => {
  const { result, rerender } = renderHook(
    ({ userId }) => usePlannerCarryover(userId, { ready: true, blocked: false }),
    { wrapper: Wrapper, initialProps: { userId: 7 } },
  );
  await waitFor(() => expect(result.current.open).toBe(true));
  rerender({ userId: 8 });
  expect(result.current.tasks).toBeNull();
  act(() => focusManager.setFocused(false));
  act(() => focusManager.setFocused(true));
  await waitFor(() => expect(result.current.open).toBe(true));
  expect(client.getQueryData(["planner", 8, "carryover", "2026-11-05", "Asia/Seoul"])).toHaveLength(
    2,
  );
});

it("가려진 사이 끝난 조회는 표시하지 않고 다음 접속에는 새 응답만 쓴다", async () => {
  let finish = (_response: Response) => {};
  let signal: AbortSignal | null | undefined;
  request.mockImplementationOnce(async (_url, init) => {
    signal = init?.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const { result } = renderHook(() => usePlannerCarryover(7, { ready: true, blocked: false }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  act(() => focusManager.setFocused(false));
  expect(signal?.aborted).toBe(true);
  await act(async () =>
    finish(Response.json([plannerTask({ name: "이전 응답", date: "2026-11-04" })])),
  );
  expect(result.current.tasks).toBeNull();
  act(() => focusManager.setFocused(true));
  await waitFor(() => expect(result.current.tasks?.[0]?.name).toBe("수학 3단원"));
});

it("연속 제출은 한 요청을 공유하고 그냥 둘게요도 offeredKeys를 전부 보낸다", async () => {
  let finish = (_response: Response) => {};
  request.mockImplementation(async (_url, init) =>
    init?.method === "POST"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Response.json(tasks),
  );
  const { result } = renderHook(() => usePlannerCarryover(7, { ready: true, blocked: false }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.open).toBe(true));
  const first = result.current.submit([]),
    second = result.current.submit(["t:1"]);
  expect(first).toBe(second);
  expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(
    JSON.parse(String(request.mock.calls.find(([, init]) => init?.method === "POST")![1]?.body)),
  ).toEqual({ offeredKeys: ["t:1", "t:2"], selectedKeys: [] });
  await act(async () => {
    finish(Response.json([]));
    await first;
  });
  expect(result.current.open).toBe(false);
});

it("이전 사용자 저장 중 새 사용자 접속의 제출을 이전 Promise로 처리하지 않는다", async () => {
  const finishes: ((_response: Response) => void)[] = [];
  request.mockImplementation(async (_url, init) =>
    init?.method === "POST"
      ? new Promise((resolve) => {
          finishes.push(resolve);
        })
      : Response.json(tasks),
  );
  const { result, rerender } = renderHook(
    ({ userId }) => usePlannerCarryover(userId, { ready: true, blocked: false }),
    { wrapper: Wrapper, initialProps: { userId: 7 } },
  );
  await waitFor(() => expect(result.current.open).toBe(true));
  const first = result.current.submit([]);
  rerender({ userId: 8 });
  act(() => focusManager.setFocused(false));
  act(() => focusManager.setFocused(true));
  await waitFor(() => expect(result.current.open).toBe(true));
  const second = result.current.submit(["t:2"]);
  expect(second).not.toBe(first);
  expect(finishes).toHaveLength(2);
  await act(async () => {
    finishes[0]!(Response.json([]));
    await first;
  });
  expect(result.current.open).toBe(true);
  await act(async () => {
    finishes[1]!(Response.json([]));
    await second;
  });
  expect(result.current.open).toBe(false);
});

it("document visibilitychange도 새 홈 접속으로 판단한다", async () => {
  const { result } = renderHook(() => usePlannerCarryover(7, { ready: true, blocked: false }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.open).toBe(true));
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  fireEvent(document, new Event("visibilitychange"));
  expect(result.current.open).toBe(false);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() => expect(result.current.open).toBe(true));
  expect(request).toHaveBeenCalledTimes(2);
});

it("가져오기 성공 본문도 알 수 없으면 후보를 유지해 멱등 요청으로 재시도할 수 있다", async () => {
  request.mockImplementation(async (_url, init) =>
    init?.method === "POST" ? Response.json({ unexpected: true }) : Response.json(tasks),
  );
  const { result } = renderHook(() => usePlannerCarryover(7, { ready: true, blocked: false }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.open).toBe(true));
  await act(async () => {
    await expect(result.current.submit(["t:1"])).rejects.toThrow();
  });
  expect(result.current.tasks).toHaveLength(2);
});

it("과목 목록 실패는 가져오기를 막지 않고 사용자 범위를 벗어난 캐시를 읽지 않는다", async () => {
  subjectsApi.listSubjects.mockRejectedValue(new Error("offline"));
  client.setQueryData(
    ["subjects", 8],
    [{ id: 3, name: "다른 사용자 과목", colorIndex: 3, studySec: 0, focusSec: 0, tasks: [] }],
  );
  const { result } = renderHook(() => usePlannerCarryover(7, { ready: true, blocked: false }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.open).toBe(true));
  expect(result.current.subjects).toEqual([]);
});

it("후보가 바뀌었다는 거절은 후보를 새로 받아 바꾸고 사용자 캐시를 갱신한다", async () => {
  let candidates = tasks;
  request.mockImplementation(async (_url, init) =>
    init?.method === "POST"
      ? Response.json(
          { code: "PLANNER_CARRYOVER_CHANGED", message: "후보가 바뀌었습니다" },
          { status: 409 },
        )
      : Response.json(candidates),
  );
  client.setQueryData(["planner", 7, "day", "2026-11-04", "Asia/Seoul"], { original: true });
  const { result } = renderHook(() => usePlannerCarryover(7, { ready: true, blocked: false }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.open).toBe(true));
  candidates = [tasks[1]!];
  await act(async () => {
    await expect(result.current.submit(["t:1"])).rejects.toMatchObject({ status: 409 });
  });
  await waitFor(() => expect(result.current.tasks?.map((task) => task.key)).toEqual(["t:2"]));
  expect(result.current.open).toBe(true);
  expect(
    client.getQueryState(["planner", 7, "day", "2026-11-04", "Asia/Seoul"])?.isInvalidated,
  ).toBe(true);
});
