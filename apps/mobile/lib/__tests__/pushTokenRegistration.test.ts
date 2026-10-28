import { Platform } from "react-native";

import { ensureAuth, refreshAuth, subscribeAuth } from "../auth";
import { getPushPermissionStatus, getPushToken } from "../pushMessaging";
import {
  registerPushToken,
  resetPushTokenRegistration,
  watchAuthForPushToken,
} from "../pushTokenRegistration";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "http://api.test" } } },
}));
// 토큰 발급·회전은 `auth.test.ts`가, RNFB 호출은 `pushMessaging.test.ts`가 본다.
jest.mock("../auth", () => ({
  ensureAuth: jest.fn(),
  refreshAuth: jest.fn(),
  subscribeAuth: jest.fn(() => () => {}),
}));
jest.mock("../pushMessaging", () => ({
  getPushToken: jest.fn(),
  getPushPermissionStatus: jest.fn(),
}));

const mockedEnsureAuth = ensureAuth as jest.Mock;
const mockedRefreshAuth = refreshAuth as jest.Mock;
const mockedSubscribeAuth = subscribeAuth as jest.Mock;
const mockedGetToken = getPushToken as jest.Mock;
const mockedPermission = getPushPermissionStatus as jest.Mock;
const mockedFetch = jest.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

const FCM_TOKEN = "fcm-token-secret";
const response = (status: number) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => ({}),
});
const callOf = (call: number) => mockedFetch.mock.calls[call] as [string, RequestInit];
const headersOf = (call: number) => new Headers(callOf(call)[1].headers);
const bodyOf = (call: number) =>
  JSON.parse(callOf(call)[1].body as string) as Record<string, unknown>;
/** 구독 콜백은 등록을 기다리지 않고 띄우므로 조건이 맞을 때까지 마이크로태스크를 돌린다. */
async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 50 && !condition(); i++) await Promise.resolve();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedFetch.mockReset();
  resetPushTokenRegistration();
  Platform.OS = "ios";
  mockedEnsureAuth.mockResolvedValue({ userId: 1, accessToken: "a", refreshToken: "r" });
  mockedRefreshAuth.mockResolvedValue(null);
  mockedGetToken.mockResolvedValue(FCM_TOKEN);
  mockedPermission.mockResolvedValue("granted");
  mockedFetch.mockResolvedValue(response(204));
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("registerPushToken", () => {
  it("토큰·플랫폼·알림 권한을 PUT /api/push-tokens로 보낸다", async () => {
    await registerPushToken();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = callOf(0);
    expect(url).toBe("http://api.test/api/push-tokens");
    expect(init.method).toBe("PUT");
    expect(headersOf(0).get("API-Version")).toBe("1");
    expect(headersOf(0).get("Authorization")).toBe("Bearer a");
    expect(headersOf(0).get("Content-Type")).toBe("application/json");
    expect(bodyOf(0)).toEqual({ token: FCM_TOKEN, platform: "IOS", notificationsEnabled: true });
  });

  it("알림 권한을 거부한 기기도 notificationsEnabled=false로 등록한다", async () => {
    mockedPermission.mockResolvedValue("denied");
    await registerPushToken();
    expect(bodyOf(0)).toMatchObject({ notificationsEnabled: false });
  });

  it("Android는 ANDROID로 보낸다", async () => {
    Platform.OS = "android";
    await registerPushToken();
    expect(bodyOf(0)).toMatchObject({ platform: "ANDROID" });
  });

  it("같은 사용자·토큰·권한이면 다시 보내지 않고, 권한이 바뀌면 다시 보낸다", async () => {
    await registerPushToken();
    await registerPushToken();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    mockedPermission.mockResolvedValue("denied");
    await registerPushToken();
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(1)).toMatchObject({ notificationsEnabled: false });
  });

  it("동시에 불려도 같은 조합은 한 번만 보내고, 그사이 바뀐 토큰은 이어서 보낸다", async () => {
    let finishFirst: (value: unknown) => void = () => {};
    mockedFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    );
    const first = registerPushToken();
    const second = registerPushToken();
    await waitFor(() => mockedFetch.mock.calls.length === 1);
    mockedGetToken.mockResolvedValue("fcm-token-new");
    const third = registerPushToken();
    finishFirst(response(204));
    await Promise.all([first, second, third]);

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(0)).toMatchObject({ token: FCM_TOKEN });
    expect(bodyOf(1)).toMatchObject({ token: "fcm-token-new" });
  });

  it("401이면 토큰을 갱신해 한 번만 다시 보낸다", async () => {
    mockedFetch.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(204));
    mockedRefreshAuth.mockResolvedValue({ userId: 1, accessToken: "b", refreshToken: "r2" });

    await registerPushToken();

    expect(mockedRefreshAuth).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(headersOf(1).get("Authorization")).toBe("Bearer b");
  });

  it("401 뒤 갱신도 실패하면 더 보내지 않는다", async () => {
    mockedFetch.mockResolvedValue(response(401));

    await registerPushToken();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["access 토큰이 없으면", () => mockedEnsureAuth.mockResolvedValue(null)],
    ["FCM 토큰이 없으면", () => mockedGetToken.mockResolvedValue(null)],
  ])("%s 보내지 않는다", async (_, arrange) => {
    arrange();
    await registerPushToken();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("네트워크가 실패해도 던지지 않고, 다음 호출에서 다시 보낸다", async () => {
    mockedFetch.mockRejectedValueOnce(new TypeError("Network request failed"));

    await expect(registerPushToken()).resolves.toBeUndefined();
    await registerPushToken();

    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("실패 로그에 FCM 토큰 값을 남기지 않는다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockedFetch.mockResolvedValue(response(500));

    await registerPushToken();

    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(FCM_TOKEN);
  });
});

describe("watchAuthForPushToken", () => {
  const authListener = () => (mockedSubscribeAuth.mock.calls[0] as [(state: unknown) => void])[0];

  it("등록한 뒤 사용자 ID가 바뀌면 새 사용자로 다시 등록한다", async () => {
    await registerPushToken();
    watchAuthForPushToken();
    mockedEnsureAuth.mockResolvedValue({ userId: 2, accessToken: "c", refreshToken: "r" });

    authListener()({ userId: 2, accessToken: "c", refreshToken: "r" });
    await waitFor(() => mockedFetch.mock.calls.length === 2);

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(headersOf(1).get("Authorization")).toBe("Bearer c");
  });

  it("등록 요청을 보낸 적이 없을 때 토큰이 생기면 등록한다", async () => {
    // 옛 설치의 지연 이관은 첫 실행에 access 토큰이 없어 실행 시 등록을 건너뛴다.
    mockedEnsureAuth.mockResolvedValue({ userId: 1, accessToken: null, refreshToken: null });
    await registerPushToken();
    watchAuthForPushToken();
    mockedEnsureAuth.mockResolvedValue({ userId: 1, accessToken: "a", refreshToken: "r" });

    authListener()({ userId: 1, accessToken: "a", refreshToken: "r" });
    await waitFor(() => mockedFetch.mock.calls.length === 1);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(headersOf(0).get("Authorization")).toBe("Bearer a");
  });

  it("등록한 사용자의 토큰 회전에는 아무것도 하지 않는다", async () => {
    await registerPushToken();
    watchAuthForPushToken();
    authListener()({ userId: 1, accessToken: "b", refreshToken: "r2" });
    await waitFor(() => false);

    expect(mockedGetToken).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("401이 계속되고 갱신은 성공해도, 갱신 알림으로 등록을 반복하지 않는다", async () => {
    // 서버에 경로가 없으면 401이 계속된다. 등록이 부른 갱신이 다시 등록을 부르면 refresh 토큰이 끝없이 회전한다.
    watchAuthForPushToken();
    let rotation = 0;
    mockedRefreshAuth.mockImplementation(async () => {
      const next = { userId: 1, accessToken: `b${++rotation}`, refreshToken: `r${rotation}` };
      mockedEnsureAuth.mockResolvedValue(next);
      authListener()(next);
      return next;
    });
    mockedFetch.mockResolvedValue(response(401));

    await registerPushToken();
    await waitFor(() => false);

    expect(mockedRefreshAuth).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });
});
