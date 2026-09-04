import * as remoteConfig from "../remoteConfig";
import type { RemoteConfigAdapter } from "../remoteConfig";

const mockRcInstance: { settings?: unknown; defaultConfig?: unknown } = {};
const mockActivate = jest.fn();
const mockFetchConfig = jest.fn();
const mockGetString = jest.fn();

jest.mock("@react-native-firebase/remote-config", () => ({
  getRemoteConfig: () => mockRcInstance,
  activate: (...args: unknown[]) => mockActivate(...args) as Promise<boolean>,
  fetchConfig: (...args: unknown[]) => mockFetchConfig(...args) as Promise<void>,
  getString: (...args: unknown[]) => mockGetString(...args) as string,
}));

describe("remoteConfig 어댑터 (BY-585)", () => {
  beforeEach(() => {
    mockActivate.mockReset();
    mockFetchConfig.mockReset();
    mockGetString.mockReset();
    delete mockRcInstance.settings;
    delete mockRcInstance.defaultConfig;
    remoteConfig.setRemoteConfigAdapter(remoteConfig.rnfbRemoteConfigAdapter);
  });

  it("setDefaults는 개발 빌드에서 fetch 간격 0과 기본값을 인스턴스에 쓴다", async () => {
    await remoteConfig.setRemoteConfigDefaults({ min_supported_version: "1.0.0" });

    // jest-expo는 __DEV__ = true다 — 개발 빌드 경로(간격 0)를 고정한다.
    expect(mockRcInstance.settings).toEqual({
      minimumFetchIntervalMillis: 0,
      fetchTimeoutMillis: 60_000,
    });
    expect(mockRcInstance.defaultConfig).toEqual({ min_supported_version: "1.0.0" });
  });

  it("activate·fetch·getString은 RNFB 모듈 함수에 인스턴스를 넘겨 위임한다", async () => {
    mockActivate.mockResolvedValue(true);
    mockFetchConfig.mockResolvedValue(undefined);
    mockGetString.mockReturnValue("1.2.0");

    await expect(remoteConfig.activateRemoteConfig()).resolves.toBe(true);
    await expect(remoteConfig.fetchRemoteConfig()).resolves.toBeUndefined();
    expect(remoteConfig.getRemoteConfigString("min_supported_version")).toBe("1.2.0");

    expect(mockActivate).toHaveBeenCalledWith(mockRcInstance);
    expect(mockFetchConfig).toHaveBeenCalledWith(mockRcInstance);
    expect(mockGetString).toHaveBeenCalledWith(mockRcInstance, "min_supported_version");
  });

  it("백그라운드 fetch 실패는 던지지 않고 경고 로그로 흡수한다 (fail-open)", async () => {
    mockFetchConfig.mockRejectedValue(new Error("offline"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => remoteConfig.fetchRemoteConfigInBackground()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("백그라운드 fetch 실패"),
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it("setRemoteConfigAdapter로 교체한 어댑터가 공개 함수에 그대로 반영된다", async () => {
    const fake: RemoteConfigAdapter = {
      setDefaults: jest.fn(() => Promise.resolve()),
      activate: jest.fn(() => Promise.resolve(false)),
      fetch: jest.fn(() => Promise.resolve()),
      getString: jest.fn(() => "fake"),
    };
    remoteConfig.setRemoteConfigAdapter(fake);

    await remoteConfig.setRemoteConfigDefaults({ a: 1 });
    await expect(remoteConfig.activateRemoteConfig()).resolves.toBe(false);
    expect(remoteConfig.getRemoteConfigString("a")).toBe("fake");
    expect(fake.setDefaults).toHaveBeenCalledWith({ a: 1 });
    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockGetString).not.toHaveBeenCalled();
  });
});
