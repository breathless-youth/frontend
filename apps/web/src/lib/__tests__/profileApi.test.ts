import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api";
import {
  deleteProfileImage,
  getProfile,
  registerProfileImage,
  requestUploadUrl,
  updateProfile,
  uploadPhoto,
} from "../profileApi";

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

  it("고정 경로(/api/users/me/profile)로 프로필을 조회한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, profile));

    await expect(getProfile()).resolves.toEqual(profile);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/users/me/profile",
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

    await expect(updateProfile({ nickname: "숨벅찬청년들" })).resolves.toEqual(updated);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/users/me/profile",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ nickname: "숨벅찬청년들" }),
      }),
    );
  });

  it("409 CONFLICT의 code를 보존해 던진다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(409, { code: "CONFLICT", message: "이미 사용 중" }));

    await expect(updateProfile({ nickname: "중복닉" })).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });
});

describe("토큰 출처 없이 URL에 userId가 있으면(구 앱)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/settings?userId=7");
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("조회가 구 경로 /api/users/7/profile로 나가고 Authorization이 없다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, profile));

    await getProfile();

    const [url, init] = mockedFetch.mock.calls[0]!;
    expect(url).toBe("/api/users/7/profile");
    expect(new Headers((init as RequestInit).headers).has("Authorization")).toBe(false);
  });

  it("수정도 구 경로로 나간다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, profile));

    await updateProfile({ nickname: "새이름" });

    expect(mockedFetch.mock.calls[0]![0]).toBe("/api/users/7/profile");
  });
});

describe("프로필 사진", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("업로드 주소는 올릴 바이트 수를 실어 API-Version 1로 받는다", async () => {
    const issued = {
      uploadUrl: "https://s3.example/put",
      key: "avatars/7/a.jpg",
      expiresAt: "2026-10-28T10:05:00Z",
    };
    mockedFetch.mockResolvedValue(jsonResponse(200, issued));

    await expect(requestUploadUrl(123_456)).resolves.toEqual(issued);
    const [url, init] = mockedFetch.mock.calls[0]!;
    expect(url).toBe("/api/users/me/profile-image/upload-url");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ contentLength: 123_456 }),
    });
    expect(new Headers((init as RequestInit).headers).get("API-Version")).toBe("1");
  });

  it("S3에는 API-Version 없이 JPEG 본문만 PUT한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, {}));
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });

    await uploadPhoto("https://s3.example/put", blob);

    expect(mockedFetch).toHaveBeenCalledWith("https://s3.example/put", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    });
  });

  it("S3가 거절하면 상태를 담은 ApiError를 던진다", async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => {
        throw new SyntaxError("XML 본문");
      },
    });

    const error = await uploadPhoto("https://s3.example/put", new Blob()).catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403 });
  });

  it("받은 키로 사진을 등록하고 프로필을 돌려받는다", async () => {
    const updated = { ...profile, profileImageUrl: "/avatars/7/a.jpg" };
    mockedFetch.mockResolvedValue(jsonResponse(200, updated));

    await expect(registerProfileImage("avatars/7/a.jpg")).resolves.toEqual(updated);
    const [url, init] = mockedFetch.mock.calls[0]!;
    expect(url).toBe("/api/users/me/profile-image");
    expect(init).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ key: "avatars/7/a.jpg" }),
    });
    expect(new Headers((init as RequestInit).headers).get("API-Version")).toBe("1");
  });

  it("사진을 지우면 사진 주소가 빈 프로필을 돌려받는다", async () => {
    const cleared = { ...profile, profileImageUrl: null };
    mockedFetch.mockResolvedValue(jsonResponse(200, cleared));

    await expect(deleteProfileImage()).resolves.toEqual(cleared);
    const [url, init] = mockedFetch.mock.calls[0]!;
    expect(url).toBe("/api/users/me/profile-image");
    expect(init).toMatchObject({ method: "DELETE" });
  });
});
