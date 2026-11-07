import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { usePlannerUpdateNotice } from "../usePlannerUpdateNotice";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("처음에는 표시하고 누른 계정은 다시 마운트해도 표시하지 않는다", () => {
  const first = renderHook(() => usePlannerUpdateNotice(7));
  expect(first.result.current.unread).toBe(true);
  act(() => first.result.current.markOpened());
  expect(first.result.current.unread).toBe(false);
  first.unmount();
  const again = renderHook(() => usePlannerUpdateNotice(7));
  expect(again.result.current.unread).toBe(false);
});

it("계정을 바꾸면 해당 계정의 확인 상태를 사용한다", () => {
  const view = renderHook(({ userId }) => usePlannerUpdateNotice(userId), {
    initialProps: { userId: 7 },
  });
  act(() => view.result.current.markOpened());
  view.rerender({ userId: 8 });
  expect(view.result.current.unread).toBe(true);
  view.rerender({ userId: 7 });
  expect(view.result.current.unread).toBe(false);
});

it("같은 계정의 다른 입구도 즉시 확인한 상태로 바뀐다", () => {
  const first = renderHook(() => usePlannerUpdateNotice(7));
  const second = renderHook(() => usePlannerUpdateNotice(7));
  act(() => first.result.current.markOpened());
  expect(second.result.current.unread).toBe(false);
});

it("사용자 신원을 기다리는 동안은 표시하거나 기록하지 않는다", () => {
  const write = vi.spyOn(Storage.prototype, "setItem");
  const view = renderHook(() => usePlannerUpdateNotice(null));
  expect(view.result.current.unread).toBe(false);
  act(() => view.result.current.markOpened());
  expect(write).not.toHaveBeenCalled();
});

it("저장소를 쓸 수 없어도 누른 뒤에는 같은 문서에서 다시 표시하지 않는다", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const first = renderHook(() => usePlannerUpdateNotice(903));
  expect(first.result.current.unread).toBe(true);
  act(() => first.result.current.markOpened());
  expect(first.result.current.unread).toBe(false);
  first.unmount();
  const again = renderHook(() => usePlannerUpdateNotice(903));
  expect(again.result.current.unread).toBe(false);
});
