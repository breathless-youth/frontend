import { afterEach, describe, expect, it, vi } from "vitest";

import { reportRtcStats } from "../rtcStatsApi";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("reportRtcStats", () => {
  it("keepalive POST로 /api/rtc-stats에 본문을 보낸다", () => {
    const fetchMock = vi.fn((..._args: Parameters<typeof fetch>) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    reportRtcStats({
      connectionId: "c1",
      roomId: 10,
      userId: 7,
      peerUserId: 8,
      candidateType: "relay",
      isFinal: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/rtc-stats$/);
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect(JSON.parse(init!.body as string)).toMatchObject({
      connectionId: "c1",
      candidateType: "relay",
    });
  });

  it("fetch가 거부돼도 예외가 전파되지 않는다 — .catch가 삼킨다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    const onUnhandled = vi.fn();
    process.on("unhandledRejection", onUnhandled);
    try {
      expect(() =>
        reportRtcStats({
          connectionId: "c",
          roomId: 1,
          userId: 1,
          candidateType: "host",
          isFinal: true,
        }),
      ).not.toThrow();
      // 거부 처리는 매크로태스크로 온다 — 한 틱 흘려 미처리 거부가 없음을 확인한다.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
