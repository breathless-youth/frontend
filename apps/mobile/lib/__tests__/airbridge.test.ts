import type * as AirbridgeModule from "../airbridge";

const mockTrackEvent = jest.fn();
const mockStartTracking = jest.fn();
const mockStopTracking = jest.fn();
const mockSdk = () => ({
  Airbridge: {
    trackEvent: mockTrackEvent,
    startTracking: mockStartTracking,
    stopTracking: mockStopTracking,
  },
});
const mockExtra: { airbridgeEnabled?: boolean } = {};

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: mockExtra } },
}));
jest.mock("airbridge-react-native-sdk", () => mockSdk());

// 게이트는 모듈 안에 한 번 캐시되므로 켬·끔마다 새로 불러온다.
function load(enabled: boolean): typeof AirbridgeModule {
  mockExtra.airbridgeEnabled = enabled;
  let mod!: typeof AirbridgeModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules 안의 재로드는 require뿐이다.
    mod = require("../airbridge");
  });
  return mod;
}

beforeEach(() => {
  mockTrackEvent.mockClear();
  mockStartTracking.mockClear();
  mockStopTracking.mockClear();
});

test("꺼진 빌드는 SDK를 부르지 않는다", () => {
  const ab = load(false);
  ab.trackAirbridgeAnalyticsEvent("tab_pressed", { tab: "home" });
  ab.trackAirbridgeConversion("fb_mobile_complete_registration");
  ab.setAirbridgeTrackingAllowed(true);
  expect(mockTrackEvent).not.toHaveBeenCalled();
  expect(mockStartTracking).not.toHaveBeenCalled();
});

test("SDK 로드가 던져도 호출부로 새지 않고 그 실행에서는 꺼진다 — 네이티브 모듈 없는 바이너리", () => {
  mockExtra.airbridgeEnabled = true;
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  let mod!: typeof AirbridgeModule;
  jest.isolateModules(() => {
    jest.doMock("airbridge-react-native-sdk", () => {
      throw new Error("native module missing");
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules 안의 재로드는 require뿐이다.
    mod = require("../airbridge");
  });
  expect(() => mod.trackAirbridgeConversion("fb_mobile_complete_registration")).not.toThrow();
  expect(() => mod.trackAirbridgeAnalyticsEvent("tab_pressed", { tab: "home" })).not.toThrow();
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
  jest.doMock("airbridge-react-native-sdk", () => mockSdk());
});

test("Amplitude 사본은 커스텀 이벤트, Meta 전환은 표준 이벤트로 간다", () => {
  const ab = load(true);
  ab.setAirbridgeTrackingAllowed(true);
  ab.trackAirbridgeAnalyticsEvent("study_session_ended", { room_type: "single", focus_sec: 61 });
  ab.trackAirbridgeConversion("fb_mobile_complete_registration");
  ab.trackAirbridgeConversion("fb_mobile_tutorial_completion", { fb_success: 1 });
  ab.trackAirbridgeConversion("fb_mobile_achievement_unlocked", { fb_description: "focus_1min" });
  ab.trackAirbridgeConversion("invite_shared", { method: "copied" });
  // Amplitude 사본에 이미 있는 전환은 다시 보내지 않는다.
  ab.trackAirbridgeConversion("study_session_started", { room_type: "single" });

  expect(mockTrackEvent.mock.calls).toEqual([
    ["study_session_ended", {}, { room_type: "single", focus_sec: 61 }],
    ["airbridge.user.signup", {}, {}],
    ["airbridge.completeTutorial", {}, {}],
    ["airbridge.unlockAchievement", { achievementID: "focus_1min" }, {}],
    ["airbridge.share", { sharedChannel: "copied" }, {}],
  ]);
});

test("ATT 응답 전 이벤트는 쌓였다가 허용되면 수집을 켠 뒤 순서대로 나간다", () => {
  const ab = load(true);
  ab.trackAirbridgeConversion("fb_mobile_complete_registration");
  ab.trackAirbridgeAnalyticsEvent("onboarding_completed", { step: 3 });
  expect(mockTrackEvent).not.toHaveBeenCalled();

  ab.setAirbridgeTrackingAllowed(true);

  expect(mockStartTracking).toHaveBeenCalledTimes(1);
  expect(mockStartTracking.mock.invocationCallOrder[0]).toBeLessThan(
    mockTrackEvent.mock.invocationCallOrder[0]!,
  );
  expect(mockTrackEvent.mock.calls).toEqual([
    ["airbridge.user.signup", {}, {}],
    ["onboarding_completed", {}, { step: 3 }],
  ]);
});

test("ATT를 거부하면 수집을 끄고 쌓인 이벤트와 이후 이벤트를 모두 버린다", () => {
  const ab = load(true);
  ab.trackAirbridgeConversion("fb_mobile_complete_registration");

  ab.setAirbridgeTrackingAllowed(false);
  ab.trackAirbridgeAnalyticsEvent("tab_pressed", { tab: "home" });

  expect(mockStopTracking).toHaveBeenCalledTimes(1);
  expect(mockStartTracking).not.toHaveBeenCalled();
  expect(mockTrackEvent).not.toHaveBeenCalled();
});

test("응답 전 큐는 50건을 넘으면 오래된 것부터 버린다", () => {
  const ab = load(true);
  for (let i = 0; i < 51; i += 1) ab.trackAirbridgeAnalyticsEvent("tab_pressed", { i });
  ab.setAirbridgeTrackingAllowed(true);
  expect(mockTrackEvent).toHaveBeenCalledTimes(50);
  expect(mockTrackEvent.mock.calls[0]).toEqual(["tab_pressed", {}, { i: 1 }]);
});
