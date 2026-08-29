import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { statsKeys } from "@/lib/statsQueries";

import { useLaunchSessionRecovery } from "../useLaunchSessionRecovery";

const closeStaleSession = vi.hoisted(() => vi.fn());

vi.mock("../closeStaleSession", () => ({ closeStaleSession }));

/** 네이티브가 주입하는 것과 같은 경로로 신호를 흘려보낸다. mock이 아니라 실물 구독을 지난다. */
function emit(raw: string): void {
  const receiver = (globalThis as unknown as Record<string, ((raw: string) => void) | undefined>)[
    NATIVE_MESSAGE_ENTRY
  ];
  receiver?.(raw);
}

const LAUNCHED = '{"type":"app-launched","atMs":1}';

function renderWithClient(userId: number | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useLaunchSessionRecovery(userId), { wrapper });
  return { ...view, client };
}

describe("useLaunchSessionRecovery", () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    closeStaleSession.mockReset();
    closeStaleSession.mockResolvedValue(undefined);
    postMessage.mockReset();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("구독을 건 뒤 준비 신호를 네이티브에 보낸다", () => {
    renderWithClient(7);

    expect(postMessage).toHaveBeenCalledTimes(1);
    const raw = postMessage.mock.calls[0]?.[0] as string;
    expect(JSON.parse(raw)).toMatchObject({ type: "home-ready" });
  });

  it("네이티브가 준비 신호에 즉시 응답해도 놓치지 않는다 — 구독이 발신보다 먼저다", async () => {
    // 실제 네이티브는 home-ready를 받은 그 자리에서 app-launched를 주입한다. 구독을 걸기 전에
    // 보내면 이 응답이 허공에 사라지는데, 발신 여부만 보는 테스트는 그 순서 회귀를 못 잡는다.
    postMessage.mockImplementation((raw: string) => {
      if ((JSON.parse(raw) as { type: string }).type === "home-ready") {
        emit(LAUNCHED);
      }
    });

    renderWithClient(7);

    await waitFor(() => {
      expect(closeStaleSession).toHaveBeenCalledWith(7);
    });
  });

  it("userId가 없으면 준비 신호도 보내지 않는다", () => {
    renderWithClient(null);

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("앱 실행 신호를 받으면 옛 세션을 마감한다", async () => {
    renderWithClient(7);

    emit(LAUNCHED);

    await waitFor(() => {
      expect(closeStaleSession).toHaveBeenCalledWith(7);
    });
  });

  it("신호가 오기 전에는 마감하지 않는다", () => {
    renderWithClient(7);

    expect(closeStaleSession).not.toHaveBeenCalled();
  });

  it("다른 메시지에는 반응하지 않는다", () => {
    renderWithClient(7);

    emit('{"type":"reset-route","path":"/home","atMs":1}');

    expect(closeStaleSession).not.toHaveBeenCalled();
  });

  it("userId가 없으면 마감하지 않는다", () => {
    renderWithClient(null);

    emit(LAUNCHED);

    expect(closeStaleSession).not.toHaveBeenCalled();
  });

  it("마감이 끝나면 통계를 다시 조회하게 만든다", async () => {
    const { client } = renderWithClient(7);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    emit(LAUNCHED);

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: statsKeys.all });
    });
  });

  it("마감이 끝나기 전에는 통계를 다시 조회하지 않는다", async () => {
    let finish: (() => void) | undefined;
    closeStaleSession.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { client } = renderWithClient(7);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    emit(LAUNCHED);
    await waitFor(() => {
      expect(closeStaleSession).toHaveBeenCalled();
    });

    expect(invalidate).not.toHaveBeenCalled();
    finish?.();
  });

  it("언마운트하면 신호를 더 받지 않는다", () => {
    const { unmount } = renderWithClient(7);

    unmount();
    emit(LAUNCHED);

    expect(closeStaleSession).not.toHaveBeenCalled();
  });
});
