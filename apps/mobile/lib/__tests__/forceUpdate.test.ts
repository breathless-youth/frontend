import {
  compareVersions,
  DEFAULT_MIN_SUPPORTED_VERSION,
  LATEST_VERSION_KEY,
  MIN_SUPPORTED_VERSION_KEY,
  resolveForceUpdate,
  shouldForceUpdate,
  shouldRecommendUpdate,
  UPDATE_CONFIG_DEFAULTS,
} from "../forceUpdate";
import { setRemoteConfigAdapter } from "../remoteConfig";
import type { RemoteConfigAdapter } from "../remoteConfig";

jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.0.2" }));
// 어댑터를 통째로 교체하므로 RNFB 모듈 자체는 로드하지 않는다(네이티브 모듈 없는 jest 환경).
jest.mock("@react-native-firebase/remote-config", () => ({
  getRemoteConfig: () => ({}),
  activate: jest.fn(),
  fetchConfig: jest.fn(),
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

    // 기본값은 한 번에 등록한다(RNFB는 맵을 통째로 바꿈) — 최소 버전·최신 버전·알림창 문구 세 개.
    expect(adapter.setDefaults).toHaveBeenCalledTimes(1);
    expect(adapter.setDefaults).toHaveBeenCalledWith(UPDATE_CONFIG_DEFAULTS);
    expect(UPDATE_CONFIG_DEFAULTS).toEqual({
      [MIN_SUPPORTED_VERSION_KEY]: DEFAULT_MIN_SUPPORTED_VERSION,
      [LATEST_VERSION_KEY]: "0.0.0",
      force_update_title: "업데이트가 필요해요",
      force_update_message: "원활한 이용을 위해 최신 버전으로 업데이트해 주세요.",
      force_update_button: "지금 업데이트",
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

  it("판정과 무관하게 다음 실행용 fetch를 백그라운드로 건다", async () => {
    const adapter = fakeAdapter({ getString: jest.fn(() => "1.0.0") });

    await resolveForceUpdate();

    expect(adapter.fetch).toHaveBeenCalledTimes(1);
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
    expect(adapter.fetch).toHaveBeenCalledTimes(1);
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
