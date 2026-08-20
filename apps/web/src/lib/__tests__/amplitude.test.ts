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
  return {
    init: vi.fn(),
    track: vi.fn(),
    identify: vi.fn(),
    setUserId: vi.fn(),
    add: vi.fn(),
    sessionReplayPlugin: vi.fn((options: unknown) => ({ name: "session-replay", options })),
    engagementPlugin: vi.fn(() => ({ name: "engagement", type: "enrichment" })),
    FakeIdentify,
  };
});

vi.mock("@amplitude/analytics-browser", () => ({
  init: mocks.init,
  track: mocks.track,
  identify: mocks.identify,
  setUserId: mocks.setUserId,
  add: mocks.add,
  Identify: mocks.FakeIdentify,
}));

vi.mock("@amplitude/plugin-session-replay-browser", () => ({
  sessionReplayPlugin: mocks.sessionReplayPlugin,
}));

// 실제 모듈은 CDN에서 원격 번들을 로드하는 로더다 — 단위 테스트에서는 등록 여부·순서만 본다
// (jsdom에서 왜 실물을 못 돌리는지는 `amplitudePipeline.test.ts`의 mock 주석 참고).
vi.mock("@amplitude/engagement-browser", () => ({
  plugin: mocks.engagementPlugin,
}));

// 모듈이 initialized 플래그를 들고 있어 테스트마다 새로 로드한다.
async function loadModule() {
  return await import("../amplitude");
}

/** `add`로 등록된 정제 플러그인을 꺼낸다 — 등록 순서에 의존하지 않고 이름으로 찾는다. */
function sanitizePlugin() {
  const plugins = mocks.add.mock.calls.map(([plugin]) => plugin as { name?: string });
  const found = plugins.find((plugin) => plugin.name === "focusmakers-sanitize-url");
  if (!found) {
    throw new Error("focusmakers-sanitize-url 플러그인이 등록되지 않았다");
  }
  return found as {
    name: string;
    type: string;
    execute: (event: Record<string, unknown>) => Promise<unknown>;
  };
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
    // 개발자 로컬 .env.local에 실제 키가 있어도 이 테스트가 흔들리면 안 된다 — 빈 값으로 고정.
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "");
    const { initAmplitude } = await loadModule();

    initAmplitude();

    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("중복 호출해도 한 번만 초기화한다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();

    initAmplitude();
    initAmplitude();

    expect(mocks.init).toHaveBeenCalledTimes(1);
  });

  it("페이지뷰 외 autocapture를 켜고 IP를 수집한다 — 원격 설정만 계속 막는다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();

    initAmplitude();

    const [apiKey, options] = mocks.init.mock.calls[0] as [string, Record<string, unknown>];
    expect(apiKey).toBe("test-key");
    // pageViews: 켜면 AnalyticsRouteTracker의 정제된 페이지뷰와 이중 집계된다.
    // attribution의 eventProperty 모드와 pageUrlEnrichment는 우리 정제 플러그인보다 **뒤에**
    // 실행되면서 원본 URL을 덧붙여 정제를 우회한다 — 실제 payload 검증은
    // `amplitudePipeline.test.ts`가 한다.
    expect(options.autocapture).toEqual({
      sessions: true,
      pageViews: false,
      attribution: { trackingMethod: "userProperty", excludeInternalReferrers: true },
      formInteractions: true,
      fileDownloads: true,
      elementInteractions: true,
      pageUrlEnrichment: false,
    });
    expect(options.trackingOptions).toEqual({ ipAddress: true });
    // 콘솔 토글로 수집 범위가 바뀌면 코드 리뷰를 우회한다 — 계속 막는다.
    expect(options.remoteConfig).toEqual({ fetchRemoteConfig: false });
    // 서버 user_id는 1~4자리 DB 순번 — 기본 최소 길이(5자)면 인제스트가 user_id를 제거해
    // 전원이 익명으로 남는다. 실제 payload 검증은 `amplitudePipeline.test.ts`가 한다.
    expect(options.minIdLength).toBe(1);
  });

  it("Session Replay를 카메라(video) 차단 설정으로 init 전에 등록한다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();

    initAmplitude();

    // video 차단이 빠지면 세션 화면의 카메라 프리뷰가 리플레이에 실린다(개인정보 원칙).
    expect(mocks.sessionReplayPlugin).toHaveBeenCalledWith({
      sampleRate: 1,
      privacyConfig: { blockSelector: ["video", ".amp-block"] },
    });
    const replayIndex = mocks.add.mock.calls.findIndex(
      ([plugin]) => (plugin as { name?: string }).name === "session-replay",
    );
    expect(replayIndex).toBeGreaterThanOrEqual(0);
    // init 이후 등록하면 세션 첫 구간이 리플레이에서 빠진다.
    expect(mocks.add.mock.invocationCallOrder[replayIndex]).toBeLessThan(
      mocks.init.mock.invocationCallOrder[0],
    );
  });

  it("Guides & Surveys 플러그인을 정제 플러그인 뒤, init 전에 등록한다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();

    initAmplitude();

    // 설문 내용·대상·빈도는 콘솔 소유 — 코드는 렌더러 등록뿐이라 이 등록이 빠지면
    // 콘솔에서 설문을 아무리 만들어도 앱에는 아무것도 뜨지 않는다.
    expect(mocks.engagementPlugin).toHaveBeenCalledTimes(1);
    const plugins = mocks.add.mock.calls.map(([plugin]) => plugin as { name?: string });
    const engagementIndex = plugins.findIndex((plugin) => plugin.name === "engagement");
    const sanitizeIndex = plugins.findIndex((plugin) => plugin.name === "focusmakers-sanitize-url");
    expect(engagementIndex).toBeGreaterThanOrEqual(0);
    // 설문 노출·응답 이벤트는 이 타임라인으로 포워딩된다 — 정제 플러그인이 앞서야
    // URL 속성이 정제된 뒤에 전달·전송된다.
    expect(sanitizeIndex).toBeGreaterThanOrEqual(0);
    expect(sanitizeIndex).toBeLessThan(engagementIndex);
    // 플러그인 방식은 init 과정에서 setup이 자체 boot를 수행한다 — init 전에 등록돼 있어야 한다.
    expect(mocks.add.mock.invocationCallOrder[engagementIndex]).toBeLessThan(
      mocks.init.mock.invocationCallOrder[0],
    );
  });
});

describe("updateSurveyGate — 세션 화면 설문 차단", () => {
  /** 로더가 만드는 `window.engagement` 전역을 흉내 낸다. */
  function stubEngagement() {
    const engagement = { disable: vi.fn(), enable: vi.fn() };
    vi.stubGlobal("engagement", engagement);
    return engagement;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("`/room/*`에서 disable, 그 외 경로에서 enable을 부른다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude, updateSurveyGate } = await loadModule();
    initAmplitude();
    const engagement = stubEngagement();

    // 카메라 측정 중인 세션 화면(S3) — 코드 가드의 존재 이유다. 콘솔 페이지 타겟팅
    // 실수(오타·범위 누락)가 프로덕션 세션 화면의 설문 오버레이로 직행하지 않게 한다.
    updateSurveyGate("/room/42");
    expect(engagement.disable).toHaveBeenCalledTimes(1);
    expect(engagement.enable).not.toHaveBeenCalled();

    // 결과 화면(S4)도 보수적으로 함께 막는다 — 설문의 표시 지점은 기록 탭(BY-411).
    updateSurveyGate("/room/42/result");
    expect(engagement.disable).toHaveBeenCalledTimes(2);

    // 설문의 실제 표시 지점.
    updateSurveyGate("/records");
    expect(engagement.enable).toHaveBeenCalledTimes(1);

    // `/roommate` 같은 접두사 오탐이 없어야 한다.
    updateSurveyGate("/roommate");
    expect(engagement.enable).toHaveBeenCalledTimes(2);
    expect(engagement.disable).toHaveBeenCalledTimes(2);
  });

  it("미초기화이거나 전역이 없으면 조용히 아무것도 하지 않는다", async () => {
    // 키 없음 → 미초기화. 전역이 있어도 건드리지 않는다.
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "");
    const { initAmplitude, updateSurveyGate } = await loadModule();
    initAmplitude();
    const engagement = stubEngagement();

    updateSurveyGate("/room/42");
    expect(engagement.disable).not.toHaveBeenCalled();

    // 전역이 없는 환경(로더 미로드) — 던지면 라우트 이펙트가 통째로 죽는다.
    vi.unstubAllGlobals();
    expect(() => updateSurveyGate("/room/42")).not.toThrow();
  });
});

describe("URL 정제 플러그인", () => {
  it("init 전에 enrichment 타입으로 등록된다 — 세션 시작 이벤트부터 걸려야 한다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();

    initAmplitude();

    const plugin = sanitizePlugin();
    expect(plugin.type).toBe("enrichment");
    const index = mocks.add.mock.calls.findIndex(
      ([registered]) => (registered as { name?: string }).name === plugin.name,
    );
    expect(mocks.add.mock.invocationCallOrder[index]).toBeLessThan(
      mocks.init.mock.invocationCallOrder[0],
    );
  });

  it("autocapture·pageUrlEnrichment가 담은 원본 URL에서 userId를 지운다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();
    initAmplitude();

    const origin = window.location.origin;
    const event = {
      event_properties: {
        // pageUrlEnrichment가 속성 없는 이벤트(Start Session 등)에 채워 넣는 원본 href.
        "[Amplitude] Page Location": `${origin}/room/42?userId=7&appVersion=1.0.0`,
        "[Amplitude] Previous Page Location": `${origin}/home?userId=7`,
        "[Amplitude] Page URL": `${origin}/room/42`,
        "[Amplitude] Page Path": "/room/42",
        "[Amplitude] Element Href": `${origin}/records?userId=7`,
      },
    };

    await sanitizePlugin().execute(event);

    expect(event.event_properties).toEqual({
      "[Amplitude] Page Location": `${origin}/room/:id?appVersion=1.0.0`,
      "[Amplitude] Previous Page Location": `${origin}/home`,
      "[Amplitude] Page URL": `${origin}/room/:id`,
      "[Amplitude] Page Path": "/room/:id",
      "[Amplitude] Element Href": `${origin}/records`,
    });
  });

  it("attribution이 담는 referrer를 user property 안에서도 정제한다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();
    initAmplitude();

    const origin = window.location.origin;
    const event = {
      user_properties: {
        $set: { referrer: `${origin}/home?userId=7`, referring_domain: "focusmakers.kr" },
        $setOnce: { initial_referrer: `${origin}/room/42?userId=7` },
      },
    };

    await sanitizePlugin().execute(event);

    expect(event.user_properties).toEqual({
      $set: { referrer: `${origin}/home`, referring_domain: "focusmakers.kr" },
      $setOnce: { initial_referrer: `${origin}/room/:id` },
    });
  });

  it("URL이 아닌 속성은 건드리지 않는다 — Element Path는 DOM 경로다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();
    initAmplitude();

    const event = {
      event_properties: {
        "[Amplitude] Element Path": "div > button.start",
        "[Amplitude] Element Text": "공부 시작",
        "[Amplitude] Page Title": "FocusMakers",
      },
    };

    await sanitizePlugin().execute(event);

    expect(event.event_properties).toEqual({
      "[Amplitude] Element Path": "div > button.start",
      "[Amplitude] Element Text": "공부 시작",
      "[Amplitude] Page Title": "FocusMakers",
    });
  });

  it("속성이 없는 이벤트도 그대로 통과시킨다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();
    initAmplitude();

    const event = { event_type: "study_session_started" };

    await expect(sanitizePlugin().execute(event)).resolves.toBe(event);
  });
});

describe("setAmplitudeUserId", () => {
  it("init 시점의 URL에 userId가 있으면 그 자리에서 신원을 붙인다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    window.history.replaceState({}, "", "/home?userId=42");
    const { initAmplitude } = await loadModule();

    initAmplitude();

    // 첫 라우트 이펙트를 기다리면 그 사이 이벤트(Start Session 등)가 익명으로 남는다.
    expect(mocks.setUserId).toHaveBeenCalledWith("42");
    expect(mocks.setUserId.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.init.mock.invocationCallOrder[0],
    );
    window.history.replaceState({}, "", "/");
  });

  it("URL에 userId가 없으면 익명으로 남긴다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude } = await loadModule();

    initAmplitude();

    expect(mocks.setUserId).not.toHaveBeenCalled();
  });

  it("미초기화 상태에서는 조용히 무시한다", async () => {
    const { setAmplitudeUserId } = await loadModule();

    setAmplitudeUserId(7);

    expect(mocks.setUserId).not.toHaveBeenCalled();
  });

  it("DB user_id를 그대로 문자열로 보낸다 — 해시·접두어를 붙이면 백엔드와 조인되지 않는다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude, setAmplitudeUserId } = await loadModule();
    initAmplitude();

    setAmplitudeUserId(7);

    expect(mocks.setUserId).toHaveBeenCalledWith("7");
  });

  it("같은 id로 다시 불러도 SDK를 건드리지 않는다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude, setAmplitudeUserId } = await loadModule();
    initAmplitude();

    setAmplitudeUserId(7);
    setAmplitudeUserId(7);
    setAmplitudeUserId(8);

    expect(mocks.setUserId.mock.calls).toEqual([["7"], ["8"]]);
  });

  it("null이면 이미 붙은 신원을 지우지 않는다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude, setAmplitudeUserId } = await loadModule();
    initAmplitude();

    setAmplitudeUserId(7);
    setAmplitudeUserId(null);

    expect(mocks.setUserId.mock.calls).toEqual([["7"]]);
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
    // 신원은 setUserId라는 제 자리로만 간다 — URL 문자열에 섞으면 화면이 사용자 수만큼 쪼개진다.
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

describe("공부 세션 이벤트", () => {
  it("미초기화 상태에서는 조용히 무시한다", async () => {
    const { trackStudySessionEnded, trackStudySessionStarted, trackStudySessionSubmitted } =
      await loadModule();

    trackStudySessionStarted();
    trackStudySessionSubmitted(true, 1);
    trackStudySessionEnded({
      studySec: 60,
      focusSec: 30,
      pauseSec: 0,
      distractionSec: 30,
      endReason: "MANUAL",
      pauseTrigger: null,
      willSubmit: true,
    });

    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("집중률을 studySec 기준 백분율로 계산해 담는다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude, trackStudySessionEnded } = await loadModule();
    initAmplitude();

    trackStudySessionEnded({
      studySec: 1200,
      focusSec: 900,
      pauseSec: 120,
      distractionSec: 300,
      endReason: "AUTO",
      pauseTrigger: "BACKGROUND",
      willSubmit: true,
    });

    expect(mocks.track).toHaveBeenCalledWith("study_session_ended", {
      study_sec: 1200,
      focus_sec: 900,
      pause_sec: 120,
      distraction_sec: 300,
      focus_rate_percent: 75,
      end_reason: "AUTO",
      pause_trigger: "BACKGROUND",
      will_submit: true,
    });
  });

  it("0초 세션의 집중률은 0 — 0 나눗셈이 NaN으로 새어 나가면 안 된다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude, trackStudySessionEnded } = await loadModule();
    initAmplitude();

    trackStudySessionEnded({
      studySec: 0,
      focusSec: 0,
      pauseSec: 0,
      distractionSec: 0,
      endReason: "MANUAL",
      pauseTrigger: null,
      willSubmit: false,
    });

    const [, payload] = mocks.track.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.focus_rate_percent).toBe(0);
  });

  it("제출 결과는 시도 번호와 함께 보낸다", async () => {
    vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
    const { initAmplitude, trackStudySessionSubmitted } = await loadModule();
    initAmplitude();

    trackStudySessionSubmitted(false, 2);

    expect(mocks.track).toHaveBeenCalledWith("study_session_submitted", { ok: false, attempt: 2 });
  });
});

describe("Amplitude 의존성 가드", () => {
  it("@amplitude/unified를 쓰지 않는다 — initAll이 카메라 차단·URL 정제 설정을 우회한다", () => {
    // vitest는 패키지 루트(apps/web)에서 돈다 — jsdom에선 import.meta.url이 file 스킴이 아니라 못 쓴다.
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const banned = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
      (name) => name === "@amplitude/unified",
    );

    expect(banned).toEqual([]);
  });
});
