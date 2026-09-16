import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

import { createRoom, renewLiveRoomSeat, leaveRoom } from "../roomApi";

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

  it("본문 없이 방을 생성하고 201 본문을 반환한다", async () => {
    const response = { roomId: 42, inviteCode: "3712", emptyTtlSeconds: 600 };
    mockedFetch.mockResolvedValue(jsonResponse(201, response));

    await expect(createRoom()).resolves.toEqual(response);
    const [url, init] = mockedFetch.mock.calls[0]!;
    expect(url).toBe("/api/rooms");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeUndefined();
  });

  it("실패 응답이면 ApiError를 던진다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(400, { message: "userId 누락" }));

    await expect(createRoom()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("renewLiveRoomSeat", () => {
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

    await expect(renewLiveRoomSeat("0712")).resolves.toEqual(response);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/rooms/join",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ inviteCode: "0712" }),
      }),
    );
  });

  it("404 ROOM_CLOSED의 code를 보존해 던진다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(404, { code: "ROOM_CLOSED", message: "소멸된 방" }));

    await expect(renewLiveRoomSeat("3712")).rejects.toMatchObject({
      status: 404,
      code: "ROOM_CLOSED",
    });
  });

  it("409 CONFLICT의 code를 보존해 던진다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(409, { code: "CONFLICT", message: "정원 초과" }));

    await expect(renewLiveRoomSeat("3712")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });
});

describe("leaveRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("roomId 경로로 퇴장을 알리고 204를 받는다", async () => {
    mockedFetch.mockResolvedValue({ ok: true, status: 204, json: async () => undefined });

    await expect(leaveRoom(42)).resolves.toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/rooms/42/leave",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("실패 응답이면 ApiError를 던진다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(404, { code: "ROOM_CLOSED", message: "없는 방" }));

    await expect(leaveRoom(42)).rejects.toBeInstanceOf(ApiError);
  });
});
