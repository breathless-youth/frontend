import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackPointsRestore } from "@/lib/amplitude";
import { ApiError } from "@/lib/api";
import type * as amplitude from "@/lib/amplitude";
import { pointsKeys } from "@/lib/pointsQueries";
import { showToast } from "@/lib/toast";

import { appPointsGateway } from "../../gateway/appPointsGateway";
import type { RestoreResult } from "../../types";
import { useRestorePurchases } from "../useRestorePurchases";

const restorePurchases = vi.hoisted(() => vi.fn<() => Promise<RestoreResult>>());
vi.mock("../../gateway/appPointsGateway", () => ({
  appPointsGateway: vi.fn(() => ({ restorePurchases })),
}));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/lib/amplitude", async (original) => ({
  ...(await original<typeof amplitude>()),
  trackPointsRestore: vi.fn(),
}));

const USER = 7;

function setup(onMemberOnly?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRestorePurchases(USER, onMemberOnly), { wrapper });
  /** 상점과 내 모습을 다시 읽으라고 한 횟수 */
  const reads = () => ({
    shop: invalidate.mock.calls.filter(
      ([filters]) => String(filters?.queryKey) === String(pointsKeys.shop(USER)),
    ).length,
    look: invalidate.mock.calls.filter(
      ([filters]) => String(filters?.queryKey) === String(pointsKeys.look(USER)),
    ).length,
  });
  return { result, reads };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  restorePurchases.mockReset();
  vi.mocked(showToast).mockClear();
  vi.mocked(trackPointsRestore).mockClear();
  vi.mocked(appPointsGateway).mockClear();
});

describe("useRestorePurchases", () => {
  it("되찾으면 상점과 내 모습을 바로 한 번 읽고 2초와 5초 뒤에 다시 읽는다", async () => {
    restorePurchases.mockResolvedValue("restored");
    const { result, reads } = setup();

    await act(() => result.current.restore());
    expect(reads()).toEqual({ shop: 1, look: 1 });
    expect(showToast).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(reads()).toEqual({ shop: 2, look: 2 });
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(reads()).toEqual({ shop: 3, look: 3 });
    // 알림은 앱의 복원 결과로 한 번만 띄운다.
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it("되찾을 것이 없으면 한 번만 읽고 나중에 다시 읽지 않는다", async () => {
    restorePurchases.mockResolvedValue("nothing");
    const { result, reads } = setup();

    await act(() => result.current.restore());
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reads()).toEqual({ shop: 1, look: 1 });
  });

  it("실패하면 읽지 않고 다시 시도하라고 알린다", async () => {
    restorePurchases.mockRejectedValue(new Error("down"));
    const { result, reads } = setup();

    await act(() => result.current.restore());
    expect(reads()).toEqual({ shop: 0, look: 0 });
    expect(showToast).toHaveBeenCalledWith("잠시 후 다시 시도해 주세요");
  });

  it("서버가 결제용 ID를 주지 않아 회원 전용으로 거절되면 알림 없이 로그인 화면으로 보낸다", async () => {
    restorePurchases.mockRejectedValue(
      new ApiError("revenueCat app user id is null", 403, "MEMBER_ONLY"),
    );
    const onMemberOnly = vi.fn();
    const { result, reads } = setup(onMemberOnly);

    await act(() => result.current.restore());
    expect(onMemberOnly).toHaveBeenCalledOnce();
    expect(showToast).not.toHaveBeenCalled();
    expect(reads()).toEqual({ shop: 0, look: 0 });
  });

  it("시도와 결과를 분석 이벤트로 남긴다", async () => {
    restorePurchases.mockResolvedValue("nothing");
    const { result } = setup();

    await act(() => result.current.restore());
    expect(vi.mocked(trackPointsRestore).mock.calls).toEqual([["attempted"], ["nothing"]]);
  });
});
