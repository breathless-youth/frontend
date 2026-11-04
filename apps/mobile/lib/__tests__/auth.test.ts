import * as SecureStore from "expo-secure-store";

import {
  authTokenMessage,
  awaitAuth,
  ensureAuth,
  linkSocial,
  refreshAuth,
  registerUser,
  subscribeAuth,
  isNewUserThisLaunch,
} from "../auth";
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
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const saved = () => JSON.parse(store.get("focuson.auth") ?? "null") as unknown;
const headersOf = (call: number) =>
  new Headers((mockedFetch.mock.calls[call] as [string, RequestInit])[1].headers);
/**
 * 등록 응답의 access 토큰을 흉내 낸다. 신원이 응답 본문이 아니라 `sub` 클레임에만 있으므로(BY-723)
 * 테스트도 실제 모양을 써야 한다 — 아무 문자열이나 주면 등록이 실패하는 게 맞는 동작이다.
 */
function accessTokenFor(userId: number): string {
  const b64url = (value: object) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "HS256" })}.${b64url({ sub: String(userId), iat: 1, exp: 2 })}.sig`;
}

const REGISTERED = { userId: 7, accessToken: accessTokenFor(7), refreshToken: "r1" };
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
    expect(isNewUserThisLaunch()).toBe(false);
  });

  it("신규 등록이면 토큰 쌍을 focuson.auth 한 키에 THIS_DEVICE_ONLY로 저장하고 구독자에게 알린다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(201, {
        isNew: true,
        accessToken: REGISTERED.accessToken,
        refreshToken: "r1",
      }),
    );
    const listener = jest.fn();
    const unsubscribe = subscribeAuth(listener);

    await expect(ensureAuth()).resolves.toEqual(REGISTERED);
    expect(mockedFetch).toHaveBeenCalledWith(
      "http://api.test/api/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ deviceId: "0f8fad5b-d9cb-469f-a165-70867728950e", locale: "ko" }),
      }),
    );
    expect(mockedSet).toHaveBeenCalledWith("focuson.auth", expect.any(String), {
      keychainAccessible: 1,
    });
    expect(saved()).toEqual(REGISTERED);
    expect(listener).toHaveBeenCalledWith(REGISTERED);
    expect(headersOf(0).get("API-Version")).toBe("2");
    // 신규 등록만 Meta 가입 완료로 센다.
    expect(logMetaRegistration).toHaveBeenCalledTimes(1);
    // 웹이 온보딩 대상을 서버 조회 없이 알도록 이번 실행이 새 계정이라는 사실을 남긴다.
    expect(isNewUserThisLaunch()).toBe(true);
    unsubscribe();
  });

  it("access 토큰에서 sub를 못 읽으면 저장하지 않는다 — 신원 없는 저장은 웹을 단독 모드로 떨어뜨린다", async () => {
    // 등록 응답에 userId가 없으므로 신원의 유일한 출처가 sub다. 못 읽으면 실패가 맞다.
    mockedFetch.mockResolvedValue(jsonResponse(200, { isNew: false, accessToken: "not-a-jwt" }));
    await expect(ensureAuth()).resolves.toBeNull();
    expect(mockedSet).not.toHaveBeenCalled();
    expect(logMetaRegistration).not.toHaveBeenCalled();
  });

  it("신규 등록 뒤 sub를 못 읽어 저장이 실패해도 가입 완료는 이미 찍혀 있다 — 재등록은 isNew=false라 기회가 없다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(201, { isNew: true, accessToken: "not-a-jwt" }));

    await expect(ensureAuth()).resolves.toBeNull();
    expect(mockedSet).not.toHaveBeenCalled();
    expect(logMetaRegistration).toHaveBeenCalledTimes(1);
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
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { isNew: false, accessToken: accessTokenFor(42), refreshToken: "r9" }),
    );
    await ensureAuth();
    expect(headersOf(0).has("Authorization")).toBe(false);
  });

  it("깨진 저장은 없는 것으로 보고 재등록한다", async () => {
    store.set("focuson.auth", "42");
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { isNew: false, accessToken: accessTokenFor(42), refreshToken: "r9" }),
    );
    await expect(ensureAuth()).resolves.toMatchObject({ userId: 42 });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("저장소 읽기가 throw해도(새 키·옛 키 모두) 없는 것으로 보고 등록한다", async () => {
    mockedGet.mockRejectedValue(new Error("keychain locked"));
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { isNew: false, accessToken: accessTokenFor(42), refreshToken: "r9" }),
    );
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
    mockedFetch.mockResolvedValue(
      jsonResponse(201, { isNew: true, accessToken: REGISTERED.accessToken, refreshToken: "r1" }),
    );
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

describe("registerUser", () => {
  it("가입 요청 본문에 자동 닉네임 언어로 쓸 locale을 싣는다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(201, { isNew: true, accessToken: accessTokenFor(7), refreshToken: "r1" }),
    );

    await registerUser("0f8fad5b-d9cb-469f-a165-70867728950e");

    expect((mockedFetch.mock.calls[0] as [string, RequestInit])[1].body).toBe(
      JSON.stringify({ deviceId: "0f8fad5b-d9cb-469f-a165-70867728950e", locale: "ko" }),
    );
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
        jsonResponse(200, { isNew: false, accessToken: accessTokenFor(7), refreshToken: "r3" }),
      );

    await expect(refreshAuth()).resolves.toEqual({
      userId: 7,
      accessToken: accessTokenFor(7),
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
        jsonResponse(200, { isNew: false, accessToken: accessTokenFor(7), refreshToken: "r3" }),
      );

    await expect(refreshAuth()).resolves.toEqual({
      userId: 7,
      accessToken: accessTokenFor(7),
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
      jsonResponse(200, { isNew: false, accessToken: accessTokenFor(7), refreshToken: "r1" }),
    );
    await expect(refreshAuth()).resolves.toEqual(REGISTERED);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch.mock.calls[0]?.[0]).toBe("http://api.test/api/users");
  });

  it("등록이 진행 중이면 /refresh를 부르지 않고 등록 결과를 돌려준다", async () => {
    store.clear();
    let finish: (value: unknown) => void = () => {};
    mockedFetch.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const registering = ensureAuth();
    const refreshing = refreshAuth();
    finish(jsonResponse(201, { isNew: true, accessToken: accessTokenFor(9), refreshToken: "y" }));
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

describe("linkSocial", () => {
  const GUEST = { userId: 7, accessToken: "a1", refreshToken: "r1" };
  const linkBody = JSON.stringify({ provider: "KAKAO", idToken: "id-token", nonce: "raw-nonce" });

  beforeEach(() => {
    store.set("focuson.auth", JSON.stringify(GUEST));
  });

  it("200 병합이면 새 토큰의 sub로 userId를 바꿔 저장하고 구독자에게 알린다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { accessToken: accessTokenFor(42), refreshToken: "r9", isNewUser: false }),
    );
    const listener = jest.fn();
    const unsubscribe = subscribeAuth(listener);

    await expect(linkSocial("KAKAO", "id-token", "raw-nonce")).resolves.toEqual({
      status: "success",
      isNewUser: false,
    });
    expect(mockedFetch).toHaveBeenCalledWith(
      "http://api.test/api/auth/link",
      expect.objectContaining({ method: "POST", body: linkBody }),
    );
    expect(headersOf(0).get("Authorization")).toBe("Bearer a1");
    const linked = { userId: 42, accessToken: accessTokenFor(42), refreshToken: "r9" };
    expect(saved()).toEqual(linked);
    expect(listener).toHaveBeenCalledWith(linked);
    unsubscribe();
  });

  it("link 요청에 서버가 정한 API-Version 1을 싣는다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { accessToken: accessTokenFor(7), refreshToken: "r9", isNewUser: true }),
    );

    await linkSocial("KAKAO", "id-token", "raw-nonce");

    expect(headersOf(0).get("API-Version")).toBe("1");
  });

  it("성공하면 구독자(웹뷰의 auth-token)에 먼저 알린 뒤 결과를 돌려준다", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, { accessToken: accessTokenFor(42), refreshToken: "r9", isNewUser: false }),
    );
    const order: string[] = [];
    const unsubscribe = subscribeAuth(() => order.push("auth-token"));

    await linkSocial("KAKAO", "id-token", "raw-nonce").then(() => order.push("result"));

    // 웹은 결과를 받자마자 새 토큰으로 다시 불러오므로 토큰이 먼저 도착해야 한다.
    expect(order).toEqual(["auth-token", "result"]);
    unsubscribe();
  });

  it("401이면 토큰을 갱신하고 같은 ID 토큰으로 한 번 다시 보낸다", async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse(401, { message: "만료" }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "a2", refreshToken: "r2" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: accessTokenFor(7), refreshToken: "r3", isNewUser: true }),
      );

    await expect(linkSocial("KAKAO", "id-token", "raw-nonce")).resolves.toEqual({
      status: "success",
      isNewUser: true,
    });
    expect(mockedFetch.mock.calls.map((call) => call[0])).toEqual([
      "http://api.test/api/auth/link",
      "http://api.test/api/auth/refresh",
      "http://api.test/api/auth/link",
    ]);
    expect((mockedFetch.mock.calls[2] as [string, RequestInit])[1].body).toBe(linkBody);
    expect(headersOf(2).get("Authorization")).toBe("Bearer a2");
  });

  it("404면 저장을 비우고 비회원으로 다시 가입한 뒤 같은 ID 토큰으로 한 번 다시 보낸다", async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse(404, { code: "USER_NOT_FOUND" }))
      .mockResolvedValueOnce(
        jsonResponse(201, { isNew: true, accessToken: accessTokenFor(8), refreshToken: "r8" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: accessTokenFor(8), refreshToken: "r9", isNewUser: true }),
      );

    await expect(linkSocial("KAKAO", "id-token", "raw-nonce")).resolves.toEqual({
      status: "success",
      isNewUser: true,
    });
    expect(mockedDelete).toHaveBeenCalledWith("focuson.auth", { keychainAccessible: 1 });
    expect(mockedFetch.mock.calls.map((call) => call[0])).toEqual([
      "http://api.test/api/auth/link",
      "http://api.test/api/users",
      "http://api.test/api/auth/link",
    ]);
    expect((mockedFetch.mock.calls[2] as [string, RequestInit])[1].body).toBe(linkBody);
    expect(headersOf(2).get("Authorization")).toBe(`Bearer ${accessTokenFor(8)}`);
  });

  it.each([
    [400, "INVALID_SOCIAL_TOKEN", "INVALID_SOCIAL_TOKEN"],
    [400, "VALIDATION_FAILED", "UNKNOWN"],
    [409, "ALREADY_LINKED", "ALREADY_LINKED"],
    [503, "SOCIAL_PROVIDER_UNAVAILABLE", "SOCIAL_PROVIDER_UNAVAILABLE"],
  ])("%i %s면 토큰을 유지하고 코드 %s만 돌려준다", async (status, code, expected) => {
    mockedFetch.mockResolvedValue(jsonResponse(status, { code }));

    await expect(linkSocial("KAKAO", "id-token", "raw-nonce")).resolves.toEqual({
      status: "failed",
      code: expected,
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedSet).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(saved()).toEqual(GUEST);
  });

  it("link 중에 들어온 갱신은 link 결과를 기다렸다가 새 refresh로 갱신한다", async () => {
    let finishLink: (value: unknown) => void = () => {};
    mockedFetch
      .mockReturnValueOnce(new Promise((resolve) => (finishLink = resolve)))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "a10", refreshToken: "r10" }));

    const linking = linkSocial("KAKAO", "id-token", "raw-nonce");
    await flush();
    const refreshing = refreshAuth();
    await flush();
    // link가 끝나기 전에 옛 refresh로 갱신하면 서버가 무효로 보고 새 비회원이 가입된다.
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    finishLink(
      jsonResponse(200, { accessToken: accessTokenFor(42), refreshToken: "r9", isNewUser: false }),
    );
    await linking;
    await expect(refreshing).resolves.toEqual({
      userId: 42,
      accessToken: "a10",
      refreshToken: "r10",
    });
    expect((mockedFetch.mock.calls[1] as [string, RequestInit])[1].body).toBe(
      JSON.stringify({ refreshToken: "r9" }),
    );
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("가입이 진행 중일 때 link와 같은 차례에 들어온 갱신도 link 결과를 기다린다", async () => {
    store.clear();
    mockedFetch
      .mockResolvedValueOnce(
        jsonResponse(201, { isNew: true, accessToken: accessTokenFor(7), refreshToken: "r1" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accessToken: accessTokenFor(42),
          refreshToken: "r9",
          isNewUser: false,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "a10", refreshToken: "r10" }));

    // link가 가입을 기다리는 동안 갱신이 가입 결과를 그대로 받으면 link 전 토큰이 웹으로 간다.
    const linking = linkSocial("KAKAO", "id-token", "raw-nonce");
    const refreshing = refreshAuth();

    await expect(linking).resolves.toEqual({ status: "success", isNewUser: false });
    await expect(refreshing).resolves.toEqual({
      userId: 42,
      accessToken: "a10",
      refreshToken: "r10",
    });
    expect((mockedFetch.mock.calls[2] as [string, RequestInit])[1].body).toBe(
      JSON.stringify({ refreshToken: "r9" }),
    );
  });

  it("갱신 중에 들어온 link는 갱신이 끝난 토큰으로 보낸다", async () => {
    let finishRefresh: (value: unknown) => void = () => {};
    mockedFetch
      .mockReturnValueOnce(new Promise((resolve) => (finishRefresh = resolve)))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: accessTokenFor(7), refreshToken: "r9", isNewUser: true }),
      );

    const refreshing = refreshAuth();
    const linking = linkSocial("KAKAO", "id-token", "raw-nonce");
    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    finishRefresh(jsonResponse(200, { accessToken: "a2", refreshToken: "r2" }));
    await refreshing;
    await expect(linking).resolves.toEqual({ status: "success", isNewUser: true });
    expect(mockedFetch.mock.calls[1]?.[0]).toBe("http://api.test/api/auth/link");
    expect(headersOf(1).get("Authorization")).toBe("Bearer a2");
  });

  it("네트워크 오류면 토큰을 유지하고 UNKNOWN을 돌려준다", async () => {
    mockedFetch.mockRejectedValue(new TypeError("Network request failed"));

    await expect(linkSocial("KAKAO", "id-token", "raw-nonce")).resolves.toEqual({
      status: "failed",
      code: "UNKNOWN",
    });
    expect(saved()).toEqual(GUEST);
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
