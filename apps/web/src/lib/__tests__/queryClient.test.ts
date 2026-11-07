import { afterEach, describe, expect, it, vi } from "vitest";
import type { TokenSource } from "@/lib/auth/tokenSource";
import type * as TokenSourceModule from "@/lib/auth/tokenSource";
import { getPlannerDay } from "../plannerApi";
import { plannerKeys } from "../plannerQueries";
import { queryClient } from "../queryClient";

const auth = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (original) => ({
  ...(await original<typeof TokenSourceModule>()),
  getTokenSource: () => auth.source,
}));

afterEach(() => {
  queryClient.clear();
  auth.source = null;
  vi.unstubAllGlobals();
});

describe("queryClient 기본값", () => {
  it("staleTime은 30초다", () => {
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it("계정 전환으로 중단된 기존 계정 쿼리는 새 계정으로 재시도해 이전 키를 채우지 않는다", async () => {
    let userId = 7;
    let finish!: (response: Response) => void;
    const listeners = new Set<
      (value: { userId: number | null; accessToken: string | null }) => void
    >();
    auth.source = {
      getUserId: () => userId,
      getAccessToken: async () => `token-${userId}`,
      getCurrentToken: () => `token-${userId}`,
      refresh: async () => `token-${userId}`,
      hasSettled: () => true,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(Response.json({ date: "new-account" }));
    vi.stubGlobal("fetch", fetcher);
    const key = plannerKeys.day(7, "2026-11-06", "Asia/Seoul");
    const pending = queryClient.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => getPlannerDay("2026-11-06", { timeZone: "Asia/Seoul", signal }),
      retryDelay: 0,
    });
    const outcome = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    userId = 8;
    listeners.forEach((listener) => listener({ userId: 8, accessToken: "token-8" }));
    finish(Response.json({ date: "old-account" }));
    expect(await outcome).toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it("일반 서버 오류는 이전처럼 한 번 재시도한다", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ date: "2026-11-06" }));
    vi.stubGlobal("fetch", fetcher);
    const data = await queryClient.fetchQuery({
      queryKey: ["normal-retry"],
      queryFn: ({ signal }) => getPlannerDay("2026-11-06", { timeZone: "Asia/Seoul", signal }),
      retryDelay: 0,
    });
    expect(data.date).toBe("2026-11-06");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("계속 실패하는 일반 오류는 두 번째 요청 뒤 중단한다", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({}, { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      queryClient.fetchQuery({
        queryKey: ["normal-retry-exhausted"],
        queryFn: ({ signal }) => getPlannerDay("2026-11-06", { timeZone: "Asia/Seoul", signal }),
        retryDelay: 0,
      }),
    ).rejects.toMatchObject({ status: 500 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
