import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api";
import { deleteDday, getDday, putDday } from "../ddayApi";

const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

const dday = { title: "2027 수능", targetDate: "2027-11-18" };

function response(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDday", () => {
  it("204면 null이다 — 설정한 D-Day가 없다는 뜻", async () => {
    mockedFetch.mockResolvedValue(response(204));

    await expect(getDday()).resolves.toBeNull();
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/dday",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("200이면 본문을 그대로 돌려준다", async () => {
    mockedFetch.mockResolvedValue(response(200, dday));

    await expect(getDday()).resolves.toEqual(dday);
  });
});

describe("putDday", () => {
  it("본문을 JSON으로 보내고 저장된 값을 돌려준다", async () => {
    mockedFetch.mockResolvedValue(response(200, dday));

    await expect(putDday(dday)).resolves.toEqual(dday);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/dday",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(dday) }),
    );
  });

  it("400은 ApiError로 던진다", async () => {
    mockedFetch.mockResolvedValue(
      response(400, { code: "BAD_REQUEST", message: "목표 날짜는 오늘 이후여야 합니다" }),
    );

    await expect(putDday({ ...dday, targetDate: "2000-01-01" })).rejects.toBeInstanceOf(ApiError);
  });
});

describe("deleteDday", () => {
  it("204면 조용히 끝난다", async () => {
    mockedFetch.mockResolvedValue(response(204));

    await expect(deleteDday()).resolves.toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/dday",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
