import * as remoteConfig from "../remoteConfig";
import type { RemoteConfigAdapter } from "../remoteConfig";

const mockActivate = jest.fn();
const mockFetch = jest.fn();
const mockGetString = jest.fn();
const mockRcInstance: { settings?: unknown; defaultConfig?: unknown; fetch: typeof mockFetch } = {
  fetch: mockFetch,
};

jest.mock("@react-native-firebase/remote-config", () => ({
  getRemoteConfig: () => mockRcInstance,
  activate: (...args: unknown[]) => mockActivate(...args) as Promise<boolean>,
  getString: (...args: unknown[]) => mockGetString(...args) as string,
}));

describe("remoteConfig 어댑터 (BY-585)", () => {
  beforeEach(() => {
    mockActivate.mockReset();
    mockFetch.mockReset();
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

  it("activate·getString은 RNFB 모듈 함수에 인스턴스를 넘겨 위임한다", async () => {
    mockActivate.mockResolvedValue(true);
    mockGetString.mockReturnValue("1.2.0");

    await expect(remoteConfig.activateRemoteConfig()).resolves.toBe(true);
    expect(remoteConfig.getRemoteConfigString("min_supported_version")).toBe("1.2.0");

    expect(mockActivate).toHaveBeenCalledWith(mockRcInstance);
    expect(mockGetString).toHaveBeenCalledWith(mockRcInstance, "min_supported_version");
  });

  it("fetch는 인스턴스 메서드에 유효 시간을 그대로 넘긴다 — 0이면 최소 간격을 무시하고 새로 받는다", async () => {
    mockFetch.mockResolvedValue(undefined);

    await expect(remoteConfig.fetchRemoteConfig(0)).resolves.toBeUndefined();
    await expect(remoteConfig.fetchRemoteConfig()).resolves.toBeUndefined();

    expect(mockFetch.mock.calls).toEqual([[0], [undefined]]);
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
