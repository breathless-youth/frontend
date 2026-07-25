import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSessionRequest, submitStudySession } from "../submitStudySession";

const BASE_INPUT = {
  userId: 1,
  startedAtMs: Date.UTC(2026, 6, 25, 1, 0, 0),
  endedAtMs: Date.UTC(2026, 6, 25, 2, 0, 0),
  studySec: 3600,
  focusSec: 3600,
};

describe("buildSessionRequest", () => {
  it("epoch ms를 UTC ISO-8601로 변환하고 events 기본값은 빈 배열이다", () => {
    const req = buildSessionRequest(BASE_INPUT);
    expect(req).toEqual({
      userId: 1,
      startedAt: "2026-07-25T01:00:00.000Z",
      endedAt: "2026-07-25T02:00:00.000Z",
      studySec: 3600,
      focusSec: 3600,
      events: [],
    });
  });

  it("studySec은 세션 길이로, focusSec은 studySec으로 클램프한다", () => {
    const req = buildSessionRequest({ ...BASE_INPUT, studySec: 99999, focusSec: 99999 });
    expect(req.studySec).toBe(3600);
    expect(req.focusSec).toBe(3600);
  });

  it("음수 입력은 0으로 클램프한다", () => {
    const req = buildSessionRequest({ ...BASE_INPUT, studySec: -5, focusSec: -5 });
    expect(req.studySec).toBe(0);
    expect(req.focusSec).toBe(0);
  });
});

describe("submitStudySession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("201이면 세션 배열을 반환한다", async () => {
    const sessions = [{ id: 10, userId: 1, statDate: "2026-07-25" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(sessions) }),
    );

    const result = await submitStudySession(BASE_INPUT);

    expect(result).toEqual(sessions);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/study-sessions$/);
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      userId: 1,
      studySec: 3600,
      events: [],
    });
  });

  it("400이면 서버 message로 throw한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "세션은 24시간을 초과할 수 없습니다" }),
      }),
    );

    await expect(submitStudySession(BASE_INPUT)).rejects.toThrow(
      "세션은 24시간을 초과할 수 없습니다",
    );
  });

  it("message 없는 실패면 HTTP 상태 코드로 throw한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error("no body")),
        }),
    );

    await expect(submitStudySession(BASE_INPUT)).rejects.toThrow("세션 제출 실패 (HTTP 500)");
  });
});
