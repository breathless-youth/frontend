import * as SecureStore from "expo-secure-store";

import { ensureAuth, refreshAuth } from "../auth";
import { readLaunchGoal, refreshLaunchGoal, saveLaunchGoal } from "../launchGoal";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "http://api.test" } } },
}));
// 토큰 발급·회전은 `auth.test.ts`가 본다.
// 여기서는 돌려준 토큰을 어떻게 쓰는지만 본다.
jest.mock("../auth", () => ({
  ensureAuth: jest.fn(),
  refreshAuth: jest.fn(),
}));

const KEY = "focuson.launchGoal";
const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;
const mockedDelete = SecureStore.deleteItemAsync as jest.Mock;
const mockedEnsureAuth = ensureAuth as jest.Mock;
const mockedRefreshAuth = refreshAuth as jest.Mock;
const mockedFetch = jest.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function profile(goal: string | null) {
  return { nickname: "포메", goal, category: null, initial: "포", colorIndex: 0 };
}
/** 조회가 토큰을 받고 요청을 보낼 때까지 기다린다. */
async function waitForFetch() {
  while (mockedFetch.mock.calls.length === 0) {
    await Promise.resolve();
  }
}
const callOf = (call: number) => mockedFetch.mock.calls[call] as [string, RequestInit];
const headersOf = (call: number) => new Headers(callOf(call)[1].headers);

beforeEach(() => {
  jest.clearAllMocks();
  mockedFetch.mockReset();
  mockedGet.mockResolvedValue(null);
  mockedEnsureAuth.mockResolvedValue({ userId: 1, accessToken: "a", refreshToken: "r" });
  mockedRefreshAuth.mockResolvedValue(null);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("readLaunchGoal", () => {
  it("저장된 목표 문구와 닉네임을 읽는다", async () => {
    mockedGet.mockResolvedValue(JSON.stringify({ goal: "하루 6시간", nickname: "포메" }));
    await expect(readLaunchGoal()).resolves.toEqual({ goal: "하루 6시간", nickname: "포메" });
    expect(mockedGet).toHaveBeenCalledWith(KEY);
  });

  it.each([
    ["값이 없으면", null],
    ["JSON이 깨졌으면", "{goal"],
    ["goal이 문자열이 아니면", JSON.stringify({ goal: 3, nickname: "포메" })],
    ["goal이 빈 문자열이면", JSON.stringify({ goal: "", nickname: "포메" })],
    ["goal이 공백뿐이면", JSON.stringify({ goal: "   ", nickname: "포메" })],
  ])("%s null이다", async (_, raw) => {
    mockedGet.mockResolvedValue(raw);
    await expect(readLaunchGoal()).resolves.toBeNull();
  });

  it("읽기가 끝나지 않으면 1초 뒤 null로 끝나 스플래시를 붙잡지 않는다", async () => {
    jest.useFakeTimers();
    try {
      mockedGet.mockReturnValue(new Promise(() => {}));
      const settled = jest.fn();
      void readLaunchGoal().then(settled);

      await jest.advanceTimersByTimeAsync(999);
      expect(settled).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledWith(null);
    } finally {
      jest.useRealTimers();
    }
  });

  it("읽기가 실패하면 null이다", async () => {
    mockedGet.mockRejectedValue(new Error("keychain locked"));
    await expect(readLaunchGoal()).resolves.toBeNull();
  });
});

describe("saveLaunchGoal", () => {
  it("목표 문구와 닉네임을 저장한다", async () => {
    await saveLaunchGoal({ goal: "하루 6시간", nickname: "포메" });
    expect(mockedSet).toHaveBeenCalledWith(
      KEY,
      JSON.stringify({ goal: "하루 6시간", nickname: "포메" }),
    );
  });

  it.each([null, "", "   "])("목표 문구가 비었으면(%p) 저장값을 지운다", async (goal) => {
    await saveLaunchGoal({ goal, nickname: "포메" });
    expect(mockedDelete).toHaveBeenCalledWith(KEY);
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("앞뒤 공백이 있는 목표 문구는 다듬지 않고 저장한다", async () => {
    await saveLaunchGoal({ goal: " 목표 ", nickname: "포메" });
    expect(mockedSet).toHaveBeenCalledWith(
      KEY,
      JSON.stringify({ goal: " 목표 ", nickname: "포메" }),
    );
  });

  it("저장이 실패해도 throw 하지 않는다", async () => {
    mockedSet.mockRejectedValue(new Error("keychain locked"));
    await expect(saveLaunchGoal({ goal: "하루 6시간", nickname: "포메" })).resolves.toBeUndefined();
  });
});

describe("refreshLaunchGoal", () => {
  it("프로필을 받아 목표 문구와 닉네임을 저장한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, profile("하루 6시간")));
    await refreshLaunchGoal();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(callOf(0)[0]).toBe("http://api.test/api/users/me/profile");
    expect(callOf(0)[1].method).toBe("GET");
    expect(headersOf(0).get("Authorization")).toBe("Bearer a");
    expect(headersOf(0).get("API-Version")).not.toBeNull();
    expect(mockedSet).toHaveBeenCalledWith(
      KEY,
      JSON.stringify({ goal: "하루 6시간", nickname: "포메" }),
    );
  });

  it.each([null, "", "   "])("목표 문구가 비었으면(%p) 저장값을 지운다", async (goal) => {
    mockedFetch.mockResolvedValue(jsonResponse(200, profile(goal)));
    await refreshLaunchGoal();
    expect(mockedDelete).toHaveBeenCalledWith(KEY);
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("401이면 토큰을 갱신해 한 번 다시 요청한다", async () => {
    mockedRefreshAuth.mockResolvedValue({ userId: 1, accessToken: "b", refreshToken: "r2" });
    mockedFetch
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, profile("하루 6시간")));
    await refreshLaunchGoal();
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(headersOf(1).get("Authorization")).toBe("Bearer b");
    expect(mockedSet).toHaveBeenCalledTimes(1);
  });

  it("저장 토큰이 이미 바뀌어 있으면 갱신 없이 그 토큰으로 다시 요청한다", async () => {
    mockedEnsureAuth
      .mockResolvedValueOnce({ userId: 1, accessToken: "a", refreshToken: "r" })
      .mockResolvedValueOnce({ userId: 1, accessToken: "c", refreshToken: "r2" });
    mockedFetch
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, profile("하루 6시간")));
    await refreshLaunchGoal();
    expect(mockedRefreshAuth).not.toHaveBeenCalled();
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(headersOf(1).get("Authorization")).toBe("Bearer c");
    expect(mockedSet).toHaveBeenCalledTimes(1);
  });

  it("갱신 결과가 보낸 토큰과 같으면 다시 요청하지 않는다", async () => {
    mockedRefreshAuth.mockResolvedValue({ userId: 1, accessToken: "a", refreshToken: "r" });
    mockedFetch.mockResolvedValue(jsonResponse(401, {}));
    await refreshLaunchGoal();
    expect(mockedRefreshAuth).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("응답이 오기 전에 웹의 저장 알림이 오면 늦게 온 응답은 저장하지 않는다", async () => {
    let respond: (value: unknown) => void = () => {};
    mockedFetch.mockReturnValue(
      new Promise((resolve) => {
        respond = resolve;
      }),
    );
    const refreshing = refreshLaunchGoal();
    await waitForFetch();

    await saveLaunchGoal({ goal: "새 목표", nickname: "포메" });
    respond(jsonResponse(200, profile("옛 목표")));
    await refreshing;

    expect(mockedSet).toHaveBeenCalledTimes(1);
    expect(mockedSet).toHaveBeenCalledWith(
      KEY,
      JSON.stringify({ goal: "새 목표", nickname: "포메" }),
    );
  });

  it("조회를 시작하기 전에 온 저장 알림은 그 뒤 응답 저장을 막지 않는다", async () => {
    await saveLaunchGoal({ goal: "새 목표", nickname: "포메" });
    mockedFetch.mockResolvedValue(jsonResponse(200, profile("하루 6시간")));

    await refreshLaunchGoal();

    expect(mockedSet).toHaveBeenLastCalledWith(
      KEY,
      JSON.stringify({ goal: "하루 6시간", nickname: "포메" }),
    );
  });

  it("동시에 불러도 요청은 하나만 나간다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, profile("하루 6시간")));
    await Promise.all([refreshLaunchGoal(), refreshLaunchGoal()]);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedSet).toHaveBeenCalledTimes(1);
  });

  it("다시 요청해도 401이면 더 시도하지 않고 저장값을 둔다", async () => {
    mockedRefreshAuth.mockResolvedValue({ userId: 1, accessToken: "b", refreshToken: "r2" });
    mockedFetch.mockResolvedValue(jsonResponse(401, {}));
    await refreshLaunchGoal();
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedRefreshAuth).toHaveBeenCalledTimes(1);
    expect(mockedSet).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("갱신이 실패하면 다시 요청하지 않는다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(401, {}));
    await refreshLaunchGoal();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedSet).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it.each([
    ["500 응답이면", () => mockedFetch.mockResolvedValue(jsonResponse(500, {}))],
    [
      "네트워크 오류면",
      () => mockedFetch.mockRejectedValue(new TypeError("Network request failed")),
    ],
  ])("%s 저장값을 두고 throw 하지 않는다", async (_, arrange) => {
    arrange();
    await expect(refreshLaunchGoal()).resolves.toBeUndefined();
    expect(mockedSet).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it.each([
    ["인증이 없으면", null],
    ["access 토큰이 없으면", { userId: 1, accessToken: null, refreshToken: null }],
  ])("%s 요청하지 않는다", async (_, auth) => {
    mockedEnsureAuth.mockResolvedValue(auth);
    await refreshLaunchGoal();
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
