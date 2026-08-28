import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

import { restoreActiveSession } from "../restoreActiveSession";

const BODY = {
  startedAt: "2026-08-28T01:00:00.000Z",
  reportedAt: "2026-08-28T01:32:00.000Z",
  studySec: 1850,
  focusSec: 1620,
  events: [
    { status: "PAUSE", startedAt: "2026-08-28T01:10:00.000Z", endedAt: "2026-08-28T01:12:00.000Z" },
  ],
};

/** 200 응답 하나만 돌려주는 fetch 스텁. */
function stub200(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) }),
  );
}

describe("restoreActiveSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("200이면 epoch ms로 바꿔 돌려주고 GET으로 보낸다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(BODY) }),
    );

    const restored = await restoreActiveSession(7);

    expect(restored).toEqual({
      startedAtMs: Date.parse(BODY.startedAt),
      reportedAtMs: Date.parse(BODY.reportedAt),
      baseStudySec: 1850,
      baseFocusSec: 1620,
      events: BODY.events,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/study-sessions\/active\?userId=7$/);
    expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
  });

  it("404면 null을 돌려준다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: "진행중인 세션이 없습니다" }),
      }),
    );

    await expect(restoreActiveSession(7)).resolves.toBeNull();
  });

  it("404가 아닌 실패는 status를 가진 ApiError로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ message: "충돌" }),
      }),
    );

    const error = await restoreActiveSession(7).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
  });

  it("시각을 읽을 수 없는 응답은 복원하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...BODY, startedAt: "언제인지 모를 값" }),
      }),
    );

    await expect(restoreActiveSession(7)).resolves.toBeNull();
  });

  it("보고 시각이 시작 시각보다 앞선 응답은 복원하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...BODY, reportedAt: "2026-08-28T00:30:00.000Z" }),
      }),
    );

    await expect(restoreActiveSession(7)).resolves.toBeNull();
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

    const caught = restoreActiveSession(7, 1_000).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    const error = await caught;

    expect((error as Error).name).toBe("AbortError");
    vi.useRealTimers();
  });

  it("이벤트 목록이 배열이 아니면 복원을 포기한다", async () => {
    stub200({ ...BODY, events: null });

    await expect(restoreActiveSession(7)).resolves.toBeNull();
  });

  it("시각을 읽을 수 없는 이벤트가 있으면 복원을 포기한다", async () => {
    // endedAt만 멀쩡하면 병합 판정을 통과하고 startedAt이 NaN으로 흘러 타임라인이 통째로 깨진다.
    stub200({
      ...BODY,
      events: [{ status: "PAUSE", startedAt: "언제였더라", endedAt: BODY.reportedAt }],
    });

    await expect(restoreActiveSession(7)).resolves.toBeNull();
  });

  it("끝이 시작보다 빠른 이벤트가 있으면 복원을 포기한다", async () => {
    stub200({
      ...BODY,
      events: [
        { status: "PAUSE", startedAt: "2026-08-28T01:20:00Z", endedAt: "2026-08-28T01:10:00Z" },
      ],
    });

    await expect(restoreActiveSession(7)).resolves.toBeNull();
  });

  it("모르는 상태값이 있으면 복원을 포기한다", async () => {
    stub200({
      ...BODY,
      events: [
        { status: "NAPPING", startedAt: "2026-08-28T01:10:00Z", endedAt: "2026-08-28T01:20:00Z" },
      ],
    });

    await expect(restoreActiveSession(7)).resolves.toBeNull();
  });
});
