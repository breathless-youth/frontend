import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeIdentify {
    readonly sets: Array<[string, unknown]> = [];
    set(key: string, value: unknown) {
      this.sets.push([key, value]);
      return this;
    }
  }
  return { init: vi.fn(), track: vi.fn(), identify: vi.fn(), FakeIdentify };
});

vi.mock("@amplitude/analytics-browser", () => ({
  init: mocks.init,
  track: mocks.track,
  identify: mocks.identify,
  Identify: mocks.FakeIdentify,
}));

// 모듈이 initialized 플래그를 들고 있어 테스트마다 새로 로드한다.
async function loadModule() {
  return await import("../amplitude");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("initAmplitude", () => {
  it("API 키가 없으면 아무것도 하지 않는다", async () => {
    const { initAmplitude } = await loadModule();

    initAmplitude();

    expect(mocks.init).not.toHaveBeenCalled();
  });

  it("중복 호출해도 한 번만 초기화한다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();

    initAmplitude();
    initAmplitude();

    expect(mocks.init).toHaveBeenCalledTimes(1);
  });

  it("세션 외 autocapture와 원격 설정을 모두 끈다 — 원본 URL·IP가 나가는 경로 차단", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();

    initAmplitude();

    const [apiKey, options] = mocks.init.mock.calls[0] as [string, Record<string, unknown>];
    expect(apiKey).toBe("test-key");
    expect(options.autocapture).toEqual({
      sessions: true,
      pageViews: false,
      attribution: false,
      formInteractions: false,
      fileDownloads: false,
      elementInteractions: false,
    });
    expect(options.trackingOptions).toEqual({ ipAddress: false });
    expect(options.remoteConfig).toEqual({ fetchRemoteConfig: false });
  });
});

describe("trackAmplitudePageView", () => {
  it("미초기화 상태에서는 조용히 무시한다", async () => {
    const { trackAmplitudePageView } = await loadModule();

    expect(() => trackAmplitudePageView("/records", "")).not.toThrow();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("초기화 후 정제된 경로로 페이지뷰를 보낸다 — userId는 어디에도 남지 않는다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude, trackAmplitudePageView } = await loadModule();
    initAmplitude();

    trackAmplitudePageView("/room/42/result", "?userId=7&appVersion=1.0.0");

    const [eventType, payload] = mocks.track.mock.calls[0] as [string, Record<string, string>];
    expect(eventType).toBe("[Amplitude] Page Viewed");
    expect(payload["[Amplitude] Page Path"]).toBe("/room/:id/result?appVersion=1.0.0");
    expect(payload["[Amplitude] Page Location"]).toBe(
      window.location.origin + "/room/:id/result?appVersion=1.0.0",
    );
    expect(JSON.stringify(mocks.track.mock.calls)).not.toContain("userId");
  });
});

describe("setAcquisitionChannel", () => {
  it("미초기화 상태에서는 조용히 무시한다", async () => {
    const { setAcquisitionChannel } = await loadModule();

    expect(() => setAcquisitionChannel("preregister")).not.toThrow();
    expect(mocks.identify).not.toHaveBeenCalled();
  });

  it("acquisition_channel user property를 보낸다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude, setAcquisitionChannel } = await loadModule();
    initAmplitude();

    setAcquisitionChannel("preregister");

    expect(mocks.identify).toHaveBeenCalledTimes(1);
    const [sent] = mocks.identify.mock.calls[0] as [InstanceType<typeof mocks.FakeIdentify>];
    expect(sent.sets).toEqual([["acquisition_channel", "preregister"]]);
  });
});

describe("Session Replay 금지 가드", () => {
  it("Replay 계열 패키지를 의존성에 두지 않는다 — 카메라 프리뷰 화면 녹화 금지(CLAUDE.md)", () => {
    // vitest는 패키지 루트(apps/web)에서 돈다 — jsdom에선 import.meta.url이 file 스킴이 아니라 못 쓴다.
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const banned = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
      (name) => name.includes("session-replay") || name === "@amplitude/unified",
    );

    expect(banned).toEqual([]);
  });
});
