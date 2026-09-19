import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

import { buildActiveSnapshotRequest, reportActiveSession } from "../reportActiveSession";

const INPUT = {
  userId: 1,
  startedAtMs: Date.UTC(2026, 6, 25, 1, 0, 0),
  reportedAtMs: Date.UTC(2026, 6, 25, 1, 0, 30),
  studySec: 30,
  focusSec: 27,
  events: [],
};

describe("buildActiveSnapshotRequest", () => {
  it("epoch ms를 UTC ISO-8601로 변환하고 reportedAt을 기준으로 담는다", () => {
    expect(buildActiveSnapshotRequest(INPUT)).toEqual({
      startedAt: "2026-07-25T01:00:00.000Z",
      reportedAt: "2026-07-25T01:00:30.000Z",
      studySec: 30,
      focusSec: 27,
      events: [],
    });
  });

  it("reportedAt을 경계로 studySec을 클램프한다", () => {
    const req = buildActiveSnapshotRequest({ ...INPUT, studySec: 99999, focusSec: 99999 });
    expect(req.studySec).toBe(30);
    expect(req.focusSec).toBe(30);
  });
});

describe("reportActiveSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("204면 정상 반환하고 PUT으로 보낸다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));

    await expect(reportActiveSession(INPUT)).resolves.toBeUndefined();

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/study-sessions\/active$/);
    expect((init as RequestInit).method).toBe("PUT");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ reportedAt: "2026-07-25T01:00:30.000Z" });
    expect(body).not.toHaveProperty("userId");
  });

  it("실패는 status를 가진 ApiError로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: "없는 유저" }),
      }),
    );

    const error = await reportActiveSession(INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });

  it("상한을 넘긴 요청은 AbortError로 끊는다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    const caught = reportActiveSession(INPUT, 1_000).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    const error = await caught;

    expect((error as Error).name).toBe("AbortError");
    vi.useRealTimers();
  });

  it("토큰 출처 없이 URL에 userId가 있으면 본문에 userId를 싣는다(구 앱)", async () => {
    window.history.replaceState(null, "", "/room/1?userId=7");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await reportActiveSession(INPUT);
      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse(init.body as string) as {
        userId?: number;
        startedAt: string;
        reportedAt: string;
        studySec: number;
        focusSec: number;
      };
      expect(body.userId).toBe(7);
      expect(body.startedAt).toBe("2026-07-25T01:00:00.000Z");
      expect(body.reportedAt).toBe("2026-07-25T01:00:30.000Z");
      expect(body.studySec).toBe(30);
      expect(body.focusSec).toBe(27);
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});
