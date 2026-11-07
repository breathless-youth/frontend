import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as TokenSourceModule from "@/lib/auth/tokenSource";
import { createBridgeTokenSource, type TokenSource } from "@/lib/auth/tokenSource";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { requestSessionStart } from "@/lib/sessionStart";

import { closeStaleSession } from "../closeStaleSession";

const mocks = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof TokenSourceModule>()),
  getTokenSource: () => mocks.source,
}));
const settleRecoveredTimelapse = vi.hoisted(() => vi.fn());
const reportHandled = vi.hoisted(() => vi.fn());
vi.mock("@/features/timelapse/timelapseRecorder", () => ({ settleRecoveredTimelapse }));
vi.mock("@/lib/sentry", () => ({ reportHandled }));

const recovered = {
  statDate: "2026-11-06",
  startedAt: "2026-11-06T01:00:00Z",
  endedAt: "2026-11-06T02:00:00Z",
  studySec: 3600,
  focusSec: 3000,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("session recovery account ownership", () => {
  const postMessage = vi.fn();

  function emit(userId: number, accessToken: string) {
    const receive = (globalThis as unknown as Record<string, (raw: string) => void>)[
      NATIVE_MESSAGE_ENTRY
    ]!;
    receive(JSON.stringify({ type: "auth-token", userId, accessToken, atMs: Date.now() }));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    postMessage.mockReset();
    settleRecoveredTimelapse.mockReset();
    reportHandled.mockReset();
    mocks.source = createBridgeTokenSource();
    emit(7, "account-a");
  });

  afterEach(() => {
    mocks.source = null;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([false, true])(
    "does not retry recovery after an account transition (returns to A: %s)",
    async (returnsToA) => {
      const first = deferred<Response>();
      const fetcher = vi
        .fn<typeof fetch>()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(Response.json(recovered));
      vi.stubGlobal("fetch", fetcher);
      const pending = closeStaleSession(7);
      const outcome = pending.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      const signal = fetcher.mock.calls[0]![1]!.signal;

      emit(8, "account-b");
      if (returnsToA) emit(7, "account-a-new");
      first.resolve(new Response(null, { status: 401 }));

      expect(await outcome).toMatchObject({ error: { name: "AbortError" } });
      expect(signal?.aborted).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(settleRecoveredTimelapse).not.toHaveBeenCalled();
      expect(reportHandled).not.toHaveBeenCalled();
    },
  );

  it("does not begin recovery when its owner is already another account", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(recovered));
    vi.stubGlobal("fetch", fetcher);
    emit(8, "account-b");

    await expect(closeStaleSession(7)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not restart under B when the account changes during the token wait", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(recovered));
    vi.stubGlobal("fetch", fetcher);
    const pending = closeStaleSession(7);
    emit(8, "account-b");

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "does not continue session start after an account transition while reading the body (returns to A: %s)",
    async (returnsToA) => {
      const body = deferred<typeof recovered>();
      const json = vi.fn(() => body.promise);
      const response = Response.json(recovered);
      response.json = json;
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      vi.stubGlobal("fetch", fetcher);
      const navigate = vi.fn();
      const pending = requestSessionStart(7, navigate);
      const outcome = pending.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(1));

      emit(8, "account-b");
      if (returnsToA) emit(7, "account-a-new");
      body.resolve(recovered);

      expect(await outcome).toMatchObject({ error: { name: "AbortError" } });
      expect(navigate).not.toHaveBeenCalled();
      expect(
        postMessage.mock.calls.some(([raw]) => JSON.parse(String(raw)).type === "start-session"),
      ).toBe(false);
      expect(settleRecoveredTimelapse).not.toHaveBeenCalled();
    },
  );

  it("retries a transient failure under the same account after its token changes", async () => {
    const first = deferred<Response>();
    const sentAuth: (string | null)[] = [];
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      sentAuth.push(new Headers(init?.headers).get("Authorization"));
      return sentAuth.length === 1 ? first.promise : Promise.resolve(Response.json(recovered));
    });
    vi.stubGlobal("fetch", fetcher);
    const pending = closeStaleSession(7);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    emit(7, "account-a-new");
    first.resolve(new Response(null, { status: 503 }));

    await expect(pending).resolves.toEqual(recovered);
    expect(sentAuth).toEqual(["Bearer account-a", "Bearer account-a-new"]);
    expect(settleRecoveredTimelapse).toHaveBeenCalledWith(recovered);
    expect(reportHandled).not.toHaveBeenCalled();
  });

  it("does not retry an AbortError even when the fetch signal is still live", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException("cancelled", "AbortError"))
      .mockResolvedValue(Response.json(recovered));
    vi.stubGlobal("fetch", fetcher);

    await expect(closeStaleSession(7)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reportHandled).not.toHaveBeenCalled();
  });
});
