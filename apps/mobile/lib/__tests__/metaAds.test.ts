import {
  __resetMetaAdsForTests,
  initMetaAds,
  logMetaAppEvent,
  logMetaRegistration,
  META_EVENT_COMPLETED_REGISTRATION,
  META_EVENT_NAME_PATTERN,
  type MetaAdsAdapter,
  setMetaAdsAdapter,
} from "../metaAds";

/**
 * Meta SDK 통로(BY-644)의 큐·초기화 계약. SDK 실구현(`lib/metaAdsSdk.ts`)은 여기서 다루지 않는다 —
 * 어댑터를 가짜로 꽂아 "언제 무엇을 어떤 순서로 부르는지"만 고정한다.
 */

type FakeAdapter = { [K in keyof MetaAdsAdapter]: jest.Mock };

function fakeAdapter(overrides: Partial<FakeAdapter> = {}): FakeAdapter {
  return {
    initialize: jest.fn(),
    requestTrackingPermission: jest.fn(async () => true),
    setAdvertiserTrackingEnabled: jest.fn(async () => undefined),
    logEvent: jest.fn(),
    ...overrides,
  };
}

let warn: jest.SpyInstance;

beforeEach(() => {
  __resetMetaAdsForTests();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("metaAds — 어댑터가 없는 빌드(Meta env 없음)", () => {
  it("initMetaAds는 즉시 끝나고 이벤트는 아무 일도 하지 않는다", async () => {
    await expect(initMetaAds()).resolves.toBeUndefined();
    expect(() => logMetaAppEvent("study_session_started", { room_type: "single" })).not.toThrow();
    expect(() => logMetaRegistration()).not.toThrow();
  });

  it("어댑터가 없을 때 들어온 이벤트는 나중에 어댑터가 붙어도 되살아나지 않는다", async () => {
    logMetaRegistration();
    const adapter = fakeAdapter();
    setMetaAdsAdapter(adapter);
    await initMetaAds();

    expect(adapter.logEvent).not.toHaveBeenCalled();
  });
});

describe("metaAds — 초기화", () => {
  it("initialize → ATT 요청 → 응답을 setAdvertiserTrackingEnabled에 그대로 넘긴다", async () => {
    const adapter = fakeAdapter({ requestTrackingPermission: jest.fn(async () => false) });
    setMetaAdsAdapter(adapter);

    await initMetaAds();

    expect(adapter.initialize).toHaveBeenCalledTimes(1);
    expect(adapter.requestTrackingPermission).toHaveBeenCalledTimes(1);
    expect(adapter.setAdvertiserTrackingEnabled).toHaveBeenCalledWith(false);
    // 순서: initialize가 ATT 요청보다 먼저
    expect(adapter.initialize.mock.invocationCallOrder[0]).toBeLessThan(
      adapter.requestTrackingPermission.mock.invocationCallOrder[0]!,
    );
  });

  it("두 번 불러도 초기화는 한 번이고 같은 프라미스를 돌려준다 — 권장 알림창이 이 프라미스를 기다린다", async () => {
    const adapter = fakeAdapter();
    setMetaAdsAdapter(adapter);

    const first = initMetaAds();
    const second = initMetaAds();
    await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(adapter.initialize).toHaveBeenCalledTimes(1);
    expect(adapter.requestTrackingPermission).toHaveBeenCalledTimes(1);
  });

  it("ATT 요청이 실패해도 resolve하고 큐를 흘린다 — SKAdNetwork 경로는 ATT와 무관하다", async () => {
    const adapter = fakeAdapter({
      requestTrackingPermission: jest.fn(async () => {
        throw new Error("ATT unavailable");
      }),
    });
    setMetaAdsAdapter(adapter);
    logMetaRegistration();

    await expect(initMetaAds()).resolves.toBeUndefined();

    expect(adapter.setAdvertiserTrackingEnabled).not.toHaveBeenCalled();
    expect(adapter.logEvent).toHaveBeenCalledWith(
      META_EVENT_COMPLETED_REGISTRATION,
      undefined,
      undefined,
    );
    expect(warn).toHaveBeenCalled();
  });
});

describe("metaAds — 이벤트 큐", () => {
  it("초기화 전 이벤트는 큐에 머물다 초기화가 끝난 뒤 순서대로 나간다", async () => {
    const adapter = fakeAdapter();
    setMetaAdsAdapter(adapter);
    logMetaRegistration();
    logMetaAppEvent("study_session_started", { room_type: "single" });
    expect(adapter.logEvent).not.toHaveBeenCalled();

    await initMetaAds();

    expect(adapter.logEvent.mock.calls).toEqual([
      [META_EVENT_COMPLETED_REGISTRATION, undefined, undefined],
      ["study_session_started", { room_type: "single" }, undefined],
    ]);
  });

  it("초기화 뒤 이벤트는 즉시 나가고 valueToSum도 그대로 전달된다", async () => {
    const adapter = fakeAdapter();
    setMetaAdsAdapter(adapter);
    await initMetaAds();

    logMetaAppEvent("study_session_ended", { room_type: "social", focus_sec: 600 }, 600);

    expect(adapter.logEvent).toHaveBeenCalledWith(
      "study_session_ended",
      { room_type: "social", focus_sec: 600 },
      600,
    );
  });

  it("logMetaRegistration은 Meta 표준 가입 완료 이벤트명을 쓴다", () => {
    expect(META_EVENT_COMPLETED_REGISTRATION).toBe("fb_mobile_complete_registration");
    expect(META_EVENT_NAME_PATTERN.test(META_EVENT_COMPLETED_REGISTRATION)).toBe(true);
  });

  it("큐 상한(50)을 넘으면 오래된 것부터 버린다", async () => {
    const adapter = fakeAdapter();
    setMetaAdsAdapter(adapter);
    for (let i = 0; i < 52; i += 1) {
      logMetaAppEvent(`event_${i}`);
    }

    await initMetaAds();

    expect(adapter.logEvent).toHaveBeenCalledTimes(50);
    expect(adapter.logEvent.mock.calls[0]![0]).toBe("event_2");
    expect(adapter.logEvent.mock.calls[49]![0]).toBe("event_51");
  });

  it("SDK logEvent가 던져도 삼킨다 — 분석 유실이 화면을 막지 않는다", async () => {
    const adapter = fakeAdapter({
      logEvent: jest.fn(() => {
        throw new Error("native boom");
      }),
    });
    setMetaAdsAdapter(adapter);
    await initMetaAds();

    expect(() => logMetaAppEvent("study_session_started")).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe("META_EVENT_NAME_PATTERN — Meta 앱 이벤트 이름 규칙", () => {
  it.each([
    "fb_mobile_complete_registration",
    "study_session_started",
    "Event With Space",
    "a",
    "a".repeat(40),
  ])("허용: %s", (name) => {
    expect(META_EVENT_NAME_PATTERN.test(name)).toBe(true);
  });

  it.each([
    "",
    "1starts_with_digit",
    "_underscore_first",
    "한글",
    "a".repeat(41),
    "has.dot",
    "has/slash",
  ])("거부: %s", (name) => {
    expect(META_EVENT_NAME_PATTERN.test(name)).toBe(false);
  });
});
