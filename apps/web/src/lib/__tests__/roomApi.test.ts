import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

import { createRoom, joinRoom, leaveRoom } from "../roomApi";

const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("createRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("userId로 방을 생성하고 201 본문을 반환한다", async () => {
    const response = { roomId: 42, inviteCode: "3712", emptyTtlSeconds: 600 };
    mockedFetch.mockResolvedValue(jsonResponse(201, response));

    await expect(createRoom(7)).resolves.toEqual(response);
    expect(mockedFetch).toHaveBeenCalledWith("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: 7 }),
    });
  });

  it("실패 응답이면 ApiError를 던진다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(400, { message: "userId 누락" }));

    await expect(createRoom(7)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("joinRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("초대코드를 문자열 그대로 실어 보낸다 — 앞자리 0 보존", async () => {
    const response = {
      roomId: 42,
      graceRejoin: false,
      cameraOn: null,
      iceServers: [],
      iceTtlSeconds: 7200,
    };
    mockedFetch.mockResolvedValue(jsonResponse(200, response));

    await expect(joinRoom(7, "0712")).resolves.toEqual(response);
    expect(mockedFetch).toHaveBeenCalledWith("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: 7, inviteCode: "0712" }),
    });
  });

  it("404 INVALID_CODE의 code를 보존해 던진다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(404, { code: "INVALID_CODE", message: "없는 코드" }),
    );

    await expect(joinRoom(7, "3712")).rejects.toMatchObject({
      status: 404,
      code: "INVALID_CODE",
    });
  });

  it("409 ROOM_FULL의 code를 보존해 던진다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(409, { code: "ROOM_FULL", message: "가득 참" }));

    await expect(joinRoom(7, "3712")).rejects.toMatchObject({
      status: 409,
      code: "ROOM_FULL",
    });
  });
});

describe("leaveRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("roomId 경로와 userId 쿼리로 퇴장을 알리고 204를 받는다", async () => {
    mockedFetch.mockResolvedValue({ ok: true, status: 204, json: async () => undefined });

    await expect(leaveRoom(42, 7)).resolves.toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith("/api/rooms/42/leave?userId=7", { method: "POST" });
  });

  it("실패 응답이면 ApiError를 던진다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(404, { code: "INVALID_CODE", message: "없는 방" }));

    await expect(leaveRoom(42, 7)).rejects.toBeInstanceOf(ApiError);
  });
});
