import * as SecureStore from "expo-secure-store";

import { authTokenMessage, awaitAuth, ensureAuth, refreshAuth, subscribeAuth } from "../auth";
import { logMetaRegistration } from "../metaAds";
import { ensureUserRegistered } from "../userApi";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "http://api.test" } } },
}));
jest.mock("../deviceId", () => ({
  getOrCreateDeviceId: jest.fn(async () => "0f8fad5b-d9cb-469f-a165-70867728950e"),
}));
// Meta 가입 완료 — 호출 여부만 본다(큐·초기화는 `metaAds.test.ts`).
jest.mock("../metaAds", () => ({
  logMetaRegistration: jest.fn(),
}));

/** SecureStore를 키별 메모리 맵으로 흉내 낸다 — `focuson.auth`와 옛 `focuson.userId`를 구분해야 한다. */
const store = new Map<string, string>();
const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;
const mockedDelete = SecureStore.deleteItemAsync as jest.Mock;
const mockedFetch = jest.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
const saved = () => JSON.parse(store.get("focuson.auth") ?? "null") as unknown;
const headersOf = (call: number) =>
  new Headers((mockedFetch.mock.calls[call] as [string, RequestInit])[1].headers);
const STORED = { userId: 7, accessToken: "a1", refreshToken: "r1" };

beforeEach(() => {
  jest.clearAllMocks();
  // 구현까지 지운다 — 앞 케이스가 남긴 fetch 응답이 다음 케이스를 조용히 통과시키지 않게.
  mockedFetch.mockReset();
  store.clear();
  mockedGet.mockImplementation(async (key: string) => store.get(key) ?? null);
  mockedSet.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  mockedDelete.mockImplementation(async (key: string) => {
    store.delete(key);
  });
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ensureAuth", () => {
  it("저장된 토큰이 있으면 네트워크 호출 없이 반환한다", async () => {
    store.set("focuson.auth", JSON.stringify(STORED));
    await expect(ensureAuth()).resolves.toEqual(STORED);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("신규 등록이면 토큰 쌍을 focuson.auth 한 키에 THIS_DEVICE_ONLY로 저장하고 구독자에게 알린다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(201, { userId: 7, isNew: true, accessToken: "a1", refreshToken: "r1" }),
    );
    const listener = jest.fn();
    const unsubscribe = subscribeAuth(listener);

    await expect(ensureAuth()).resolves.toEqual(STORED);
    expect(mockedFetch).toHaveBeenCalledWith(
      "http://api.test/api/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ deviceId: "0f8fad5b-d9cb-469f-a165-70867728950e" }),
      }),
    );
    expect(mockedSet).toHaveBeenCalledWith("focuson.auth", expect.any(String), {
      keychainAccessible: 1,
    });
    expect(saved()).toEqual(STORED);
    expect(listener).toHaveBeenCalledWith(STORED);
    // 신규 등록만 Meta 가입 완료로 센다 — 저장 뒤에 찍힌다.
    expect(logMetaRegistration).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("서버가 토큰을 주지 않으면 accessToken·refreshToken을 null로 저장한다 — 웹이 영영 기다리지 않게", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { userId: 7, isNew: false }));
    await expect(ensureAuth()).resolves.toEqual({
      userId: 7,
      accessToken: null,
      refreshToken: null,
    });
    expect(logMetaRegistration).not.toHaveBeenCalled();
  });

  it("지연 이관: focuson.userId만 있으면 네트워크 없이 그 userId를 토큰 없이 옮기고 옛 키를 지운다", async () => {
    store.set("focuson.userId", "42");

    await expect(ensureAuth()).resolves.toEqual({
      userId: 42,
      accessToken: null,
      refreshToken: null,
    });
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(saved()).toEqual({ userId: 42, accessToken: null, refreshToken: null });
    expect(store.has("focuson.userId")).toBe(false);
  });

  it("POST /api/users에 Authorization을 붙이지 않는다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { userId: 42, isNew: false }));
    await ensureAuth();
    expect(headersOf(0).has("Authorization")).toBe(false);
  });

  it("깨진 저장은 없는 것으로 보고 재등록한다", async () => {
    store.set("focuson.auth", "42");
    mockedFetch.mockResolvedValue(jsonResponse(200, { userId: 42, isNew: false }));
    await expect(ensureAuth()).resolves.toMatchObject({ userId: 42 });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("저장소 읽기가 throw해도(새 키·옛 키 모두) 없는 것으로 보고 등록한다", async () => {
    mockedGet.mockRejectedValue(new Error("keychain locked"));
    mockedFetch.mockResolvedValue(jsonResponse(200, { userId: 42, isNew: false }));
    await expect(ensureAuth()).resolves.toMatchObject({ userId: 42 });
  });

  it("400·네트워크 오류면 null을 반환하고 throw 하지 않는다", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(400, { message: "deviceId: UUID 형식이어야 합니다" }),
    );
    await expect(ensureAuth()).resolves.toBeNull();
    mockedFetch.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(ensureAuth()).resolves.toBeNull();
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("동시에 여러 번 호출해도 등록 요청은 한 번만 나간다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(201, { userId: 7, isNew: true }));
    const results = await Promise.all([ensureAuth(), ensureAuth(), ensureAuth()]);
    expect(results.map((s) => s?.userId)).toEqual([7, 7, 7]);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("ensureUserRegistered는 userId만 돌려주는 래퍼다", async () => {
    store.set(
      "focuson.auth",
      JSON.stringify({ userId: 42, accessToken: null, refreshToken: null }),
    );
    await expect(ensureUserRegistered()).resolves.toBe(42);
  });
});

describe("refreshAuth", () => {
  beforeEach(() => {
    store.set("focuson.auth", JSON.stringify(STORED));
  });

  it("200이면 두 토큰을 교체 저장하고 구독자에게 알린다 — Authorization 없이 보낸다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { accessToken: "a2", refreshToken: "r2" }));
    const listener = jest.fn();
    const unsubscribe = subscribeAuth(listener);

    await expect(refreshAuth()).resolves.toEqual({
      userId: 7,
      accessToken: "a2",
      refreshToken: "r2",
    });
    expect(mockedFetch).toHaveBeenCalledWith(
      "http://api.test/api/auth/refresh",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ refreshToken: "r1" }) }),
    );
    expect(headersOf(0).has("Authorization")).toBe(false);
    expect(saved()).toEqual({ userId: 7, accessToken: "a2", refreshToken: "r2" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("동시 호출은 갱신 요청 한 번을 공유한다 — refresh는 1회용이라 두 번 나가면 전량 폐기된다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { accessToken: "a2", refreshToken: "r2" }));
    await Promise.all([refreshAuth(), refreshAuth(), refreshAuth()]);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("401이면 저장을 지우고 기기 UUID로 재등록한다", async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse(401, { message: "만료된 refresh 토큰입니다" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { userId: 7, isNew: false, accessToken: "a3", refreshToken: "r3" }),
      );

    await expect(refreshAuth()).resolves.toEqual({
      userId: 7,
      accessToken: "a3",
      refreshToken: "r3",
    });
    expect(mockedDelete).toHaveBeenCalledWith("focuson.auth", { keychainAccessible: 1 });
    expect(mockedFetch.mock.calls[1]?.[0]).toBe("http://api.test/api/users");
  });

  it("400(VALIDATION_FAILED)이면 저장을 지우고 기기 UUID로 재등록한다", async () => {
    mockedFetch
      .mockResolvedValueOnce(
        jsonResponse(400, {
          code: "VALIDATION_FAILED",
          message: "refreshToken이 유효하지 않습니다",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { userId: 7, isNew: false, accessToken: "a3", refreshToken: "r3" }),
      );

    await expect(refreshAuth()).resolves.toEqual({
      userId: 7,
      accessToken: "a3",
      refreshToken: "r3",
    });
    expect(mockedDelete).toHaveBeenCalledWith("focuson.auth", { keychainAccessible: 1 });
    expect(mockedFetch.mock.calls[1]?.[0]).toBe("http://api.test/api/users");
  });

  it("네트워크 오류·5xx면 저장을 유지하고 null을 돌려준다", async () => {
    mockedFetch.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(refreshAuth()).resolves.toBeNull();
    mockedFetch.mockResolvedValueOnce(jsonResponse(503, { message: "unavailable" }));
    await expect(refreshAuth()).resolves.toBeNull();
    expect(saved()).toEqual(STORED);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("refresh 토큰이 없으면(지연 이관·토큰 없는 서버) /refresh 없이 저장을 지우고 재등록한다", async () => {
    store.set("focuson.auth", JSON.stringify({ userId: 7, accessToken: null, refreshToken: null }));
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { userId: 7, isNew: false, accessToken: "a1", refreshToken: "r1" }),
    );
    await expect(refreshAuth()).resolves.toEqual(STORED);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch.mock.calls[0]?.[0]).toBe("http://api.test/api/users");
  });

  it("등록이 진행 중이면 /refresh를 부르지 않고 등록 결과를 돌려준다", async () => {
    store.clear();
    let finish: (value: unknown) => void = () => {};
    mockedFetch.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const registering = ensureAuth();
    const refreshing = refreshAuth();
    finish(jsonResponse(201, { userId: 9, isNew: true, accessToken: "x", refreshToken: "y" }));
    await expect(registering).resolves.toMatchObject({ userId: 9 });
    await expect(refreshing).resolves.toMatchObject({ userId: 9 });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});

describe("awaitAuth", () => {
  it("갱신이 진행 중이면 갱신 결과를 돌려준다", async () => {
    store.set("focuson.auth", JSON.stringify(STORED));
    let finish: (value: unknown) => void = () => {};
    mockedFetch.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const refreshing = refreshAuth();
    const awaited = awaitAuth();
    finish(jsonResponse(200, { accessToken: "a2", refreshToken: "r2" }));
    await refreshing;
    await expect(awaited).resolves.toMatchObject({ accessToken: "a2" });
  });

  it("갱신 중이 아니면 저장 상태를 돌려준다", async () => {
    store.set("focuson.auth", JSON.stringify(STORED));
    await expect(awaitAuth()).resolves.toEqual(STORED);
  });
});

describe("authTokenMessage", () => {
  it("refresh 토큰은 절대 싣지 않는다 — 웹뷰로 나가는 유일한 메시지다", () => {
    const message = authTokenMessage(STORED);
    expect(message).toEqual({
      type: "auth-token",
      userId: 7,
      accessToken: "a1",
      atMs: expect.any(Number),
    });
    expect(Object.keys(message)).not.toContain("refreshToken");
  });

  it("상태가 없으면 userId·accessToken을 null로 보낸다 — 웹이 헤더 없이 보내게", () => {
    expect(authTokenMessage(null)).toMatchObject({
      type: "auth-token",
      userId: null,
      accessToken: null,
    });
  });
});
