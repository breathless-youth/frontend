import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { statsKeys } from "@/lib/statsQueries";

import { useLaunchSessionRecovery } from "../useLaunchSessionRecovery";

const closeStaleSession = vi.hoisted(() => vi.fn());

vi.mock("../closeStaleSession", () => ({ closeStaleSession }));

const analytics = vi.hoisted(() => ({ prompted: vi.fn(), confirmed: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackSessionRecoveryPrompted: analytics.prompted,
  trackSessionRecoveryConfirmed: analytics.confirmed,
}));

/** 네이티브가 주입하는 것과 같은 경로로 신호를 흘려보낸다. mock이 아니라 실물 구독을 지난다. */
function emit(raw: string): void {
  const receiver = (globalThis as unknown as Record<string, ((raw: string) => void) | undefined>)[
    NATIVE_MESSAGE_ENTRY
  ];
  receiver?.(raw);
}

const LAUNCHED = '{"type":"app-launched","atMs":1}';

const RECOVERED = {
  statDate: "2026-08-27",
  startedAt: "2026-08-27T12:03:00Z",
  endedAt: "2026-08-27T13:48:00Z",
  studySec: 6300,
  focusSec: 5040,
};

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
    closeStaleSession.mockResolvedValue(null);
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
      new Promise<null>((resolve) => {
        finish = () => {
          resolve(null);
        };
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

  it("마감이 기록을 돌려주면 recovered로 노출한다", async () => {
    closeStaleSession.mockResolvedValue(RECOVERED);
    const { result } = renderWithClient(7);

    emit(LAUNCHED);

    await waitFor(() => {
      expect(result.current.recovered).toEqual(RECOVERED);
    });
  });

  it("순공 1분 미만 기록은 노출하지 않는다", async () => {
    // 기록 화면이 순공 1분 미만을 표시하지 않아, 모달을 띄우면 기록 탭에서 못 찾아 혼란만 준다.
    closeStaleSession.mockResolvedValue({ ...RECOVERED, focusSec: 59 });
    const { result } = renderWithClient(7);

    emit(LAUNCHED);

    await waitFor(() => {
      expect(closeStaleSession).toHaveBeenCalled();
    });
    expect(result.current.recovered).toBeNull();
  });

  it("순공 정확히 1분은 노출한다", async () => {
    closeStaleSession.mockResolvedValue({ ...RECOVERED, focusSec: 60 });
    const { result } = renderWithClient(7);

    emit(LAUNCHED);

    await waitFor(() => {
      expect(result.current.recovered).not.toBeNull();
    });
  });

  it("마감할 세션이 없으면 노출하지 않는다", async () => {
    closeStaleSession.mockResolvedValue(null);
    const { result } = renderWithClient(7);

    emit(LAUNCHED);

    await waitFor(() => {
      expect(closeStaleSession).toHaveBeenCalled();
    });
    expect(result.current.recovered).toBeNull();
  });

  it("dismiss를 부르면 사라진다", async () => {
    closeStaleSession.mockResolvedValue(RECOVERED);
    const { result } = renderWithClient(7);
    emit(LAUNCHED);
    await waitFor(() => {
      expect(result.current.recovered).toEqual(RECOVERED);
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.recovered).toBeNull();
  });

  it("사용자가 바뀌면 이전 사용자의 마감 결과를 버린다", async () => {
    // 앞 사용자의 마감이 화면 전환보다 늦게 끝나는 상황이다. 그대로 두면 새 사용자 홈에
    // 남의 공부 기록 모달이 뜬다.
    let finishFirst: (() => void) | undefined;
    closeStaleSession.mockReturnValueOnce(
      new Promise<typeof RECOVERED>((resolve) => {
        finishFirst = () => {
          resolve(RECOVERED);
        };
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(({ id }) => useLaunchSessionRecovery(id), {
      initialProps: { id: 7 },
      wrapper,
    });
    emit(LAUNCHED);
    await waitFor(() => {
      expect(closeStaleSession).toHaveBeenCalledWith(7);
    });

    rerender({ id: 8 });
    finishFirst?.();
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.recovered).toBeNull();
  });

  it("언마운트하면 신호를 더 받지 않는다", () => {
    const { unmount } = renderWithClient(7);

    unmount();
    emit(LAUNCHED);

    expect(closeStaleSession).not.toHaveBeenCalled();
  });
});

describe("useLaunchSessionRecovery 계측 (BY-616 확장)", () => {
  beforeEach(() => {
    closeStaleSession.mockReset();
    analytics.prompted.mockClear();
    analytics.confirmed.mockClear();
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("확정 안내 노출과 확인을 남긴다 — 노출에는 확정된 순공 시간을 싣는다", async () => {
    closeStaleSession.mockResolvedValue(RECOVERED);
    const view = renderWithClient(7);

    emit(LAUNCHED);
    await waitFor(() => expect(view.result.current.recovered).not.toBeNull());
    expect(analytics.prompted).toHaveBeenCalledWith(5040);
    expect(analytics.confirmed).not.toHaveBeenCalled();

    act(() => {
      view.result.current.dismiss();
    });
    expect(analytics.confirmed).toHaveBeenCalledTimes(1);
  });

  it("순공 1분 미만은 안내가 없으니 계측도 없다", async () => {
    closeStaleSession.mockResolvedValue({ ...RECOVERED, focusSec: 30 });
    renderWithClient(7);

    emit(LAUNCHED);
    await waitFor(() => expect(closeStaleSession).toHaveBeenCalledWith(7));

    expect(analytics.prompted).not.toHaveBeenCalled();
  });
});
