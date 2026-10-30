import type { SubjectDayResponse } from "@focusmakers/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { completeSubject, listSubjectsOnDay, uncompleteSubject } from "@/lib/subjectApi";
import { showToast } from "@/lib/toast";

import { useSubjectCompletion } from "../subjectCompletion";

vi.mock("@/lib/subjectApi", () => ({
  listSubjectsOnDay: vi.fn(),
  completeSubject: vi.fn(),
  uncompleteSubject: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

const mockedList = vi.mocked(listSubjectsOnDay);
const mockedComplete = vi.mocked(completeSubject);
const mockedUncomplete = vi.mocked(uncompleteSubject);

const DATE = "2026-10-29";
const OTHER_DATE = "2026-10-28";
const DONE_AT = "2026-10-29T03:00:00Z";

const daySubject = (id: number, completed: boolean): SubjectDayResponse => ({
  id,
  name: `과목${String(id)}`,
  colorIndex: id,
  deleted: false,
  studySec: 0,
  focusSec: 0,
  completed,
  completedAt: completed ? DONE_AT : null,
});

/** 끝나는 때를 테스트가 정하는 요청 */
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderCompletion(initial = { userId: 7, dateKey: DATE }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ userId, dateKey }: { userId: number; dateKey: string }) =>
      useSubjectCompletion(userId, dateKey),
    { wrapper, initialProps: initial },
  );
  return { ...view, queryClient };
}

async function renderLoaded(initial?: { userId: number; dateKey: string }) {
  const view = renderCompletion(initial);
  await waitFor(() => expect(view.result.current).not.toBeNull());
  return view;
}

describe("useSubjectCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedList.mockResolvedValue([daySubject(1, true), daySubject(2, false)]);
    mockedComplete.mockResolvedValue(undefined);
    mockedUncomplete.mockResolvedValue(undefined);
  });

  it("받는 동안은 null이다", () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    const { result } = renderCompletion();

    expect(result.current).toBeNull();
    expect(mockedList).toHaveBeenCalledWith(DATE);
  });

  it("처음 조회가 실패하면 알리지 않고 null로 남는다", async () => {
    mockedList.mockRejectedValue(new Error("날짜별 과목 조회 실패 (HTTP 404)"));
    const { result } = renderCompletion();

    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("받아 둔 뒤에 만든 과목도 바로 완료로 보이고 저장한다", async () => {
    const { result } = await renderLoaded();
    mockedList.mockResolvedValue([daySubject(1, true), daySubject(2, false), daySubject(3, false)]);
    mockedComplete.mockImplementation(async () => {
      mockedList.mockResolvedValue([
        daySubject(1, true),
        daySubject(2, false),
        daySubject(3, true),
      ]);
    });

    act(() => result.current!.setDone(3, true));

    expect(result.current!.isDone(3)).toBe(true);
    await waitFor(() => expect(mockedComplete).toHaveBeenCalledExactlyOnceWith(3, DATE));
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    expect(result.current!.isDone(3)).toBe(true);
  });

  it("받아 둔 뒤에 만든 과목을 저장한 뒤 다시 받기가 실패해도 완료로 남는다", async () => {
    const { result } = await renderLoaded();
    mockedList.mockRejectedValue(new Error("network"));

    act(() => result.current!.setDone(3, true));

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(result.current!.isDone(3)).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("날짜와 사용자마다 따로 받아 그 값으로 답한다", async () => {
    mockedList.mockImplementation(async (date) =>
      date === OTHER_DATE ? [daySubject(2, true)] : [daySubject(1, true), daySubject(2, false)],
    );
    const { result, rerender } = await renderLoaded();
    expect(result.current!.isDone(2)).toBe(false);

    rerender({ userId: 7, dateKey: OTHER_DATE });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.isDone(2)).toBe(true));
    expect(result.current!.isDone(1)).toBe(false);

    rerender({ userId: 8, dateKey: OTHER_DATE });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(mockedList).toHaveBeenCalledTimes(3);
  });

  it("받아 둔 뒤에 만든 과목의 저장이 실패하면 되돌리고 알린다", async () => {
    mockedComplete.mockRejectedValueOnce(new Error("network"));
    const { result } = await renderLoaded();

    act(() => result.current!.setDone(3, true));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("완료를 저장하지 못했어요. 다시 시도해 주세요"),
    );
    expect(result.current!.isDone(3)).toBe(false);
  });

  it("저장 중에 끝난 재조회가 낡은 서버 값을 들고 와도 저장 중인 표시는 유지한다", async () => {
    mockedComplete.mockReturnValue(new Promise(() => {}));
    const { result, queryClient } = await renderLoaded();

    act(() => result.current!.setDone(2, true));
    await waitFor(() => expect(mockedComplete).toHaveBeenCalled());
    await act(() => queryClient.refetchQueries({ queryKey: ["subjects", "day", 7, DATE] }));

    expect(result.current!.isDone(2)).toBe(true);
  });

  it("받아 둔 뒤 재조회가 실패해도 받아 둔 값으로 계속 보여 준다", async () => {
    const { result, queryClient } = await renderLoaded();
    mockedList.mockRejectedValue(new Error("network"));

    await act(() => queryClient.refetchQueries({ queryKey: ["subjects", "day", 7, DATE] }));

    expect(queryClient.getQueryState(["subjects", "day", 7, DATE])?.status).toBe("error");
    expect(result.current?.isDone(1)).toBe(true);
  });

  it("서버의 그날 완료 여부를 그대로 읽는다", async () => {
    const { result } = await renderLoaded();

    expect(result.current?.isDone(1)).toBe(true);
    expect(result.current?.isDone(2)).toBe(false);
    expect(result.current?.isDone(99)).toBe(false);
  });

  it("완료 표시·취소는 화면에 먼저 반영하고 그 과목과 날짜로 저장한 뒤 그날을 다시 받는다", async () => {
    const save = deferred();
    mockedComplete.mockReturnValueOnce(save.promise);
    const { result } = await renderLoaded();
    const loads = mockedList.mock.calls.length;

    act(() => result.current?.setDone(2, true));
    await waitFor(() => expect(result.current?.isDone(2)).toBe(true));
    expect(mockedComplete).toHaveBeenCalledWith(2, DATE);
    expect(mockedList).toHaveBeenCalledTimes(loads);

    await act(async () => save.resolve());
    await waitFor(() => expect(mockedList.mock.calls.length).toBeGreaterThan(loads));

    act(() => result.current?.setDone(1, false));
    await waitFor(() => expect(mockedUncomplete).toHaveBeenCalledWith(1, DATE));
  });

  it("저장이 끝나기 전에 같은 과목을 다시 눌러도 한 번만 보낸다", async () => {
    mockedComplete.mockReturnValue(new Promise(() => {}));
    const { result } = await renderLoaded();

    act(() => {
      result.current?.setDone(2, true);
      result.current?.setDone(2, true);
    });
    await waitFor(() => expect(result.current?.isDone(2)).toBe(true));
    act(() => result.current?.setDone(2, false));

    await act(async () => {});
    expect(mockedComplete).toHaveBeenCalledTimes(1);
    expect(mockedUncomplete).not.toHaveBeenCalled();
    expect(result.current?.isDone(2)).toBe(true);
  });

  it("앞 날짜의 저장이 끝나기 전에 날짜를 바꿔도 새 날짜의 같은 과목은 바로 저장하고, 앞 요청이 끝나도 새 요청의 잠금은 남는다", async () => {
    const oldSave = deferred();
    const newSave = deferred();
    mockedComplete.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(newSave.promise);
    const { result, rerender } = await renderLoaded();

    act(() => result.current?.setDone(2, true));
    await waitFor(() => expect(mockedComplete).toHaveBeenCalledWith(2, DATE));

    rerender({ userId: 7, dateKey: OTHER_DATE });
    await waitFor(() => expect(result.current?.isDone(2)).toBe(false));
    act(() => result.current?.setDone(2, true));
    await waitFor(() => expect(mockedComplete).toHaveBeenCalledWith(2, OTHER_DATE));

    await act(async () => oldSave.resolve());
    act(() => result.current?.setDone(2, false));
    await act(async () => {});
    expect(mockedUncomplete).not.toHaveBeenCalled();

    // 저장이 끝난 뒤 다시 받으면 서버에도 완료가 남아 있다.
    mockedList.mockResolvedValue([daySubject(1, true), daySubject(2, true)]);
    await act(async () => newSave.resolve());
    act(() => result.current?.setDone(2, false));
    await waitFor(() => expect(mockedUncomplete).toHaveBeenCalledWith(2, OTHER_DATE));
  });

  it("앞 사용자의 저장이 끝나기 전에 사용자가 바뀌어도 새 사용자의 같은 과목은 바로 저장한다", async () => {
    mockedComplete.mockReturnValue(new Promise(() => {}));
    const { result, rerender } = await renderLoaded();

    act(() => result.current?.setDone(2, true));
    await waitFor(() => expect(mockedComplete).toHaveBeenCalledTimes(1));

    rerender({ userId: 8, dateKey: DATE });
    await waitFor(() => expect(result.current?.isDone(2)).toBe(false));
    act(() => result.current?.setDone(2, true));

    await waitFor(() => expect(mockedComplete).toHaveBeenCalledTimes(2));
  });

  it("완료 표시가 실패하면 되돌리고 알린다", async () => {
    mockedComplete.mockRejectedValueOnce(new Error("network"));
    const { result } = await renderLoaded();

    act(() => result.current?.setDone(2, true));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("완료를 저장하지 못했어요. 다시 시도해 주세요"),
    );
    expect(result.current?.isDone(2)).toBe(false);
  });

  it("완료 취소가 실패하면 원래 완료 시각까지 그대로 되돌린다", async () => {
    mockedUncomplete.mockRejectedValueOnce(new Error("network"));
    const { result, queryClient } = await renderLoaded();
    // 실패 뒤 다시 받기가 끝나지 않게 막아 되돌린 값만 남긴다.
    mockedList.mockReturnValue(new Promise(() => {}));

    act(() => result.current?.setDone(1, false));

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(
      queryClient
        .getQueryData<SubjectDayResponse[]>(["subjects", "day", 7, DATE])
        ?.find((subject) => subject.id === 1),
    ).toEqual(daySubject(1, true));
    expect(result.current?.isDone(1)).toBe(true);
  });
});
