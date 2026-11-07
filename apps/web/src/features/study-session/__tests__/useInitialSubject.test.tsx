import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { listSubjects } from "@/lib/subjectApi";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";
import {
  parseInitialSubject,
  useInitialSubject,
  verifySubjectBeforeSeat,
} from "../useInitialSubject";
vi.mock("@/lib/subjectApi", () => ({ listSubjects: vi.fn() }));
const auth = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", () => ({ getTokenSource: () => auth.source }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.useRealTimers();
  auth.source = null;
});
it("자기 과목을 확인한 뒤에만 초기 선택을 확정한다", async () => {
  vi.mocked(listSubjects).mockResolvedValue([
    { id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
  ]);
  const { result } = renderHook(() => useInitialSubject(7, 3, false));
  expect(result.current.settled).toBe(false);
  await waitFor(() => expect(result.current.subjectId).toBe(3));
});
it("조회 실패 시 세션 시작을 막고 재시도 후 원래 과목을 선택한다", async () => {
  vi.mocked(listSubjects)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([
      { id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
    ]);
  const { result } = renderHook(() => useInitialSubject(7, 3, false));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.settled).toBe(false);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.subjectId).toBe(3));
  expect(result.current.settled).toBe(true);
});
it("삭제된 과목은 조회 성공 후 선택 없이 시작한다", async () => {
  vi.mocked(listSubjects).mockResolvedValueOnce([]);
  const { result } = renderHook(() => useInitialSubject(7, 3, false));
  await waitFor(() => expect(result.current.settled).toBe(true));
  expect(result.current.subjectId).toBeUndefined();
});
it("복원 세션은 초기 과목 조회도 선택도 적용하지 않는다", () => {
  const { result } = renderHook(() => useInitialSubject(7, 3, true));
  expect(result.current).toMatchObject({ settled: true, subjectId: undefined });
  expect(listSubjects).not.toHaveBeenCalled();
  expect(parseInitialSubject("-1")).toBeUndefined();
  expect(parseInitialSubject("3x")).toBeUndefined();
});

it("과목 조회가 지연되면 3초 뒤 재시도를 제공하고 늦은 응답은 무시한다", async () => {
  vi.useFakeTimers();
  let finish!: (subjects: Awaited<ReturnType<typeof listSubjects>>) => void;
  vi.mocked(listSubjects).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useInitialSubject(7, 3, false));
  expect(result.current.settled).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(result.current).toMatchObject({ settled: false, error: true });
  expect(vi.mocked(listSubjects).mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
  await act(async () => {
    finish([{ id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] }]);
  });
  expect(result.current).toMatchObject({ settled: false, error: true });
  vi.useRealTimers();
});

it("조회 대상이 바뀌거나 언마운트되면 이전 타이머와 응답을 정리한다", async () => {
  vi.useFakeTimers();
  let finish!: (subjects: Awaited<ReturnType<typeof listSubjects>>) => void;
  vi.mocked(listSubjects)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce([
      { id: 4, name: "영어", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
    ]);
  const { result, rerender, unmount } = renderHook(
    ({ candidate }) => useInitialSubject(7, candidate, false),
    { initialProps: { candidate: 3 } },
  );
  rerender({ candidate: 4 });
  await act(async () => {});
  expect(result.current).toMatchObject({ settled: true, subjectId: 4 });
  await act(async () => {
    finish([{ id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] }]);
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(result.current).toMatchObject({ settled: true, subjectId: 4 });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it("계정이 바뀌면 이전 계정의 오류와 늦은 응답을 새 계정에 쓰지 않는다", async () => {
  let finish!: (subjects: Awaited<ReturnType<typeof listSubjects>>) => void;
  vi.mocked(listSubjects)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce([
      { id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
    ]);
  const { result, rerender } = renderHook(({ userId }) => useInitialSubject(userId, 3, false), {
    initialProps: { userId: 7 },
  });
  rerender({ userId: 8 });
  await waitFor(() => expect(result.current.subjectId).toBe(3));
  await act(async () => finish([]));
  expect(result.current).toMatchObject({ settled: true, error: false, subjectId: 3 });
});

it("그룹 좌석 예약 전 과목 조회가 멈추면 3초 뒤 요청을 중단한다", async () => {
  vi.useFakeTimers();
  vi.mocked(listSubjects).mockImplementationOnce(() => new Promise(() => {}));
  const result = verifySubjectBeforeSeat(7, 3);
  const rejection = expect(result).rejects.toThrow("subject lookup timed out");
  await vi.advanceTimersByTimeAsync(3000);
  await rejection;
  expect(vi.mocked(listSubjects).mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
});

function authSource() {
  let userId = 7;
  const listeners = new Set<(snapshot: AuthSnapshot) => void>();
  auth.source = {
    getUserId: () => userId,
    getAccessToken: async () => "token",
    getCurrentToken: () => "token",
    refresh: async () => "token",
    hasSettled: () => true,
    subscribe: (listener: (snapshot: AuthSnapshot) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return (next: number) => {
    userId = next;
    for (const listener of listeners) listener({ userId: next, accessToken: "refreshed" });
  };
}

it("그룹 과목 확인 중 계정이 바뀌면 요청을 중단해 좌석 예약으로 진행하지 않는다", async () => {
  const changeUser = authSource();
  vi.mocked(listSubjects).mockImplementationOnce(
    ({ signal } = {}) =>
      new Promise<Awaited<ReturnType<typeof listSubjects>>>((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  );
  const pending = verifySubjectBeforeSeat(7, 3);
  const rejection = expect(pending).rejects.toThrow("aborted");
  changeUser(8);
  await rejection;
});

it("같은 계정의 토큰 갱신은 그룹 과목 확인을 중단하지 않는다", async () => {
  const refresh = authSource();
  let finish!: (subjects: Awaited<ReturnType<typeof listSubjects>>) => void;
  vi.mocked(listSubjects).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = verifySubjectBeforeSeat(7, 3);
  refresh(7);
  finish([{ id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] }]);
  await expect(pending).resolves.toBe(true);
});
