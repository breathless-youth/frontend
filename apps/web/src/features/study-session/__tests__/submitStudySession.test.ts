import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

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

  it("studySec 상한에서 PAUSE 구간을 뺀다 — 서버 규칙과 같은 식으로 막는다", () => {
    // 서버 규칙: studySec ≤ (endedAt − startedAt) − PAUSE 합.
    // 예전 클램프는 벽시계 길이(3600)까지만 막아서 일시정지 600초짜리 세션에 3600을 통과시켰다.
    const req = buildSessionRequest({
      ...BASE_INPUT,
      studySec: 3600,
      focusSec: 3600,
      events: [
        {
          status: "PAUSE",
          startedAt: "2026-07-25T01:10:00.000Z",
          endedAt: "2026-07-25T01:20:00.000Z",
        },
      ],
    });
    expect(req.studySec).toBe(3000);
    expect(req.focusSec).toBe(3000);
  });

  it("PAUSE가 여러 건이면 전부 합산해서 뺀다", () => {
    const req = buildSessionRequest({
      ...BASE_INPUT,
      studySec: 3600,
      focusSec: 0,
      events: [
        {
          status: "PAUSE",
          startedAt: "2026-07-25T01:10:00.000Z",
          endedAt: "2026-07-25T01:11:00.000Z",
        },
        {
          status: "AWAY",
          startedAt: "2026-07-25T01:20:00.000Z",
          endedAt: "2026-07-25T01:30:00.000Z",
        },
        {
          status: "PAUSE",
          startedAt: "2026-07-25T01:40:00.000Z",
          endedAt: "2026-07-25T01:42:00.000Z",
        },
      ],
    });
    // 비집중(AWAY)은 총 공부 시간에 포함되므로 빼지 않는다 — PAUSE 180초만 뺀다.
    expect(req.studySec).toBe(3420);
  });

  it("소수점 초 경계에서 studySec을 깎지 않는다 — 상한은 마지막에 한 번만 내림한다", () => {
    // qa-WG4 F1 회귀: 세션 길이와 PAUSE를 각각 반올림하면 `floor(S) − ceil(P)`가 되어
    // 계약값 `floor(S − P)`보다 1초 작아진다. 실제 시각은 전부 Date.now() 밀리초라
    // 소수부가 0인 경우가 오히려 드물어서, 이 버그는 일시정지가 있는 세션 상당수를 상시 1초 깎았다.
    //
    // 세션 100,900ms · PAUSE 10,400ms → computeSessionTotals가 내는 값은 floor(90,500/1000)=90.
    const startedAtMs = Date.UTC(2026, 6, 25, 1, 0, 0);
    const req = buildSessionRequest({
      userId: 1,
      startedAtMs,
      endedAtMs: startedAtMs + 100_900,
      studySec: 90,
      focusSec: 90,
      events: [
        {
          status: "PAUSE",
          startedAt: new Date(startedAtMs + 20_000).toISOString(),
          endedAt: new Date(startedAtMs + 30_400).toISOString(),
        },
      ],
    });

    expect(req.studySec).toBe(90);
    expect(req.focusSec).toBe(90);
  });

  it("호출부가 이미 PAUSE를 제외한 값을 넘기면 그대로 통과시킨다", () => {
    // `computeSessionTotals`가 넘기는 정상 경로 — 클램프가 값을 더 깎으면 안 된다.
    const req = buildSessionRequest({
      ...BASE_INPUT,
      studySec: 3000,
      focusSec: 2400,
      events: [
        {
          status: "PAUSE",
          startedAt: "2026-07-25T01:10:00.000Z",
          endedAt: "2026-07-25T01:20:00.000Z",
        },
      ],
    });
    expect(req.studySec).toBe(3000);
    expect(req.focusSec).toBe(2400);
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

  it("실패는 status를 가진 ApiError로 던져진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "검증 실패" }),
      }),
    );

    const error = await submitStudySession(BASE_INPUT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
  });

  it("message 없는 실패면 HTTP 상태 코드로 throw한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("no body")),
      }),
    );

    await expect(submitStudySession(BASE_INPUT)).rejects.toThrow("세션 제출 실패 (HTTP 500)");
  });
});
