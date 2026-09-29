import {
  __resetFirebaseAnalyticsForTests,
  type FirebaseAnalyticsAdapter,
  logAnalyticsEvent,
  setAnalyticsUserId,
  setAnalyticsUserProperties,
  setFirebaseAnalyticsAdapter,
} from "../firebaseAnalytics";

/**
 * Firebase Analytics 통로 — 어댑터 위임, 예약 이름 차단, SDK 실패가 화면을 죽이지 않는지 본다.
 * 브리지 파싱(형식 검증)은 `webBridge.test.ts`, 핸들러 배선은 `nativeBridgeHandler.test.ts`가 본다.
 */

function fakeAdapter(overrides: Partial<FirebaseAnalyticsAdapter> = {}) {
  const adapter: FirebaseAnalyticsAdapter = {
    logEvent: jest.fn(async () => undefined),
    setUserId: jest.fn(async () => undefined),
    setUserProperties: jest.fn(async () => undefined),
    ...overrides,
  };
  setFirebaseAnalyticsAdapter(adapter);
  return adapter;
}

afterEach(() => {
  __resetFirebaseAnalyticsForTests();
  jest.restoreAllMocks();
});

describe("firebaseAnalytics", () => {
  it("어댑터가 없으면 아무 일도 하지 않는다 — 네이티브 모듈 없는 환경에서도 죽지 않는다", () => {
    expect(() => {
      logAnalyticsEvent("study_session_started", { room_type: "single" });
      setAnalyticsUserId("7");
      setAnalyticsUserProperties({ theme: "dark" });
    }).not.toThrow();
  });

  it("이벤트·user_id·유저 속성을 어댑터에 그대로 넘긴다", () => {
    const adapter = fakeAdapter();

    logAnalyticsEvent("study_session_started", { room_type: "single" });
    logAnalyticsEvent("app_opened");
    setAnalyticsUserId("7");
    setAnalyticsUserProperties({ theme: "dark" });

    expect(adapter.logEvent).toHaveBeenCalledWith("study_session_started", { room_type: "single" });
    expect(adapter.logEvent).toHaveBeenCalledWith("app_opened", undefined);
    expect(adapter.setUserId).toHaveBeenCalledWith("7");
    expect(adapter.setUserProperties).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("예약 접두사 이벤트명은 어댑터를 부르지 않는다 — SDK가 예외를 던지는 이름", () => {
    const adapter = fakeAdapter();

    logAnalyticsEvent("firebase_x");
    logAnalyticsEvent("google_x");
    logAnalyticsEvent("ga_x");

    expect(adapter.logEvent).not.toHaveBeenCalled();
  });

  it("예약 접두사 유저 속성 키는 빼고 넘기고, 전부 예약이면 부르지 않는다", () => {
    const adapter = fakeAdapter();

    setAnalyticsUserProperties({ theme: "dark", firebase_x: "1" });
    setAnalyticsUserProperties({ ga_x: "1" });

    expect(adapter.setUserProperties).toHaveBeenCalledTimes(1);
    expect(adapter.setUserProperties).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("SDK가 동기로 던지거나 거부해도 경고로 끝난다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    fakeAdapter({
      logEvent: jest.fn(() => {
        throw new Error("reserved");
      }),
      setUserId: jest.fn(async () => {
        throw new Error("native");
      }),
    });

    expect(() => logAnalyticsEvent("study_session_started")).not.toThrow();
    expect(() => setAnalyticsUserId("7")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledTimes(2);
  });
});
