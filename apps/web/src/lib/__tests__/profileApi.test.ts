import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProfile, updateProfile } from "../profileApi";

const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

const profile = {
  nickname: "포메3721",
  goal: null,
  category: null,
  initial: "포",
  colorIndex: 0,
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("getProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("userId 경로로 프로필을 조회한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, profile));

    await expect(getProfile(7)).resolves.toEqual(profile);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/users/7/profile",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("updateProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("변경할 필드만 PATCH로 보낸다", async () => {
    const updated = { ...profile, nickname: "숨벅찬청년들", initial: "숨" };
    mockedFetch.mockResolvedValue(jsonResponse(200, updated));

    await expect(updateProfile(7, { nickname: "숨벅찬청년들" })).resolves.toEqual(updated);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/users/7/profile",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ nickname: "숨벅찬청년들" }),
      }),
    );
  });

  it("409 NICKNAME_TAKEN의 code를 보존해 던진다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(409, { code: "NICKNAME_TAKEN", message: "이미 사용 중" }),
    );

    await expect(updateProfile(7, { nickname: "중복닉" })).rejects.toMatchObject({
      status: 409,
      code: "NICKNAME_TAKEN",
    });
  });
});
