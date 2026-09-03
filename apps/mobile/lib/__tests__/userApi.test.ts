import * as SecureStore from "expo-secure-store";

import { ensureUserRegistered } from "../userApi";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "http://api.test" } } },
}));
jest.mock("../deviceId", () => ({
  getOrCreateDeviceId: jest.fn(async () => "0f8fad5b-d9cb-469f-a165-70867728950e"),
}));

const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;
const mockedFetch = jest.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("ensureUserRegistered", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("저장된 userId가 있으면 네트워크 호출 없이 반환한다", async () => {
    mockedGet.mockResolvedValue("42");

    await expect(ensureUserRegistered()).resolves.toBe(42);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("신규 등록(201) 시 userId를 저장하고 반환한다", async () => {
    mockedGet.mockResolvedValue(null);
    mockedFetch.mockResolvedValue(jsonResponse(201, { userId: 7, isNew: true }));

    await expect(ensureUserRegistered()).resolves.toBe(7);
    expect(mockedFetch).toHaveBeenCalledWith(
      "http://api.test/api/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ deviceId: "0f8fad5b-d9cb-469f-a165-70867728950e" }),
      }),
    );
    expect(mockedSet).toHaveBeenCalledWith("focuson.userId", "7");
  });

  it("재등록(200, isNew=false)도 동일하게 userId를 저장한다", async () => {
    mockedGet.mockResolvedValue(null);
    mockedFetch.mockResolvedValue(jsonResponse(200, { userId: 7, isNew: false }));

    await expect(ensureUserRegistered()).resolves.toBe(7);
    expect(mockedSet).toHaveBeenCalledWith("focuson.userId", "7");
  });

  it("400 응답이면 null을 반환하고 throw 하지 않는다 (fail-soft)", async () => {
    mockedGet.mockResolvedValue(null);
    mockedFetch.mockResolvedValue(
      jsonResponse(400, { message: "deviceId: UUID 형식이어야 합니다" }),
    );

    await expect(ensureUserRegistered()).resolves.toBeNull();
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("네트워크 오류여도 null을 반환하고 throw 하지 않는다 (fail-soft)", async () => {
    mockedGet.mockResolvedValue(null);
    mockedFetch.mockRejectedValue(new TypeError("Network request failed"));

    await expect(ensureUserRegistered()).resolves.toBeNull();
  });

  it("동시에 여러 번 호출해도 등록 요청은 한 번만 나간다 (레이스 컨디션 방지)", async () => {
    mockedGet.mockResolvedValue(null);
    mockedFetch.mockResolvedValue(jsonResponse(201, { userId: 7, isNew: true }));

    const [first, second, third] = await Promise.all([
      ensureUserRegistered(),
      ensureUserRegistered(),
      ensureUserRegistered(),
    ]);

    expect(first).toBe(7);
    expect(second).toBe(7);
    expect(third).toBe(7);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("이전 호출이 끝난 뒤에는 다시 독립적으로 호출한다", async () => {
    mockedGet.mockResolvedValue(null);
    mockedFetch.mockResolvedValue(jsonResponse(201, { userId: 7, isNew: true }));

    await ensureUserRegistered();
    mockedGet.mockResolvedValue("7");
    await ensureUserRegistered();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
