import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { listSubjects } from "@/lib/subjectApi";
import { parseInitialSubject, useInitialSubject } from "../useInitialSubject";
vi.mock("@/lib/subjectApi", () => ({ listSubjects: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("자기 과목을 확인한 뒤에만 초기 선택을 확정한다", async () => {
  vi.mocked(listSubjects).mockResolvedValue([
    { id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
  ]);
  const { result } = renderHook(() => useInitialSubject(7, 3, false));
  expect(result.current.settled).toBe(false);
  await waitFor(() => expect(result.current.subjectId).toBe(3));
});
it("삭제됐거나 조회가 실패해도 선택 없이 세션을 시작할 수 있다", async () => {
  vi.mocked(listSubjects).mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useInitialSubject(7, 3, false));
  await waitFor(() => expect(result.current.settled).toBe(true));
  expect(result.current.subjectId).toBeUndefined();
});
it("복원 세션은 초기 과목 조회도 선택도 적용하지 않는다", () => {
  const { result } = renderHook(() => useInitialSubject(7, 3, true));
  expect(result.current).toEqual({ settled: true, subjectId: undefined });
  expect(listSubjects).not.toHaveBeenCalled();
  expect(parseInitialSubject("-1")).toBeUndefined();
  expect(parseInitialSubject("3x")).toBeUndefined();
});

it("과목 조회가 지연되면 3초 뒤 선택 없이 시작하고 늦은 응답은 무시한다", async () => {
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
  expect(result.current).toEqual({ settled: true, subjectId: undefined });
  await act(async () => {
    finish([{ id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] }]);
  });
  expect(result.current).toEqual({ settled: true, subjectId: undefined });
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
  expect(result.current).toEqual({ settled: true, subjectId: 4 });
  await act(async () => {
    finish([{ id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] }]);
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(result.current).toEqual({ settled: true, subjectId: 4 });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
