import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api";
import {
  completeSubject,
  listSubjectsOnDay,
  reorderSubjects,
  uncompleteSubject,
} from "../subjectApi";

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

  it("과목 API는 API-Version 1로 나간다 — 다른 값이면 서버가 400으로 거절한다", async () => {
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

describe("날짜별 과목·완료", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("그날 과목은 GET /api/subjects/day?date=로 API-Version 1을 실어 받는다", async () => {
    const day = [
      {
        id: 3,
        name: "수학",
        colorIndex: 2,
        deleted: false,
        studySec: 0,
        focusSec: 0,
        completed: true,
        completedAt: "2026-10-29T12:30:00Z",
      },
    ];
    mockedFetch.mockResolvedValue(jsonResponse(200, day));

    await expect(listSubjectsOnDay("2026-10-29")).resolves.toEqual(day);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/subjects/day?date=2026-10-29",
      expect.objectContaining({ method: "GET" }),
    );
    expect(sentHeaders().get("API-Version")).toBe("1");
  });

  it("배열이 아닌 그날 과목 응답은 실패로 본다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { message: "proxy" }));

    await expect(listSubjectsOnDay("2026-10-29")).rejects.toThrow("날짜별 과목 조회 실패");
  });

  it.each([
    ["완료 표시", completeSubject, "PUT"],
    ["완료 취소", uncompleteSubject, "DELETE"],
  ] as const)(
    "%s는 %s /api/subjects/{id}/completions/{date}로 보내고 204로 끝난다",
    async (_, send, method) => {
      mockedFetch.mockResolvedValue({ ok: true, status: 204, json: async () => undefined });

      await expect(send(3, "2026-10-29")).resolves.toBeUndefined();
      expect(mockedFetch).toHaveBeenCalledWith(
        "/api/subjects/3/completions/2026-10-29",
        expect.objectContaining({ method }),
      );
      expect(sentHeaders().get("API-Version")).toBe("1");
    },
  );

  it("완료 표시 거절은 서버 메시지를 담은 ApiError다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(400, {
        code: "BAD_REQUEST",
        message: "미래 날짜에는 완료를 기록할 수 없습니다",
      }),
    );

    await expect(completeSubject(3, "2026-10-30")).rejects.toMatchObject({
      status: 400,
      message: "미래 날짜에는 완료를 기록할 수 없습니다",
    });
  });
});
