import {
  compareVersions,
  DEFAULT_MIN_SUPPORTED_VERSION,
  LATEST_VERSION_KEY,
  MIN_SUPPORTED_VERSION_KEY,
  refreshForceUpdate,
  resolveForceUpdate,
  resolveForceUpdateOnLaunch,
  shouldForceUpdate,
  shouldRecommendUpdate,
  UPDATE_CONFIG_DEFAULTS,
} from "../forceUpdate";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../nativeAnalytics";
import { setRemoteConfigAdapter } from "../remoteConfig";
import type { RemoteConfigAdapter } from "../remoteConfig";

jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.0.2" }));
// 어댑터를 통째로 교체하므로 RNFB 모듈 자체는 로드하지 않는다(네이티브 모듈 없는 jest 환경).
jest.mock("@react-native-firebase/remote-config", () => ({
  getRemoteConfig: () => ({}),
  activate: jest.fn(),
  getString: jest.fn(),
}));

function fakeAdapter(overrides: Partial<RemoteConfigAdapter> = {}) {
  const adapter: RemoteConfigAdapter = {
    setDefaults: jest.fn(() => Promise.resolve()),
    activate: jest.fn(() => Promise.resolve(true)),
    fetch: jest.fn(() => Promise.resolve()),
    getString: jest.fn(() => ""),
    ...overrides,
  };
  setRemoteConfigAdapter(adapter);
  return adapter;
}

/** 키별 서버 값. 안 준 키는 빈 문자열(값 없음). */
function valuesAdapter(values: Record<string, string>) {
  return fakeAdapter({ getString: jest.fn((key: string) => values[key] ?? "") });
}

/**
 * 서버를 흉내 내는 가짜 어댑터
 *
 * 받은 값은 `activate`해야 읽힌다.
 * 받은 뒤 적용을 빼먹으면 판정이 옛 값으로 남아 테스트가 실패하게 하려는 것이다.
 * `holdFetch`면 `release()`를 부를 때까지 받기가 끝나지 않는다.
 */
function serverAdapter(
  active: Record<string, string>,
  server: Record<string, string>,
  { holdFetch = false }: { holdFetch?: boolean } = {},
) {
  let fetched: Record<string, string> | null = null;
  let release: () => void = () => {};
  const adapter = fakeAdapter({
    fetch: jest.fn(() => {
      const receive = () => {
        fetched = { ...server };
      };
      if (!holdFetch) {
        receive();
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        release = () => {
          receive();
          resolve();
        };
      });
    }),
    activate: jest.fn(() => {
      if (fetched === null) return Promise.resolve(false);
      Object.assign(active, fetched);
      fetched = null;
      return Promise.resolve(true);
    }),
    getString: jest.fn((key: string) => active[key] ?? ""),
  });
  return { adapter, release: () => release() };
}

describe("compareVersions / shouldForceUpdate", () => {
  it.each([
    ["1.0.0", "1.0.0", 0],
    ["1.0.10", "1.0.9", 1],
    ["1.0.9", "1.0.10", -1],
    ["2.0.0", "1.9.9", 1],
    ["1.0", "1.0.0", 0],
  ])("compareVersions(%s, %s) = %i", (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it("앱 버전이 최소 버전보다 낮을 때만 막는다", () => {
    expect(shouldForceUpdate("1.0.2", "1.0.3")).toBe(true);
    expect(shouldForceUpdate("1.0.2", "1.0.2")).toBe(false);
    expect(shouldForceUpdate("1.1.0", "1.0.9")).toBe(false);
  });

  it.each([
    [null, "1.0.3"],
    ["1.0.2", null],
    ["1.0.2", ""],
    ["1.0.x", "1.0.3"],
    ["1.0.2", "latest"],
    ["1.0.2", "1.0"],
  ])("값이 없거나 형식이 이상하면(%s, %s) 통과시킨다 — fail-open", (app, min) => {
    expect(shouldForceUpdate(app, min)).toBe(false);
  });

  it("권장도 같은 규칙이다 — 최신 버전이 앱 버전보다 높을 때만, 형식이 이상하면 안 띄운다", () => {
    expect(shouldRecommendUpdate("1.0.2", "1.0.3")).toBe(true);
    expect(shouldRecommendUpdate("1.0.2", "1.0.2")).toBe(false);
    expect(shouldRecommendUpdate("1.0.2", "0.0.0")).toBe(false);
    expect(shouldRecommendUpdate("1.0.2", null)).toBe(false);
    expect(shouldRecommendUpdate("1.0.2", "latest")).toBe(false);
  });
});

describe("resolveForceUpdate", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("두 키의 기본값을 한 번에 등록하고 activate한 뒤 서버 값과 앱 버전을 비교한다", async () => {
    const adapter = valuesAdapter({ [MIN_SUPPORTED_VERSION_KEY]: "1.0.3" });

    const decision = await resolveForceUpdate();

    // 기본값은 한 번에 등록한다(RNFB는 맵을 통째로 바꿈) — 최소·최신 버전, 강제 문구 세 개, 권장 문구 네 개.
    expect(adapter.setDefaults).toHaveBeenCalledTimes(1);
    expect(adapter.setDefaults).toHaveBeenCalledWith(UPDATE_CONFIG_DEFAULTS);
    expect(UPDATE_CONFIG_DEFAULTS).toEqual({
      [MIN_SUPPORTED_VERSION_KEY]: DEFAULT_MIN_SUPPORTED_VERSION,
      [LATEST_VERSION_KEY]: "0.0.0",
      force_update_title: "업데이트가 필요해요",
      force_update_message: "원활한 이용을 위해 최신 버전으로 업데이트 해주세요.",
      force_update_button: "지금 업데이트",
      recommended_update_title: "새 버전이 나왔어요",
      recommended_update_message: "최신 버전으로 업데이트하면 더 나아진 포메를 쓸 수 있어요.",
      recommended_update_later_button: "나중에",
      recommended_update_confirm_button: "지금 업데이트",
    });
    expect(adapter.getString).toHaveBeenCalledWith(MIN_SUPPORTED_VERSION_KEY);
    expect(adapter.getString).toHaveBeenCalledWith(LATEST_VERSION_KEY);
    expect(decision).toEqual({
      forced: true,
      recommended: false,
      appVersion: "1.0.2",
      minVersion: "1.0.3",
      latestVersion: null,
    });
  });

  it("막히지 않았고 최신 버전이 앱 버전보다 높으면 권장한다", async () => {
    valuesAdapter({ [MIN_SUPPORTED_VERSION_KEY]: "1.0.0", [LATEST_VERSION_KEY]: "1.0.3" });

    await expect(resolveForceUpdate()).resolves.toMatchObject({
      forced: false,
      recommended: true,
      latestVersion: "1.0.3",
    });
  });

  it("막히면 최신 버전이 높아도 권장은 false다 — 알림창을 두 장 띄우지 않는다", async () => {
    valuesAdapter({ [MIN_SUPPORTED_VERSION_KEY]: "1.0.3", [LATEST_VERSION_KEY]: "1.0.4" });

    await expect(resolveForceUpdate()).resolves.toMatchObject({ forced: true, recommended: false });
  });

  it("최신 버전이 기본값(0.0.0)이거나 앱 버전 이하면 권장하지 않는다", async () => {
    valuesAdapter({ [LATEST_VERSION_KEY]: "0.0.0" });
    await expect(resolveForceUpdate()).resolves.toMatchObject({ recommended: false });

    valuesAdapter({ [LATEST_VERSION_KEY]: "1.0.2" });
    await expect(resolveForceUpdate()).resolves.toMatchObject({ recommended: false });
  });

  it("최소 버전이 앱 버전 이하이면 통과한다", async () => {
    fakeAdapter({ getString: jest.fn(() => "1.0.0") });

    await expect(resolveForceUpdate()).resolves.toMatchObject({
      forced: false,
      minVersion: "1.0.0",
    });
  });

  it("지난 값 판정은 서버에 가지 않는다 — 받기는 resolveForceUpdateOnLaunch·refreshForceUpdate의 몫이다", async () => {
    const adapter = fakeAdapter({ getString: jest.fn(() => "1.0.0") });

    await resolveForceUpdate();

    expect(adapter.fetch).not.toHaveBeenCalled();
  });

  it("activate가 제한 시간 안에 끝나지 않으면 통과시킨다 — 스플래시를 네트워크에 묶지 않는다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const adapter = fakeAdapter({
      activate: jest.fn(() => new Promise<boolean>(() => {})),
      getString: jest.fn(() => "9.9.9"),
    });

    const decision = await resolveForceUpdate({ activateTimeoutMs: 10 });

    expect(decision).toEqual({
      forced: false,
      recommended: false,
      appVersion: "1.0.2",
      minVersion: null,
      latestVersion: null,
    });
    expect(adapter.fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("fail-open"), expect.any(Error));
    warn.mockRestore();
  });

  it("activate가 실패해도 throw하지 않고 통과시킨다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    fakeAdapter({ activate: jest.fn(() => Promise.reject(new Error("native down"))) });

    await expect(resolveForceUpdate()).resolves.toMatchObject({ forced: false, minVersion: null });
    warn.mockRestore();
  });

  it("서버 값이 빈 문자열이면 최소 버전 없음으로 보고 통과시킨다", async () => {
    fakeAdapter({ getString: jest.fn(() => "") });

    await expect(resolveForceUpdate()).resolves.toMatchObject({ forced: false, minVersion: null });
  });
});

describe("refreshForceUpdate — 접속 시 재판정", () => {
  let received: NativeAnalyticsEvent[];

  beforeEach(() => {
    __resetNativeAnalyticsForTests();
    received = [];
    attachNativeAnalyticsSink((event) => received.push(event));
  });

  afterEach(() => {
    __resetNativeAnalyticsForTests();
  });

  it("최소 fetch 간격을 무시하고(fetch(0)) 새 값을 받아 활성화한 뒤 판정하고, 성공을 이벤트로 남긴다", async () => {
    const { adapter } = serverAdapter(
      { [MIN_SUPPORTED_VERSION_KEY]: "1.0.0" },
      { [MIN_SUPPORTED_VERSION_KEY]: "1.0.3" },
    );

    const decision = await refreshForceUpdate("cold_start");

    expect(adapter.fetch).toHaveBeenCalledWith(0);
    expect(adapter.activate).toHaveBeenCalledTimes(1);
    expect(adapter.setDefaults).not.toHaveBeenCalled();
    expect(decision).toMatchObject({ forced: true, minVersion: "1.0.3" });
    expect(received.map((event) => [event.name, event.properties])).toEqual([
      ["update_config_refreshed", { trigger: "cold_start", result: "ok" }],
    ]);
  });

  it("받기에 실패하면 지난 값으로 판정하고 실패를 이벤트로 남긴다 — fail-open, throw하지 않는다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    fakeAdapter({
      fetch: jest.fn(() => Promise.reject(new Error("offline"))),
      getString: jest.fn((key: string) => (key === LATEST_VERSION_KEY ? "1.0.3" : "1.0.0")),
    });

    await expect(refreshForceUpdate("resume")).resolves.toMatchObject({
      forced: false,
      recommended: true,
      latestVersion: "1.0.3",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("fail-open"), expect.any(Error));
    expect(received.map((event) => [event.name, event.properties])).toEqual([
      ["update_config_refreshed", { trigger: "resume", result: "failed" }],
    ]);
    warn.mockRestore();
  });
});

describe("resolveForceUpdateOnLaunch — 앱을 켤 때 판정", () => {
  beforeEach(() => {
    __resetNativeAnalyticsForTests();
  });

  it("지난 값을 먼저 적용한 뒤 새 값을 받는다", async () => {
    const calls: string[] = [];
    fakeAdapter({
      activate: jest.fn(() => {
        calls.push("activate");
        return Promise.resolve(true);
      }),
      fetch: jest.fn(() => {
        calls.push("fetch");
        return Promise.resolve();
      }),
    });

    await resolveForceUpdateOnLaunch();

    expect(calls).toEqual(["activate", "fetch", "activate"]);
  });

  it("새 값이 상한 안에 오면 그 값으로 첫 판정을 하고 늦게 올 판정은 없다", async () => {
    serverAdapter(
      { [MIN_SUPPORTED_VERSION_KEY]: "1.0.0" },
      { [MIN_SUPPORTED_VERSION_KEY]: "1.0.3" },
    );

    const { decision, late } = await resolveForceUpdateOnLaunch({ freshWaitMs: 50 });

    expect(decision).toMatchObject({ forced: true, minVersion: "1.0.3" });
    expect(late).toBeNull();
  });

  it("상한을 넘기면 지난 값으로 판정하고, 늦게 온 새 값의 판정을 넘긴다", async () => {
    const { release } = serverAdapter(
      { [MIN_SUPPORTED_VERSION_KEY]: "1.0.0" },
      { [MIN_SUPPORTED_VERSION_KEY]: "1.0.3" },
      { holdFetch: true },
    );

    const { decision, late } = await resolveForceUpdateOnLaunch({ freshWaitMs: 10 });

    expect(decision).toMatchObject({ forced: false, minVersion: "1.0.0" });
    expect(late).not.toBeNull();
    release();
    await expect(late).resolves.toMatchObject({ forced: true, minVersion: "1.0.3" });
  });

  it("받기가 상한 안에 실패하면 지난 값으로 판정하고 늦게 올 판정은 없다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    fakeAdapter({
      fetch: jest.fn(() => Promise.reject(new Error("offline"))),
      getString: jest.fn((key: string) => (key === LATEST_VERSION_KEY ? "1.0.3" : "1.0.0")),
    });

    const { decision, late } = await resolveForceUpdateOnLaunch({ freshWaitMs: 50 });

    expect(decision).toMatchObject({ forced: false, recommended: true, latestVersion: "1.0.3" });
    expect(late).toBeNull();
    warn.mockRestore();
  });

  it("새 값 대기 상한은 지난 값 적용 시간까지 포함해 센다", async () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const adapter = fakeAdapter({
      fetch: jest.fn(() => delay(50).then(() => undefined)),
      getString: jest.fn(() => "1.0.0"),
    });
    // 지난 값 적용만 느리고, 새 값을 받은 뒤의 적용은 바로 끝난다.
    (adapter.activate as jest.Mock).mockImplementationOnce(() => delay(100).then(() => true));

    const { late } = await resolveForceUpdateOnLaunch({ freshWaitMs: 120 });

    expect(late).not.toBeNull();
    await late;
  });

  it("값 읽기가 예외를 내도 통과로 판정한다 — throw하지 않는다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    fakeAdapter({
      getString: jest.fn(() => {
        throw new Error("not initialized");
      }),
    });

    await expect(resolveForceUpdateOnLaunch({ freshWaitMs: 50 })).resolves.toMatchObject({
      decision: { forced: false, recommended: false, minVersion: null, latestVersion: null },
    });
    await expect(refreshForceUpdate("resume")).resolves.toMatchObject({
      forced: false,
      minVersion: null,
    });
    warn.mockRestore();
  });
});
