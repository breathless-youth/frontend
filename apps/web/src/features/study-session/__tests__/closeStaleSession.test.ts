import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeStaleSession } from "../closeStaleSession";

const reportHandled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sentry", () => ({ reportHandled }));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** 서버가 마감하고 돌려주는 확정 기록. 마감 자체가 목적이라 본문은 쓰지 않는다. */
const RECOVERED = {
  statDate: "2026-08-28",
  startedAt: "2026-08-28T01:00:00Z",
  endedAt: "2026-08-28T01:32:00Z",
  studySec: 1850,
  focusSec: 1620,
};

describe("closeStaleSession", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    reportHandled.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("복구 요청을 한 번만 보낸다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, RECOVERED));

    await closeStaleSession(7);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/study-sessions/recovery?userId=7");
    expect(init.method).toBe("POST");
    expect(reportHandled).not.toHaveBeenCalled();
  });

  it("복구 대상이 없다는 404는 실패로 보지 않는다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { message: "복구할 세션이 없습니다" }));

    await closeStaleSession(7);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reportHandled).not.toHaveBeenCalled();
  });

  it("userId가 없으면 요청조차 하지 않는다", async () => {
    await closeStaleSession(null);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("네트워크가 실패하면 한 번 다시 시도한다", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("네트워크"))
      .mockResolvedValue(jsonResponse(200, RECOVERED));

    await closeStaleSession(7);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reportHandled).not.toHaveBeenCalled();
  });

  it("서버 오류도 실패로 보고 다시 시도한다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { message: "서버 오류" }))
      .mockResolvedValue(jsonResponse(200, RECOVERED));

    await closeStaleSession(7);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("두 번 다 실패해도 던지지 않고 Sentry에 한 번 남긴다", async () => {
    fetchMock.mockRejectedValue(new Error("네트워크"));

    await expect(closeStaleSession(7)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reportHandled).toHaveBeenCalledTimes(1);
  });

  it("응답이 없어도 상한 안에 반환한다", async () => {
    vi.useFakeTimers();
    // 영원히 결착하지 않는 요청 — 상한이 없으면 시작 버튼이 여기서 멈춘다.
    fetchMock.mockReturnValue(new Promise(() => {}));

    let done = false;
    void closeStaleSession(7).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(done).toBe(true);
  });

  it("상한을 넘겨 우리가 끊은 요청은 Sentry에 남기지 않는다", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });

    void closeStaleSession(7);
    await vi.advanceTimersByTimeAsync(10_000);

    // 끊긴 요청을 다시 보내지도, 실패로 보고하지도 않는다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reportHandled).not.toHaveBeenCalled();
  });
});
