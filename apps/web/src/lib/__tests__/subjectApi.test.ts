import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api";
import { reorderSubjects } from "../subjectApi";

const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function sentHeaders(): Headers {
  const init = mockedFetch.mock.calls[0]![1] as RequestInit;
  return new Headers(init.headers);
}

describe("reorderSubjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("전체 순서를 PUT /api/subjects/order로 보내고 정렬된 목록을 돌려준다", async () => {
    const ordered = [
      { id: 3, name: "영어", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] },
      { id: 1, name: "국어", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
    ];
    mockedFetch.mockResolvedValue(jsonResponse(200, ordered));

    await expect(reorderSubjects({ subjectIds: [3, 1] })).resolves.toEqual(ordered);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/subjects/order",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ subjectIds: [3, 1] }) }),
    );
  });

  it("과목 API라 API-Version 1을 명시한다 — apiFetch 기본값 2가 붙으면 400이 난다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, []));

    await reorderSubjects({ subjectIds: [1] });

    expect(sentHeaders().get("API-Version")).toBe("1");
  });

  it("400은 서버 메시지를 담은 ApiError로 거부한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(400, { message: "사용자의 과목이 아닙니다" }));

    await expect(reorderSubjects({ subjectIds: [99] })).rejects.toMatchObject({
      status: 400,
      message: "사용자의 과목이 아닙니다",
    });
    await expect(reorderSubjects({ subjectIds: [99] })).rejects.toBeInstanceOf(ApiError);
  });

  it("본문 없는 204여도 해석하지 않고 끝난다", async () => {
    mockedFetch.mockResolvedValue({ ok: true, status: 204, json: async () => undefined });

    await expect(reorderSubjects({ subjectIds: [1] })).resolves.toBeUndefined();
  });
});
