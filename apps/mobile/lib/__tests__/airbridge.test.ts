import type * as AirbridgeModule from "../airbridge";

const mockTrackEvent = jest.fn();
const mockExtra: { airbridgeEnabled?: boolean } = {};

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: mockExtra } },
}));
jest.mock("airbridge-react-native-sdk", () => ({ Airbridge: { trackEvent: mockTrackEvent } }));

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

beforeEach(() => mockTrackEvent.mockClear());

test("꺼진 빌드는 SDK를 부르지 않는다", () => {
  const ab = load(false);
  ab.trackAirbridgeAnalyticsEvent("tab_pressed", { tab: "home" });
  ab.trackAirbridgeConversion("fb_mobile_complete_registration");
  expect(mockTrackEvent).not.toHaveBeenCalled();
});

test("Amplitude 사본은 커스텀 이벤트, Meta 전환은 표준 이벤트로 간다", () => {
  const ab = load(true);
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
