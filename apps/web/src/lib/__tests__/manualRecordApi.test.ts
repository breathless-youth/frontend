import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ManualStudySessionRequest, StudySessionResponse } from "@focusmakers/types";

import { ApiError } from "../api";
import { createManualRecord, deleteManualRecord, updateManualRecord } from "../manualRecordApi";

const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function sentInit(): RequestInit {
  return mockedFetch.mock.calls[0]![1] as RequestInit;
}

const BODY: ManualStudySessionRequest = {
  startedAt: "2026-10-15T05:00:00.000Z",
  endedAt: "2026-10-15T06:30:00.000Z",
  subjectId: 3,
};

const PIECE: StudySessionResponse = {
  id: 41,
  userId: 7,
  statDate: "2026-10-15",
  startedAt: BODY.startedAt,
  endedAt: BODY.endedAt,
  studySec: 5400,
  focusSec: 5400,
  focusRate: 100,
  events: [],
  source: "MANUAL",
  submissionStartedAt: BODY.startedAt,
};

describe("manualRecordApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("추가는 POST /api/study-sessions/manual로 본문을 보내고 저장된 조각 목록을 돌려준다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(201, [PIECE]));

    await expect(createManualRecord(BODY)).resolves.toEqual([PIECE]);
    expect(mockedFetch.mock.calls[0]![0]).toBe("/api/study-sessions/manual");
    expect(sentInit()).toMatchObject({ method: "POST", body: JSON.stringify(BODY) });
    expect(new Headers(sentInit().headers).get("Content-Type")).toBe("application/json");
  });

  it("수정은 조각 id로 PATCH하고 다시 만든 묶음을 돌려준다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, [PIECE]));

    await expect(updateManualRecord(41, BODY)).resolves.toEqual([PIECE]);
    expect(mockedFetch.mock.calls[0]![0]).toBe("/api/study-sessions/manual/41");
    expect(sentInit()).toMatchObject({ method: "PATCH", body: JSON.stringify(BODY) });
  });

  it("삭제는 DELETE이고 204 본문을 읽지 않는다", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error("body read");
      },
    });

    await expect(deleteManualRecord(41)).resolves.toBeUndefined();
    expect(mockedFetch.mock.calls[0]![0]).toBe("/api/study-sessions/manual/41");
    expect(sentInit()).toMatchObject({ method: "DELETE" });
  });

  it("API-Version 1로 나간다, 다른 값이면 서버가 400으로 거절한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(201, [PIECE]));

    await createManualRecord(BODY);

    expect(new Headers(sentInit().headers).get("API-Version")).toBe("1");
  });

  it("전부 겹친 409는 status를 담은 ApiError로 거부한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(409, { code: "CONFLICT", message: "겹침" }));

    const result = createManualRecord(BODY);

    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 409 });
  });
});
