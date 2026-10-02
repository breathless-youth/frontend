import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../nativeAnalytics";
import {
  ensurePushPermission,
  PUSH_PERMISSION_TIMEOUT_MS,
  startPushMessaging,
} from "../pushBootstrap";
import type { PushMessage } from "../pushMessaging";

/**
 * 부팅 배선은 의존성을 전부 주입해 검증한다 — 알림 탭 라우팅, 초기 알림, 권한 요청, 해제.
 * 실제 RNFB 어댑터는 `pushMessaging.test.ts` 소관.
 */

// 라우팅 허용 목록은 설정의 extra에서 오고, jest 환경의 expo-constants에는 그 값이 없다.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { appSchemes: ["focusmakers", "focuson"], deepLinkHosts: ["web.focusmakers.app"] },
    },
  },
}));

jest.mock("../pushMessaging", () => ({
  requestPushPermission: jest.fn(),
  getPushToken: jest.fn(),
  onPushTokenRefresh: jest.fn(),
  onPushMessage: jest.fn(),
  onPushNotificationOpened: jest.fn(),
  getInitialPushNotification: jest.fn(),
}));

type Listener = (message: PushMessage) => void;

function message(data: Record<string, string> = {}, id = "m1"): PushMessage {
  return { messageId: id, data, notification: { title: "t", body: "b" } };
}

function createHarness({ devBuild = false, initial = null as PushMessage | null } = {}) {
  const listeners: { message?: Listener; opened?: Listener; token?: (t: string) => void } = {};
  const unsubscribe = { message: jest.fn(), opened: jest.fn(), token: jest.fn() };
  const deps = {
    navigate: jest.fn(),
    devBuild,
    onTokenRefresh: jest.fn((l: (t: string) => void) => {
      listeners.token = l;
      return unsubscribe.token;
    }),
    onMessage: jest.fn((l: Listener) => {
      listeners.message = l;
      return unsubscribe.message;
    }),
    onNotificationOpened: jest.fn((l: Listener) => {
      listeners.opened = l;
      return unsubscribe.opened;
    }),
    getInitialNotification: jest.fn(() => Promise.resolve(initial)),
  };
  return { deps, listeners, unsubscribe };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("startPushMessaging (BY-586)", () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    log.mockRestore();
  });

  it("포그라운드·알림 탭·토큰 갱신을 구독하고 해제 함수가 전부 푼다", () => {
    const h = createHarness();

    const stop = startPushMessaging(h.deps);
    stop();

    expect(h.deps.onMessage).toHaveBeenCalledTimes(1);
    expect(h.deps.onNotificationOpened).toHaveBeenCalledTimes(1);
    expect(h.deps.onTokenRefresh).toHaveBeenCalledTimes(1);
    expect(h.unsubscribe.message).toHaveBeenCalledTimes(1);
    expect(h.unsubscribe.opened).toHaveBeenCalledTimes(1);
    expect(h.unsubscribe.token).toHaveBeenCalledTimes(1);
  });

  it("알림을 누르면 data.link를 경로로 바꿔 이동하고, 없으면 홈이다", () => {
    const h = createHarness();
    startPushMessaging(h.deps);

    h.listeners.opened?.(message({ link: "focusmakers://social/join?code=1234" }));
    h.listeners.opened?.(message({}, "m2"));

    expect(h.deps.navigate).toHaveBeenNthCalledWith(1, "/social/join?code=1234");
    expect(h.deps.navigate).toHaveBeenNthCalledWith(2, "/");
  });

  it("포그라운드 수신은 이동하지 않는다 — 표시도 하지 않는다", () => {
    const h = createHarness();
    startPushMessaging(h.deps);

    h.listeners.message?.(message({ link: "focusmakers://social" }));

    expect(h.deps.navigate).not.toHaveBeenCalled();
  });

  it("종료 상태에서 알림으로 켜졌으면(초기 알림) 그 경로로 이동한다", async () => {
    const h = createHarness({ initial: message({ link: "/social/join?code=0001" }) });
    startPushMessaging(h.deps);
    await flush();

    expect(h.deps.navigate).toHaveBeenCalledWith("/social/join?code=0001");
  });

  it("해제 뒤에 도착한 초기 알림·탭은 이동하지 않는다", async () => {
    const h = createHarness({ initial: message({ link: "/social" }) });
    const stop = startPushMessaging(h.deps);
    stop();
    await flush();
    h.listeners.opened?.(message({ link: "/social" }));

    expect(h.deps.navigate).not.toHaveBeenCalled();
  });

  it("구독·조회가 실패해도 throw하지 않는다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const h = createHarness({ devBuild: true });
    h.deps.onMessage.mockImplementation(() => {
      throw new Error("no native module");
    });
    h.deps.getInitialNotification.mockRejectedValue(new Error("boom"));

    expect(() => startPushMessaging(h.deps)).not.toThrow();
    await flush();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("구독 실패"), expect.any(Error));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("초기 알림"), expect.any(Error));
    warn.mockRestore();
  });
});

describe("ensurePushPermission", () => {
  function createDeps(devBuild: boolean) {
    return {
      devBuild,
      requestPermission: jest.fn(() => Promise.resolve("granted" as const)),
      getToken: jest.fn(() => Promise.resolve("tok")),
    };
  }

  it("운영 빌드에서도 권한을 요청한다 — 토큰 조회·로그는 하지 않는다", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const deps = createDeps(false);

    await ensurePushPermission(deps);

    expect(deps.requestPermission).toHaveBeenCalledTimes(1);
    expect(deps.getToken).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("개발 빌드는 권한을 요청하고 토큰을 로그로 남긴다", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const deps = createDeps(true);

    await ensurePushPermission(deps);

    expect(deps.requestPermission).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("permission=granted token=tok"));
    log.mockRestore();
  });

  it("요청이 실패해도 거부하지 않는다 — 뒤에 이어지는 알림창이 막히지 않게", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const deps = createDeps(false);
    deps.requestPermission.mockRejectedValue(new Error("denied hard"));

    await expect(ensurePushPermission(deps)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("권한 요청"), expect.any(Error));
    warn.mockRestore();
  });

  it("응답이 영영 안 와도 상한 뒤에는 끝난다 — 권장 업데이트 알림창이 멎지 않게", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const deps = createDeps(false);
    deps.requestPermission.mockReturnValue(new Promise(() => {}));

    const done = ensurePushPermission(deps);
    jest.advanceTimersByTime(PUSH_PERMISSION_TIMEOUT_MS);

    await expect(done).resolves.toBeUndefined();
    warn.mockRestore();
    jest.useRealTimers();
  });
});

/** 알림 탭은 네이티브만 아는 진입 경로다 — `push_notification_opened`로 웹 Amplitude에 넘긴다. */
describe("startPushMessaging — push_notification_opened", () => {
  let received: NativeAnalyticsEvent[];

  beforeEach(() => {
    __resetNativeAnalyticsForTests();
    received = [];
    attachNativeAnalyticsSink((event) => received.push(event));
  });

  afterEach(() => {
    __resetNativeAnalyticsForTests();
  });

  it("알림 탭마다 쿼리(초대코드)를 뗀 경로만 싣는다 — 링크가 없으면 홈", () => {
    const h = createHarness();
    startPushMessaging(h.deps);

    h.listeners.opened?.(message({ link: "focusmakers://social/join?code=1234" }));
    h.listeners.opened?.(message({}, "m2"));

    expect(received.map((event) => event.properties)).toEqual([
      { route: "/social/join" },
      { route: "/" },
    ]);
  });

  it("해제 뒤의 알림 탭은 남기지 않는다", () => {
    const h = createHarness();
    const stop = startPushMessaging(h.deps);
    stop();

    h.listeners.opened?.(message({ link: "/social" }));

    expect(received).toHaveLength(0);
  });
});
