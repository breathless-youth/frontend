import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type AuthChannel,
  type AuthLocks,
  createBrowserTokenSource,
  readUserIdFromAccessToken,
} from "@/lib/auth/browserTokenSource";

const jwt = (sub: unknown) =>
  `h.${btoa(JSON.stringify({ sub }))
    .replace(/=+$/, "")
    .replaceAll("+", "-")
    .replaceAll("/", "_")}.s`;
const T7 = jwt("7");
const T7b = jwt("7") + "b";
const T8 = jwt("8");

type Reply = { status: number; body?: unknown } | "network" | "hang" | "hang-body";
type Call = { path: string; init: RequestInit };

/** 경로마다 차례로 답하는 가짜 fetch. 답을 다 쓰면 마지막 답을 되풀이한다. */
function fakeServer(replies: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const fetch = vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url, "http://local").pathname;
    calls.push({ path, init });
    const queue = replies[path] ?? [{ status: 404 }];
    const reply = queue.length > 1 ? queue.shift()! : queue[0]!;
    if (reply === "network") return Promise.reject(new TypeError("Failed to fetch"));
    if (reply === "hang") return new Promise<Response>(() => {});
    if (reply === "hang-body") {
      // 헤더는 왔지만 본문이 멈춘 응답. 요청이 중단될 때만 끝난다.
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("", "AbortError")),
            ),
          ),
      } as Response);
    }
    return Promise.resolve({
      ok: reply.status < 300,
      status: reply.status,
      json: () => Promise.resolve(reply.body),
    } as Response);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const header = (call: Call | undefined, name: string) => new Headers(call?.init.headers).get(name);

/** 탭 여러 개가 함께 쓰는 잠금. 들어온 순서대로 하나씩 실행한다. */
function sharedLocks(): AuthLocks {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request<T>(_name: string, task: () => Promise<T>) {
      const run = tail.then(task);
      tail = run.catch(() => {});
      return run;
    },
  };
}

/** 같은 이름의 BroadcastChannel처럼 보낸 탭을 뺀 나머지에게 비동기로 전한다. */
function sharedBus() {
  const members: { handlers: ((event: MessageEvent) => void)[] }[] = [];
  return (): AuthChannel => {
    const self = { handlers: [] as ((event: MessageEvent) => void)[] };
    members.push(self);
    return {
      postMessage(data) {
        for (const member of members) {
          if (member === self) continue;
          queueMicrotask(() => {
            for (const handler of member.handlers) handler({ data } as MessageEvent);
          });
        }
      },
      addEventListener(_type, handler) {
        self.handlers.push(handler);
      },
    };
  };
}

/** 알림을 붙잡아 두었다가 `deliver`로 원하는 순서에 전하는 채널 */
function heldBus() {
  const held: { to: ((event: MessageEvent) => void)[]; data: unknown }[] = [];
  const tabs: ((event: MessageEvent) => void)[][] = [];
  const channel = (): AuthChannel => {
    const self: ((event: MessageEvent) => void)[] = [];
    tabs.push(self);
    return {
      postMessage: (data) => {
        for (const tab of tabs) if (tab !== self) held.push({ to: tab, data });
      },
      addEventListener: (_type, handler) => self.push(handler),
    };
  };
  const deliver = (index: number) => {
    const { to, data } = held[index]!;
    for (const handler of to) handler({ data } as MessageEvent);
  };
  return { channel, deliver, held };
}

/** 쿠키 없이 갱신했을 때 서버의 답 */
const NO_COOKIE: Reply = { status: 400, body: { code: "VALIDATION_FAILED" } };

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function create(server: ReturnType<typeof fakeServer>, extra: object = {}) {
  return createBrowserTokenSource({
    fetch: server.fetch,
    locks: null,
    channel: null,
    baseUrl: "",
    newDeviceId: () => "uuid-1",
    language: "ko-KR",
    ...extra,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

describe("readUserIdFromAccessToken", () => {
  it.each([
    ["숫자 문자열 sub", jwt("260"), 260],
    ["숫자 sub", jwt(260), null],
    ["0", jwt("0"), null],
    ["안전 정수 초과", jwt("9007199254740993"), null],
    ["숫자 아닌 sub", jwt("12a"), null],
    ["조각 수가 틀림", "a.b", null],
    ["base64가 아님", "h.!!!.s", null],
    ["JSON이 아님", `h.${btoa("x")}.s`, null],
  ])("%s", (_name, token, expected) => {
    expect(readUserIdFromAccessToken(token)).toBe(expected);
  });
});

describe("createBrowserTokenSource 첫 신원", () => {
  it("쿠키 갱신이 200이면 등록하지 않고 그 신원을 쓴다", async () => {
    const server = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
    });
    const source = create(server);
    expect(source.hasSettled()).toBe(false);

    await expect(source.getAccessToken()).resolves.toBe(T7);

    expect(source.getUserId()).toBe(7);
    expect(source.hasSettled()).toBe(true);
    expect(server.calls.map((call) => call.path)).toEqual(["/api/auth/refresh"]);
    const [refresh] = server.calls;
    expect(refresh!.init.method).toBe("POST");
    expect(refresh!.init.credentials).toBe("include");
    expect(refresh!.init.body).toBeUndefined();
    expect(header(refresh, "Refresh-Transport")).toBe("cookie");
    expect(header(refresh, "API-Version")).toBe("1");
  });

  it.each<[string, Reply]>([
    ["쿠키 없음 400", NO_COOKIE],
    ["만료·폐기 401", { status: 401, body: { code: "INVALID_REFRESH_TOKEN" } }],
  ])("쿠키 갱신이 %s이면 새 비회원으로 등록한다", async (_label, reply) => {
    const server = fakeServer({
      "/api/auth/refresh": [reply],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T7 } }],
    });
    const source = create(server);

    await expect(source.getAccessToken()).resolves.toBe(T7);

    expect(source.getUserId()).toBe(7);
    expect(server.calls.map((call) => call.path)).toEqual(["/api/auth/refresh", "/api/users"]);
    const register = server.calls[1];
    expect(JSON.parse(register!.init.body as string)).toEqual({
      deviceId: "uuid-1",
      language: "ko-KR",
    });
    expect(register!.init.credentials).toBe("include");
    expect(header(register, "API-Version")).toBe("2");
    expect(header(register, "Refresh-Transport")).toBe("cookie");
    expect(header(register, "Content-Type")).toBe("application/json");
  });

  it.each<Reply>([
    { status: 400, body: { code: "REQUEST_FAILED" } },
    { status: 400, body: { code: "BAD_REQUEST" } },
    { status: 400 },
  ])("쿠키 없음이 아닌 400(%o)에는 등록하지 않고 신원을 비워 둔다", async (reply) => {
    const server = fakeServer({
      "/api/auth/refresh": [reply],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T7 } }],
    });
    const source = create(server);

    await expect(source.refresh()).resolves.toBeNull();

    expect(server.calls.map((call) => call.path)).toEqual(["/api/auth/refresh"]);
    expect(source.getUserId()).toBeNull();
  });

  it("언어를 모르면 등록 본문에서 뺀다", async () => {
    const server = fakeServer({
      "/api/auth/refresh": [NO_COOKIE],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T7 } }],
    });
    const source = create(server, { language: "" });
    await source.getAccessToken();
    expect(JSON.parse(server.calls[1]!.init.body as string)).toEqual({ deviceId: "uuid-1" });
  });

  it("기기 UUID와 access 토큰을 저장소와 쿠키 어디에도 남기지 않는다", async () => {
    const server = fakeServer({
      "/api/auth/refresh": [NO_COOKIE],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T7 } }],
    });
    const source = create(server, { newDeviceId: () => "uuid-secret" });
    await source.getAccessToken();

    const stored = [localStorage, sessionStorage].flatMap((storage) =>
      Object.keys(storage).map((key) => storage.getItem(key) ?? ""),
    );
    for (const secret of ["uuid-secret", T7]) {
      expect(stored.some((value) => value.includes(secret))).toBe(false);
      expect(document.cookie).not.toContain(secret);
    }
  });

  it("3초 안에 답이 없으면 빈 신원으로 확정하고 구독자에게 알린다", async () => {
    vi.useFakeTimers();
    const server = fakeServer({ "/api/auth/refresh": ["hang"] });
    const source = create(server);
    const seen: unknown[] = [];
    source.subscribe((snapshot) => seen.push(snapshot));
    const pending = source.getAccessToken();

    vi.advanceTimersByTime(3000);

    await expect(pending).resolves.toBeNull();
    expect(source.hasSettled()).toBe(true);
    expect(source.getUserId()).toBeNull();
    expect(seen).toEqual([{ userId: null, accessToken: null }]);
  });

  it("sub를 읽을 수 없는 토큰은 실패로 보고 신원을 만들지 않는다", async () => {
    const server = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: jwt("abc") } }],
    });
    const source = create(server);

    await expect(source.refresh()).resolves.toBeNull();

    expect(source.getUserId()).toBeNull();
    expect(source.getCurrentToken()).toBeNull();
  });
});

describe("createBrowserTokenSource 갱신", () => {
  it.each<Reply>(["network", { status: 503 }])(
    "갱신이 %o로 실패하면 등록하지 않고 지금 신원을 유지한 채 null을 준다",
    async (failure) => {
      const server = fakeServer({
        "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }, failure],
      });
      const source = create(server);
      await source.getAccessToken();

      await expect(source.refresh()).resolves.toBeNull();

      expect(source.getCurrentToken()).toBe(T7);
      expect(source.getUserId()).toBe(7);
      expect(server.calls.map((call) => call.path)).toEqual([
        "/api/auth/refresh",
        "/api/auth/refresh",
      ]);
    },
  );

  it("응답 본문이 멈춰도 요청 한도가 지나면 잠금을 풀고 다음 갱신을 보낸다", async () => {
    vi.useFakeTimers();
    const server = fakeServer({
      "/api/auth/refresh": ["hang-body", { status: 200, body: { accessToken: T7 } }],
    });
    const source = create(server, { locks: sharedLocks() });

    const first = source.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(first).resolves.toBeNull();

    const second = source.refresh();
    await vi.advanceTimersByTimeAsync(0);
    await expect(second).resolves.toBe(T7);
    expect(server.calls).toHaveLength(2);
  });

  it("탭 안의 동시 refresh는 요청 하나로 묶인다", async () => {
    const server = fakeServer({
      "/api/auth/refresh": [
        { status: 200, body: { accessToken: T7 } },
        { status: 200, body: { accessToken: T7b } },
      ],
    });
    const source = create(server);
    await source.getAccessToken();

    const results = await Promise.all([source.refresh(), source.refresh(), source.refresh()]);

    expect(results).toEqual([T7b, T7b, T7b]);
    expect(server.calls).toHaveLength(2);
  });

  it("잠금을 기다리는 동안 다른 탭이 알린 토큰이 오면 쿠키 갱신을 다시 보내지 않는다", async () => {
    const locks = sharedLocks();
    const bus = sharedBus();
    const serverA = fakeServer({
      "/api/auth/refresh": [NO_COOKIE],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T7 } }],
    });
    const serverB = fakeServer({ "/api/auth/refresh": [{ status: 200, body: {} }] });
    const tabA = create(serverA, { locks, channel: bus() });
    const tabB = create(serverB, { locks, channel: bus() });

    await expect(tabA.getAccessToken()).resolves.toBe(T7);
    await expect(tabB.getAccessToken()).resolves.toBe(T7);

    expect(tabB.getUserId()).toBe(7);
    expect(serverB.calls).toHaveLength(0);
  });

  it("다른 탭이 알린 새 신원으로 바꾸고 구독자에게 알린다", async () => {
    const bus = sharedBus();
    const serverA = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T8 } }],
    });
    const serverB = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
    });
    const tabA = create(serverA, { channel: bus() });
    const tabB = create(serverB, { channel: bus() });
    await tabA.getAccessToken();
    await tabB.getAccessToken();
    const seen: unknown[] = [];
    tabB.subscribe((snapshot) => seen.push(snapshot));

    await tabA.logout();
    await settle();

    expect(tabB.getUserId()).toBe(8);
    expect(tabB.getCurrentToken()).toBe(T8);
    expect(seen).toEqual([{ userId: 8, accessToken: T8 }]);
    expect(serverB.calls).toHaveLength(1);
  });

  it("로그아웃보다 늦게 도착한 다른 탭의 갱신 알림은 버린다", async () => {
    const locks = sharedLocks();
    const { channel, deliver, held } = heldBus();
    const serverA = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T8 } }],
    });
    const serverB = fakeServer({
      "/api/auth/refresh": [
        { status: 200, body: { accessToken: T7 } },
        { status: 200, body: { accessToken: T7b } },
      ],
    });
    const tabA = create(serverA, { locks, channel: channel() });
    const tabB = create(serverB, { locks, channel: channel() });
    await tabA.getAccessToken();
    await tabB.getAccessToken();
    held.length = 0;

    await tabB.refresh();
    await tabA.logout();
    // A의 로그아웃 알림이 B에 먼저, B의 갱신 알림이 A에 나중에 도착한다.
    deliver(1);
    deliver(0);

    expect(tabA.getUserId()).toBe(8);
    expect(tabA.getCurrentToken()).toBe(T8);
    expect(tabB.getUserId()).toBe(8);
  });

  it("저장소를 막은 브라우저에서도 다른 탭의 로그아웃 알림을 받는다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const locks = sharedLocks();
    const { channel, deliver, held } = heldBus();
    const serverA = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T8 } }],
    });
    const serverB = fakeServer({
      "/api/auth/refresh": [
        { status: 200, body: { accessToken: T7 } },
        { status: 200, body: { accessToken: T7b } },
      ],
    });
    const tabA = create(serverA, { locks, channel: channel() });
    const tabB = create(serverB, { locks, channel: channel() });
    await tabA.getAccessToken();
    await tabB.getAccessToken();
    held.length = 0;

    // B의 갱신 알림이 A에 닿기 전에 A가 로그아웃한다.
    await tabB.refresh();
    await tabA.logout();
    deliver(1);

    expect(tabB.getUserId()).toBe(8);
  });

  it("이 탭이 받기 전이라도 저장소에 더 최근 순번이 있으면 그보다 오래된 알림은 버린다", async () => {
    const { channel, deliver, held } = heldBus();
    const server = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
    });
    const tab = create(server, { channel: channel() });
    const sender = channel();
    await tab.getAccessToken();
    held.length = 0;
    const mine = Number(localStorage.getItem("focusmakers:auth-epoch"));

    // 다른 탭이 순번 mine+2로 로그아웃을 저장했고, 그보다 앞선 mine+1 알림이 먼저 도착한다.
    localStorage.setItem("focusmakers:auth-epoch", String(mine + 2));
    sender.postMessage({ accessToken: jwt("9"), epoch: mine + 1 });
    sender.postMessage({ accessToken: T8, epoch: mine + 2 });
    deliver(0);
    expect(tab.getUserId()).toBe(7);
    deliver(1);
    expect(tab.getUserId()).toBe(8);
  });

  it("두 탭에서 같은 계정을 동시에 로그아웃해도 서버 로그아웃과 새 등록은 한 번씩만 나간다", async () => {
    const locks = sharedLocks();
    const bus = sharedBus();
    const serverA = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T8 } }],
    });
    const serverB = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: jwt("9") } }],
    });
    const tabA = create(serverA, { locks, channel: bus() });
    const tabB = create(serverB, { locks, channel: bus() });
    await tabA.getAccessToken();
    await tabB.getAccessToken();

    const results = await Promise.all([tabA.logout(), tabB.logout()]);

    expect(results).toEqual([true, true]);
    const paths = [...serverA.calls, ...serverB.calls].map((call) => call.path);
    expect(paths.filter((path) => path === "/api/auth/logout")).toHaveLength(1);
    expect(paths.filter((path) => path === "/api/users")).toHaveLength(1);
    expect(tabB.getUserId()).toBe(8);
  });

  it("앞 탭의 로그아웃 방송이 늦어도 뒤 탭은 새 비회원을 다시 로그아웃하지 않고 바뀐 쿠키로 갱신한다", async () => {
    const locks = sharedLocks();
    const { channel } = heldBus();
    const serverA = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T8 } }],
    });
    const serverB = fakeServer({
      "/api/auth/refresh": [
        { status: 200, body: { accessToken: T7 } },
        { status: 200, body: { accessToken: T8 } },
      ],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: jwt("9") } }],
    });
    const tabA = create(serverA, { locks, channel: channel() });
    const tabB = create(serverB, { locks, channel: channel() });
    await tabA.getAccessToken();
    await tabB.getAccessToken();

    // 방송은 붙잡아 두어 B가 A의 로그아웃을 알림으로는 모르는 채 잠금을 얻는다.
    const results = await Promise.all([tabA.logout(), tabB.logout()]);

    expect(results).toEqual([true, true]);
    const paths = [...serverA.calls, ...serverB.calls].map((call) => call.path);
    expect(paths.filter((path) => path === "/api/auth/logout")).toHaveLength(1);
    expect(paths.filter((path) => path === "/api/users")).toHaveLength(1);
    expect(tabB.getUserId()).toBe(8);
  });

  it("앞 탭이 로그아웃한 뒤 바뀐 쿠키마저 없으면 뒤 탭은 새 비회원으로 등록한다", async () => {
    const locks = sharedLocks();
    const { channel } = heldBus();
    const serverA = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T8 } }],
    });
    const serverB = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }, NO_COOKIE],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: jwt("9") } }],
    });
    const tabA = create(serverA, { locks, channel: channel() });
    const tabB = create(serverB, { locks, channel: channel() });
    await tabA.getAccessToken();
    await tabB.getAccessToken();

    const results = await Promise.all([tabA.logout(), tabB.logout()]);

    expect(results).toEqual([true, true]);
    expect(serverB.calls.map((call) => call.path)).not.toContain("/api/auth/logout");
    expect(tabB.getUserId()).toBe(9);
  });

  it("navigator.locks가 없으면 탭 안에서 차례로 실행한다", async () => {
    let finishRefresh: (value: Response) => void = () => {};
    const calls: string[] = [];
    const fetch = vi.fn((url: string) => {
      calls.push(url);
      if (url === "/api/auth/refresh" && calls.length === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ accessToken: T7 }),
        } as Response);
      }
      if (url === "/api/auth/refresh") {
        return new Promise<Response>((resolve) => (finishRefresh = resolve));
      }
      if (url === "/api/auth/logout") {
        return Promise.resolve({ ok: true, status: 204, json: () => Promise.reject() } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ isNew: true, accessToken: T8 }),
      } as Response);
    });
    const source = create({ fetch: fetch as unknown as typeof globalThis.fetch, calls: [] });
    await source.getAccessToken();

    const refreshing = source.refresh();
    const loggingOut = source.logout();
    await settle();
    expect(calls).toEqual(["/api/auth/refresh", "/api/auth/refresh"]);

    finishRefresh({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ accessToken: T7b }),
    } as Response);
    await refreshing;
    await loggingOut;
    expect(calls).toEqual([
      "/api/auth/refresh",
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/users",
    ]);
  });
});

describe("createBrowserTokenSource 로그아웃", () => {
  it("서버에 로그아웃을 보내고 같은 출처가 새 비회원 신원을 알린다", async () => {
    const server = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T8 } }],
    });
    const source = create(server);
    await source.getAccessToken();
    const seen: unknown[] = [];
    source.subscribe((snapshot) => seen.push(snapshot));

    await source.logout();

    const logout = server.calls[1];
    expect(logout!.path).toBe("/api/auth/logout");
    expect(logout!.init.body).toBeUndefined();
    expect(logout!.init.credentials).toBe("include");
    expect(header(logout, "Authorization")).toBe(`Bearer ${T7}`);
    expect(header(logout, "Refresh-Transport")).toBe("cookie");
    expect(header(logout, "API-Version")).toBe("1");
    expect(server.calls[2]!.path).toBe("/api/users");
    expect(source.getUserId()).toBe(8);
    await expect(source.getAccessToken()).resolves.toBe(T8);
    expect(seen).toEqual([{ userId: 8, accessToken: T8 }]);
  });

  it.each<Reply>(["network", { status: 500 }])(
    "서버 로그아웃이 %o로 실패해도 새 비회원이 된다",
    async (failure) => {
      const server = fakeServer({
        "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
        "/api/auth/logout": [failure],
        "/api/users": [{ status: 201, body: { isNew: true, accessToken: T8 } }],
      });
      const source = create(server);
      await source.getAccessToken();

      await source.logout();

      expect(source.getUserId()).toBe(8);
    },
  );

  it("로그아웃 중에 시작한 요청은 이전 토큰이 아니라 새 비회원 토큰을 받는다", async () => {
    const server = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [{ status: 201, body: { isNew: true, accessToken: T8 } }],
    });
    const source = create(server);
    await source.getAccessToken();

    const loggingOut = source.logout();
    const during = source.getAccessToken();
    await loggingOut;

    await expect(during).resolves.toBe(T8);
  });

  it("로그아웃을 연달아 불러도 서버 로그아웃과 새 등록은 한 번씩만 나간다", async () => {
    const server = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": [
        { status: 201, body: { isNew: true, accessToken: T8 } },
        { status: 201, body: { isNew: true, accessToken: jwt("9") } },
      ],
    });
    const source = create(server);
    await source.getAccessToken();

    await Promise.all([source.logout(), source.logout()]);

    expect(server.calls.map((call) => call.path)).toEqual([
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/users",
    ]);
    expect(source.getUserId()).toBe(8);
  });

  it("서버 로그아웃과 새 등록이 모두 실패하면 이전 회원을 그대로 두고 실패를 알린다", async () => {
    const server = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": ["network"],
      "/api/users": ["network"],
    });
    const source = create(server);
    await source.getAccessToken();

    await expect(source.logout()).resolves.toBe(false);

    expect(source.getUserId()).toBe(7);
    expect(source.getCurrentToken()).toBe(T7);
  });

  it("새 비회원 등록까지 실패하면 이전 신원을 남기지 않고 빈 신원이 된다", async () => {
    const server = fakeServer({
      "/api/auth/refresh": [{ status: 200, body: { accessToken: T7 } }],
      "/api/auth/logout": [{ status: 204 }],
      "/api/users": ["network"],
    });
    const source = create(server);
    await source.getAccessToken();

    await source.logout();

    expect(source.getUserId()).toBeNull();
    expect(source.getCurrentToken()).toBeNull();
  });
});
