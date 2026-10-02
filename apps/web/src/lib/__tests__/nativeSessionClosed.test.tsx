import type { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { useNativeSessionClosed } from "@/lib/nativeSessionClosed";
import { queryClient } from "@/lib/queryClient";
import { statsKeys } from "@/lib/statsQueries";

/** 네이티브가 주입하는 것과 같은 경로로 신호를 흘려보낸다. mock이 아니라 실물 구독을 지난다. */
function emit(raw: string): void {
  const receiver = (globalThis as unknown as Record<string, ((raw: string) => void) | undefined>)[
    NATIVE_MESSAGE_ENTRY
  ];
  receiver?.(raw);
}

describe("useNativeSessionClosed", () => {
  /** 싱글턴 queryClient를 건드리므로 테스트마다 새로 걸고 되돌린다. */
  let invalidateQueries: MockInstance<QueryClient["invalidateQueries"]>;

  /** 훅 구독은 모듈 스코프 집합에 쌓이므로 테스트마다 반드시 걷어낸다. */
  let unmountHook: (() => void) | null = null;

  function render(): void {
    unmountHook = renderHook(() => useNativeSessionClosed()).unmount;
  }

  beforeEach(() => {
    invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
  });

  afterEach(() => {
    unmountHook?.();
    unmountHook = null;
    invalidateQueries.mockRestore();
    vi.unstubAllGlobals();
  });

  it("session-closed를 받으면 통계 쿼리를 무효화한다", () => {
    render();

    emit('{"type":"session-closed","atMs":1}');

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: statsKeys.all });
  });

  it("다른 메시지에는 반응하지 않는다", () => {
    render();

    emit('{"type":"app-launched","atMs":1}');

    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
